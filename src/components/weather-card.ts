import { getEntity, subscribeEntity, subscribeUser, subscribeActivePerson } from "../store/entity-store"
import { callService } from "../services/ha-service"
import type { HAEntity } from "../types/homeassistant"
import type { HAUser } from "../store/entity-store"

class WeatherCard extends HTMLElement {
    private weatherEntity = "weather.smhi_home"
    private toggleEntity = "input_boolean.toggle_vaderprognos"
    private hourlySensor = "sensor.vader_prognos_timme"
    private dailySensor = "sensor.vader_prognos_daglig"
    
    // Person tracking
    private personEntity = "person.sebastian"
    private lastCoords: string = ""
    private localWeather: any = null
    private localLocation: string = "Hem"
    private isExpanded: boolean = false
    private showDebug: boolean = false
    private fetchError: string = ""
    private viewMode: 'hourly' | 'daily' = (localStorage.getItem("weather_view_mode") as 'hourly' | 'daily') || 'daily'

    private imageMap: Record<string, string> = {
        "sunny": "Soligt.png",
        "clear-night": "Mone.png",
        "cloudy": "Molnigt2.png",
        "fog": "Dimmadag.png",
        "fog_night": "Dimmanatt.png",
        "hail": "Hagel.png",
        "lightning": "Aska.png",
        "lightning-rainy": "Askaochregn.png",
        "partlycloudy": "Delvismolnigtdag2.png",
        "partlycloudy_night": "Delvismolnigtnatt.png",
        "pouring": "Osregn.png",
        "rainy": "Regn3.png",
        "snowy": "Sno.png",
        "snowy-rainy": "Snoregn.png",
        "windy": "Molnigt2.png",
        "windy-variant": "Molnigt2.png",
        "exceptional": "Aska.png"
    }

    constructor() {
        super()
        this.attachShadow({ mode: "open" })
    }

    connectedCallback() {
        // 1. Subscribe to basic weather sensors
        const coreSensors = [this.weatherEntity, this.hourlySensor, this.dailySensor]
        coreSensors.forEach(id => {
            subscribeEntity(id, () => this.handleUpdate())
        })

        // 2. Subscribe to BOTH persons for coordinates
        subscribeEntity("person.sebastian", () => this.handleUpdate())
        subscribeEntity("person.sara", () => this.handleUpdate())

        // 3. THE "MAGIC" PART: Subscribe to the active person from the store
        subscribeActivePerson((personId) => {
            this.personEntity = personId
            console.log("Weather location now tracking:", this.personEntity)
            this.handleUpdate()
        })
        
        // 4. Update when coming back into focus
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
                this.handleUpdate()
            }
        })

        // 5. Expand toggle
        this.addEventListener("click", () => {
            this.isExpanded = !this.isExpanded;
            this.render();
        });
    }

    private handleUpdate() {
        const person = getEntity(this.personEntity)
        
        if (person?.attributes.latitude && person?.attributes.longitude) {
            const coords = `${person.attributes.latitude.toFixed(4)},${person.attributes.longitude.toFixed(4)}`
            if (coords !== this.lastCoords) {
                this.lastCoords = coords
                this.fetchError = ""
                this.fetchLocalWeather(person.attributes.latitude, person.attributes.longitude)
            }
        }
        
        if (person || this.localWeather) {
            this.setAttribute("loaded", "")
        }
        this.render()
    }
    private async fetchLocalWeather(lat: number, lon: number) {
        try {
            // Coordinate validation
            if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
                throw new Error("Invalid GPS data");
            }

            // 1. Get City Name
            const geoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=sv`)
            if (!geoRes.ok) throw new Error(`Geo Error ${geoRes.status}`);
            const geoData = await geoRes.json()
            
            // Hard override for home
            const distToHome = Math.sqrt(Math.pow(lat - 56.726, 2) + Math.pow(lon - 16.326, 2))
            if (distToHome < 0.01) {
                this.localLocation = "Lindsdal"
            } else {
                let location = geoData.locality || geoData.city || geoData.principalSubdivision || "Okänd"
                location = location.replace(/ stadsdelsområde$/i, "").replace(/ kommun$/i, "")
                this.localLocation = location
            }

            // 2. Get Weather - Yr.no (MET Norway)
            // 2. Get Weather - Yr.no (MET Norway)
            // CRITICAL: We DO NOT set User-Agent here. It is a forbidden header in browsers
            // and causes an immediate "Failed to fetch" security error on mobile devices.
            const weatherRes = await fetch(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`)

            if (!weatherRes.ok) {
                throw new Error(`MET ${weatherRes.status}`);
            }

            const data = await weatherRes.json()
            this.localWeather = data
            this.setAttribute("loaded", "")
            this.render()
        } catch (e: any) {
            console.error("Weather fetch failed:", e)
            this.fetchError = e.message || "Network Error"
            this.render()
        }
    }

    private toggleView(mode: 'hourly' | 'daily') {
        this.viewMode = mode
        localStorage.setItem("weather_view_mode", mode)
        this.render()
    }

    render() {
        const weather = getEntity(this.weatherEntity)
        const toggle = getEntity(this.toggleEntity)
        const hourly = getEntity(this.hourlySensor)
        const daily = getEntity(this.dailySensor)
        const sun = getEntity("sun.sun")

        if (!weather) return

        const isDaily = this.viewMode === 'daily'
        const isNight = sun?.state === "below_horizon"

        // Localized vs Fixed Logic
        let temp: number
        let feelsLike: number | null = null
        let condition: string
        let locationName: string

        if (this.localWeather) {
            const current = this.localWeather.properties.timeseries[0].data.instant.details
            const symbol = this.localWeather.properties.timeseries[0].data.next_1_hours.summary.symbol_code
            temp = Math.round(current.air_temperature)
            
            // If MET compact doesn't have it, calculate a simple heat index / wind chill approximation
            let app = current.apparent_temperature
            if (app == null) {
                const ws = current.wind_speed || 0
                const rh = current.relative_humidity || 50
                if (temp <= 10) {
                    // Simple wind chill for cold
                    app = 13.12 + 0.6215 * temp - 11.37 * Math.pow(ws, 0.16) + 0.3965 * temp * Math.pow(ws, 0.16)
                } else if (temp >= 26) {
                    // Simple heat index for warm
                    app = temp + 0.5 * (temp + 61 + (temp - 68) * 1.2 + rh * 0.094)
                } else {
                    app = temp
                }
            }
            feelsLike = Math.round(app)
            condition = this.getMetState(symbol)
            locationName = this.localLocation
        } else {
            temp = Math.round(Number(weather.attributes.temperature || 0))
            const app = weather.attributes.apparent_temperature
            feelsLike = app != null ? Math.round(app) : temp
            condition = weather.state 
            locationName = "Lindsdal"
        }

        const conditionLabel = this.translateCondition(condition)

        const formatTime = (iso: string) => {
            if (!iso) return "--:--"
            return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }

        this.shadowRoot!.innerHTML = `
            <style>
                :host {
                    display: block;
                    background: var(--color-card);
                    border-radius: var(--radius-md);
                    padding: var(--space-md);
                    color: var(--text-primary);
                    opacity: 0;
                    transition: opacity 0.4s ease-out, background 0.3s ease;
                    position: relative;
                    overflow: hidden;
                    cursor: pointer;
                }

                /* ── Sky Theme for Light Mode ── */
                @media (prefers-color-scheme: light) {
                    :host:not([data-theme="dark"]) {
                        background: linear-gradient(180deg, rgba(51,140,210,1) 40%, rgba(89,179,224,1) 100%);
                        color: #ffffff;
                    }
                    :host:not([data-theme="dark"]) .label,
                    :host:not([data-theme="dark"]) .location,
                    :host:not([data-theme="dark"]) .unit,
                    :host:not([data-theme="dark"]) .f-temp.low,
                    :host:not([data-theme="dark"]) .precip,
                    :host:not([data-theme="dark"]) .sun-info {
                        color: rgba(255, 255, 255, 0.8) !important;
                    }
                    :host:not([data-theme="dark"]) .tabs {
                        background: rgba(255, 255, 255, 0.2);
                        backdrop-filter: blur(4px);
                    }
                    :host:not([data-theme="dark"]) .tab {
                        color: rgba(255, 255, 255, 0.7);
                    }
                    :host:not([data-theme="dark"]) .tab.active {
                        background: #ffffff;
                        color: #0088cc;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                    }
                }

                /* Manual Light override */
                :host-context([data-theme="light"]) {
                    background: linear-gradient(180deg, rgba(51,140,210,1) 40%, rgba(89,179,224,1) 100%);
                    color: #ffffff;
                }
                :host-context([data-theme="light"]) .label,
                :host-context([data-theme="light"]) .location,
                :host-context([data-theme="light"]) .unit,
                :host-context([data-theme="light"]) .f-temp.low,
                :host-context([data-theme="light"]) .precip,
                :host-context([data-theme="light"]) .sun-info {
                    color: rgba(255, 255, 255, 0.8) !important;
                }
                :host-context([data-theme="light"]) .tabs {
                    background: rgba(255, 255, 255, 0.2);
                    backdrop-filter: blur(4px);
                }
                :host-context([data-theme="light"]) .tab {
                    color: rgba(255, 255, 255, 0.7);
                }
                :host-context([data-theme="light"]) .tab.active {
                    background: #ffffff;
                    color: #0088cc;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                }

                :host([loaded]) {
                    opacity: 1;
                }
                .hero {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }
                .temp-group {
                    display: flex;
                    align-items: flex-start;
                    gap: 2px;
                }
                .temp {
                    font-size: 56px;
                    font-weight: 600;
                    letter-spacing: -3px;
                    line-height: 0.9;
                }
                .unit {
                    font-size: 32px;
                    font-weight: 500;
                    margin-top: -12px;
                }
                .meta {
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    flex: 1;
                }
                .condition {
                    font-size: 18px;
                    font-weight: 600;
                    text-transform: capitalize;
                    line-height: 1.2;
                }
                .location {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    margin-top: 2px;
                    font-size: 14px;
                    color: var(--text-secondary);
                    opacity: 0.8;
                }
                .weather-icon-large {
                    color: var(--accent);
                }
                
                :host-context([data-theme="light"]) .weather-icon-large,
                @media (prefers-color-scheme: light) {
                    :host:not([data-theme="dark"]) .weather-icon-large {
                        color: #ffffff;
                    }
                }

                /* ── Expandable Section ── */
                .expander {
                    display: grid;
                    grid-template-rows: 0fr;
                    transition: grid-template-rows 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                }
                :host([expanded]) .expander,
                .expander.expanded {
                    grid-template-rows: 1fr;
                }
                .expander-content {
                    overflow: hidden;
                }

                .content-inner {
                    padding-top: 24px;
                }

                .tabs {
                    display: flex;
                    background: var(--color-card-alt);
                    padding: 4px;
                    border-radius: 12px;
                    margin-bottom: 20px;
                }
                .tab {
                    flex: 1;
                    border: none;
                    background: transparent;
                    color: var(--text-secondary);
                    padding: 8px;
                    font-size: 13px;
                    font-weight: 500;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                    user-select: none;
                }
                .tab.active {
                    background: var(--color-card);
                    color: var(--text-primary);
                }

                .scroll {
                    display: flex;
                    gap: 20px;
                    overflow-x: auto;
                    padding-bottom: 10px;
                    scroll-snap-type: x mandatory;
                    scrollbar-width: none;
                }
                .scroll::-webkit-scrollbar { display: none; }

                .item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 6px;
                    min-width: 54px;
                    scroll-snap-align: start;
                }
                .label { font-size: 12px; color: var(--text-secondary); }
                .f-temp { font-size: 15px; font-weight: 500; }
                .f-temps { display: flex; gap: 6px; }
                .f-temp.low { opacity: 0.5; }
                .precip { font-size: 11px; font-weight: 500; color: var(--text-secondary); opacity: 0.9; }

                .sun-info {
                    display: flex;
                    justify-content: center;
                    gap: 32px;
                    margin-bottom: 24px;
                    padding-bottom: 20px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    font-size: 13px;
                    color: var(--text-secondary);
                    font-weight: 500;
                }
                .sun-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
            </style>
            
            <div class="hero" id="weatherHero">
                <div class="temp-group">
                    <span class="temp">${temp}</span>
                    <span class="unit">°</span>
                </div>
                
                <div class="meta" id="locationArea">
                    <div class="condition">${conditionLabel}</div>
                    <div class="location">
                        ${this.localWeather ? `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-top:1px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>` : ''}
                        ${locationName}
                    </div>
                    ${feelsLike !== null ? `<div class="location" style="font-size:12px;opacity:0.6">Känns som ${feelsLike}°</div>` : ''}

                    ${this.showDebug ? `
                        <div style="font-size: 10px; background: rgba(0,0,0,0.3); padding: 4px; border-radius: 4px; margin-top: 8px; font-family: monospace; pointer-events: auto;">
                            ID: ${this.personEntity.split('.')[1]}<br>
                            GPS: ${this.lastCoords || 'NONE'}<br>
                            COND: ${condition}<br>
                            FETCH: ${this.localWeather ? 'OK' : (this.fetchError || 'WAITING')}<br>
                            <button id="btn-refresh" style="font-size:9px; border:1px solid #fff; background:none; color:#fff; border-radius:4px; padding:2px 4px; margin-top:4px;">Force Reload</button>
                        </div>
                    ` : ''}
                </div>

                <div class="weather-icon-large">
                    ${this.getWeatherIcon(condition, 64, isNight)}
                </div>
            </div>

            <div class="expander ${this.isExpanded ? 'expanded' : ''}">
                <div class="expander-content">
                    <div class="content-inner">
                        <div class="sun-info">
                            <div class="sun-item">
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="overflow:visible"><path d="M12 11V3.5"/><path d="m9 6.5 3-3 3 3"/><path d="M18 20a6 6 0 0 0-12 0"/><path d="M2 22h20"/></svg>
                                Soluppgång ${formatTime(sun?.attributes.next_rising)}
                            </div>
                            <div class="sun-item">
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="overflow:visible"><path d="M12 3.5v7.5"/><path d="m15 8-3 3-3-3"/><path d="M18 20a6 6 0 0 0-12 0"/><path d="M2 22h20"/></svg>
                                Solnedgång ${formatTime(sun?.attributes.next_setting)}
                            </div>
                        </div>

                        <div class="tabs">
                            <button class="tab ${!isDaily ? 'active' : ''}" id="btn-hourly">Timvis</button>
                            <button class="tab ${isDaily ? 'active' : ''}" id="btn-daily">Dygn</button>
                        </div>

                        <div class="scroll">
                            ${isDaily ? this.renderDaily(daily) : this.renderHourly(hourly)}
                        </div>
                    </div>
                </div>
            </div>
        `

        // Re-attach listeners
        this.shadowRoot!.getElementById("locationArea")?.addEventListener("dblclick", (e) => {
            e.stopPropagation();
            this.showDebug = !this.showDebug;
            this.render();
        });

        this.shadowRoot!.getElementById("btn-refresh")?.addEventListener("click", (e) => {
            e.stopPropagation();
            this.lastCoords = "";
            this.handleUpdate();
        });

        this.shadowRoot!.getElementById("btn-hourly")?.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleView("hourly");
        })
        this.shadowRoot!.getElementById("btn-daily")?.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleView("daily");
        })
    }

    private renderHourly(entity?: HAEntity) {
        if (this.localWeather) {
            const timeseries = this.localWeather.properties.timeseries
            const now = new Date()
            
            // Filter only future points and take next 24
            const futurePoints = timeseries.filter((ts: any) => new Date(ts.time) > now)

            return futurePoints.slice(0, 24).map((ts: any) => {
                const date = new Date(ts.time)
                const temp = Math.round(ts.data.instant.details.air_temperature)
                const symbol = ts.data.next_1_hours?.summary?.symbol_code || ts.data.next_6_hours?.summary?.symbol_code
                const cond = this.getMetState(symbol)
                const precip = ts.data.next_1_hours?.details?.precipitation_amount || 0
                
                return `
                    <div class="item">
                        <span class="label">${date.getHours()}:00</span>
                        ${this.getWeatherIcon(cond, 24, date.getHours() > 20 || date.getHours() < 6)}
                        <span class="f-temp">${temp}°</span>
                        <span class="precip">${precip > 0 ? precip.toFixed(1) + ' mm' : '&nbsp;'}</span>
                    </div>
                `
            }).join("")
        }

        const forecast = entity?.attributes.forecast || []
        return forecast.slice(0, 15).map((f: any) => {
            const date = new Date(f.datetime)
            const time = date.getHours().toString().padStart(2, '0') + ":00"
            const hour = date.getHours()
            const isNight = hour > 20 || hour < 6
            
            return `
                <div class="item">
                    <span class="label">${time}</span>
                    ${this.getWeatherIcon(f.condition, 26, isNight)}
                    <span class="f-temp">${Math.round(f.temperature)}°</span>
                    <span class="precip">${f.precipitation > 0 ? f.precipitation.toFixed(1) + ' mm' : '&nbsp;'}</span>
                </div>
            `
        }).join("")
    }

    private renderDaily(entity?: HAEntity) {
        if (this.localWeather) {
            const timeseries = this.localWeather.properties.timeseries
            const days = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"]
            
            // 1. Group all points by local date
            const dailyGroups: Record<string, any[]> = {}
            timeseries.forEach((ts: any) => {
                const dateKey = new Date(ts.time).toLocaleDateString()
                if (!dailyGroups[dateKey]) dailyGroups[dateKey] = []
                dailyGroups[dateKey].push(ts)
            })

            const dailyData: any[] = []
            Object.keys(dailyGroups).forEach(dateKey => {
                const group = dailyGroups[dateKey]
                
                // Get all temperatures for this day
                const temps = group.map(ts => ts.data.instant.details.air_temperature)
                
                // Find a midday point (around 12:00 local) for the day's icon
                let midDayPoint = group.find(ts => new Date(ts.time).getHours() === 12) || group[Math.floor(group.length / 2)]
                
                // Sum precipitation for the whole day
                // MET Norway provides non-overlapping windows. We prefer 1h windows, fall back to 6h.
                let totalPrecip = 0
                let lastPrecipTime = 0
                
                group.forEach(ts => {
                    const time = new Date(ts.time).getTime()
                    const p1 = ts.data.next_1_hours?.details?.precipitation_amount
                    const p6 = ts.data.next_6_hours?.details?.precipitation_amount
                    
                    if (p1 !== undefined) {
                        totalPrecip += p1
                    } else if (p6 !== undefined && time >= lastPrecipTime + 6 * 3600000) {
                        // Only add 6h data if we haven't covered these hours with 1h points
                        totalPrecip += p6
                        lastPrecipTime = time
                    }
                })

                dailyData.push({
                    time: group[0].time,
                    tempMax: Math.max(...temps),
                    tempMin: Math.min(...temps),
                    symbol: midDayPoint.data.next_6_hours?.summary?.symbol_code || midDayPoint.data.next_12_hours?.summary?.symbol_code || midDayPoint.data.next_1_hours?.summary?.symbol_code,
                    precip: totalPrecip
                })
            })

            // Skip "today" if it's late in the evening and user wants "tomorrow" as first forecast
            // or just show the next 8 days available
            return dailyData.slice(0, 8).map((d: any, i: number) => {
                const date = new Date(d.time)
                const dayName = i === 0 ? "Idag" : i === 1 ? "Imorgon" : days[date.getDay()]
                let cond = this.getMetState(d.symbol)
                
                return `
                    <div class="item">
                        <span class="label">${dayName}</span>
                        ${this.getWeatherIcon(cond, 26, false)}
                        <div class="f-temps">
                            <span class="f-temp">${Math.round(d.tempMax)}°</span>
                            <span class="f-temp low">${Math.round(d.tempMin)}°</span>
                        </div>
                        <span class="precip">${d.precip > 0.1 ? d.precip.toFixed(1) + ' mm' : '&nbsp;'}</span>
                    </div>
                `
            }).join("")
        }

        const forecast = entity?.attributes.forecast || []
        const days = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"]
        return forecast.slice(0, 8).map((f: any, i: number) => {
            const date = new Date(f.datetime)
            const dayName = i === 0 ? "Idag" : i === 1 ? "Imorgon" : days[date.getDay()]
            return `
                <div class="item">
                    <span class="label">${dayName}</span>
                    ${this.getWeatherIcon(f.condition, 26, false)}
                    <div class="f-temps">
                        <span class="f-temp">${Math.round(f.temperature)}°</span>
                        <span class="f-temp low">${Math.round(f.templow || 0)}°</span>
                    </div>
                    <span class="precip">${f.precipitation > 0 ? f.precipitation.toFixed(1) + ' mm' : '&nbsp;'}</span>
                </div>
            `
        }).join("")
    }

    private getMetState(symbol: string): string {
        const s = symbol?.split("_")[0] || ""
        switch (s) {
            case "clearsky": return "sunny"
            case "fair": 
            case "partlycloudy": return "partlycloudy"
            case "cloudy": return "cloudy"
            case "fog": return "fog"
            case "rain": return "rainy"
            case "heavyrain": return "pouring"
            case "lightrain": 
            case "lightrainshowers": return "rainy"
            case "rainshowers": 
            case "heavyrainshowers": return "rainy"
            case "snow": 
            case "heavysnow": return "snowy"
            case "lightsnow": 
            case "lightsnowshowers":
            case "snowshowers": return "snowy"
            case "sleet": 
            case "sleetshowers": return "snowy-rainy"
            case "thunderstorm": return "lightning"
            default: return "cloudy"
        }
    }

    private translateCondition(condition: string): string {
        const dict: Record<string, string> = {
            "sunny": "Soligt",
            "clear-night": "Klart",
            "cloudy": "Molnigt",
            "fog": "Dimma",
            "hail": "Hagel",
            "lightning": "Åska",
            "lightning-rainy": "Åska och regn",
            "partlycloudy": "Delvis molnigt",
            "pouring": "Ösregn",
            "rainy": "Regn",
            "snowy": "Snö",
            "snowy-rainy": "Snöblandat regn",
            "windy": "Blåsigt",
            "windy-variant": "Blåsigt",
            "exceptional": "Varning"
        }
        return dict[condition.toLowerCase()] || condition
    }

    private getWeatherIcon(condition: string, size: number, isNight: boolean = false) {
        let stateKey = (condition || "").toLowerCase().trim()
        
        // Handle night swap for sunny
        if (isNight && stateKey === "sunny") stateKey = "clear-night"

        // Check for night variation in our map (fog_night, etc)
        const nightKey = `${stateKey}_night`
        const finalKey = (isNight && this.imageMap[nightKey]) ? nightKey : stateKey
        
        const fileName = this.imageMap[finalKey] || this.imageMap[stateKey]

        if (fileName) {
            // Use Vite's built-in detection to handle paths correctly in both environments
            const iconUrl = `weather/${fileName}`
            
            return `
                <div class="icon-wrapper" style="width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center;">
                    <img src="${iconUrl}" 
                         style="width: 100%; height: 100%; object-fit: contain;" 
                         loading="lazy"
                    />
                </div>`
        }

        // Only use Lucide for absolute unknowns
        return `<div style="width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); opacity: 0.3;">
            <svg xmlns="http://www.w3.org/2000/svg" width="${size * 0.7}" height="${size * 0.7}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19c2.5 0 4.5-2 4.5-4.5 0-2.4-1.9-4.3-4.3-4.5C17.1 7.2 14.4 5 11.4 5c-3.3 0-6 2.5-6.6 5.8C2.8 11.3 1 13.2 1 15.6c0 2.4 2 4.4 4.4 4.4z"/></svg>
        </div>`
    }
}

customElements.define("weather-card", WeatherCard)
