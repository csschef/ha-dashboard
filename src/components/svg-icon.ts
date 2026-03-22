export class SvgIcon extends HTMLElement {
    private static cache: Record<string, string> = {}
    private currentSrc: string = ""

    constructor() {
        super()
        this.attachShadow({ mode: "open" })
    }

    static get observedAttributes() {
        return ["src", "condition"]
    }

    attributeChangedCallback() {
        this.render()
    }

    connectedCallback() {
        this.render()
    }

    private async render() {
        const src = this.getAttribute("src")
        if (!src || src === this.currentSrc) return
        this.currentSrc = src

        let content = SvgIcon.cache[src]

        if (!content) {
            try {
                const res = await fetch(src)
                if (res.ok) {
                    content = await res.text()
                    SvgIcon.cache[src] = content
                }
            } catch (e) {
                console.error("Failed to load SVG:", src, e)
            }
        }

        if (content) {
            this.shadowRoot!.innerHTML = `
                <style>
                    :host {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 100%;
                        height: 100%;
                    }
                    svg {
                        width: 100%;
                        height: 100%;
                        display: block;
                        overflow: visible;
                    }

                    /* Color mappings for theme overrides */
                    svg stop[stop-color="#fdc015"] { stop-color: var(--weather-sun-1, #fdc015); }
                    svg stop[stop-color="#f3d87c"] { stop-color: var(--weather-sun-2, #f3d87c); }
                    svg stop[stop-color="#fdd76c"] { stop-color: var(--weather-moon-1, #fdd76c); }
                    svg stop[stop-color="#f9e095"] { stop-color: var(--weather-moon-2, #f9e095); }
                    svg stop[stop-color="#edf0f4"] { stop-color: var(--weather-cloud-1, #edf0f4); }
                    svg stop[stop-color="#a4a4a5"] { stop-color: var(--weather-cloud-dark, #a4a4a5); }
                    svg stop[stop-color="#ffffff"] { stop-color: var(--weather-cloud-2, #ffffff); }
                    svg path[fill="rgba(255,255,255,0.65)"] { fill: var(--weather-rain, rgba(255,255,255,0.65)); }
                    svg path[fill="#fbc224"] { fill: var(--weather-lightning, #fbc224); }

                    /* ── Default Animations ── */
                    
                    /* Slajdande moln för ALLA molnikoner */
                    @keyframes cloud-slide {
                        0%, 100% { transform: translateX(0); }
                        50% { transform: translateX(10px); }
                    }

                    .cloud, path[fill*="cloudGradient"], path[d^="M34.613"] {
                        animation: cloud-slide 6s ease-in-out infinite;
                        transform-box: fill-box;
                    }

                    /* Regndroppar för rainy */
                    @keyframes rain-fall {
                        0% { transform: translateY(0px); opacity: 0; }
                        30% { opacity: 1; }
                        100% { transform: translateY(15px); opacity: 0; }
                    }

                    :host([condition*="rainy"]) .drop-1,
                    :host([condition*="rainy"]) .drop-2,
                    :host([condition*="rainy"]) .drop-3,
                    :host([condition*="pouring"]) .drop-1,
                    :host([condition*="pouring"]) .drop-2,
                    :host([condition*="pouring"]) .drop-3 {
                        transform-box: fill-box;
                        opacity: 0;
                    }

                    :host([condition*="rainy"]) .drop-1 { animation: rain-fall 2.5s infinite 0s linear; }
                    :host([condition*="rainy"]) .drop-2 { animation: rain-fall 2.5s infinite 0.8s linear; }
                    :host([condition*="rainy"]) .drop-3 { animation: rain-fall 2.5s infinite 1.6s linear; }

                    :host([condition*="pouring"]) .drop-1 { animation: rain-fall 1.0s infinite 0s linear; }
                    :host([condition*="pouring"]) .drop-2 { animation: rain-fall 1.0s infinite 0.3s linear; }
                    :host([condition*="pouring"]) .drop-3 { animation: rain-fall 1.0s infinite 0.6s linear; }

                    /* Dimma (fog) */
                    @keyframes fog-drift {
                        0%, 100% { transform: translateX(0); }
                        50% { transform: translateX(8px); }
                    }

                    :host([condition*="fog"]) .fog-line {
                        animation: fog-drift 6s ease-in-out infinite;
                        transform-box: fill-box;
                    }

                    :host([condition*="fog"]) .fog-line:nth-of-type(even) {
                        animation-duration: 8s;
                        animation-delay: -1s;
                    }

                    /* Blixt (lightning) */
                    @keyframes lightning-flash {
                        0%, 80%, 86%, 92%, 100% { opacity: 0; }
                        83%, 89%, 95% { opacity: 1; }
                    }

                    .lightning {
                        animation: lightning-flash 5s infinite;
                        transform-box: fill-box;
                    }

                    /* Snö (snow) */
                    @keyframes snow-fall {
                        0% { transform: translateY(0) translateX(0); opacity: 0; }
                        20% { opacity: 1; }
                        100% { transform: translateY(20px) translateX(4px); opacity: 0; }
                    }

                    :host([condition*="snowy"]) [class^="flake-"] {
                        transform-box: fill-box;
                        opacity: 0;
                    }

                    :host([condition*="snowy"]) .flake-1 { animation: snow-fall 4s infinite 0s linear; }
                    :host([condition*="snowy"]) .flake-2 { animation: snow-fall 4s infinite 1.3s linear; }
                    :host([condition*="snowy"]) .flake-3 { animation: snow-fall 4s infinite 2.6s linear; }

                    /* Hagel (hail) */
                    @keyframes hail-fall {
                        0% { transform: translateY(0) rotate(0deg); opacity: 0; }
                        10% { opacity: 1; }
                        100% { transform: translateY(20px) rotate(15deg); opacity: 0; }
                    }

                    :host([condition*="hail"]) [class^="hail-"] {
                        transform-box: fill-box;
                        opacity: 0;
                    }

                    :host([condition*="hail"]) .hail-1 { animation: hail-fall 0.8s infinite 0s linear; }
                    :host([condition*="hail"]) .hail-2 { animation: hail-fall 0.8s infinite 0.3s linear; }
                    :host([condition*="hail"]) .hail-3 { animation: hail-fall 0.8s infinite 0.6s linear; }

                    /* Vi kan lägga på fler här sen när vi targetar andra element */
                </style>
                ${content}
            `
        }
    }
}

customElements.define("svg-icon", SvgIcon)
