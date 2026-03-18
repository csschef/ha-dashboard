import { HA_URL, HA_TOKEN } from "./ha-client"

let socket: WebSocket | null = null

export function registerSocket(ws: WebSocket) {
    socket = ws
}

export function getSocket() {
    return socket
}

let messageId = 1000

function nextId() {
    return messageId++
}

export function callService(
    domain: string,
    service: string,
    serviceData: any
): Promise<any> {
    return new Promise((resolve, reject) => {
        if (!socket || socket.readyState === WebSocket.CONNECTING) {
            setTimeout(() => callService(domain, service, serviceData).then(resolve).catch(reject), 1000)
            return
        }

        if (socket.readyState !== WebSocket.OPEN) {
            console.warn("HA socket not ready. State:", socket.readyState)
            return reject("Socket not open")
        }

        const id = messageId++
        const msg = {
            id,
            type: "call_service",
            domain,
            service,
            service_data: serviceData
        }

        const handler = (event: MessageEvent) => {
            const response = JSON.parse(event.data)
            if (response.id === id) {
                socket!.removeEventListener("message", handler)
                if (response.success) resolve(response.result)
                else reject(response.error)
            }
        }
        socket.addEventListener("message", handler)
        socket.send(JSON.stringify(msg))
    })
}

export function fetchHistory(entityId: string, hours = 24): Promise<any[]> {
    return new Promise((resolve) => {
        if (!socket) {
            console.error("HA socket not ready for history")
            return resolve([])
        }

        const end = new Date()
        const start = new Date(end.getTime() - hours * 60 * 60 * 1000)
        const reqId = nextId()

        // Temporary listener for this specific request ID
        const handler = (event: MessageEvent) => {
            const msg = JSON.parse(event.data)
            if (msg.id === reqId) {
                socket!.removeEventListener("message", handler)
                if (msg.type === "result" && msg.success) {
                    // WebSocket history payload normally maps entity_id keys to arrays of states
                    // Ensure we gracefully handle both array responses and object maps depending on HA version
                    const res = msg.result
                    const entityData = Array.isArray(res) ? res : (res[entityId] || [])
                    resolve(entityData)
                } else {
                    console.error("fetchHistory WS error:", msg)
                    resolve([])
                }
            }
        }

        socket.addEventListener("message", handler)

        // Native WebSocket history request avoids CORS barriers!
        socket.send(
            JSON.stringify({
                id: reqId,
                type: "history/history_during_period",
                start_time: start.toISOString(),
                end_time: end.toISOString(),
                significant_changes_only: false,
                minimal_response: false,
                entity_ids: [entityId]
            })
        )
    })
}

export function fetchShoppingList(): Promise<any[]> {
    return new Promise((resolve) => {
        if (!socket) return resolve([])
        const reqId = nextId()
        const handler = (event: MessageEvent) => {
            const msg = JSON.parse(event.data)
            if (msg.id === reqId) {
                socket!.removeEventListener("message", handler)
                resolve(msg.result || [])
            }
        }
        socket.addEventListener("message", handler)
        socket.send(JSON.stringify({ id: reqId, type: "shopping_list/items" }))
    })
}

export function callShoppingList(service: string, data: any = {}) {
    if (!socket) return
    socket.send(JSON.stringify({
        id: nextId(),
        type: `shopping_list/${service}`,
        ...data
    }))
}

export function fetchTodoItems(entityId: string): Promise<any[]> {
    return new Promise((resolve) => {
        if (!socket) return resolve([])
        const reqId = nextId()
        const handler = (event: MessageEvent) => {
            const msg = JSON.parse(event.data)
            if (msg.id === reqId) {
                socket!.removeEventListener("message", handler)
                resolve(msg.result?.items || [])
            }
        }
        socket.addEventListener("message", handler)
        socket.send(JSON.stringify({
            id: reqId,
            type: "todo/item/list",
            entity_id: entityId
        }))
    })
}

export function callTodoService(service: string, entityId: string, data: any = {}) {
    callService("todo", service, {
        entity_id: entityId,
        ...data
    })
}

export function fetchCalendarEvents(entityId: string, start: string, end: string): Promise<any[]> {
    return new Promise((resolve) => {
        if (!socket || socket.readyState === WebSocket.CONNECTING) {
            setTimeout(() => resolve(fetchCalendarEvents(entityId, start, end)), 1000)
            return
        }

        if (socket.readyState !== WebSocket.OPEN) {
            resolve([])
            return
        }

        const reqId = nextId()
        const handler = (event: MessageEvent) => {
            const msg = JSON.parse(event.data)
            if (msg.id === reqId) {
                socket?.removeEventListener("message", handler)
                if (msg.success) {
                    const res = msg.result?.response?.[entityId] || msg.result || {}
                    const rawEvents = res.events || (Array.isArray(res) ? res : [])

                    // DEEP DEBUG: Log everything about the first event to find the ID
                    if (rawEvents.length > 0) {
                        console.log(`[Calendar Deep Debug] Full first event for ${entityId}:`, JSON.stringify(rawEvents[0]))
                    }

                    const events = rawEvents.map((e: any) => ({
                        ...e,
                        uid: e.uid || e.id || e.event_id // Map any found ID to 'uid'
                    }))
                    resolve(events)
                } else {
                    console.error(`[Calendar WS] Failed to fetch ${entityId}:`, msg.error)
                    resolve([])
                }
            }
        }
        socket?.addEventListener("message", handler)

        socket?.send(JSON.stringify({
            id: reqId,
            type: "call_service",
            domain: "calendar",
            service: "get_events",
            target: { entity_id: entityId },
            service_data: {
                start_date_time: start.split('.')[0],
                end_date_time: end.split('.')[0]
            },
            return_response: true
        }))
    })
}

// Keeping service call as an internal utility if needed, but fetch is preferred
async function fetchCalendarEventsViaService(entityId: string, start: string, end: string): Promise<any[]> {
    const reqId = nextId()
    return new Promise((resolve) => {
        const handler = (event: MessageEvent) => {
            const msg = JSON.parse(event.data)
            if (msg.id === reqId) {
                socket?.removeEventListener("message", handler)
                console.log(`[Calendar Raw] Response for ${entityId}:`, msg.result)

                // Extract events and try to find a UID/ID
                const res = msg.result?.response?.[entityId] || msg.result || {}
                const rawEvents = res.events || (Array.isArray(res) ? res : [])

                const events = rawEvents.map((e: any) => ({
                    ...e,
                    uid: e.uid || e.id || e.event_id // Ensure we have SOME kind of ID
                }))

                resolve(events)
            }
        }
        socket?.addEventListener("message", handler)

        // Using list_events which is known to return UIDs for many integrations
        socket?.send(JSON.stringify({
            id: reqId,
            type: "call_service",
            domain: "calendar",
            service: "list_events",
            target: { entity_id: entityId },
            service_data: {
                start_date_time: start.split('.')[0],
                end_date_time: end.split('.')[0]
            },
            return_response: true
        }))
    })
}

export function createCalendarEvent(entityId: string, eventData: any) {
    return callService("calendar", "create_event", {
        entity_id: entityId,
        ...eventData
    })
}

export function deleteCalendarEvent(entityId: string, uid?: string, fingerprint?: any) {
    const serviceData: any = { entity_id: entityId }

    if (uid) {
        serviceData.uid = uid
    } else if (fingerprint) {
        // FALLBACK: If no UID, try to delete by matching the event details
        serviceData.summary = fingerprint.summary
        serviceData.start_date_time = fingerprint.start
        serviceData.end_date_time = fingerprint.end
    }

    return callService("calendar", "delete_event", serviceData)
}