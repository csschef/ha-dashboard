import { getEntity, subscribeEntity } from "../store/entity-store"

class EnergyView extends HTMLElement {
    private energyEntity = "sensor.nordpool_kwh_se3_sek_3_10_025" // Fallback name
    private prices: any[] = []

    constructor() {
        super()
        this.attachShadow({ mode: "open" })
    }

    connectedCallback() {
        this.render()
        subscribeEntity(this.energyEntity, (state: any) => {
            if (state?.attributes?.today) {
                this.prices = state.attributes.today
            }
            this.render()
        })
    }

    private getPriceStatus(price: number): { color: string; label: string } {
        if (!this.prices.length) return { color: "#8e8e93", label: "Hämtar..." }
        const min = Math.min(...this.prices)
        const max = Math.max(...this.prices)
        const range = max - min
        
        if (price <= min + range * 0.3) return { color: "#34c759", label: "Billigt" }
        if (price >= max - range * 0.3) return { color: "#ff3b30", label: "Dyrast" }
        return { color: "#ffcc00", label: "Normalt" }
    }

    render() {
        const entity = getEntity(this.energyEntity)
        
        if (!entity || !this.prices.length) {
            this.shadowRoot!.innerHTML = `
                <div style="padding: 40px; text-align: center; opacity: 0.5; color: var(--text-primary);">
                    <i class="fas fa-bolt" style="font-size: 40px; margin-bottom: 20px; display: block;"></i>
                    Hämtar prisdata från ${this.energyEntity.split('.')[1]}...
                </div>
            `
            return
        }

        const currentPrice = parseFloat(entity.state) || 0
        const { color, label } = this.getPriceStatus(currentPrice)
        
        const minPrice = Math.min(...this.prices)
        const maxPrice = Math.max(...this.prices)

        this.shadowRoot!.innerHTML = `
        <style>
            :host { display: block; padding: 0 16px 120px; color: var(--text-primary); }
            
            h2 { font-size: 22px; margin: 32px 0 16px; font-weight: 700; letter-spacing: -0.02em; }
            
            .hero-card {
                background: var(--color-card);
                border-radius: 28px;
                padding: 24px;
                box-shadow: var(--shadow-md);
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 16px;
                margin-bottom: 32px;
            }
            
            .price-circle {
                width: 160px;
                height: 160px;
                border-radius: 50%;
                border: 4px solid ${color};
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                box-shadow: 0 0 30px ${color}20;
            }
            
            .price-val { font-size: 38px; font-weight: 700; letter-spacing: -2px; }
            .price-unit { font-size: 14px; opacity: 0.5; font-weight: 500; }
            
            .status-badge {
                background: ${color}20;
                color: ${color};
                padding: 6px 16px;
                border-radius: 20px;
                font-weight: 700;
                font-size: 12px;
                text-transform: uppercase;
            }

            .price-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 16px;
                margin-bottom: 32px;
            }
            .grid-item {
                background: var(--color-card-alt);
                border-radius: 20px;
                padding: 16px;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .grid-label { font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; }
            .grid-val { font-size: 18px; font-weight: 600; }

            /* ── SVG Horizon Chart ── */
            .chart-box {
                background: var(--color-card);
                border-radius: 24px;
                padding: 24px 16px;
                box-shadow: var(--shadow-sm);
            }
            svg { width: 100%; height: 120px; overflow: visible; }
            .bar { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
            .now-line { stroke: var(--accent); stroke-width: 2; stroke-dasharray: 4; }
        </style>

        <h2>Energi</h2>
        
        <div class="hero-card">
            <div class="status-badge">${label}</div>
            <div class="price-circle">
                <div class="price-val">${(currentPrice).toFixed(1)}</div>
                <div class="price-unit">öre / kWh</div>
            </div>
            <div style="font-size: 13px; color: var(--text-secondary); text-align: center;">
                Kvartspris för SE3 (nuvarande timme)
            </div>
        </div>

        <div class="price-grid">
            <div class="grid-item">
                <div class="grid-label">Dagens lägsta</div>
                <div class="grid-val" style="color: #34c759;">${(minPrice).toFixed(1)} öre</div>
            </div>
            <div class="grid-item">
                <div class="grid-label">Dagens högsta</div>
                <div class="grid-val" style="color: #ff3b30;">${(maxPrice).toFixed(1)} öre</div>
            </div>
        </div>

        <div class="chart-box">
            <div class="grid-label" style="margin-bottom: 12px; opacity: 0.5;">Priskurva idag</div>
            <svg viewBox="0 0 240 100" preserveAspectRatio="none">
                <defs>
                   <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.8" />
                        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.1" />
                   </linearGradient>
                </defs>
                ${this.prices.map((p, i) => {
                    const h = (p / maxPrice) * 80
                    const x = i * 10
                    const isNow = i === new Date().getHours()
                    return `
                        <rect class="bar" 
                              x="${x + 1}" 
                              y="${100 - h}" 
                              width="8" 
                              height="${h}" 
                              rx="2"
                              fill="${isNow ? 'var(--accent)' : 'var(--color-card-alt)'}"
                              style="opacity: ${isNow ? 1 : 0.6}" />
                        ${isNow ? `<line class="now-line" x1="${x + 5}" y1="0" x2="${x + 5}" y2="100" />` : ''}
                    `
                }).join('')}
            </svg>
            <div style="display: flex; justify-content: space-between; margin-top: 8px; font-size: 10px; color: var(--text-secondary); font-weight: 700;">
                <span>00:00</span>
                <span>Nu</span>
                <span>23:00</span>
            </div>
        </div>
        `
    }
}

customElements.define("energy-view", EnergyView)
