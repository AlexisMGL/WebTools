

var DataflashParser

import('../modules/JsDataflashParser/parser.js').then((mod) => { DataflashParser = mod.default });

let jspack
let jspackReadyPromise = import("./MAVLink/local_modules/jspack/jspack.js").then((mod) => {
    jspack = new mod.default()
}).catch((e) => {
    console.warn("jspack load failed", e)
})



function plot_visibility(plot, hide) {

    plot.parentElement.hidden = hide

}



// Time stamp for each bin

function bin_time(low_bin, high_bin, bin_width) {

    let time = array_from_range(low_bin, high_bin, 1.0)

    time = array_scale(time, bin_width)

    return array_offset(time, bin_width * 0.5)

}



// Splint time into bins and count size of instances in each bin

function bin_count(time_in, size, bin_width, total) {



    // Bin index for given time array

    function bin_index(time, bin_width) {

        const len = time.length

        let ret = new Array(len)

        for (let i = 0; i < len; i++) {

            ret[i] = Math.floor(time[i] / bin_width)

        }

        return ret

    }



    // Size of msg at index, deal with array size

    function get_size(i) {

        if (Array.isArray(size)) {

            return size[i]

        }

        return size

    }



    const bins = bin_index(time_in, bin_width)



    let low_bin = Infinity

    let high_bin = -Infinity

    const len = bins.length

    for (let i = 0; i < len; i++) {

        low_bin = Math.min(low_bin, bins[i])

        high_bin = Math.max(high_bin, bins[i])

    }

    total.low_bin = Math.min(total.low_bin, low_bin)

    total.high_bin = Math.max(total.high_bin, high_bin)



    const time = bin_time(low_bin, high_bin, bin_width)



    // Sort bins into counts

    let count = new Array(time.length).fill(0)

    for (let i = 0; i < len; i++) {

        const bin = bins[i]

        const size = get_size(i)



        // Add to msg count

        count[bin - low_bin] += size



        // Add to total count

        if (total.count[bin] == null) {

            total.count[bin] = 0

        }

        total.count[bin] += size

    }



    // Normalize by bin width

    count = array_scale(count, 1 / bin_width)



    return { time, count }

}



// Take total object and return time and count

function total_count(total, bin_width) {

    if (total.count.length == 0) {
        // No data
        return { time: null, count: null }
    }



    let time = bin_time(total.low_bin, total.high_bin, bin_width)

    let count = total.count.slice(total.low_bin, total.high_bin + 1)



    // Fill in any any missing data and normalize for bin size

    const len = count.length

    for (let i = 0; i < len; i++) {

        if (count[i] == null) {

            count[i] = 0

        }

        count[i] /= bin_width

    }


    return { time, count }
}

const mavlinkFieldCache = {}
let tlogFieldStats = {}
let availableMessageFields = {}
let tlogStatusTexts = []
let ptgiAltSeries = []
let ptgiRawSeries = []
let customDistSeries = []
let gpiDistSeries = []
let ptgiPath = []
let gpiPath = []
let homeLat = null
let homeLon = null
let tlogMessagesSeen = new Set()
let tlogFieldSeries = {}
let tlogEndTime = null
let palierAwayWindow = null
let palierReturnWindow = null
let farFromHomeWindow = null
let tlogMessageSamples = {}
let graphConfig = {}
let graphPlots = {}
let routeMap = null
let routeLayers = []
let leafletLoadingPromise = null
const manualFieldnames = {
    87: ["time_boot_ms", "lat", "lon", "alt", "vx", "vy", "vz", "afx", "afy", "afz", "yaw", "yaw_rate", "type_mask", "target_system", "target_component"],
    147: ["current_consumed", "energy_consumed", "temperature", "voltages", "current_battery", "id", "battery_function", "type", "battery_remaining"],
    74: ["airspeed", "groundspeed", "heading", "throttle", "alt", "climb"],
    241: ["time_usec", "vibration_x", "vibration_y", "vibration_z", "clipping_0", "clipping_1", "clipping_2"]
}
const mavlinkNameToId = (() => {
    const res = {}
    if (typeof mavlink_msgs !== "undefined") {
        Object.keys(mavlink_msgs).forEach(id => {
            const entry = mavlink_msgs[id]
            if (entry && entry.name) {
                res[entry.name] = Number(id)
            }
        })
    }
    return res
})()

// --- Supabase (shared config) ---
const SUPABASE_URL = "https://tcyzpwgfetktblazbgtz.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjeXpwd2dmZXRrdGJsYXpiZ3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3ODgyNzIsImV4cCI6MjA3ODM2NDI3Mn0.UEDF3LrZeSD3aeaBtSivvFAs8YCr1iUSs1EAhOEAyyQ"
const REMOTE_TABLE_CHECKS = "streamcheck_checks"
const REMOTE_TABLE_SEQ = "streamcheck_sequence"
const REMOTE_TABLE_GRAPHS = "streamcheck_graphs"
const REMOTE_CHECKS_ID = "shared"
const REMOTE_SEQ_ID = "shared"
const REMOTE_GRAPHS_ID = "shared"
let supabasePromise

async function getSupabase() {
    if (!supabasePromise) {
        supabasePromise = import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.48.0/+esm").then(({ createClient }) => {
            return createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
        }).catch(e => {
            console.warn("Supabase import failed", e)
            throw e
        })
    }
    return supabasePromise
}

function getMavlinkFieldMeta(msgId) {
    const mavScope = (typeof mavlink20 !== "undefined") ? mavlink20 : (typeof window !== "undefined" ? window.mavlink20 : null)
    if (!mavScope || mavScope.map == null) {
        return null
    }
    if (mavlinkFieldCache[msgId] != null) {
        return mavlinkFieldCache[msgId]
    }
    const entry = mavScope.map[msgId]
    if (entry == null || entry.type == null) {
        return null
    }
    const instance = new entry.type()
    const fieldnames = (instance.fieldnames && instance.fieldnames.length > 0)
        ? instance.fieldnames.slice()
        : (manualFieldnames[msgId] || [])
    const meta = {
        format: entry.format,
        order: entry.order_map,
        fieldnames
    }
    mavlinkFieldCache[msgId] = meta
    return meta
}

function decodeMavlinkPayload(msgId, buffer, offset, length) {
    if (typeof jspack === 'undefined') {
        return null
    }
    const mavScope = (typeof mavlink20 !== "undefined") ? mavlink20 : (typeof window !== "undefined" ? window.mavlink20 : null)
    if (!mavScope || !mavScope.map) {
        return null
    }
    const meta = getMavlinkFieldMeta(msgId)
    if (meta == null || meta.fieldnames.length === 0) {
        return null
    }
    let unpacked
    try {
        const payload = new Uint8Array(buffer, offset, length)
        unpacked = jspack.Unpack(meta.format, payload)
    } catch (e) {
        return null
    }
    if (unpacked === false || !Array.isArray(unpacked)) {
        return null
    }
    const values = meta.fieldnames.map((_, idx) => unpacked[meta.order[idx]])
    return { fieldnames: meta.fieldnames, values }
}

function parsePTGIManual(buffer, offset, length) {
    if (length < 16) return null
    const dv = new DataView(buffer, offset, length)
    const res = {}
    if (length >= 4) res.time_boot_ms = dv.getUint32(0, true)
    res.lat = dv.getInt32(4, true) / 1e7
    res.lon = dv.getInt32(8, true) / 1e7
    res.alt = dv.getInt32(12, true) / 1000
    if (length >= 28) {
        res.vx = dv.getFloat32(16, true)
        res.vy = dv.getFloat32(20, true)
        res.vz = dv.getFloat32(24, true)
    }
    if (length >= 40) {
        res.afx = dv.getFloat32(28, true)
        res.afy = dv.getFloat32(32, true)
        res.afz = dv.getFloat32(36, true)
    }
    if (length >= 48) {
        res.yaw = dv.getFloat32(40, true)
        res.yaw_rate = dv.getFloat32(44, true)
    }
    if (length >= 50) {
        res.type_mask = dv.getUint16(48, true)
    }
    if (length >= 52) {
        res.target_system = dv.getUint8(50)
        res.target_component = dv.getUint8(51)
    }
    return res
}

function parseGPIGlobal(buffer, offset, length) {
    if (length < 28) return null
    const dv = new DataView(buffer, offset, length)
    return {
        time_boot_ms: dv.getUint32(0, true),
        lat: dv.getInt32(4, true) / 1e7,
        lon: dv.getInt32(8, true) / 1e7,
        alt: dv.getInt32(12, true) / 1000,
        relative_alt: dv.getInt32(16, true) / 1000
    }
}

function parseVibrationManual(buffer, offset, length) {
    if (length < 20) return null
    const dv = new DataView(buffer, offset, length)
    const res = {
        time_usec: dv.getBigUint64(0, true),
        vibration_x: dv.getFloat32(8, true),
        vibration_y: dv.getFloat32(12, true),
        vibration_z: dv.getFloat32(16, true)
    }
    if (length >= 32) {
        res.clipping_0 = dv.getUint32(20, true)
        res.clipping_1 = dv.getUint32(24, true)
        res.clipping_2 = dv.getUint32(28, true)
    }
    return res
}

function parseBatteryStatusManual(buffer, offset, length) {
    // Common BATTERY_STATUS layout (len 36)
    if (length < 36) return null
    const dv = new DataView(buffer, offset, length)
    const res = {}
    res.current_consumed = dv.getInt32(0, true)
    res.energy_consumed = dv.getInt32(4, true)
    res.temperature = dv.getInt16(8, true)
    res.voltages = []
    for (let i = 0; i < 10; i++) {
        res.voltages.push(dv.getUint16(10 + 2 * i, true))
    }
    res.current_battery = dv.getInt16(30, true)
    res.id = dv.getUint8(32)
    res.battery_function = dv.getUint8(33)
    res.type = dv.getUint8(34)
    res.battery_remaining = dv.getInt8(35)
    return res
}

function parseVfrHudManual(buffer, offset, length) {
    if (length < 4) return null
    const dv = new DataView(buffer, offset, length)
    const res = {}
    if (length >= 4) res.airspeed = dv.getFloat32(0, true)
    if (length >= 8) res.groundspeed = dv.getFloat32(4, true)
    if (length >= 12) res.alt = dv.getFloat32(8, true)
    if (length >= 16) res.climb = dv.getFloat32(12, true)
    if (length >= 18) res.heading = dv.getInt16(16, true)
    if (length >= 20) res.throttle = dv.getUint16(18, true)
    return res
}

function pushFieldSample(messageName, fieldName, time, value) {
    if (typeof value === "bigint") {
        value = Number(value)
    }
    if (!Number.isFinite(value)) return
    if (!(messageName in tlogFieldSeries)) {
        tlogFieldSeries[messageName] = {}
    }
    if (!(fieldName in tlogFieldSeries[messageName])) {
        tlogFieldSeries[messageName][fieldName] = []
    }
    tlogFieldSeries[messageName][fieldName].push({ time, value })
}

function pushMessageSample(messageName, time, payload) {
    if (!payload || !payload.fieldnames) return
    if (!(messageName in tlogMessageSamples)) {
        tlogMessageSamples[messageName] = []
    }
    const sample = {}
    payload.fieldnames.forEach((field, idx) => {
        let val = payload.values[idx]
        if (typeof val === "bigint") val = Number(val)
        sample[field] = val
    })
    tlogMessageSamples[messageName].push({ time, fields: sample })
}

function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000
    const toRad = (d) => d * Math.PI / 180
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
}

function updateFieldStats(messageName, fieldName, value) {
    if (typeof value === "bigint") {
        value = Number(value)
    }
    if (!Number.isFinite(value)) {
        return
    }
    if (!(messageName in tlogFieldStats)) {
        tlogFieldStats[messageName] = {}
    }
    if (!(fieldName in tlogFieldStats[messageName])) {
        tlogFieldStats[messageName][fieldName] = { min: Infinity, max: -Infinity, sum: 0, count: 0 }
    }
    const stats = tlogFieldStats[messageName][fieldName]
    stats.min = Math.min(stats.min, value)
    stats.max = Math.max(stats.max, value)
    stats.sum += value
    stats.count += 1
}

function getStatValue(stats, aggregate) {
    if (stats == null || stats.count === 0) {
        return null
    }
    if (aggregate === "min") {
        return stats.min
    }
    if (aggregate === "max") {
        return stats.max
    }
    return stats.sum / stats.count
}

function statsForWindow(message, field, start, end, aggregate) {
    const arr = tlogFieldSeries[message]?.[field]
    if (!arr || arr.length === 0) return null
    let min = Infinity
    let max = -Infinity
    let sum = 0
    let count = 0
    const hasStart = Number.isFinite(start)
    const hasEnd = Number.isFinite(end)
    for (const { time, value } of arr) {
        if (hasStart && time < start) continue
        if (hasEnd && time > end) continue
        if (!Number.isFinite(value)) continue
        if (value < min) min = value
        if (value > max) max = value
        sum += value
        count++
    }
    if (count === 0) return null
    if (aggregate === "min") return min
    if (aggregate === "max") return max
    return sum / count
}

function statsForWindowWithFilter(message, field, start, end, aggregate, intersection) {
    if (!intersection) {
        return statsForWindow(message, field, start, end, aggregate)
    }
    const arr = tlogMessageSamples[message]
    if (!arr || arr.length === 0) return null
    const hasStart = Number.isFinite(start)
    const hasEnd = Number.isFinite(end)
    const interField = intersection.field
    const interValue = intersection.value
    let min = Infinity
    let max = -Infinity
    let sum = 0
    let count = 0
    for (const { time, fields } of arr) {
        if (hasStart && time < start) continue
        if (hasEnd && time > end) continue
        if (!(interField in fields)) continue
        if (fields[interField] != interValue) continue
        let val = fields[field]
        if (typeof val === "bigint") val = Number(val)
        if (!Number.isFinite(val)) continue
        if (val < min) min = val
        if (val > max) max = val
        sum += val
        count++
    }
    if (count === 0) return null
    if (aggregate === "min") return min
    if (aggregate === "max") return max
    return sum / count
}

function getPhaseBounds(seq) {
    const start0 = seq["seq-start"]
    const takeoffEnd = seq["vtol-takeoff"]
    const transitionEnd = seq["transition"]
    const cruiseAwayEnd = seq["cruise-away"]
    const cruiseReturnEnd = seq["cruise-return"]
    const airbrakeEnd = seq["airbrake"]
    const landingEnd = seq["vtol-landing"] ?? tlogEndTime

    const takeoffStart = start0
    const transitionStart = takeoffEnd ?? start0
    const cruiseAwayStart = transitionEnd ?? transitionStart

    const cruiseAwayWindow = cruiseAwayEnd != null && cruiseAwayEnd > cruiseAwayStart
        ? { start: cruiseAwayStart, end: cruiseAwayEnd }
        : null

    const cruiseReturnStart = cruiseAwayEnd ?? cruiseAwayStart
    const cruiseReturnWindow = cruiseReturnEnd != null && cruiseReturnEnd > cruiseReturnStart
        ? { start: cruiseReturnStart, end: cruiseReturnEnd }
        : (airbrakeEnd && airbrakeEnd > cruiseReturnStart ? { start: cruiseReturnStart, end: airbrakeEnd } : null)

    const airbrakeStart = cruiseReturnWindow?.end ?? cruiseReturnStart
    const airbrakeWindow = airbrakeEnd != null && airbrakeEnd > airbrakeStart
        ? { start: airbrakeStart, end: airbrakeEnd }
        : null

    const landingStart = airbrakeWindow?.end ?? airbrakeStart
    const landingWindow = landingEnd != null && landingEnd > (landingStart ?? 0)
        ? { start: landingStart, end: landingEnd }
        : null

    const takeoffWindow = (takeoffEnd != null && takeoffStart != null && takeoffEnd > takeoffStart)
        ? { start: takeoffStart, end: takeoffEnd }
        : null
    const transitionWindow = (transitionEnd != null && transitionStart != null && transitionEnd > transitionStart)
        ? { start: transitionStart, end: transitionEnd }
        : null

    return {
        start0,
        takeoffWindow,
        transitionWindow,
        cruiseAwayWindow,
        cruiseReturnWindow,
        airbrakeWindow,
        landingWindow,
        landingEnd
    }
}

function statusTextToString(val) {
    if (val == null) {
        return null
    }
    if (typeof val === "string") {
        return val.replace(/\0+$/, "")
    }
    if (Array.isArray(val)) {
        return arrayBytesToString(val)
    }
    if (ArrayBuffer.isView(val)) {
        return arrayBytesToString(Array.from(val))
    }
    return val.toString()
}

function arrayBytesToString(arr) {
    let chars = []
    for (let i = 0; i < arr.length; i++) {
        const c = arr[i]
        if (c === 0) {
            break
        }
        chars.push(String.fromCharCode(c))
    }
    return chars.join("")
}

function extractStatusText(payload) {
    if (payload == null) {
        return null
    }
    const idx = payload.fieldnames.findIndex(n => n.toLowerCase().startsWith("text"))
    if (idx === -1) {
        return null
    }
    const txt = statusTextToString(payload.values[idx])
    return txt == null ? null : txt.trim()
}

function extractStatusTextFromBytes(buffer, offset, length) {
    // STATUSTEXT: severity (1 byte) + text[50] (null-terminated)
    if (buffer == null || length <= 1) {
        return null
    }
    const bytes = new Uint8Array(buffer, offset, length)
    let chars = []
    for (let i = 1; i < bytes.length; i++) {
        const c = bytes[i]
        if (c === 0) break
        chars.push(String.fromCharCode(c))
    }
    if (chars.length === 0) {
        return null
    }
    return chars.join("").trim()
}

const CHECKS_STORAGE_KEY = "streamcheck_checks_v1"
let checkConfig = {}
const localChecksCache = loadSavedChecks()
checkConfig = localChecksCache
const checkPairs = {
    "vtol-takeoff": "vtol-landing",
    "transition": "airbrake",
    "cruise-away": "cruise-return",
    "palier-away": "palier-return"
}

function loadSavedChecks() {
    try {
        const raw = localStorage.getItem(CHECKS_STORAGE_KEY)
        if (raw == null) {
            return {}
        }
        const parsed = JSON.parse(raw)
        if (parsed == null || typeof parsed !== "object") {
            return {}
        }
        return parsed
    } catch (e) {
        console.warn("Could not load saved checks", e)
        return {}
    }
}

function saveChecks() {
    try {
        localStorage.setItem(CHECKS_STORAGE_KEY, JSON.stringify(checkConfig))
    } catch (e) {
        console.warn("Could not save checks", e)
    }
    pushRemoteChecks().catch(err => console.warn("Remote checks save failed", err))
}

function generateCheckId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID()
    }
    return "chk_" + Date.now() + "_" + Math.random().toString(16).slice(2)
}

function getAvailableMessages() {
    const all = new Set()
    Object.keys(availableMessageFields || {}).forEach(k => all.add(k))
    Object.keys(tlogFieldStats || {}).forEach(k => all.add(k))
    tlogMessagesSeen.forEach(k => all.add(k))
    if (typeof mavlink_msgs !== "undefined") {
        Object.values(mavlink_msgs).forEach(entry => {
            if (entry && entry.name && entry.name.toUpperCase().includes("CUSTOM")) {
                all.add(entry.name)
            }
        })
    }
    Object.keys(tlogMessageSamples || {}).forEach(k => all.add(k))
    return Array.from(all).sort()
}

function getFieldsForMessage(message) {
    if (availableMessageFields[message]) {
        return availableMessageFields[message]
    }
    if (tlogFieldStats[message]) {
        return Object.keys(tlogFieldStats[message])
    }
    if (tlogMessageSamples[message] && tlogMessageSamples[message].length > 0) {
        const keys = Object.keys(tlogMessageSamples[message][0].fields || {})
        if (keys.length > 0) {
            availableMessageFields[message] = keys
            return keys
        }
    }
    const msgId = mavlinkNameToId[message]
    if (msgId != null) {
        const meta = getMavlinkFieldMeta(msgId)
        if (meta && Array.isArray(meta.fieldnames) && meta.fieldnames.length > 0) {
            availableMessageFields[message] = meta.fieldnames
            return meta.fieldnames
        }
    }
    return []
}

function formatBound(val) {
    if (val == null || val === "") {
        return "-"
    }
    const num = Number(val)
    if (!Number.isFinite(num)) {
        return "-"
    }
    return num.toString()
}

function buildCheckRow(section, check) {
    const row = document.createElement("div")
    row.className = "check-item"
    row.dataset.checkId = check.id
    row.draggable = true
    row.addEventListener("dblclick", () => openEditCheckDialog(section, check.id))

    const status = document.createElement("span")
    status.className = "check-status pending"
    status.textContent = "?"
    status.title = "En attente d'un tlog"

    const value = document.createElement("span")
    value.className = "check-value"
    value.textContent = "-"

    const label = document.createElement("span")
    label.className = "check-label"
    const mult = check.mult != null ? Number(check.mult) : 1
    const interTxt = check.intersection && check.intersection.field ? ` | si ${check.intersection.field}=${check.intersection.value}` : ""
    label.textContent = `${check.message} · ${check.field} (${check.aggregate} x${mult}) in [${formatBound(check.min)} ; ${formatBound(check.max)}]${interTxt}`

    const remove = document.createElement("button")
    remove.className = "check-remove"
    remove.textContent = "×"
    remove.addEventListener("click", () => removeCheck(section, check.id))

    row.append(status, value, label, remove)
    return row
}

function renderChecks() {
    document.querySelectorAll(".check-list").forEach(list => {
        const section = list.dataset.section
        list.replaceChildren()
        const checks = checkConfig[section] || []
        if (checks.length === 0) {
            const empty = document.createElement("div")
            empty.className = "check-item"
            const status = document.createElement("span")
            status.className = "check-status pending"
            status.textContent = "?"
            const label = document.createElement("span")
            label.className = "check-label"
            label.textContent = "Aucun check"
            empty.append(status, label)
            list.appendChild(empty)
            return
        }
        checks.forEach(check => list.appendChild(buildCheckRow(section, check)))
    })
    attachDragHandlers()
}

let dragCheckInfo = null

function attachDragHandlers() {
    document.querySelectorAll(".check-item").forEach(row => {
        row.addEventListener("dragstart", (e) => {
            dragCheckInfo = {
                id: row.dataset.checkId,
                section: row.closest(".check-list")?.dataset.section || null
            }
            e.dataTransfer.effectAllowed = "move"
        })
        row.addEventListener("dragover", (e) => {
            if (!dragCheckInfo) return
            const list = row.closest(".check-list")
            if (!list || list.dataset.section !== dragCheckInfo.section) return
            e.preventDefault()
            const dragging = list.querySelector(`[data-check-id=\"${dragCheckInfo.id}\"]`)
            if (!dragging || dragging === row) return
            const rect = row.getBoundingClientRect()
            const before = e.clientY < rect.top + rect.height / 2
            if (before) {
                list.insertBefore(dragging, row)
            } else {
                list.insertBefore(dragging, row.nextSibling)
            }
        })
        row.addEventListener("drop", (e) => {
            e.preventDefault()
            finalizeOrder(row.closest(".check-list"))
        })
        row.addEventListener("dragend", () => {
            finalizeOrder(row.closest(".check-list"))
        })
    })
}

function finalizeOrder(list) {
    if (!list || !dragCheckInfo) return
    const section = list.dataset.section
    if (!section || section !== dragCheckInfo.section) {
        dragCheckInfo = null
        return
    }
    const ids = Array.from(list.querySelectorAll("[data-check-id]")).map(el => el.dataset.checkId)
    const current = checkConfig[section] || []
    const idToCheck = Object.fromEntries(current.map(c => [c.id, c]))
    checkConfig[section] = ids.map(id => idToCheck[id]).filter(Boolean)
    dragCheckInfo = null
    saveChecks()
    evaluateChecks()
}

function removeCheck(section, checkId) {
    if (!(section in checkConfig)) {
        return
    }
    checkConfig[section] = checkConfig[section].filter(c => c.id !== checkId)
    saveChecks()
    renderChecks()
    evaluateChecks()
}

function markChecksPending(message = "En attente d'un tlog") {
    document.querySelectorAll("[data-check-id] .check-status").forEach(el => {
        el.textContent = "?"
        el.classList.remove("pass", "fail")
        el.classList.add("pending")
        el.title = message
    })
    document.querySelectorAll("[data-check-id] .check-value").forEach(el => {
        el.textContent = "-"
    })
}

function setCheckStatus(checkId, state, detail) {
    const el = document.querySelector(`[data-check-id="${checkId}"] .check-status`)
    if (!el) {
        return
    }
    el.classList.remove("pending", "pass", "fail")
    if (state === "pass") {
        el.textContent = "✓"
        el.classList.add("pass")
    } else if (state === "fail") {
        el.textContent = "✗"
        el.classList.add("fail")
    } else {
        el.textContent = "?"
        el.classList.add("pending")
    }
    el.title = detail || ""
}

function setCheckValue(checkId, value) {
    const el = document.querySelector(`[data-check-id="${checkId}"] .check-value`)
    if (!el) {
        return
    }
    el.textContent = value == null ? "-" : value
}

function evaluateChecks() {
    markChecksPending("En attente d'un tlog")
    if (Object.keys(tlogFieldStats).length === 0) {
        return
    }
    const bounds = getPhaseBounds(sequenceMatches)
    const sectionWindow = (section) => {
        switch (section) {
            case "vtol-takeoff":
                return bounds.takeoffWindow
            case "transition":
                return bounds.transitionWindow
            case "cruise-away":
                return bounds.cruiseAwayWindow
            case "cruise-return":
                return bounds.cruiseReturnWindow
            case "airbrake":
                return bounds.airbrakeWindow
            case "vtol-landing":
                return bounds.landingWindow
            case "palier-away":
                return palierAwayWindow ? { start: palierAwayWindow.start, end: palierAwayWindow.end } : null
            case "palier-return":
                return palierReturnWindow ? { start: palierReturnWindow.start, end: palierReturnWindow.end } : null
            case "full-flight":
                return { start: bounds.start0, end: bounds.landingEnd }
            case "far-from-home":
                return farFromHomeWindow ? { start: farFromHomeWindow.start, end: farFromHomeWindow.end } : null
            case "response":
            case "parachute":
                return { start: bounds.start0, end: bounds.landingEnd }
            default:
                return { start: null, end: null }
        }
    }
    for (const [section, checks] of Object.entries(checkConfig)) {
        for (const check of checks) {
            const win = sectionWindow(section)
            if (!win || !Number.isFinite(win.start) || !Number.isFinite(win.end) || win.end <= win.start) {
                setCheckStatus(check.id, "pending", "Phase vide ou bornes manquantes")
                setCheckValue(check.id, "-")
                continue
            }
            const rawVal = statsForWindowWithFilter(
                check.message,
                check.field,
                win?.start,
                win?.end,
                check.aggregate,
                check.intersection && check.intersection.field ? check.intersection : null
            )
            if (rawVal == null) {
                setCheckStatus(check.id, "pending", "Pas de données pour ce champ")
                continue
            }
            const mult = check.mult != null ? Number(check.mult) : 1
            const value = rawVal * mult
            let ok = true
            if (check.min != null && check.min !== "" && value < Number(check.min)) {
                ok = false
            }
            if (check.max != null && check.max !== "" && value > Number(check.max)) {
                ok = false
            }
            const detail = `${check.aggregate}=${value.toFixed(3)} / limites [${formatBound(check.min)} ; ${formatBound(check.max)}]`
            setCheckStatus(check.id, ok ? "pass" : "fail", detail)
            setCheckValue(check.id, value.toFixed(3))
        }
    }
}

function openCheckDialog(sectionId) {
    return openCheckDialogInternal(sectionId)
}

function openEditCheckDialog(sectionId, checkId) {
    const checks = checkConfig[sectionId] || []
    const existing = checks.find(c => c.id === checkId)
    if (!existing) return
    return openCheckDialogInternal(sectionId, existing)
}

function openCheckDialogInternal(sectionId, existing = null) {
    const messages = getAvailableMessages()
    if (messages.length === 0) {
        alert("Charge un tlog pour récupérer les messages et champs.")
        return
    }

    const modal = document.createElement("div")
    modal.className = "check-modal"

    const panel = document.createElement("div")
    panel.className = "panel"

    const title = document.createElement("h3")
    title.textContent = existing ? "Modifier le check" : "Add check"
    panel.appendChild(title)

    const messageLabel = document.createElement("label")
    messageLabel.textContent = "Message"
    const messageSelect = document.createElement("select")
    messageSelect.name = "chk-message"
    messageSelect.id = "chk-message"
    messages.forEach(m => {
        const opt = document.createElement("option")
        opt.value = m
        opt.textContent = m
        messageSelect.appendChild(opt)
    })
    messageLabel.appendChild(messageSelect)
    panel.appendChild(messageLabel)

    const fieldLabel = document.createElement("label")
    fieldLabel.textContent = "Champ"
    const fieldSelect = document.createElement("select")
    fieldSelect.name = "chk-field"
    fieldSelect.id = "chk-field"
    fieldLabel.appendChild(fieldSelect)
    panel.appendChild(fieldLabel)

    const interRow = document.createElement("div")
    interRow.className = "intersection-row"
    const interToggle = document.createElement("input")
    interToggle.type = "checkbox"
    interToggle.id = "chk-intersection"
    interToggle.name = "chk-intersection"
    const interLabel = document.createElement("label")
    interLabel.textContent = "Filtrer (champ = valeur)"
    interLabel.prepend(interToggle)
    const interField = document.createElement("select")
    interField.name = "chk-intersection-field"
    interField.disabled = true
    const interValue = document.createElement("input")
    interValue.type = "number"
    interValue.step = "any"
    interValue.placeholder = "valeur"
    interValue.name = "chk-intersection-value"
    interValue.disabled = true
    interRow.append(interLabel, interField, interValue)
    panel.appendChild(interRow)

    const aggLabel = document.createElement("label")
    aggLabel.textContent = "Agrégat"
    const aggSelect = document.createElement("select")
    aggSelect.name = "chk-aggregate"
    ;["max", "min", "mean"].forEach(v => {
        const opt = document.createElement("option")
        opt.value = v
        opt.textContent = v
        aggSelect.appendChild(opt)
    })
    aggLabel.appendChild(aggSelect)
    panel.appendChild(aggLabel)

    const multLabel = document.createElement("label")
    multLabel.textContent = "Multiplicateur (par défaut 1.0)"
    const multInput = document.createElement("input")
    multInput.type = "number"
    multInput.step = "any"
    multInput.value = existing ? existing.mult ?? 1 : "1"
    multInput.name = "chk-mult"
    multLabel.appendChild(multInput)
    panel.appendChild(multLabel)

    const minLabel = document.createElement("label")
    minLabel.textContent = "Min autorisé (optionnel)"
    const minInput = document.createElement("input")
    minInput.type = "number"
    minInput.step = "any"
    minInput.name = "chk-min"
    minLabel.appendChild(minInput)
    panel.appendChild(minLabel)

    const maxLabel = document.createElement("label")
    maxLabel.textContent = "Max autorisé (optionnel)"
    const maxInput = document.createElement("input")
    maxInput.type = "number"
    maxInput.step = "any"
    maxInput.name = "chk-max"
    maxLabel.appendChild(maxInput)
    panel.appendChild(maxLabel)

    const actions = document.createElement("div")
    actions.className = "actions"
    const cancelBtn = document.createElement("button")
    cancelBtn.textContent = "Annuler"
    const addBtn = document.createElement("button")
    addBtn.textContent = "Ajouter"
    addBtn.className = "primary"
    actions.append(cancelBtn, addBtn)
    panel.appendChild(actions)

    modal.appendChild(panel)
    document.body.appendChild(modal)

    function refreshFields() {
        fieldSelect.replaceChildren()
        interField.replaceChildren()
        const fields = getFieldsForMessage(messageSelect.value)
        if (fields.length === 0) {
            const opt = document.createElement("option")
            opt.value = ""
            opt.textContent = "Aucun champ disponible"
            fieldSelect.appendChild(opt)
            const opt2 = document.createElement("option")
            opt2.value = ""
            opt2.textContent = "Aucun champ"
            interField.appendChild(opt2)
            return
        }
        fields.forEach(f => {
            const opt = document.createElement("option")
            opt.value = f
            opt.textContent = f
            fieldSelect.appendChild(opt)
            const opt2 = document.createElement("option")
            opt2.value = f
            opt2.textContent = f
            interField.appendChild(opt2)
        })
    }

    if (existing) {
        messageSelect.value = existing.message
    }
    refreshFields()
    if (existing) {
        if (existing.field) {
            fieldSelect.value = existing.field
        }
        if (existing.intersection && existing.intersection.field) {
            interToggle.checked = true
            interField.disabled = false
            interValue.disabled = false
            interField.value = existing.intersection.field
            interValue.value = existing.intersection.value
        }
        aggSelect.value = existing.aggregate
        if (existing.min != null) minInput.value = existing.min
        if (existing.max != null) maxInput.value = existing.max
    }
    messageSelect.addEventListener("change", refreshFields)
    interToggle.addEventListener("change", () => {
        const on = interToggle.checked
        interField.disabled = !on
        interValue.disabled = !on
    })

    function closeModal() {
        document.body.removeChild(modal)
    }

    cancelBtn.addEventListener("click", closeModal)
    modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            closeModal()
        }
    })

    addBtn.addEventListener("click", () => {
        const message = messageSelect.value
        const field = fieldSelect.value
        const aggregate = aggSelect.value
        const minRaw = minInput.value.trim()
        const maxRaw = maxInput.value.trim()

        if (!message || !field) {
            alert("Choisis un message et un champ.")
            return
        }

        const minVal = minRaw === "" ? null : Number(minRaw)
        const maxVal = maxRaw === "" ? null : Number(maxRaw)

        if (minRaw !== "" && Number.isNaN(minVal)) {
            alert("Min doit être un nombre.")
            return
        }
        if (maxRaw !== "" && Number.isNaN(maxVal)) {
            alert("Max doit être un nombre.")
            return
        }

        if (!(sectionId in checkConfig)) {
            checkConfig[sectionId] = []
        }
        const updated = {
            id: existing ? existing.id : generateCheckId(),
            message,
            field,
            aggregate,
            min: minVal,
            max: maxVal,
            mult: Number(multInput.value) || 1,
            intersection: null
        }
        if (interToggle.checked && interField.value) {
            const valRaw = interValue.value
            const valNum = valRaw === "" ? null : Number(valRaw)
            const val = valRaw === "" ? "" : (Number.isNaN(valNum) ? valRaw : valNum)
            updated.intersection = { field: interField.value, value: val }
        }
        if (!(sectionId in checkConfig)) {
            checkConfig[sectionId] = []
        }
        if (existing) {
            checkConfig[sectionId] = checkConfig[sectionId].map(c => c.id === existing.id ? updated : c)
        } else {
            checkConfig[sectionId].push(updated)
        }

        const paired = checkPairs[sectionId]
        if (paired) {
            const msg = `Ajouter aussi ce check dans "${paired}" ?`
            if (confirm(msg)) {
                if (!(paired in checkConfig)) {
                    checkConfig[paired] = []
                }
                if (existing) {
                    const clone = { ...updated, id: generateCheckId() }
                    checkConfig[paired].push(clone)
                } else {
                    checkConfig[paired].push({ ...updated, id: generateCheckId() })
                }
            }
        }

        saveChecks()
        renderChecks()
        evaluateChecks()
        closeModal()
    })
}

function initCheckUI() {
    renderChecks()
    document.querySelectorAll(".add-check-btn").forEach(btn => {
        btn.addEventListener("click", () => openCheckDialog(btn.dataset.section))
    })
    syncChecksFromRemote()
    const addGraphBtn = document.getElementById("add-graph-btn")
    if (addGraphBtn) {
        addGraphBtn.addEventListener("click", openAddGraphDialog)
    }
    syncGraphsFromRemote()
    renderGraphCards()
}

document.addEventListener("DOMContentLoaded", initCheckUI)

const GRAPHS_STORAGE_KEY = "streamcheck_graphs_v1"
const SEQ_STORAGE_KEY = "streamcheck_sequence_v1"
const graphDefaults = []
let graphLocalCache = loadSavedGraphs()
graphConfig = graphLocalCache
const sequenceSteps = [
    { id: "seq-start", label: "Début (avant VTOL Takeoff)" },
    { id: "vtol-takeoff", label: "VTOL Takeoff" },
    { id: "transition", label: "Transition" },
    { id: "cruise-away", label: "Cruise Away" },
    { id: "cruise-return", label: "Cruise Return" },
    { id: "airbrake", label: "Airbrake" },
    { id: "vtol-landing", label: "VTOL Landing (fin)" },
]
let sequenceConfig = {}
const localSequenceCache = loadSavedSequenceConfig()
sequenceConfig = localSequenceCache
let sequenceMatches = {}

async function fetchRemoteConfig(table, id) {
    try {
        const supabase = await getSupabase()
        const { data, error } = await supabase
            .from(table)
            .select("config")
            .eq("id", id)
            .maybeSingle()
        if (error) {
            if (error.code !== "PGRST116") {
                throw error
            }
            return null
        }
        return data?.config ?? null
    } catch (e) {
        console.warn("Remote fetch failed", table, e)
        return null
    }
}

async function pushRemoteChecks() {
    try {
        const supabase = await getSupabase()
        await supabase
            .from(REMOTE_TABLE_CHECKS)
            .upsert({ id: REMOTE_CHECKS_ID, config: checkConfig })
    } catch (e) {
        console.warn("Remote push checks failed", e)
    }
}

async function pushRemoteSequence() {
    try {
        const supabase = await getSupabase()
        await supabase
            .from(REMOTE_TABLE_SEQ)
            .upsert({ id: REMOTE_SEQ_ID, config: sequenceConfig })
    } catch (e) {
        console.warn("Remote push sequence failed", e)
    }
}

function loadSavedSequenceConfig() {
    try {
        const raw = localStorage.getItem(SEQ_STORAGE_KEY)
        if (!raw) {
            return {}
        }
        const parsed = JSON.parse(raw)
        if (parsed == null || typeof parsed !== "object") {
            return {}
        }
        return parsed
    } catch (e) {
        console.warn("Could not load sequencing config", e)
        return {}
    }
}

async function fetchRemoteGraphs() {
    try {
        const supabase = await getSupabase()
        const { data, error } = await supabase
            .from(REMOTE_TABLE_GRAPHS)
            .select("config")
            .eq("id", REMOTE_GRAPHS_ID)
            .maybeSingle()
        if (error) {
            if (error.code !== "PGRST116") {
                throw error
            }
            return null
        }
        return data?.config ?? null
    } catch (e) {
        console.warn("Remote graphs fetch failed", e)
        return null
    }
}

async function pushRemoteGraphs() {
    try {
        const supabase = await getSupabase()
        await supabase
            .from(REMOTE_TABLE_GRAPHS)
            .upsert({ id: REMOTE_GRAPHS_ID, config: graphConfig })
    } catch (e) {
        console.warn("Remote graphs save failed", e)
    }
}

function saveSequenceConfig() {
    try {
        localStorage.setItem(SEQ_STORAGE_KEY, JSON.stringify(sequenceConfig))
    } catch (e) {
        console.warn("Could not save sequencing config", e)
    }
    pushRemoteSequence().catch(err => console.warn("Remote sequence save failed", err))
}

function loadSavedGraphs() {
    try {
        const raw = localStorage.getItem(GRAPHS_STORAGE_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === "object" ? parsed : {}
    } catch (e) {
        console.warn("Could not load graphs", e)
        return {}
    }
}

function saveGraphs() {
    try {
        localStorage.setItem(GRAPHS_STORAGE_KEY, JSON.stringify(graphConfig))
    } catch (e) {
        console.warn("Could not save graphs", e)
    }
    pushRemoteGraphs().catch(err => console.warn("Remote graphs save failed", err))
}

function renderSequenceRows() {
    const container = document.getElementById("sequence-rows")
    if (!container) return
    container.replaceChildren()
    sequenceSteps.forEach(step => {
        const card = document.createElement("div")
        card.className = "sequence-card"
        card.dataset.seqId = step.id

        const title = document.createElement("h4")
        title.textContent = step.label
        card.appendChild(title)

        const row = document.createElement("div")
        row.className = "sequence-row"

        const input = document.createElement("input")
        input.type = "text"
        input.placeholder = "Texte dans STATUSTEXT"
        input.name = `seq-input-${step.id}`
        input.id = `seq-input-${step.id}`
        input.dataset.seqInput = step.id
        row.appendChild(input)

        const select = document.createElement("select")
        select.name = `seq-mode-${step.id}`
        select.id = `seq-mode-${step.id}`
        select.dataset.seqMode = step.id
        ;[{ v: "first", l: "premier" }, { v: "last", l: "dernier" }].forEach(opt => {
            const o = document.createElement("option")
            o.value = opt.v
            o.textContent = opt.l
            select.appendChild(o)
        })
        row.appendChild(select)

        card.appendChild(row)

        const result = document.createElement("div")
        result.className = "seq-result"
        result.dataset.seqResult = step.id
        result.textContent = "En attente d'un tlog"
        card.appendChild(result)

        container.appendChild(card)
    })
    applySequenceConfigToInputs()
    bindSequenceInputs()
}

function applySequenceConfigToInputs() {
    sequenceSteps.forEach(step => {
        const input = document.querySelector(`[data-seq-input="${step.id}"]`)
        const select = document.querySelector(`[data-seq-mode="${step.id}"]`)
        const cfg = sequenceConfig[step.id] || { needle: "", mode: "first" }
        if (input) input.value = cfg.needle || ""
        if (select) select.value = cfg.mode || "first"
    })
}

function bindSequenceInputs() {
    sequenceSteps.forEach(step => {
        const input = document.querySelector(`[data-seq-input="${step.id}"]`)
        const select = document.querySelector(`[data-seq-mode="${step.id}"]`)
        if (input) {
            input.onchange = () => updateSequenceConfig(step.id)
        }
        if (select) {
            select.onchange = () => updateSequenceConfig(step.id)
        }
    })
}

function updateSequenceConfig(id) {
    const input = document.querySelector(`[data-seq-input="${id}"]`)
    const select = document.querySelector(`[data-seq-mode="${id}"]`)
    const needle = input ? input.value.trim() : ""
    const mode = select ? select.value : "first"
    sequenceConfig[id] = { needle, mode }
    saveSequenceConfig()
    evaluateSequence()
}

function renderSequenceResultsPending(msg = "En attente d'un tlog") {
    sequenceSteps.forEach(step => {
        const el = document.querySelector(`[data-seq-result="${step.id}"]`)
        if (el) {
            el.textContent = msg
        }
    })
    const ff = document.getElementById("seq-full-flight")
    if (ff) {
        ff.textContent = "Full flight : " + msg
    }
    const dump = document.getElementById("statustext-list")
    if (dump) {
        dump.textContent = ""
    }
    const ptgiDump = document.getElementById("ptgi-list")
    if (ptgiDump) ptgiDump.textContent = ""
    const customDump = document.getElementById("custom-list")
    if (customDump) customDump.textContent = ""
    const batDump = document.getElementById("battery-list")
    if (batDump) batDump.textContent = ""
    const vfrDump = document.getElementById("vfrhud-list")
    if (vfrDump) vfrDump.textContent = ""
    const infoDump = document.getElementById("mavlink-info")
    if (infoDump) infoDump.textContent = ""
    palierAwayWindow = null
    palierReturnWindow = null
    farFromHomeWindow = null
}

function evaluateSequence() {
    renderSequenceResultsPending()
    sequenceMatches = {}
    if (tlogStatusTexts.length === 0) {
        renderTelemCheck()
        updateDerivedSections()
        return
    }
    const texts = tlogStatusTexts.map(e => ({ time: e.time, text: (e.text || "").toLowerCase().trim() }))
    const dump = document.getElementById("statustext-list")
    if (dump) {
        dump.textContent = tlogStatusTexts
            .map(e => `${e.time.toFixed(2)}s: ${e.text}`)
            .join("\n")
    }
    const ptgiDump = document.getElementById("ptgi-list")
    if (ptgiDump) {
        ptgiDump.textContent = `Count=${ptgiRawSeries.length}\n` + ptgiRawSeries
            .map(e => `${e.time.toFixed(2)}s: ${e.payload ? JSON.stringify(e.payload) : "payload decode failed"}`)
            .join("\n")
    }
    const customDump = document.getElementById("custom-list")
    if (customDump) {
        customDump.textContent = `CUSTOM Count=${customDistSeries.length}\n` + customDistSeries
            .map(e => `${e.time != null ? e.time.toFixed(2) : "-"}s: dist=${e.dist}`)
            .join("\n")
    }
    const batDump = document.getElementById("battery-list")
    if (batDump) {
        const samples = tlogMessageSamples["BATTERY_STATUS"] || []
        const maxRows = 200
        batDump.textContent = `BATTERY_STATUS Count=${samples.length}\n` + samples.slice(0, maxRows)
            .map(e => `${e.time.toFixed(2)}s: ${JSON.stringify(e.fields)}`)
            .join("\n")
    }
    const vfrDump = document.getElementById("vfrhud-list")
    if (vfrDump) {
        const samples = tlogMessageSamples["VFR_HUD"] || []
        const maxRows = 200
        vfrDump.textContent = `VFR_HUD Count=${samples.length}\n` + samples.slice(0, maxRows)
            .map(e => `${e.time.toFixed(2)}s: ${JSON.stringify(e.fields)}`)
            .join("\n")
    }
    const infoDump = document.getElementById("mavlink-info")
    if (infoDump) {
        infoDump.textContent = `Parsed msgs: ${Object.keys(system||{}).length} systems\nSeen msg names: ${Array.from(tlogMessagesSeen).join(", ")}`
    }
    sequenceSteps.forEach(step => {
        const cfg = sequenceConfig[step.id] || { needle: "", mode: "first" }
        const resEl = document.querySelector(`[data-seq-result="${step.id}"]`)
        if (!cfg.needle || cfg.needle.trim() === "") {
            if (resEl) resEl.textContent = "Aucun motif configuré"
            return
        }
        const needle = cfg.needle.toLowerCase().trim()
        const matches = texts.filter(e => e.text.includes(needle))
        if (matches.length === 0) {
            if (resEl) resEl.textContent = "Non trouvé"
            return
        }
        const chosen = cfg.mode === "last" ? matches[matches.length - 1] : matches[0]
        sequenceMatches[step.id] = chosen.time
        if (resEl) {
            const prefix = step.id === "seq-start" ? "Début" : `Fin ${step.label}`
            resEl.textContent = `${prefix} : ${chosen.time.toFixed(2)} s`
        }
    })
    // If no "cruise-return" marker, treat whole cruise as return (test flight, no drop) starting after transition
    if (sequenceMatches["cruise-return"] == null) {
        const awayEl = document.querySelector('[data-seq-result="cruise-away"]')
        const retEl = document.querySelector('[data-seq-result="cruise-return"]')
        if (awayEl) {
            awayEl.textContent = "Test : cruise away vide (pas de largage)"
        }
        const fallbackStart = sequenceMatches["transition"] ?? sequenceMatches["cruise-away"]
        if (retEl) {
            if (fallbackStart != null) {
                retEl.textContent = `Cruise return démarre à ${fallbackStart.toFixed(2)} s`
            } else {
                retEl.textContent = "Cruise return démarre après transition (temps inconnu)"
            }
        }
        sequenceMatches["cruise-return"] = fallbackStart
    }
    const ff = document.getElementById("seq-full-flight")
    if (ff) {
        const bounds = getPhaseBounds(sequenceMatches)
        const start = bounds.start0
        const end = bounds.landingEnd
        if (start != null && end != null && end > start) {
            ff.textContent = `Full flight : ${start.toFixed(2)} s -> ${end.toFixed(2)} s`
        } else {
            ff.textContent = "Full flight : bornes manquantes"
        }
    }
    renderTelemCheck()
    updateDerivedSections()
    evaluateChecks()
    plotGraphs()
    renderRouteMap()
}

function initSequenceUI() {
    renderSequenceRows()
    renderSequenceResultsPending()
    syncSequenceFromRemote()
}

document.addEventListener("DOMContentLoaded", initSequenceUI)

function renderGraphCards() {
    const container = document.getElementById("graphs-container")
    if (!container) return
    container.replaceChildren()
    Object.entries(graphConfig || {}).forEach(([graphId, graph]) => {
        graph.series = Array.isArray(graph.series) ? graph.series : []
        const card = document.createElement("div")
        card.className = "analysis-card"
        const header = document.createElement("div")
        header.className = "card-header"
        const h3 = document.createElement("h3")
        h3.textContent = graph.name || "Graph"
        const del = document.createElement("button")
        del.textContent = "supprimer"
        del.addEventListener("click", () => {
            delete graphConfig[graphId]
            saveGraphs()
            renderGraphCards()
            plotGraphs()
        })
        const addSeries = document.createElement("button")
        addSeries.textContent = "ajouter serie"
        addSeries.addEventListener("click", () => openGraphSeriesDialog(graphId))
        header.append(h3, addSeries, del)
        card.appendChild(header)
        const graphDiv = document.createElement("div")
        graphDiv.id = `graph-${graphId}`
        graphDiv.style.height = "320px"
        card.appendChild(graphDiv)
        const stats = document.createElement("div")
        stats.className = "analysis-result"
        stats.id = `graph-stats-${graphId}`
        card.appendChild(stats)
        container.appendChild(card)
    })
    plotGraphs()
}

function openAddGraphDialog() {
    const name = prompt("Nom du graph")
    if (!name) return
    const id = generateCheckId()
    graphConfig[id] = { name, series: [] }
    saveGraphs()
    renderGraphCards()
}

function openGraphSeriesDialog(graphId) {
    const graph = graphConfig[graphId]
    if (!graph) return
    graph.series = Array.isArray(graph.series) ? graph.series : []
    const messages = getAvailableMessages()
    if (messages.length === 0) {
        alert("Charge un tlog pour récupérer les messages et champs.")
        return
    }

    const modal = document.createElement("div")
    modal.className = "check-modal"
    const panel = document.createElement("div")
    panel.className = "panel"
    const title = document.createElement("h3")
    title.textContent = "Ajouter une série"
    panel.appendChild(title)

    const messageLabel = document.createElement("label")
    messageLabel.textContent = "Message"
    const messageSelect = document.createElement("select")
    messageSelect.name = "graph-message"
    messageSelect.id = "graph-message"
    messages.forEach(m => {
        const opt = document.createElement("option")
        opt.value = m
        opt.textContent = m
        messageSelect.appendChild(opt)
    })
    messageLabel.appendChild(messageSelect)
    panel.appendChild(messageLabel)

    const fieldLabel = document.createElement("label")
    fieldLabel.textContent = "Champ"
    const fieldSelect = document.createElement("select")
    fieldSelect.name = "graph-field"
    fieldSelect.id = "graph-field"
    fieldLabel.appendChild(fieldSelect)
    panel.appendChild(fieldLabel)

    const interRow = document.createElement("div")
    interRow.className = "intersection-row"
    const interToggle = document.createElement("input")
    interToggle.type = "checkbox"
    interToggle.id = "graph-intersection"
    interToggle.name = "graph-intersection"
    const interLabel = document.createElement("label")
    interLabel.textContent = "Filtrer (champ = valeur)"
    interLabel.prepend(interToggle)
    const interField = document.createElement("select")
    interField.name = "graph-intersection-field"
    interField.disabled = true
    const interValue = document.createElement("input")
    interValue.type = "number"
    interValue.step = "any"
    interValue.placeholder = "valeur"
    interValue.name = "graph-intersection-value"
    interValue.disabled = true
    interRow.append(interLabel, interField, interValue)
    panel.appendChild(interRow)

    const multLabel = document.createElement("label")
    multLabel.textContent = "Multiplicateur (par défaut 1.0)"
    const multInput = document.createElement("input")
    multInput.type = "number"
    multInput.step = "any"
    multInput.value = "1"
    multInput.name = "graph-mult"
    multLabel.appendChild(multInput)
    panel.appendChild(multLabel)

    const actions = document.createElement("div")
    actions.className = "actions"
    const cancelBtn = document.createElement("button")
    cancelBtn.textContent = "Annuler"
    const addBtn = document.createElement("button")
    addBtn.textContent = "Ajouter"
    addBtn.className = "primary"
    actions.append(cancelBtn, addBtn)
    panel.appendChild(actions)

    modal.appendChild(panel)
    document.body.appendChild(modal)

    function refreshFields() {
        fieldSelect.replaceChildren()
        interField.replaceChildren()
        const fields = getFieldsForMessage(messageSelect.value)
        if (fields.length === 0) {
            const opt = document.createElement("option")
            opt.value = ""
            opt.textContent = "Aucun champ disponible"
            fieldSelect.appendChild(opt)
            const opt2 = document.createElement("option")
            opt2.value = ""
            opt2.textContent = "Aucun champ"
            interField.appendChild(opt2)
            return
        }
        fields.forEach(f => {
            const opt = document.createElement("option")
            opt.value = f
            opt.textContent = f
            fieldSelect.appendChild(opt)
            const opt2 = document.createElement("option")
            opt2.value = f
            opt2.textContent = f
            interField.appendChild(opt2)
        })
    }

    refreshFields()
    messageSelect.addEventListener("change", refreshFields)
    interToggle.addEventListener("change", () => {
        const on = interToggle.checked
        interField.disabled = !on
        interValue.disabled = !on
    })

    function closeModal() {
        document.body.removeChild(modal)
    }
    cancelBtn.addEventListener("click", closeModal)
    modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal()
    })

    addBtn.addEventListener("click", () => {
        const message = messageSelect.value
        const field = fieldSelect.value
        if (!message || !field) {
            alert("Choisis un message et un champ.")
            return
        }
        const mult = Number(multInput.value) || 1
        let intersection = null
        if (interToggle.checked && interField.value) {
            const raw = interValue.value
            const num = raw === "" ? null : Number(raw)
            const val = raw === "" ? "" : (Number.isNaN(num) ? raw : num)
            intersection = { field: interField.value, value: val }
        }
        graph.series.push({
            id: generateCheckId(),
            message,
            field,
            mult,
            intersection
        })
        saveGraphs()
        renderGraphCards()
        closeModal()
    })
}

function plotGraphs() {
    const bounds = getPhaseBounds(sequenceMatches)
    const start = bounds.start0 ?? 0
    const end = bounds.landingEnd ?? tlogEndTime
    Object.entries(graphConfig || {}).forEach(([graphId, graph]) => {
        graph.series = Array.isArray(graph.series) ? graph.series : []
        if (!graph.series || graph.series.length === 0) {
            const targetEmpty = document.getElementById(`graph-stats-${graphId}`)
            if (targetEmpty) targetEmpty.textContent = "Pas de serie"
            return
        }
        const target = document.getElementById(`graph-${graphId}`)
        if (!target) return
        const traces = []
        graphPlots[graphId] = graphPlots[graphId] || {}
        graphPlots[graphId].series = []
        const seriesList = Array.isArray(graph.series) ? graph.series : []
        seriesList.forEach((series, idx) => {
            const arr = tlogMessageSamples[series.message] || []
            const x = []
            const y = []
            arr.forEach(s => {
                if (s.time == null) return
                if (start != null && s.time < start) return
                if (end != null && s.time > end) return
                if (series.intersection && series.intersection.field) {
                    const v = s.fields?.[series.intersection.field]
                    if (v != series.intersection.value) return
                }
                let val = s.fields?.[series.field]
                if (typeof val === "bigint") val = Number(val)
                if (!Number.isFinite(val)) return
                val = val * (series.mult ?? 1)
                x.push(s.time)
                y.push(val)
            })
            graphPlots[graphId].series.push({ x, y, name: `${series.message}.${series.field}` })
            traces.push({
                x,
                y,
                name: `${series.message}.${series.field}`,
                type: "scatter",
                mode: "lines",
                line: { width: 2 },
            })
        })
        Plotly.newPlot(target, traces, {
            margin: { t: 20, r: 10, b: 40, l: 60 },
            xaxis: { title: "Temps (s)", range: start != null && end != null ? [start, end] : undefined },
            yaxis: { title: "Valeurs" },
            dragmode: "zoom",
            paper_bgcolor: "white",
            plot_bgcolor: "white",
            hovermode: "closest",
        }, { responsive: true })
        target.on("plotly_relayout", (ev) => {
            const rng = ev["xaxis.range"] || ev["xaxis.range[0]"] ? [ev["xaxis.range[0]"], ev["xaxis.range[1]"]] : null
            updateGraphStats(graphId, rng)
        })
        target.on("plotly_selected", (ev) => {
            if (!ev || !ev.range) return
            updateGraphStats(graphId, [ev.range.x[0], ev.range.x[1]])
        })
        updateGraphStats(graphId, start != null && end != null ? [start, end] : null)
    })
}

function renderRouteMap() {
    const mapDiv = document.getElementById("route-map")
    if (!mapDiv) return
    const info = document.getElementById("route-map-info")
    const bounds = getPhaseBounds(sequenceMatches)
    const start = bounds.start0 ?? 0
    const end = bounds.landingEnd ?? tlogEndTime
    if (start == null || end == null) {
        if (info) info.textContent = "Bornes manquantes (sequence)"
        return
    }
    const plan = ptgiPath.filter(p => p.time >= start && (end == null || p.time <= end) && Number.isFinite(p.lat) && Number.isFinite(p.lon))
    const actual = gpiPath.filter(p => p.time >= start && (end == null || p.time <= end) && Number.isFinite(p.lat) && Number.isFinite(p.lon))
    if (plan.length === 0 && actual.length === 0) {
        if (info) info.textContent = "Pas de points (attends un tlog ou borne manquante)"
        return
    }
    ensureLeafletLoaded().then(Lctx => {
        if (Lctx) {
            if (!routeMap) {
                routeMap = Lctx.map(mapDiv).setView([0, 0], 2)
                Lctx.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 18,
                    attribution: '&copy; OpenStreetMap'
                }).addTo(routeMap)
            }
            routeLayers.forEach(l => {
                try { routeMap.removeLayer(l) } catch (e) {}
            })
            routeLayers = []
            let allLatLng = []
            if (plan.length > 0) {
                const latlngs = plan.map(p => [p.lat, p.lon])
                const poly = Lctx.polyline(latlngs, { color: "#1f78ff", weight: 3, opacity: 0.8 })
                poly.addTo(routeMap)
                routeLayers.push(poly)
                allLatLng = allLatLng.concat(latlngs)
            }
            if (actual.length > 0) {
                const latlngs = actual.map(p => [p.lat, p.lon])
                const poly = Lctx.polyline(latlngs, { color: "#b32020", weight: 3, opacity: 0.8 })
                poly.addTo(routeMap)
                routeLayers.push(poly)
                allLatLng = allLatLng.concat(latlngs)
            }
            if (allLatLng.length > 0) {
                routeMap.fitBounds(allLatLng)
            }
            if (info) info.textContent = `Plan points: ${plan.length} | Position points: ${actual.length} (fenetre ${start?.toFixed ? start.toFixed(1) : start}s -> ${end?.toFixed ? end.toFixed(1) : end}s)`
        } else {
            // Fallback Plotly scattergeo
            const traces = []
            if (plan.length > 0) {
                traces.push({
                    type: "scattergeo",
                    mode: "lines",
                    lat: plan.map(p => p.lat),
                    lon: plan.map(p => p.lon),
                    line: { color: "#1f78ff", width: 2 },
                    name: "Plan"
                })
            }
            if (actual.length > 0) {
                traces.push({
                    type: "scattergeo",
                    mode: "lines",
                    lat: actual.map(p => p.lat),
                    lon: actual.map(p => p.lon),
                    line: { color: "#b32020", width: 2 },
                    name: "Position"
                })
            }
            Plotly.purge(mapDiv)
            Plotly.newPlot(mapDiv, traces, {
                margin: { t: 10, b: 10, l: 10, r: 10 },
                showlegend: true,
                geo: {
                    showcountries: true,
                    showland: true,
                    landcolor: "#f7f7f7",
                    oceancolor: "#e8f2ff",
                    lakecolor: "#e8f2ff",
                    showocean: true
                }
            }, {responsive: true, displaylogo: false})
            if (info) info.textContent = "Mode fallback (Plotly) : plan=" + plan.length + " / pos=" + actual.length
        }
    }).catch(() => {
        if (info) info.textContent = "Carte non chargee (erreur Leaflet)"
    })
}

function ensureLeafletLoaded() {
    if (typeof window === "undefined") return Promise.resolve(null)
    if (window.L) return Promise.resolve(window.L)
    if (leafletLoadingPromise) return leafletLoadingPromise
    leafletLoadingPromise = new Promise(resolve => {
        const finish = () => resolve(window.L || null)
        const addFallback = () => {
            const script = document.createElement("script")
            script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
            script.dataset.leaflet = "true"
            script.onload = finish
            script.onerror = () => resolve(null)
            document.head.appendChild(script)
            if (!document.querySelector('link[data-leaflet]')) {
                const link = document.createElement("link")
                link.rel = "stylesheet"
                link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
                link.dataset.leaflet = "true"
                document.head.appendChild(link)
            }
        }
        const existing = document.querySelector('script[src*="leaflet"]')
        if (existing) {
            existing.addEventListener('load', finish)
            existing.addEventListener('error', () => {
                existing.remove()
                addFallback()
            })
            const iv = setInterval(() => {
                if (window.L) {
                    clearInterval(iv)
                    finish()
                }
            }, 100)
            setTimeout(() => { clearInterval(iv); if (!window.L) addFallback() }, 3000)
            return
        }
        addFallback()
        const iv = setInterval(() => {
            if (window.L) {
                clearInterval(iv)
                finish()
            }
        }, 100)
        setTimeout(() => { clearInterval(iv); finish() }, 5000)
    })
    return leafletLoadingPromise
}

function updateGraphStats(graphId, range) {
    const statsEl = document.getElementById(`graph-stats-${graphId}`)
    if (!statsEl) return
    const series = graphPlots[graphId]?.series || []
    if (series.length === 0) {
        statsEl.textContent = "Pas de donnees"
        return
    }
    const lines = []
    series.forEach(s => {
        let min = Infinity, max = -Infinity, sum = 0, count = 0
        for (let i = 0; i < s.x.length; i++) {
            const t = s.x[i]
            const v = s.y[i]
            if (range) {
                if (t < range[0] || t > range[1]) continue
            }
            if (!Number.isFinite(v)) continue
            if (v < min) min = v
            if (v > max) max = v
            sum += v
            count++
        }
        if (count === 0) {
            lines.push(`${s.name}: aucun point`)
        } else {
            const mean = sum / count
            lines.push(`${s.name}: min ${min.toFixed(3)} | max ${max.toFixed(3)} | mean ${mean.toFixed(3)} (n=${count})`)
        }
    })
    statsEl.textContent = lines.join(" | ")
}
async function syncChecksFromRemote() {
    const remote = await fetchRemoteConfig(REMOTE_TABLE_CHECKS, REMOTE_CHECKS_ID)
    if (remote && typeof remote === "object") {
        checkConfig = remote
        try {
            localStorage.setItem(CHECKS_STORAGE_KEY, JSON.stringify(checkConfig))
        } catch (e) {
            console.warn("Could not cache remote checks", e)
        }
        renderChecks()
        evaluateChecks()
        return
    }
    // Fallback to local cache only if nothing remote
    checkConfig = localChecksCache || {}
    renderChecks()
    evaluateChecks()
}

async function syncGraphsFromRemote() {
    const remote = await fetchRemoteGraphs()
    if (remote && typeof remote === "object") {
        graphConfig = remote
        try {
            localStorage.setItem(GRAPHS_STORAGE_KEY, JSON.stringify(graphConfig))
        } catch (e) {
            console.warn("Could not cache remote graphs", e)
        }
        renderGraphCards()
        plotGraphs()
        return
    }
    graphConfig = graphLocalCache || {}
    renderGraphCards()
    plotGraphs()
}

async function syncSequenceFromRemote() {
    const remote = await fetchRemoteConfig(REMOTE_TABLE_SEQ, REMOTE_SEQ_ID)
    if (remote && typeof remote === "object") {
        sequenceConfig = remote
        try {
            localStorage.setItem(SEQ_STORAGE_KEY, JSON.stringify(sequenceConfig))
        } catch (e) {
            console.warn("Could not cache remote sequence", e)
        }
        applySequenceConfigToInputs()
        evaluateSequence()
        return
    }
    sequenceConfig = localSequenceCache || {}
    applySequenceConfigToInputs()
    evaluateSequence()
}

// Expose handlers for inline attributes
window.reset = reset
window.load = load

function clearDerivedSections() {
    const ids = ["palier-away-info", "palier-return-info", "far-from-home-info", "response-info", "parachute-info", "full-flight-info"]
    ids.forEach(id => {
        const el = document.getElementById(id)
        if (el) el.textContent = "En attente d'un tlog"
    })
}

function resetTelemCheck(message = "En attente d'un tlog") {
    const section = document.getElementById("telem-check")
    if (section) section.hidden = true
    const ids = ["telem-blackout", "telem-hb-rate", "telem-flight-totals", "telem-offflight-totals"]
    ids.forEach(id => {
        const el = document.getElementById(id)
        if (el) el.textContent = message
    })
    if (typeof Plotly !== "undefined") {
        ["telem-rate-chart", "telem-avg-chart"].forEach(id => {
            const el = document.getElementById(id)
            if (el) {
                try { Plotly.purge(el) } catch (e) { }
            }
        })
    }
}

function getFlightWindow() {
    const bounds = getPhaseBounds(sequenceMatches || {})
    const start = sequenceMatches["vtol-takeoff"] ?? sequenceMatches["seq-start"] ?? null
    const end = sequenceMatches["vtol-landing"] ?? bounds.landingEnd ?? tlogEndTime
    const hasWindow = start != null && end != null && end > start
    return { start, end, hasWindow }
}

function collectTelemSamples() {
    const res = {
        inTimes: [], inSizes: [],
        outTimes: [], outSizes: [],
        heartbeatInTimes: [], heartbeatOutTimes: []
    }
    if (!system) return res
    for (const [sysId, comps] of Object.entries(system)) {
        const numericId = Number(sysId)
        const isOut = numericId === 255
        Object.values(comps || {}).forEach(comp => {
            Object.entries(comp.msg || {}).forEach(([name, msg]) => {
                const tgtTimes = isOut ? res.outTimes : res.inTimes
                const tgtSizes = isOut ? res.outSizes : res.inSizes
                for (let i = 0; i < msg.time.length; i++) {
                    tgtTimes.push(msg.time[i])
                    tgtSizes.push(msg.size[i])
                }
                if (name === "HEARTBEAT") {
                    const hbArr = isOut ? res.heartbeatOutTimes : res.heartbeatInTimes
                    msg.time.forEach(t => hbArr.push(t))
                }
            })
        })
    }
    return res
}

function splitTotals(times, sizes, start, end) {
    let inWindow = 0
    let offWindow = 0
    const hasWindow = start != null && end != null && end > start
    for (let i = 0; i < times.length; i++) {
        const t = times[i]
        const bits = sizes[i]
        if (!Number.isFinite(bits)) continue
        if (hasWindow && t >= start && t <= end) {
            inWindow += bits
        } else {
            offWindow += bits
        }
    }
    return { inWindow, offWindow }
}

function computeHeartbeatStats(samples, flightWindow) {
    const { start, end, hasWindow } = flightWindow
    const hbSource = samples.heartbeatInTimes.length > 0 ? samples.heartbeatInTimes
        : (samples.heartbeatOutTimes.length > 0 ? samples.heartbeatOutTimes : [])
    if (!hasWindow || hbSource.length === 0) {
        return { blackout: null, ratePerMin: null }
    }
    const hb = hbSource.filter(t => t >= start && t <= end).sort((a, b) => a - b)
    if (hb.length === 0) {
        return { blackout: end - start, ratePerMin: 0 }
    }
    let maxGap = Math.max(hb[0] - start, end - hb[hb.length - 1])
    for (let i = 1; i < hb.length; i++) {
        const gap = hb[i] - hb[i - 1]
        if (gap > maxGap) maxGap = gap
    }
    const durationMin = (end - start) / 60
    const ratePerMin = durationMin > 0 ? hb.length / durationMin : null
    return { blackout: maxGap, ratePerMin }
}

function buildFluxRateSeries(times, sizes, binWidth, start, end) {
    const hasWindow = start != null && end != null && end > start
    const filteredTimes = []
    const filteredSizes = []
    for (let i = 0; i < times.length; i++) {
        const t = times[i]
        const bits = sizes[i]
        if (!Number.isFinite(bits)) continue
        if (hasWindow && (t < start || t > end)) continue
        filteredTimes.push(t)
        filteredSizes.push(bits)
    }
    if (filteredTimes.length === 0) return null
    const total = { count: [], low_bin: Infinity, high_bin: -Infinity }
    const binned = bin_count(filteredTimes, filteredSizes, binWidth, total)
    if (!binned.time || !binned.count) return null
    return {
        x: binned.time,
        y: binned.count.map(v => v / 1e6) // bits/s to Mb/s
    }
}

function formatGo(bits) {
    const gb = bits / 8 / 1e9
    if (!Number.isFinite(gb)) return "0.000 Go"
    return `${gb.toFixed(3)} Go`
}

function renderTelemCheck() {
    const section = document.getElementById("telem-check")
    if (!section) return
    const blackoutEl = document.getElementById("telem-blackout")
    const hbRateEl = document.getElementById("telem-hb-rate")
    const flightTotalsEl = document.getElementById("telem-flight-totals")
    const offTotalsEl = document.getElementById("telem-offflight-totals")
    if (!system) {
        resetTelemCheck()
        return
    }
    const flightWindow = getFlightWindow()
    const samples = collectTelemSamples()
    const hbStats = computeHeartbeatStats(samples, flightWindow)
    if (section) section.hidden = false
    if (blackoutEl) {
        blackoutEl.textContent = flightWindow.hasWindow && hbStats.blackout != null
            ? `Plus long blackout: ${hbStats.blackout.toFixed(2)} s`
            : "Plus long blackout: bornes manquantes ou HB absent"
    }
    if (hbRateEl) {
        hbRateEl.textContent = flightWindow.hasWindow && hbStats.ratePerMin != null
            ? `Heartbeats par minute: ${hbStats.ratePerMin.toFixed(2)}`
            : "Heartbeats par minute: bornes manquantes"
    }

    const inTotals = splitTotals(samples.inTimes, samples.inSizes, flightWindow.start, flightWindow.end)
    const outTotals = splitTotals(samples.outTimes, samples.outSizes, flightWindow.start, flightWindow.end)
    const flightInBits = inTotals.inWindow
    const flightOutBits = outTotals.inWindow
    const offInBits = inTotals.offWindow
    const offOutBits = outTotals.offWindow
    if (flightTotalsEl) {
        flightTotalsEl.textContent = flightWindow.hasWindow
            ? `Flux vol: IN ${formatGo(flightInBits)} | OUT ${formatGo(flightOutBits)} | Total ${formatGo(flightInBits + flightOutBits)}`
            : "Flux vol: bornes manquantes"
    }
    if (offTotalsEl) {
        offTotalsEl.textContent = `Hors vol: IN ${formatGo(offInBits)} | OUT ${formatGo(offOutBits)} | Total ${formatGo(offInBits + offOutBits)}`
    }

    const rateDiv = document.getElementById("telem-rate-chart")
    const avgDiv = document.getElementById("telem-avg-chart")
    const binWidth = 1
    const inSeries = buildFluxRateSeries(samples.inTimes, samples.inSizes, binWidth, flightWindow.start, flightWindow.end)
    const outSeries = buildFluxRateSeries(samples.outTimes, samples.outSizes, binWidth, flightWindow.start, flightWindow.end)
    if (rateDiv && typeof Plotly !== "undefined") {
        const traces = []
        if (inSeries) {
            traces.push({
                type: 'scattergl',
                mode: 'lines',
                name: 'IN',
                x: inSeries.x,
                y: inSeries.y
            })
        }
        if (outSeries) {
            traces.push({
                type: 'scattergl',
                mode: 'lines',
                name: 'OUT',
                x: outSeries.x,
                y: outSeries.y
            })
        }
        const layout = {
            margin: { l: 50, r: 20, t: 10, b: 50 },
            yaxis: { title: { text: "Mb/s" } },
            xaxis: { title: { text: "Temps (s)" } },
            showlegend: true
        }
        Plotly.purge(rateDiv)
        if (traces.length > 0) {
            Plotly.newPlot(rateDiv, traces, layout, { displaylogo: false })
        } else {
            rateDiv.innerHTML = "Pas de données telemetry"
        }
    }

    if (avgDiv && typeof Plotly !== "undefined") {
        const duration = flightWindow.hasWindow ? (flightWindow.end - flightWindow.start) : null
        const avgIn = duration && duration > 0 ? (flightInBits / duration) / 1e6 : null
        const avgOut = duration && duration > 0 ? (flightOutBits / duration) / 1e6 : null
        Plotly.purge(avgDiv)
        if (avgIn != null || avgOut != null) {
            const trace = {
                type: 'bar',
                x: ['IN', 'OUT'],
                y: [avgIn ?? 0, avgOut ?? 0],
                marker: { color: ['#1f77b4', '#ff7f0e'] }
            }
            const layout = {
                margin: { l: 50, r: 20, t: 10, b: 50 },
                yaxis: { title: { text: "Mb/s" } },
                showlegend: false
            }
            Plotly.newPlot(avgDiv, [trace], layout, { displaylogo: false })
        } else {
            avgDiv.innerHTML = "Flux moyen indisponible (bornes manquantes)"
        }
    }
}

function formatInterval(res) {
    if (!res) return "Non trouvé"
    return `Début ${res.start.toFixed(2)}s, Fin ${res.end.toFixed(2)}s, Alt ${res.alt?.toFixed(1) ?? "-"} m, Durée ${(res.duration).toFixed(1)}s`
}

function longestConstantAltInterval(series, tol, startBound, endBound) {
    if (!series || series.length === 0) return null
    const filtered = series.filter(p => (startBound == null || p.time >= startBound) && (endBound == null || p.time <= endBound))
    if (filtered.length < 2) return null
    filtered.sort((a, b) => a.time - b.time)
    let best = { duration: -1 }
    let startIdx = 0
    let minAlt = filtered[0].alt
    let maxAlt = filtered[0].alt
    let window = [filtered[0]]
    for (let endIdx = 1; endIdx < filtered.length; endIdx++) {
        const alt = filtered[endIdx].alt
        minAlt = Math.min(minAlt, alt)
        maxAlt = Math.max(maxAlt, alt)
        while (maxAlt - minAlt > tol && startIdx < endIdx) {
            startIdx += 1
            window = filtered.slice(startIdx, endIdx + 1)
            minAlt = Math.min(...window.map(p => p.alt))
            maxAlt = Math.max(...window.map(p => p.alt))
        }
        const duration = filtered[endIdx].time - filtered[startIdx].time
        if (duration > best.duration) {
            // Alt moyenne sur la fenêtre
            const avgAlt = windowAverage(filtered, startIdx, endIdx)
            best = { start: filtered[startIdx].time, end: filtered[endIdx].time, duration, alt: avgAlt }
        }
    }
    if (best.duration <= 0) return null
    return best
}

function windowAverage(arr, startIdx, endIdx) {
    let sum = 0
    let cnt = 0
    for (let i = startIdx; i <= endIdx; i++) {
        sum += arr[i].alt
        cnt += 1
    }
    return cnt ? sum / cnt : null
}

function longestFarFromHome(series, threshold, startBound, endBound) {
    if (!series || series.length === 0) return null
    const filtered = series.filter(p => (startBound == null || p.time >= startBound) && (endBound == null || p.time <= endBound))
    if (filtered.length === 0) return null
    filtered.sort((a, b) => a.time - b.time)
    let best = { duration: -1 }
    let activeStart = null
    for (let i = 0; i < filtered.length; i++) {
        const p = filtered[i]
        if (p.dist > threshold) {
            if (activeStart == null) activeStart = p.time
        } else if (activeStart != null) {
            const duration = p.time - activeStart
            if (duration > best.duration) {
                best = { start: activeStart, end: p.time, duration }
            }
            activeStart = null
        }
    }
    if (activeStart != null) {
        const duration = filtered[filtered.length - 1].time - activeStart
        if (duration > best.duration) {
            best = { start: activeStart, end: filtered[filtered.length - 1].time, duration }
        }
    }
    if (best.duration <= 0) return null
    return best
}

function updateDerivedSections() {
    const palAwayEl = document.getElementById("palier-away-info")
    const palRetEl = document.getElementById("palier-return-info")
    const farEl = document.getElementById("far-from-home-info")
    const respEl = document.getElementById("response-info")
    const paraEl = document.getElementById("parachute-info")
    const fullEl = document.getElementById("full-flight-info")

    if (fullEl) {
        const start = sequenceMatches["vtol-takeoff"]
        const end = sequenceMatches["vtol-landing"]
        if (start != null && end != null && end > start) {
            fullEl.textContent = `Début ${start.toFixed(2)}s, Fin ${end.toFixed(2)}s, Durée ${(end - start).toFixed(1)}s`
        } else {
            fullEl.textContent = "En attente d'un tlog"
        }
    }
    if (respEl) {
        const start = sequenceMatches["vtol-takeoff"]
        const end = sequenceMatches["vtol-landing"]
        if (start != null && end != null && end > start) {
            respEl.textContent = `Début ${start.toFixed(2)}s, Fin ${end.toFixed(2)}s`
        } else {
            respEl.textContent = "En attente d'un tlog"
        }
    }
    if (paraEl) {
        const start = sequenceMatches["vtol-takeoff"]
        const end = sequenceMatches["vtol-landing"]
        if (start != null && end != null && end > start) {
            paraEl.textContent = `Début ${start.toFixed(2)}s, Fin ${end.toFixed(2)}s`
        } else {
            paraEl.textContent = "En attente d'un tlog"
        }
    }

    const cruiseAwayStart = sequenceMatches["cruise-away"]
    const cruiseReturnStart = sequenceMatches["cruise-return"]
    const airbrakeStart = sequenceMatches["airbrake"]

    if (palAwayEl) {
        const bounds = getPhaseBounds(sequenceMatches)
        const ca = bounds.cruiseAwayWindow
        if (ca) {
            const res = longestConstantAltInterval(ptgiAltSeries, 2.0, ca.start, ca.end)
            palierAwayWindow = res ? { start: res.start, end: res.end } : null
            palAwayEl.textContent = res ? formatInterval(res) : "Pas de palier détecté"
        } else {
            palAwayEl.textContent = "Bornes manquantes ou cruise away vide"
            palierAwayWindow = null
        }
    }
    if (palRetEl) {
        const bounds = getPhaseBounds(sequenceMatches)
        const cr = bounds.cruiseReturnWindow
        if (cr) {
            const res = longestConstantAltInterval(ptgiAltSeries, 2.0, cr.start, cr.end)
            palierReturnWindow = res ? { start: res.start, end: res.end } : null
            palRetEl.textContent = res ? formatInterval(res) : "Pas de palier détecté"
        } else {
            palRetEl.textContent = "Bornes manquantes"
            palierReturnWindow = null
        }
    }

    if (farEl) {
        const bounds = getPhaseBounds(sequenceMatches)
        const start = sequenceMatches["vtol-takeoff"]
        const end = bounds.landingEnd
        const source = customDistSeries.some(e => Number.isFinite(e.dist)) ? customDistSeries : gpiDistSeries
        const res = longestFarFromHome(source, 5000, start, end)
        farFromHomeWindow = res ? { start: res.start, end: res.end } : null
        farEl.textContent = res ? `Début ${res.start.toFixed(2)}s, Fin ${res.end.toFixed(2)}s, Durée ${res.duration.toFixed(1)}s` : "Pas d'intervalle >5km"
    }
}

let log
function load_log(log_file) {
    const start = performance.now()

    log = new DataflashParser()
    log.processData(log_file, [])



    open_in_update(log)



    plot_log()



    const end = performance.now()

    console.log(`Load took: ${end - start} ms`)

}



let system

async function load_tlog(log_file) {

    const start = performance.now()

    if (jspackReadyPromise) {
        try { await jspackReadyPromise } catch (e) { console.warn("jspack not ready", e) }
    }



    // Very basic Tlog parsing, does not look into messages, just gets type and size

    let data = new DataView(log_file)



    // Start at 8 since were looking for MAVlink header which comes after 64 bit timestamp

    const timestamp_length = 8



    let first_timestamp

    let end_time = 0



    system = {}

    let offset = timestamp_length

    while (offset < log_file.byteLength) {

        const magic = data.getUint8(offset)

        let header

        if (magic == 0xFE) {

            // MAVLink 1

            // 6 byte header, 2 byte crc

            const header_length = 8

            if ((offset + header_length) > log_file.byteLength) {

                // Header does not fit in remaining space

                break

            }

            header = {

                version: 1,

                header_length,

                payload_length: data.getUint8(offset + 1),

                sequence: data.getUint8(offset + 2),

                srcSystem: data.getUint8(offset + 3),

                srcComponent: data.getUint8(offset + 4),

                msgId: data.getUint8(offset + 5),

                signed: false

            }



        } else if (magic == 0xFD) {

            // MAVLink 2

            // 10 byte header, 2 byte crc

            const header_length = 12

            if ((offset + header_length) > log_file.byteLength) {

                // Header does not fit in remaining space

                break

            }



            const incompat_flags = data.getUint8(offset + 2)

            //const compat_flags = data.getUint8(offset + 3)



            header = {

                version: 2,

                header_length,

                payload_length: data.getUint8(offset + 1),

                sequence: data.getUint8(offset + 4),

                srcSystem: data.getUint8(offset + 5),

                srcComponent: data.getUint8(offset + 6),

                msgId: (data.getUint8(offset + 9) << 16) + (data.getUint8(offset + 8) << 8) + data.getUint8(offset + 7),

                signed: (incompat_flags & 0x01) != 0

            }



        } else {

            // Invalid header

            offset += 1

            continue

        }



        const total_msg_length = header.header_length + header.payload_length + (header.signed ? 13 : 0)

        if ((offset + total_msg_length) > log_file.byteLength) {

            // Message does not fit in remaining space

            break

        }



        const message = mavlink_msgs[header.msgId]

        if (message == null) {

            // Invalid ID

            offset += 1

            continue

        }



        // CRC-16/MCRF4XX checksum helper

        function x25Crc(byte, crc) {

            var tmp = byte ^ (crc & 0xFF)

            tmp = (tmp ^ (tmp << 4)) & 0xFF

            crc = (crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)

            return crc & 0xFFFF

        }



        // Calculate checksum

        let crc = 0xFFFF

        const crc_len = header.header_length + header.payload_length - 2

        for (let i = 1; i < crc_len; i++) {

            crc = x25Crc(data.getUint8(offset + i), crc)

        }

        crc = x25Crc(message.CRC, crc)



        const expected_crc = data.getUint16(offset + crc_len, true)

        if (crc != expected_crc) {
            // Invalid crc, but continue parsing to allow partial data
        }



        // Get system

        if (!(header.srcSystem in system)) {

            system[header.srcSystem] = {}

        }

        let sys = system[header.srcSystem]



        // Get component

        if (!(header.srcComponent in sys)) {

            sys[header.srcComponent] = {

                next_seq: header.sequence,

                received: 0,

                dropped: 0,

                msg: {},

                version: new Set(),

                signed: false

            }

        }

        let comp = sys[header.srcComponent]

        comp.received++



        // Get message

        if (!(message.name in comp.msg)) {

            comp.msg[message.name] = {

                time: [],

                size: [],

                version: new Set(),

                signed: false

            }

        }

        let msg = comp.msg[message.name]

        const payload_start = offset + (header.header_length - 2)
        tlogMessagesSeen.add(message.name)
        const meta = getMavlinkFieldMeta(header.msgId)
        if (meta && Array.isArray(meta.fieldnames) && meta.fieldnames.length > 0 && !availableMessageFields[message.name]) {
            availableMessageFields[message.name] = meta.fieldnames
        }
        let payload = decodeMavlinkPayload(header.msgId, log_file, payload_start, header.payload_length)
        let manualPayload = null
        if (message.name === "VFR_HUD") {
            const manual = parseVfrHudManual(log_file, payload_start, header.payload_length)
            if (manual) {
                const fieldnames = Object.keys(manual)
                manualPayload = { fieldnames, values: fieldnames.map(k => manual[k]) }
            }
        }
        if (payload == null && message.name === "POSITION_TARGET_GLOBAL_INT") {
            const manual = parsePTGIManual(log_file, payload_start, header.payload_length)
            if (manual) {
                const fieldnames = Object.keys(manual)
                manualPayload = { fieldnames, values: fieldnames.map(k => manual[k]) }
            }
        } else if (payload == null && message.name === "VIBRATION") {
            const manual = parseVibrationManual(log_file, payload_start, header.payload_length)
            if (manual) {
                const fieldnames = Object.keys(manual)
                manualPayload = { fieldnames, values: fieldnames.map(k => manual[k]) }
            }
        } else if (payload == null && message.name === "BATTERY_STATUS") {
            const manual = parseBatteryStatusManual(log_file, payload_start, header.payload_length)
            if (manual) {
                const fieldnames = Object.keys(manual)
                manualPayload = { fieldnames, values: fieldnames.map(k => manual[k]) }
            }
        }
        let payloadForStats = payload ?? manualPayload
        if (message.name === "VFR_HUD" && manualPayload) {
            payloadForStats = manualPayload
        }
        if (payloadForStats != null) {
            if (!availableMessageFields[message.name]) {
                availableMessageFields[message.name] = payloadForStats.fieldnames
            }
            payloadForStats.fieldnames.forEach((field, idx) => {
                updateFieldStats(message.name, field, payloadForStats.values[idx])
            })
        }
        payload = payloadForStats


        // Get timestamp

        const time_stamp = data.getBigUint64(offset - timestamp_length)

        if (first_timestamp == null) {

            first_timestamp = time_stamp



            const date = new Date(Number(time_stamp / 1000n))

            console.log("Start time: " + date.toString())

        }



        // Time since log start in seconds

        const time = Number(time_stamp - first_timestamp) / 1000000



        if (time < end_time) {

            alert("Time went backwards!")

            throw new Error()

        }

        end_time = time
        tlogEndTime = end_time
        if (payloadForStats != null) {
            payloadForStats.fieldnames.forEach((field, idx) => {
                pushFieldSample(message.name, field, time, payloadForStats.values[idx])
            })
            pushMessageSample(message.name, time, payloadForStats)
        }

        if (message.name === "STATUSTEXT") {
            let text = payload ? extractStatusText(payload) : null
            if (text == null || text === "") {
                text = extractStatusTextFromBytes(log_file, payload_start, header.payload_length)
            }
            if (text != null && text !== "") {
                tlogStatusTexts.push({ time, text: text.trim() })
            }
        }
        if (message.name === "POSITION_TARGET_GLOBAL_INT") {
            let parsed = payload ? Object.fromEntries(payload.fieldnames.map((n, idx) => [n, payload.values[idx]])) : null
            if (!parsed && manualPayload) {
                parsed = Object.fromEntries(manualPayload.fieldnames.map((n, idx) => [n, manualPayload.values[idx]]))
            }
            if (!parsed) {
                const manual = parsePTGIManual(log_file, payload_start, header.payload_length)
                if (manual) parsed = manual
            }
            ptgiRawSeries.push({ time, payload: parsed })
            if (parsed && Number.isFinite(parsed.alt)) {
                ptgiAltSeries.push({ time, alt: parsed.alt })
            }
            if (parsed && Number.isFinite(parsed.lat) && Number.isFinite(parsed.lon)) {
                ptgiPath.push({ time, lat: parsed.lat, lon: parsed.lon })
            }
        }
        if (payload) {
            if (message.name === "GLOBAL_POSITION_INT") {
                const data = parseGPIGlobal(log_file, payload_start, header.payload_length)
                if (data) {
                    if (homeLat == null && Number.isFinite(data.lat) && Number.isFinite(data.lon)) {
                        homeLat = data.lat
                        homeLon = data.lon
                    }
                    if (homeLat != null && homeLon != null) {
                        const dist = haversineMeters(homeLat, homeLon, data.lat, data.lon)
                        gpiDistSeries.push({ time, dist })
                    }
                    if (Number.isFinite(data.lat) && Number.isFinite(data.lon)) {
                        gpiPath.push({ time, lat: data.lat, lon: data.lon })
                    }
                }
            }
            if (message.name.toUpperCase().includes("CUSTOM")) {
                const idxDist = payload.fieldnames.findIndex(n => n.toLowerCase().includes("dist_home") || n.toLowerCase().includes("disthome"))
                if (idxDist !== -1 && Number.isFinite(payload.values[idxDist])) {
                    customDistSeries.push({ time, dist: payload.values[idxDist] })
                } else {
                    customDistSeries.push({ time, dist: null })
                }
            }
            if (message.name === "VIBRATION") {
                const parsed = Object.fromEntries(payload.fieldnames.map((n, idx) => [n, payload.values[idx]]))
                if (Number.isFinite(parsed.vibration_x) || Number.isFinite(parsed.vibration_y) || Number.isFinite(parsed.vibration_z)) {
                    // No extra series yet, but ensure payload recorded
                }
            }
        } else {
            if (message.name === "GLOBAL_POSITION_INT") {
                const data = parseGPIGlobal(log_file, payload_start, header.payload_length)
                if (data) {
                    if (homeLat == null && Number.isFinite(data.lat) && Number.isFinite(data.lon)) {
                        homeLat = data.lat
                        homeLon = data.lon
                    }
                    if (homeLat != null && homeLon != null) {
                        const dist = haversineMeters(homeLat, homeLon, data.lat, data.lon)
                        gpiDistSeries.push({ time, dist })
                    }
                }
            }
            if (message.name.toUpperCase().includes("CUSTOM")) {
                customDistSeries.push({ time, dist: null })
            }
        }



        // Update message stats

        msg.time.push(time)

        msg.size.push(total_msg_length * 8)

        msg.version.add(header.version)

        msg.signed |= header.signed



        // Update component stats

        comp.version.add(header.version)

        comp.signed |= header.signed



        // Check sequence for dropped packets

        let seq = header.sequence

        if (seq < comp.next_seq) {

            // Deal with wrap at 256

            seq += 256

        }

        comp.dropped += seq - comp.next_seq

        comp.next_seq = (seq + 1) % 256



        // Advance by message length

        offset += total_msg_length + timestamp_length

    }



    // Print stats for each system detected

    let section = document.getElementById("MAVLink")

    section.hidden = false

    section.previousElementSibling.hidden = false

    for (const [sys_id, sys] of Object.entries(system)) {



        let heading = document.createElement("h4")

        heading.innerHTML = "System ID: " + sys_id

        section.appendChild(heading)



        let table = document.createElement("table")

        section.appendChild(table)



        for (const [comp_id, comp] of Object.entries(sys)) {



            let colum = document.createElement("td")

            table.appendChild(colum)



            let fieldset = document.createElement("fieldset")

            colum.appendChild(fieldset)



            let legend = document.createElement("legend")

            legend.innerHTML = "Component ID: " + comp_id

            fieldset.appendChild(legend)



            let name = "Unknown"

            if (comp_id in MAV_COMPONENT) {

                name = MAV_COMPONENT[comp_id]

            }



            fieldset.appendChild(document.createTextNode("ID Name: " + name))

            fieldset.appendChild(document.createElement("br"))



            function get_version_string(version_set) {

                let version = Array.from(version_set)

                version = version.toSorted()

                return version.join(", ")

            }



            fieldset.appendChild(document.createTextNode("MAVLink Version: " + get_version_string(comp.version)))

            fieldset.appendChild(document.createElement("br"))



            fieldset.appendChild(document.createTextNode("Signing: " + (comp.signed ? "\u2705" : "\u274C")))

            fieldset.appendChild(document.createElement("br"))



            const drop_pct = (comp.dropped / comp.received) * 100

            fieldset.appendChild(document.createTextNode("Dropped messages: " + comp.dropped + " / " + comp.received + " (" + drop_pct.toFixed(2) + "%)"))

            fieldset.appendChild(document.createElement("br"))



            function add_include(parent, name) {

                let check = document.createElement("input")

                check.setAttribute('type', 'checkbox')

                check.setAttribute('id', name)

                check.checked = true

                check.addEventListener('change', plot_tlog)



                parent.appendChild(check)



                let label = document.createElement("label")

                label.setAttribute('for', name)

                label.innerHTML = "Include"

                parent.appendChild(label)



                return check

            }



            comp.include = add_include(fieldset, sys_id + "," + comp_id)





            let details = document.createElement("details")

            fieldset.appendChild(details)



            let summary = document.createElement("summary")

            summary.innerHTML = "Messages"

            details.appendChild(summary)



            for (const [name, msg] of Object.entries(comp.msg)) {

                let msg_fieldset = document.createElement("fieldset")

                details.appendChild(msg_fieldset)



                let msg_legend = document.createElement("legend")

                msg_legend.innerHTML = name

                msg_fieldset.appendChild(msg_legend)



                msg_fieldset.appendChild(document.createTextNode("Count: " + msg.time.length))

                msg_fieldset.appendChild(document.createElement("br"))



                if (comp.version.size > 1) {

                    msg_fieldset.appendChild(document.createTextNode("MAVLink Version: " + get_version_string(msg.version)))

                    msg_fieldset.appendChild(document.createElement("br"))

                }



                if (comp.signed) {

                    msg_fieldset.appendChild(document.createTextNode("Signing: " + (msg.signed ? "\u2705" : "\u274C")))

                    msg_fieldset.appendChild(document.createElement("br"))

                }



                msg.include = add_include(msg_fieldset, sys_id + "," + comp_id + "," + name)



            }



        }

    }



    plot_tlog()
    evaluateSequence()
    plotGraphs()
    renderRouteMap()



    const end = performance.now()

    console.log(`Load took: ${end - start} ms`)

}

function plot_tlog() {

    const bin_width = parseFloat(document.getElementById("WindowSize").value);

    const use_size = document.getElementById("Unit_bps").checked;

    const plot_labels = use_size ? rate_plot.bits : rate_plot.count;



    // 1) Construction des traces Message Rates et collecte pour la compo

    data_rates.data = [];

    let total = { count: [], low_bin: Infinity, high_bin: -Infinity };

    let composition = {};



    for (const [sys_id, sys] of Object.entries(system)) {

        for (const [comp_id, comp] of Object.entries(sys)) {

            if (!comp.include.checked) {

                Object.values(comp.msg).forEach(m => m.include.disabled = true);

                continue;

            }

            Object.values(comp.msg).forEach(m => m.include.disabled = false);



            for (const [name, msg] of Object.entries(comp.msg)) {

                if (!msg.include.checked) continue;

                const binned = bin_count(msg.time, use_size ? msg.size : 1, bin_width, total);



                data_rates.data.push({

                    mode: 'lines',

                    x: binned.time,

                    y: binned.count,

                    name,

                    meta: name,

                    hovertemplate: plot_labels.hovertemplate

                });



                const key = `(${sys_id},${comp_id}) ${name}`;

                composition[key] = use_size ? array_sum(msg.size) : msg.size.length;

            }

        }

    }



    // 2) Affichage Message Rates

    data_rates.layout.yaxis.title.text = plot_labels.yaxis;

    let plot = document.getElementById("data_rates");

    Plotly.purge(plot);

    Plotly.newPlot(plot, data_rates.data, data_rates.layout, { displaylogo: false });

    plot_visibility(plot, false);



    // 3) Affichage Total Rate

    const total_binned = total_count(total, bin_width);

    total_rate.data[0].x = total_binned.time;

    total_rate.data[0].y = total_binned.count;

    total_rate.data[0].hovertemplate = plot_labels.hovertemplate;

    total_rate.layout.yaxis.title.text = plot_labels.yaxis;



    plot = document.getElementById("total_rate");

    Plotly.purge(plot);

    Plotly.newPlot(plot, total_rate.data, total_rate.layout, { displaylogo: false });

    plot_visibility(plot, false);



    // 4) **NOUVEAU** : Affichage initial du camembert Composition

    const compTrace = {

        type: 'pie',

        labels: Object.keys(composition),

        values: Object.values(composition),

        hovertemplate: plot_labels.pie_hovertemplate,

        textinfo: "label+percent",

        textposition: "inside"

    };

    plot = document.getElementById("log_stats");

    Plotly.purge(plot);

    Plotly.newPlot(plot, [compTrace], log_stats.layout, { displaylogo: false });

    plot_visibility(plot, false);



    // 5) Raccordements axes + reset (inchangés)

    document.getElementById("total_rate").removeAllListeners("plotly_relayout");

    document.getElementById("data_rates").removeAllListeners("plotly_relayout");

    link_plot_axis_range([["total_rate", "x", "", total_rate], ["data_rates", "x", "", data_rates]]);

    link_plot_reset([["total_rate", total_rate], ["data_rates", data_rates]]);



    // 

    // 6) Fonction interne pour mettre à jour le pie-chart selon [x0,x1]

    function updatePie(x0, x1) {

        const comp2 = {};

        for (const [sys_id, sys] of Object.entries(system)) {

            for (const [comp_id, compObj] of Object.entries(sys)) {

                if (!compObj.include.checked) continue;

                for (const [name, msg] of Object.entries(compObj.msg)) {

                    if (!msg.include.checked) continue;

                    const times = msg.time.filter(t => t >= x0 && t <= x1);

                    if (!times.length) continue;

                    const key = `(${sys_id},${comp_id}) ${name}`;

                    if (use_size) {

                        let sum = 0;

                        times.forEach(t => {

                            const idx = msg.time.indexOf(t);

                            sum += msg.size[idx];

                        });

                        comp2[key] = (comp2[key] || 0) + sum;

                    } else {

                        comp2[key] = (comp2[key] || 0) + times.length;

                    }

                }

            }

        }

        // On réaffiche le camembert avec Plotly.react

        Plotly.react(

            document.getElementById("log_stats"),

            [{

                type: 'pie',

                labels: Object.keys(comp2),

                values: Object.values(comp2),

                hovertemplate: plot_labels.pie_hovertemplate,

                textinfo: "label+percent",

                textposition: "inside"

            }],

            log_stats.layout

        );

    }



    // 7) On attache un seul listener pour les deux graphes

    ["data_rates", "total_rate"].forEach(id => {

        document.getElementById(id).on("plotly_relayout", evt => {

            const x0 = evt["xaxis.range[0]"] ?? (Array.isArray(evt["xaxis.range"]) ? evt["xaxis.range"][0] : null);

            const x1 = evt["xaxis.range[1]"] ?? (Array.isArray(evt["xaxis.range"]) ? evt["xaxis.range"][1] : null);

            if (x0 != null && x1 != null) updatePie(x0, x1);

        });

    });

}





function replot() {

    if (system != null) {

        plot_tlog()



    } else if (log != null) {

        plot_log()



    }

}



async function load(e) {

    reset()

    const file = e.files[0]
    if (file == null) {
        return
    }

    if (file.name.toLowerCase().endsWith(".bin")) {
        let reader = new FileReader()
        reader.onload = function (e) {
            loading_call(() => { load_log(reader.result) })
        }
        reader.readAsArrayBuffer(file)
    } else if (file.name.toLowerCase().endsWith(".tlog")) {
        let reader = new FileReader()
        reader.onload = function (e) {
            loading_call(() => { return load_tlog(reader.result) })
        }
        reader.readAsArrayBuffer(file)
    }

}




// Axis labels used in different modes

const rate_plot = {

    bits: {

        hovertemplate: "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} bps",

        yaxis: "bits per second",

        pie_hovertemplate: '%{label}<br>%{value:,i} bits<br>%{percent}<extra></extra>'

    },

    count: {

        hovertemplate: "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} messages",

        yaxis: "messages per second",

        pie_hovertemplate: '%{label}<br>%{value:,i} messages<br>%{percent}<extra></extra>'

    }

}



let log_stats = {}

let data_rates = {}

let total_rate = {}

function reset() {



    // Clear bin

    log = null



    // Clear tlog

    system = null

    tlogFieldStats = {}
    availableMessageFields = {}
    tlogStatusTexts = []
    sequenceMatches = {}
    ptgiAltSeries = []
    ptgiRawSeries = []
    ptgiPath = []
    customDistSeries = []
    gpiDistSeries = []
    gpiPath = []
    homeLat = null
    homeLon = null
    tlogMessagesSeen = new Set()
    tlogFieldSeries = {}
    tlogMessageSamples = {}
    tlogEndTime = null
    palierAwayWindow = null
    palierReturnWindow = null
    farFromHomeWindow = null
    graphPlots = {}
    if (routeLayers && routeLayers.length > 0) {
        routeLayers.forEach(l => {
            try { if (routeMap) routeMap.removeLayer(l) } catch (e) {}
        })
    }
    routeLayers = []
    const routeInfo = document.getElementById("route-map-info")
    if (routeInfo) routeInfo.textContent = "En attente d'un tlog"
    markChecksPending("En attente d'un tlog")
    renderSequenceResultsPending()
    resetTelemCheck()
    clearDerivedSections()



    function setup_section(section) {

        // Remove all children

        section.replaceChildren()



        // Hide

        section.hidden = true

        section.previousElementSibling.hidden = true

    }



    setup_section(document.getElementById("MAVLink"))



    document.getElementById("plotsetup").hidden = true

    document.getElementById("LOGSTATS").replaceChildren()



    // Log Composition

    log_stats.data = [{

        type: 'pie', textposition: 'inside', textinfo: "label+percent",

        hovertemplate: '%{label}<br>%{value:,i} bits<br>%{percent}<extra></extra>'

    }]

    log_stats.layout = {

        showlegend: false,

        margin: { b: 10, l: 50, r: 50, t: 10 },

    }



    let plot = document.getElementById("log_stats")

    Plotly.purge(plot)

    Plotly.newPlot(plot, log_stats.data, log_stats.layout, { displaylogo: false });

    plot_visibility(plot, true)



    const time_scale_label = "Time (s)"



    // Per msg data rates

    data_rates.layout = {

        showlegend: false,

        //legend: { itemclick: false, itemdoubleclick: false }, 

        margin: { b: 50, l: 50, r: 50, t: 20 },

        xaxis: { title: { text: time_scale_label } },

        yaxis: { title: { text: "" } },

    }

    plot_visibility(document.getElementById("data_rates"), true)



    // Total data rates

    total_rate.data = [{ type: 'scattergl', mode: 'lines', name: "Total", meta: "Total", hovertemplate: "" }]

    total_rate.layout = {

        showlegend: false,

        //legend: { itemclick: false, itemdoubleclick: false }, 

        margin: { b: 50, l: 50, r: 50, t: 20 },

        xaxis: { title: { text: time_scale_label } },

        yaxis: { title: { text: "" } },

    }

    plot_visibility(document.getElementById("total_rate"), true)



}


