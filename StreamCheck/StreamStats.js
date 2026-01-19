

var DataflashParser

import('../modules/JsDataflashParser/parser.js').then((mod) => { DataflashParser = mod.default });

let jspack
let jspackReadyPromise = import("../Checklists/MAVLink/local_modules/jspack/jspack.js").then((mod) => {
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
let customDistSeries = []

// --- Supabase (shared config) ---
const SUPABASE_URL = "https://tcyzpwgfetktblazbgtz.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjeXpwd2dmZXRrdGJsYXpiZ3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3ODgyNzIsImV4cCI6MjA3ODM2NDI3Mn0.UEDF3LrZeSD3aeaBtSivvFAs8YCr1iUSs1EAhOEAyyQ"
const REMOTE_TABLE_CHECKS = "streamcheck_checks"
const REMOTE_TABLE_SEQ = "streamcheck_sequence"
const REMOTE_CHECKS_ID = "shared"
const REMOTE_SEQ_ID = "shared"
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
    if (typeof mavlink20 === 'undefined' || mavlink20.map == null) {
        return null
    }
    if (mavlinkFieldCache[msgId] != null) {
        return mavlinkFieldCache[msgId]
    }
    const entry = mavlink20.map[msgId]
    if (entry == null || entry.type == null) {
        return null
    }
    const instance = new entry.type()
    const meta = {
        format: entry.format,
        order: entry.order_map,
        fieldnames: (instance.fieldnames || []).slice()
    }
    mavlinkFieldCache[msgId] = meta
    return meta
}

function decodeMavlinkPayload(msgId, buffer, offset, length) {
    if (typeof jspack === 'undefined') {
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

function updateFieldStats(messageName, fieldName, value) {
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
    return Array.from(all).sort()
}

function getFieldsForMessage(message) {
    if (availableMessageFields[message]) {
        return availableMessageFields[message]
    }
    if (tlogFieldStats[message]) {
        return Object.keys(tlogFieldStats[message])
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

    const status = document.createElement("span")
    status.className = "check-status pending"
    status.textContent = "?"
    status.title = "En attente d'un tlog"

    const value = document.createElement("span")
    value.className = "check-value"
    value.textContent = "-"

    const label = document.createElement("span")
    label.className = "check-label"
    label.textContent = `${check.message} • ${check.field} (${check.aggregate}) in [${formatBound(check.min)} ; ${formatBound(check.max)}]`

    const remove = document.createElement("button")
    remove.className = "check-remove"
    remove.textContent = "✕"
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
    for (const [section, checks] of Object.entries(checkConfig)) {
        for (const check of checks) {
            const stats = tlogFieldStats[check.message]?.[check.field]
            const value = getStatValue(stats, check.aggregate)
            if (value == null) {
                setCheckStatus(check.id, "pending", "Pas de données pour ce champ")
                continue
            }
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
    title.textContent = "Add check"
    panel.appendChild(title)

    const messageLabel = document.createElement("label")
    messageLabel.textContent = "Message"
    const messageSelect = document.createElement("select")
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
    fieldLabel.appendChild(fieldSelect)
    panel.appendChild(fieldLabel)

    const aggLabel = document.createElement("label")
    aggLabel.textContent = "Agrégat"
    const aggSelect = document.createElement("select")
    ;["max", "min", "mean"].forEach(v => {
        const opt = document.createElement("option")
        opt.value = v
        opt.textContent = v
        aggSelect.appendChild(opt)
    })
    aggLabel.appendChild(aggSelect)
    panel.appendChild(aggLabel)

    const minLabel = document.createElement("label")
    minLabel.textContent = "Min autorisé (optionnel)"
    const minInput = document.createElement("input")
    minInput.type = "number"
    minInput.step = "any"
    minLabel.appendChild(minInput)
    panel.appendChild(minLabel)

    const maxLabel = document.createElement("label")
    maxLabel.textContent = "Max autorisé (optionnel)"
    const maxInput = document.createElement("input")
    maxInput.type = "number"
    maxInput.step = "any"
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
        const fields = getFieldsForMessage(messageSelect.value)
        if (fields.length === 0) {
            const opt = document.createElement("option")
            opt.value = ""
            opt.textContent = "Aucun champ disponible"
            fieldSelect.appendChild(opt)
            return
        }
        fields.forEach(f => {
            const opt = document.createElement("option")
            opt.value = f
            opt.textContent = f
            fieldSelect.appendChild(opt)
        })
    }

    refreshFields()
    messageSelect.addEventListener("change", refreshFields)

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
        const newCheck = {
            id: generateCheckId(),
            message,
            field,
            aggregate,
            min: minVal,
            max: maxVal
        }
        checkConfig[sectionId].push(newCheck)

        const paired = checkPairs[sectionId]
        if (paired) {
            const msg = `Ajouter aussi ce check dans "${paired}" ?`
            if (confirm(msg)) {
                if (!(paired in checkConfig)) {
                    checkConfig[paired] = []
                }
                checkConfig[paired].push({ ...newCheck, id: generateCheckId() })
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
}

document.addEventListener("DOMContentLoaded", initCheckUI)

const SEQ_STORAGE_KEY = "streamcheck_sequence_v1"
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

function saveSequenceConfig() {
    try {
        localStorage.setItem(SEQ_STORAGE_KEY, JSON.stringify(sequenceConfig))
    } catch (e) {
        console.warn("Could not save sequencing config", e)
    }
    pushRemoteSequence().catch(err => console.warn("Remote sequence save failed", err))
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
        input.dataset.seqInput = step.id
        row.appendChild(input)

        const select = document.createElement("select")
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
}

function evaluateSequence() {
    renderSequenceResultsPending()
    sequenceMatches = {}
    if (tlogStatusTexts.length === 0) {
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
        ptgiDump.textContent = ptgiAltSeries
            .map(e => `${e.time.toFixed(2)}s: alt=${e.alt}`)
            .join("\n")
    }
    const customDump = document.getElementById("custom-list")
    if (customDump) {
        customDump.textContent = customDistSeries
            .map(e => `${e.time.toFixed(2)}s: dist=${e.dist}`)
            .join("\n")
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
            resEl.textContent = `Trouvé à ${chosen.time.toFixed(2)} s`
        }
    })
    // If no "cruise-return" marker but we have "cruise-away", treat whole cruise as return (test flight, no drop)
    if (sequenceMatches["cruise-away"] != null && sequenceMatches["cruise-return"] == null) {
        const awayEl = document.querySelector('[data-seq-result="cruise-away"]')
        const retEl = document.querySelector('[data-seq-result="cruise-return"]')
        if (awayEl) {
            awayEl.textContent = "Test : cruise away vide (pas de largage)"
        }
        if (retEl) {
            retEl.textContent = `Cruise return démarre à ${sequenceMatches["cruise-away"].toFixed(2)} s`
        }
        sequenceMatches["cruise-return"] = sequenceMatches["cruise-away"]
    }
    const ff = document.getElementById("seq-full-flight")
    if (ff) {
        const start = sequenceMatches["vtol-takeoff"]
        const end = sequenceMatches["vtol-landing"]
        if (start != null && end != null && end > start) {
            ff.textContent = `Full flight : ${start.toFixed(2)} s -> ${end.toFixed(2)} s`
        } else {
            ff.textContent = "Full flight : bornes manquantes"
        }
    }
    updateDerivedSections()
}

function initSequenceUI() {
    renderSequenceRows()
    renderSequenceResultsPending()
    syncSequenceFromRemote()
}

document.addEventListener("DOMContentLoaded", initSequenceUI)

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
        if (cruiseAwayStart != null && cruiseReturnStart != null && cruiseReturnStart > cruiseAwayStart) {
            const res = longestConstantAltInterval(ptgiAltSeries, 2.0, cruiseAwayStart, cruiseReturnStart)
            palAwayEl.textContent = res ? formatInterval(res) : "Pas de palier détecté"
        } else {
            palAwayEl.textContent = "Bornes manquantes ou cruise away vide"
        }
    }
    if (palRetEl) {
        if (cruiseReturnStart != null && airbrakeStart != null && airbrakeStart > cruiseReturnStart) {
            const res = longestConstantAltInterval(ptgiAltSeries, 2.0, cruiseReturnStart, airbrakeStart)
            palRetEl.textContent = res ? formatInterval(res) : "Pas de palier détecté"
        } else {
            palRetEl.textContent = "Bornes manquantes"
        }
    }

    if (farEl) {
        const start = sequenceMatches["vtol-takeoff"]
        const end = sequenceMatches["vtol-landing"]
        const res = longestFarFromHome(customDistSeries, 5000, start, end)
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

            // Invalid crc

            offset += 1

            continue

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
        const payload = decodeMavlinkPayload(header.msgId, log_file, payload_start, header.payload_length)
        if (payload != null) {
            availableMessageFields[message.name] = payload.fieldnames
            payload.fieldnames.forEach((field, idx) => {
                updateFieldStats(message.name, field, payload.values[idx])
            })
            if (message.name === "POSITION_TARGET_GLOBAL_INT") {
                const idxAlt = payload.fieldnames.findIndex(n => n.toLowerCase() === "alt")
                if (idxAlt !== -1 && Number.isFinite(payload.values[idxAlt])) {
                    ptgiAltSeries.push({ time, alt: payload.values[idxAlt] })
                }
            }
            if (message.name.toUpperCase().includes("CUSTOM")) {
                const idxDist = payload.fieldnames.findIndex(n => n.toLowerCase().includes("dist_home") || n.toLowerCase().includes("disthome"))
                if (idxDist !== -1 && Number.isFinite(payload.values[idxDist])) {
                    customDistSeries.push({ time, dist: payload.values[idxDist] })
                }
            }
        }


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

        if (message.name === "STATUSTEXT") {
            let text = extractStatusText(payload)
            if (text == null || text === "") {
                text = extractStatusTextFromBytes(log_file, payload_start, header.payload_length)
            }
            if (text != null && text !== "") {
                tlogStatusTexts.push({ time, text: text.trim() })
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

            // Deal with wrap at 255

            seq += 255

        }

        comp.dropped += seq - comp.next_seq

        comp.next_seq = (header.sequence + 1) % 256



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

    evaluateChecks()
    evaluateSequence()
    updateDerivedSections()



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
    customDistSeries = []
    markChecksPending("En attente d'un tlog")
    renderSequenceResultsPending()
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

