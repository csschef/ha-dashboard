import { BaseCard } from "./base-card"
import { getEntity, subscribeEntity } from "../store/entity-store"
import { callService } from "../services/ha-service"
import type { HAEntity } from "../types/homeassistant"

class PcCard extends BaseCard {
    private entityId = ""
    private binaryEntityId = ""
    private steamEntityId = ""
    private powerService = ""
    private pcName = ""
    private powerEntityId = ""
    private noWol = false
 
    private mainEntity?: HAEntity
    private binaryEntity?: HAEntity
    private steamEntity?: HAEntity

    private visuallyOn = false
    private isToggling = false
    private toggleTimeout: any

    connectedCallback() {
        this.pcName = this.getAttribute("name") || "PC"
        this.entityId = this.getAttribute("entity") || ""
        this.binaryEntityId = this.getAttribute("binary-entity") || ""
        this.steamEntityId = this.getAttribute("steam-entity") || ""
        this.powerService = this.getAttribute("power-service") || ""
        this.powerEntityId = this.getAttribute("power-entity") || ""
        this.noWol = this.hasAttribute("no-wol")

        if (this.entityId) {
            subscribeEntity(this.entityId, (e: HAEntity) => {
                this.mainEntity = e
                if (!this.isToggling) this.update()
            })
        }

        if (this.binaryEntityId) {
            subscribeEntity(this.binaryEntityId, (e: HAEntity) => {
                this.binaryEntity = e
                if (!this.isToggling) this.update()
            })
        }

        if (this.steamEntityId) {
            subscribeEntity(this.steamEntityId, (e: HAEntity) => {
                this.steamEntity = e
                if (!this.isToggling) this.update()
            })
        }

        this.update()
    }

    private toggle() {
        this.isToggling = true
        this.visuallyOn = !this.visuallyOn
        
        // Optimistic render
        this.render(this.pcName, this.visuallyOn ? "Startar..." : "Av")
        this.applyVisuals()

        clearTimeout(this.toggleTimeout)
        this.toggleTimeout = setTimeout(() => {
            this.isToggling = false
            this.update()
        }, 3500)

        if (this.powerService) {
            const [domain, service] = this.powerService.split('.')
            const targetId = this.powerEntityId || this.entityId
            const data: any = {}
            if (domain !== 'script') data.entity_id = targetId
            callService(domain as any, service, data)
        } else {
            callService("input_boolean", "toggle", { entity_id: this.entityId })
        }
    }

    update() {
        if (!this.mainEntity || this.isToggling) {
            if (!this.mainEntity) this.render(this.pcName, "Laddar...")
            return
        }

        const toggleOn = this.mainEntity.state === "on"
        const pcOn = this.binaryEntity ? this.binaryEntity.state === "on" : toggleOn
        const steam = this.steamEntity
        
        let status = "Av"
        
        // Match user's specific logic from YAML
        if (this.pcName === "RGBDreamz") {
            const game = steam?.attributes?.game || "På"
            // RGBDreamz: Prioritize reality (pcOn) over the toggle
            if (pcOn) {
                if (!steam || steam.state === "unavailable" || ["offline", "away", "snooze"].includes(steam.state)) status = "På"
                else if (steam.state === "online") status = game
                else status = "På"
            } 
            else if (toggleOn) {
                status = "Startar"
            } 
            else {
                status = "Av"
            }
        } 
        else if (this.pcName === "Dator") {
            // Dator: Prioritize toggle to prevent "dancing" during shutdown
            if (!toggleOn) status = "Av"
            else if (!pcOn) status = "Startar"
            else status = "På"
        } 
        else {
            // Laptop or generic PC
            status = toggleOn ? "På" : "Av"
        }

        this.render(this.pcName, status)
        this.visuallyOn = (status !== "Av")
        this.applyVisuals()
    }

    private applyVisuals() {
        const root = this.shadowRoot
        if (!root) return

        const card = root.querySelector(".card") as HTMLElement
        if (!card) return

        const isOn = this.visuallyOn

        if (isOn) {
            // Match the TV card's 'Violet Horizon' gradient
            card.style.setProperty("--card-bg", "linear-gradient(145deg, #767cda 0%, #a0a5eb 100%)")
            card.style.setProperty("--card-text-primary", "#ffffff")
            card.style.setProperty("--card-text-secondary", "rgba(255,255,255,0.85)")
            card.style.setProperty("--card-icon-fill", "#ffffff")
        } else {
            card.style.removeProperty("--card-bg")
            card.style.removeProperty("--card-text-primary")
            card.style.removeProperty("--card-text-secondary")
            card.style.removeProperty("--card-icon-fill")
        }

        const WINDOWS_ICON = `<svg class="card-icon" viewBox="0 0 24 24" style="fill:none; stroke:currentColor; stroke-width:1.5; stroke-linecap:round; stroke-linejoin:round; width:20px; height:20px;">
            <path d="M2.5 18.5v-13l19-4v21zM10 4v16m-7.5-8h19" />
        </svg>`

        const header = root.querySelector(".header") as HTMLElement
        if (header) {
            const accent = isOn ? "#525698" : ""
            const accentStyle = accent ? ` style="--toggle-accent:${accent}"` : ""

            const existingTs = header.querySelector("toggle-switch") as any
            if (existingTs) {
                existingTs.setAttribute("checked", String(isOn))
                existingTs.style.visibility = (this.noWol && !isOn) ? "hidden" : "visible"
                if (accent) existingTs.setAttribute("accent", accent)
                else existingTs.removeAttribute("accent")
                const wrap = header.querySelector(".pc-icon-wrap")
                if (wrap) wrap.innerHTML = WINDOWS_ICON
            } else {
                const tsVisibility = (this.noWol && !isOn) ? 'style="visibility:hidden"' : ""
                header.innerHTML = `
                    <div class="pc-icon-wrap" style="display:flex;align-items:center">
                        ${WINDOWS_ICON}
                    </div>
                    <toggle-switch checked="${isOn}" accent="${accent}"${accentStyle} ${tsVisibility}></toggle-switch>
                `
                header.querySelector("toggle-switch")?.addEventListener('toggle', (e: any) => {
                    e.stopPropagation()
                    this.toggle()
                })
            }
        }
    }
}

customElements.define("pc-card", PcCard)
