import "./styles/tokens.css"
import "./styles/layout.css"
import "./styles/cards.css"

import "./components/toggle-switch"
import "./components/base-card"
import "./components/room-divider"
import "./components/light-card"
import "./components/light-popup"

import { connectHA } from "./services/ha-client"

console.log("Dashboard starting")

connectHA()

/* ── Theme toggle ── */

const html = document.documentElement
const btn = document.getElementById("themeBtn") as HTMLButtonElement | null

function getSystemTheme() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyTheme(theme: "light" | "dark") {
    html.setAttribute("data-theme", theme)
    if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙"
    localStorage.setItem("ha-theme", theme)
}

// Initialise from localStorage or system preference
const saved = localStorage.getItem("ha-theme") as "light" | "dark" | null
applyTheme(saved ?? getSystemTheme())

btn?.addEventListener("click", () => {
    const current = html.getAttribute("data-theme") as "light" | "dark"
    applyTheme(current === "dark" ? "light" : "dark")
})

/* ── Hash Router for Subviews ── */

const views = document.querySelectorAll(".view")
const pageTitle = document.getElementById("pageTitle")
const backBtn = document.getElementById("backBtn")

function handleRoute() {
    const hash = window.location.hash || "#home"
    const targetId = hash.replace("#", "")

    // Find target view; fallback to home if not found
    let targetView = document.getElementById(targetId)
    if (!targetView) {
        targetView = document.getElementById("home")
    }

    // Hide all, show target
    views.forEach(v => (v as HTMLElement).style.display = "none")
    if (targetView) targetView.style.display = "block"

    // Update topbar UI
    if (hash === "#home" || hash === "") {
        if (backBtn) backBtn.style.display = "none"
        if (pageTitle) pageTitle.textContent = "Hem"
    } else {
        if (backBtn) backBtn.style.display = "flex"
        // VERY simple logic: capitalise route name for title
        if (pageTitle) pageTitle.textContent = targetId.charAt(0).toUpperCase() + targetId.slice(1)
    }
}

window.addEventListener("hashchange", handleRoute)
// Trigger once on load
handleRoute()

if (backBtn) {
    backBtn.addEventListener("click", () => {
        // Simple back action (defaults to home if no history)
        if (window.history.length > 2) {
            window.history.back()
        } else {
            window.location.hash = "#home"
        }
    })
}
