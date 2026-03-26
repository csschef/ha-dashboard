import { BaseCard } from "./base-card"
import { getEntity, subscribeEntity } from "../store/entity-store"
import { callService } from "../services/ha-service"
import type { HAEntity } from "../types/homeassistant"

const ICON_SVG = (cls: string) => `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
</svg>`

class BooleanCard extends BaseCard {

    private entityId = ""
    private entity?: HAEntity
    private isToggling = false
    private toggleTimeout: any
    private visuallyOn = false

    connectedCallback() {
        this.entityId = (this.getAttribute("entity") || "").trim()
        this.entity = getEntity(this.entityId)
        this.visuallyOn = this.entity?.state === "on"

        this.update()

        subscribeEntity(this.entityId, (entity: HAEntity) => {
            this.entity = entity

            if (this.isToggling) {
                if ((entity.state === "on") === this.visuallyOn) {
                    clearTimeout(this.toggleTimeout)
                    this.isToggling = false
                    this.update()
                }
                return
            }

            this.update()
        })
    }

    private toggle() {
        this.visuallyOn = !this.visuallyOn
        this.applyVisuals()

        this.isToggling = true
        clearTimeout(this.toggleTimeout)

        this.toggleTimeout = setTimeout(() => {
            this.isToggling = false
            this.update()
        }, 2000)

        callService("input_boolean", "toggle", { entity_id: this.entityId })
    }

    update() {
        if (this.isToggling) return

        if (!this.entity) {
            this.render("Laddar...", "")
            return
        }

        this.visuallyOn = this.entity.state === "on"

        const name = this.getAttribute("name") || this.entity.attributes.friendly_name || this.entityId
        const subtitle = this.visuallyOn ? "Aktiv" : "Inaktiv"

        this.render(name, subtitle)
        this.applyVisuals()
    }

    private applyVisuals() {
        const root = this.shadowRoot
        if (!root) return

        const card = root.querySelector(".card") as HTMLElement | null
        const header = root.querySelector(".header") as HTMLElement | null
        if (!card || !header) return

        const isOn = this.visuallyOn

        const subtitleEl = root.querySelector(".subtitle") as HTMLElement | null
        if (subtitleEl) subtitleEl.textContent = isOn ? "Aktiv" : "Inaktiv"

        // Always use advice-card (energitips) style: soft green gradient + green border
        card.style.setProperty("--card-bg", "linear-gradient(135deg, color-mix(in srgb, var(--color-success) 15%, transparent) 0%, color-mix(in srgb, var(--color-success) 5%, transparent) 100%)")
        card.style.setProperty("border-color", "color-mix(in srgb, var(--color-success) 30%, transparent)")
        card.style.setProperty("--card-text-primary", "var(--text-primary)")
        card.style.setProperty("--card-text-secondary", "var(--color-success)")
        card.style.setProperty("--card-icon-fill", "var(--color-success)")

        const existingTs = header.querySelector("toggle-switch") as HTMLElement | null

        if (existingTs) {
            existingTs.setAttribute("checked", String(isOn))
            existingTs.setAttribute("accent", "var(--color-success)")
            const iconWrapper = header.querySelector("div") as HTMLElement | null
            if (iconWrapper) iconWrapper.innerHTML = ICON_SVG("card-icon")
        } else {
            header.innerHTML = `
                <div style="display:flex;align-items:center">${ICON_SVG("card-icon")}</div>
                <toggle-switch checked="${isOn}" accent="var(--color-success)"></toggle-switch>
            `
            header.querySelector("toggle-switch")?.addEventListener("toggle", (e) => {
                e.stopPropagation()
                this.toggle()
            })
        }

        card.onclick = () => this.toggle()
    }
}

customElements.define("boolean-card", BooleanCard)
