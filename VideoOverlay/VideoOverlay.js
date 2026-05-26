var html2canvas
let import_done = []
import_done[0] = import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.esm.js').then((mod) => { html2canvas = mod.default })

var DataflashParser
import_done[1] = import('../modules/JsDataflashParser/parser.js').then((mod) => { DataflashParser = mod.default })

// Bin log object
let log

const syncPlotDefaultItem = "BARO[0].Alt"
const syncPlotState = {
    item: syncPlotDefaultItem,
    series: null,
    optionValues: new Set(),
    drawPending: false
}
const widgetPreviewTimeState = {
    running: false,
    pendingVidTime: null
}

// Get flight time from stat params
function getFlightTime(log) {
    if (!("PARM" in log.messageTypes)) {
        return "Unknown"
    }

    let startTime
    let endTime

    const PARM = log.get("PARM")
    for (let i = 0; i < PARM.Name.length; i++) {
        if (PARM.Name[i] != "STAT_FLTTIME") {
            continue
        }
        const value = PARM.Value[i]
        if (startTime == null) {
            startTime = value
        }
        endTime = value
    }

    if (startTime == null) {
        return "Unknown"
    }

    const flightTime = endTime - startTime
    if (flightTime == 0) {
        return "-"
    }
    const dur = luxon.Duration.fromMillis(flightTime * 1000)
    return dur.rescale().toHuman({listStyle: 'narrow', unitDisplay: 'short'})
}

// Available output formats
let outputFormats = []

async function loadCodecs() {

    outputFormats = []

    const {
        getEncodableVideoCodecs,
        getEncodableAudioCodecs,
        Mp4OutputFormat,
        WebMOutputFormat,
        MkvOutputFormat,
        MovOutputFormat,
    } = Mediabunny;

    // Available output formats
    const formats = {
        mp4: new Mp4OutputFormat(),
        webm: new WebMOutputFormat(),
        mkv: new MkvOutputFormat(),
        mov: new MovOutputFormat()
    }

    for (const [name, format] of Object.entries(formats)) {
        const video = await getEncodableVideoCodecs(format.getSupportedCodecs())
        const audio = await getEncodableAudioCodecs(format.getSupportedCodecs())
        if ((video.length > 0) && (audio.length > 0)) {
            outputFormats.push({
                name,
                video,
                audio
            })
        }
    }

    if (outputFormats.length == 0) {
        throw new Error("Video export not supported by browser")
    }

    // Add selection option for each format
    const output_format_select = document.getElementById("output_format")
    output_format_select.replaceChildren()
    for (const format of outputFormats) {
        const option = document.createElement("option")
        option.setAttribute('value', format.name)
        option.innerHTML = format.name
        output_format_select.appendChild(option)
    }

    // Update the available codecs when the format is changed
    output_format_select.addEventListener('change', () => {
        updateFormatSelection()
    })
    updateFormatSelection()
}

// Update the supported codecs for a given selection
function updateFormatSelection() {

    const output_format_select = document.getElementById("output_format")
    const selectedFormat = outputFormats.find((x) => x.name === output_format_select.value)

    if (selectedFormat == null) {
        throw new Error("Unknown selected format")
    }

    function updateCodecOptions(select, codecs) {
        select.replaceChildren()
        for (const codec of codecs) {
            const option = document.createElement("option")
            option.setAttribute('value', codec)
            option.innerHTML = codec
            select.appendChild(option)
        }
        // Lock the input if there is only one option
        select.disabled = codecs.length == 1
    }

    updateCodecOptions(document.getElementById("video_codec"), selectedFormat.video)
    updateCodecOptions(document.getElementById("audio_codec"), selectedFormat.audio)
}

// Match the export format and setting to the input one if possible
function MatchExportFormatToInput(format, vidCodec, audioCodec, fps) {

    // Find the output format which best matches
    const formats = document.getElementById("output_format").querySelectorAll("option")
    for (const fmt of formats) {
        if (fmt.value.toLowerCase() === format.toLowerCase()) {
            fmt.selected = true
            updateFormatSelection()
            break;
        }
    }

    // Match codec
    function matchCodec(select, codec) {
        const options = select.querySelectorAll("option")
        for (const opt of options) {
            if (opt.value.toLowerCase() === codec.toLowerCase()) {
                opt.selected = true
                break;
            }
        }
    }

    matchCodec(document.getElementById("video_codec"), vidCodec)
    matchCodec(document.getElementById("audio_codec"), audioCodec)

    // Match FPS
    let minDiff = Infinity
    const options = document.getElementById("frame_rate").querySelectorAll("option")
    for (const opt of options) {
        const diff = Math.abs(parseFloat(opt.value) - parseFloat(fps))
        if (diff < minDiff) {
            minDiff = diff
            opt.selected = true
        }
    }
}

// Try and work out the offset such that something is happening in the log
function setDefaultOffset() {

    // Default to 0
    document.getElementById("log_offset").value = 0.0

    // Find the fist log message with timestamp
    let firstTimeOffset

    for (const msg of log.FMT) {
        if (msg == null) {
            // Invalid message type
            continue
        }

        // Look for timestamp
        const time_index = msg.Columns.indexOf("TimeUS")
        if ((time_index == -1) || (msg.Format.charAt(time_index) != "Q")) {
            // No timestamp, or unexpected format
            continue
        }

        // Offset of timestamp within message
        const TimeUS_offset = msg.FormatOffset[time_index]

        // Offset of message, only check first, assume time never goes backwards
        if ("InstancesOffsetArray" in msg) {
            // Multiple instances
            for (const inst of Object.values(msg.InstancesOffsetArray)) {
                const len = inst.length
                if (len > 0) {
                    const offset = inst[0] + TimeUS_offset
                    if (firstTimeOffset == null || offset <= firstTimeOffset) {
                        firstTimeOffset = offset
                    }
                }
            }

        } else {
            // Single instance
            const len = msg.OffsetArray.length
            if (len > 0) {
                const offset = msg.OffsetArray[0] + TimeUS_offset
                if (firstTimeOffset == null || offset <= firstTimeOffset) {
                    firstTimeOffset = offset
                }
            }
        }
    }

    if (firstTimeOffset == null) {
        return
    }

    log.offset = firstTimeOffset
    const firstTimeUs = log.parse_type("Q")

    // Offset the log backwards such that the first time lines up with the start of the vid
    document.getElementById("log_offset").value = -firstTimeUs / 1000000
}

// Return the duration in micro seconds
function getLogDurationUS() {
    // Find the fist log message with timestamp
    let firstTimeOffset
    let lastTimeOffset

    // Helper to record offset of time stamps
    function updateOffsets(first, last, valueOffset) {
        const newFirstTimeOffset = first + valueOffset
        if ((firstTimeOffset == null) || (newFirstTimeOffset < firstTimeOffset)) {
            firstTimeOffset = newFirstTimeOffset
        }
        const newLastTimeOffset = last + valueOffset
        if ((lastTimeOffset == null) || (newLastTimeOffset > lastTimeOffset)) {
            lastTimeOffset = newLastTimeOffset
        }
    }

    for (const msg of log.FMT) {
        if (msg == null) {
            // Invalid message type
            continue
        }

        // Look for timestamp
        const time_index = msg.Columns.indexOf("TimeUS")
        if ((time_index == -1) || (msg.Format.charAt(time_index) != "Q")) {
            // No timestamp, or unexpected format
            continue
        }

        // Offset of timestamp within message
        const TimeUS_offset = msg.FormatOffset[time_index]

        // Offset of message, only check first, assume time never goes backwards
        if ("InstancesOffsetArray" in msg) {
            // Multiple instances
            for (const inst of Object.values(msg.InstancesOffsetArray)) {
                const len = inst.length
                if (len > 0) {
                    updateOffsets(inst[0], inst[len-1], TimeUS_offset)
                }
            }

        } else {
            // Single instance
            const len = msg.OffsetArray.length
            if (len > 0) {
                updateOffsets(msg.OffsetArray[0], msg.OffsetArray[len-1], TimeUS_offset)
            }
        }
    }

    if ((firstTimeOffset == null) || (lastTimeOffset == null)) {
        return
    }

    log.offset = firstTimeOffset
    const firstTimeUs = log.parse_type("Q")

    log.offset = lastTimeOffset
    const lastTimeUs = log.parse_type("Q")

    return lastTimeUs - firstTimeUs
}

function parseSyncPlotItem(item) {
    if (typeof item != "string") {
        return
    }

    const match = item.match(/^(\w+)(?:\[(\d+)\])?\.(\w+)$/)
    if (match == null) {
        return
    }

    return {
        name: match[1],
        instance: (match[2] == null) ? null : parseInt(match[2]),
        field: match[3]
    }
}

function isNumericLogFormat(format) {
    return "bBMhHiLIfdQqcCEe".includes(format)
}

function getVideoCurrentTime() {
    const video = document.getElementById("video")
    if (video == null) {
        return 0
    }
    return video.currentTime || 0
}

function getCurrentLogOffset() {
    const offset = parseFloat(document.getElementById("log_offset").value)
    return Number.isFinite(offset) ? offset : 0
}

function setCurrentLogOffset(offset) {
    document.getElementById("log_offset").value = Number.isFinite(offset) ? offset.toFixed(3) : 0
}

function getLogTimeForVideoTime(vidTime) {
    return vidTime - getCurrentLogOffset()
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max)
}

function getSyncPlotUnit(messageName, field) {
    const type = log?.messageTypes?.[messageName]
    const fieldInfo = type?.complexFields?.[field]
    if ((fieldInfo == null) || (fieldInfo.units == null) || (fieldInfo.units == "?")) {
        return ""
    }
    return fieldInfo.units
}

function addSyncPlotOption(fieldList, messageName, field) {
    const value = `${messageName}.${field}`
    const unit = getSyncPlotUnit(messageName, field)

    const option = document.createElement("option")
    option.setAttribute("value", value)
    option.setAttribute("label", unit == "" ? value : `${value} (${unit})`)
    fieldList.appendChild(option)

    syncPlotState.optionValues.add(value)
}

function updateSyncPlotOptions() {
    const fieldInput = document.getElementById("sync_plot_field")
    const fieldList = document.getElementById("sync_plot_field_list")
    if ((fieldInput == null) || (fieldList == null)) {
        return
    }

    fieldList.replaceChildren()
    syncPlotState.optionValues = new Set()

    if (log == null) {
        fieldInput.value = syncPlotDefaultItem
        fieldInput.disabled = true
        clearSyncPlotSeries()
        updateSyncPlotTime(getVideoCurrentTime())
        return
    }

    for (const msg of log.FMT) {
        if ((msg == null) || (msg.Total_Length == 0) || (msg.Columns.indexOf("TimeUS") == -1)) {
            continue
        }

        const messageNames = []
        if ("InstancesOffsetArray" in msg) {
            const instances = Object.keys(msg.InstancesOffsetArray).sort((a, b) => parseFloat(a) - parseFloat(b))
            for (const instance of instances) {
                messageNames.push(`${msg.Name}[${instance}]`)
            }
        } else {
            messageNames.push(msg.Name)
        }

        for (let i = 0; i < msg.Columns.length; i++) {
            const field = msg.Columns[i]
            if ((field == "TimeUS") || !isNumericLogFormat(msg.Format.charAt(i))) {
                continue
            }

            for (const messageName of messageNames) {
                addSyncPlotOption(fieldList, messageName, field)
            }
        }
    }

    fieldInput.disabled = syncPlotState.optionValues.size == 0
    if (syncPlotState.optionValues.size == 0) {
        fieldInput.value = ""
        clearSyncPlotSeries()
        updateSyncPlotTime(getVideoCurrentTime())
        return
    }

    let item = fieldInput.value
    if (!syncPlotState.optionValues.has(item)) {
        if (syncPlotState.optionValues.has(syncPlotDefaultItem)) {
            item = syncPlotDefaultItem
        } else if (syncPlotState.optionValues.has("BARO.Alt")) {
            item = "BARO.Alt"
        } else {
            item = syncPlotState.optionValues.values().next().value
        }
    }

    fieldInput.value = item
    setSyncPlotItem(item)
}

function getSyncPlotSeries(item) {
    if (log == null) {
        return
    }

    const parsed = parseSyncPlotItem(item)
    if (parsed == null) {
        return
    }

    let timeUS
    let value
    if (parsed.instance == null) {
        timeUS = log.get(parsed.name, "TimeUS")
        value = log.get(parsed.name, parsed.field)
    } else {
        timeUS = log.get_instance(parsed.name, parsed.instance, "TimeUS")
        value = log.get_instance(parsed.name, parsed.instance, parsed.field)
    }

    if ((timeUS == null) || (value == null)) {
        return
    }

    let minTime = Infinity
    let maxTime = -Infinity
    let minValue = Infinity
    let maxValue = -Infinity
    let validCount = 0
    const len = Math.min(timeUS.length, value.length)
    for (let i = 0; i < len; i++) {
        const time = timeUS[i] / 1000000
        const sample = value[i]
        if (!Number.isFinite(time) || !Number.isFinite(sample)) {
            continue
        }

        minTime = Math.min(minTime, time)
        maxTime = Math.max(maxTime, time)
        minValue = Math.min(minValue, sample)
        maxValue = Math.max(maxValue, sample)
        validCount += 1
    }

    if (validCount == 0) {
        return
    }

    const messageName = (parsed.instance == null) ? parsed.name : `${parsed.name}[${parsed.instance}]`
    return {
        item,
        field: parsed.field,
        unit: getSyncPlotUnit(messageName, parsed.field),
        timeUS,
        value,
        len,
        minTime,
        maxTime,
        minValue,
        maxValue,
        validCount
    }
}

function clearSyncPlotSeries() {
    syncPlotState.series = null

    const slider = document.getElementById("sync_plot_slider")
    if (slider != null) {
        slider.disabled = true
    }
}

function setSyncPlotItem(item) {
    syncPlotState.item = item
    syncPlotState.series = getSyncPlotSeries(item)

    const slider = document.getElementById("sync_plot_slider")
    if (slider == null) {
        return
    }

    const series = syncPlotState.series
    if (series == null) {
        slider.disabled = true
        updateSyncPlotTime(getVideoCurrentTime())
        return
    }

    slider.disabled = false
    slider.min = series.minTime
    slider.max = series.maxTime
    slider.step = Math.max((series.maxTime - series.minTime) / 10000, 0.001)
    updateSyncPlotTime(getVideoCurrentTime())
}

function getSyncPlotValueAtTime(series, time) {
    if ((series == null) || (series.len == 0)) {
        return
    }

    const targetUS = time * 1000000
    let low = 0
    let high = series.len - 1
    while (low <= high) {
        const mid = Math.floor((low + high) / 2)
        if (series.timeUS[mid] < targetUS) {
            low = mid + 1
        } else {
            high = mid - 1
        }
    }

    const i0 = clamp(low - 1, 0, series.len - 1)
    const i1 = clamp(low, 0, series.len - 1)
    const t0 = series.timeUS[i0] / 1000000
    const t1 = series.timeUS[i1] / 1000000
    const v0 = series.value[i0]
    const v1 = series.value[i1]

    if (!Number.isFinite(v0) || !Number.isFinite(v1) || (t0 == t1)) {
        return Number.isFinite(v0) ? v0 : v1
    }

    return v0 + ((time - t0) / (t1 - t0)) * (v1 - v0)
}

function formatSyncValue(value) {
    if (!Number.isFinite(value)) {
        return "-"
    }

    const abs = Math.abs(value)
    if ((abs > 0) && ((abs < 0.01) || (abs >= 10000))) {
        return value.toExponential(2)
    }
    return value.toFixed(abs < 100 ? 2 : 1)
}

function updateSyncPlotStatus(logTime) {
    const status = document.getElementById("sync_plot_status")
    if (status == null) {
        return
    }

    if (log == null) {
        status.textContent = "Load a log to enable sync plot"
        return
    }

    const series = syncPlotState.series
    if (series == null) {
        status.textContent = "No data for selected plot"
        return
    }

    const value = getSyncPlotValueAtTime(series, logTime)
    const unit = series.unit == "" ? "" : ` ${series.unit}`
    status.textContent = `Offset ${getCurrentLogOffset().toFixed(3)} s | ${series.item} ${formatSyncValue(value)}${unit}`
}

function updateSyncPlotTime(vidTime) {
    const series = syncPlotState.series
    const slider = document.getElementById("sync_plot_slider")
    const logTime = getLogTimeForVideoTime(vidTime)

    if ((series != null) && (slider != null) && (document.activeElement !== slider)) {
        slider.value = clamp(logTime, series.minTime, series.maxTime)
    }

    updateSyncPlotStatus(logTime)
    requestSyncPlotDraw()
}

function requestSyncPlotDraw() {
    if (syncPlotState.drawPending) {
        return
    }

    syncPlotState.drawPending = true
    requestAnimationFrame(() => {
        syncPlotState.drawPending = false
        drawSyncPlot()
    })
}

function drawSyncPlotMessage(ctx, width, height, message) {
    ctx.fillStyle = "#666"
    ctx.font = "12px sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(message, width / 2, height / 2)
}

function drawSyncPlot() {
    const canvas = document.getElementById("sync_plot_canvas")
    const panel = document.getElementById("sync_panel")
    if ((canvas == null) || (panel == null) || panel.classList.contains("collapsed")) {
        return
    }

    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if ((width == 0) || (height == 0)) {
        return
    }

    const pixelRatio = window.devicePixelRatio || 1
    const canvasWidth = Math.floor(width * pixelRatio)
    const canvasHeight = Math.floor(height * pixelRatio)
    if ((canvas.width != canvasWidth) || (canvas.height != canvasHeight)) {
        canvas.width = canvasWidth
        canvas.height = canvasHeight
    }

    const ctx = canvas.getContext("2d")
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    ctx.clearRect(0, 0, width, height)

    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, width, height)

    const series = syncPlotState.series
    if (series == null) {
        drawSyncPlotMessage(ctx, width, height, log == null ? "No log loaded" : "No plot data")
        return
    }

    const left = 52
    const right = 12
    const top = 10
    const bottom = 20
    const plotWidth = Math.max(width - left - right, 1)
    const plotHeight = Math.max(height - top - bottom, 1)

    let minValue = series.minValue
    let maxValue = series.maxValue
    if (minValue == maxValue) {
        minValue -= 0.5
        maxValue += 0.5
    }

    let minTime = series.minTime
    let maxTime = series.maxTime
    if (minTime == maxTime) {
        minTime -= 0.5
        maxTime += 0.5
    }

    const timeRange = maxTime - minTime
    const valueRange = maxValue - minValue

    ctx.strokeStyle = "#d0d0d0"
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i <= 4; i++) {
        const y = top + (plotHeight * i / 4)
        ctx.moveTo(left, y)
        ctx.lineTo(left + plotWidth, y)
    }
    ctx.stroke()

    ctx.strokeStyle = "#333"
    ctx.strokeRect(left, top, plotWidth, plotHeight)

    const maxSamples = Math.max(Math.floor(plotWidth * 3), 1)
    const step = Math.max(Math.floor(series.validCount / maxSamples), 1)
    ctx.strokeStyle = "#1f77b4"
    ctx.lineWidth = 1.5
    ctx.beginPath()
    let started = false
    for (let i = 0; i < series.len; i += step) {
        const time = series.timeUS[i] / 1000000
        const value = series.value[i]
        if (!Number.isFinite(time) || !Number.isFinite(value)) {
            continue
        }

        const x = left + ((time - minTime) / timeRange) * plotWidth
        const y = top + (1 - ((value - minValue) / valueRange)) * plotHeight
        if (!started) {
            ctx.moveTo(x, y)
            started = true
        } else {
            ctx.lineTo(x, y)
        }
    }
    ctx.stroke()

    const logTime = getLogTimeForVideoTime(getVideoCurrentTime())
    const lineTime = clamp(logTime, minTime, maxTime)
    const lineX = left + ((lineTime - minTime) / timeRange) * plotWidth
    ctx.strokeStyle = ((logTime < minTime) || (logTime > maxTime)) ? "#777" : "#d32f2f"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(lineX, top)
    ctx.lineTo(lineX, top + plotHeight)
    ctx.stroke()

    ctx.fillStyle = "#333"
    ctx.font = "11px sans-serif"
    ctx.textBaseline = "top"
    ctx.textAlign = "right"
    ctx.fillText(formatSyncValue(maxValue), left - 6, top)
    ctx.textBaseline = "bottom"
    ctx.fillText(formatSyncValue(minValue), left - 6, top + plotHeight)
    ctx.textAlign = "left"
    ctx.fillText(minTime.toFixed(1) + "s", left, height - 4)
    ctx.textAlign = "right"
    ctx.fillText(maxTime.toFixed(1) + "s", left + plotWidth, height - 4)
}


function load() {

    // load codex for export
    loadCodecs()

    // Video input setup
    const input = document.getElementById('vid-upload');
    const video = document.getElementById('video');
    const info = document.getElementById('vid-info');

    function matchOverlaySize() {
        const bodyStyle = getComputedStyle(document.body)
        const maxWidth = Math.min(1200, document.documentElement.clientWidth - parseFloat(bodyStyle.marginLeft) - parseFloat(bodyStyle.marginRight))
        const maxHeight = Math.min(1200, document.documentElement.clientHeight * 0.8)

        const containerRatio = maxWidth / maxHeight;
        let videoRatio = video.videoWidth / video.videoHeight;
        if (isNaN(videoRatio)) {
            videoRatio = 16 / 9
        }

        let renderedW, renderedH

        if (videoRatio > containerRatio) {
            // Video is wider than container — constrained by width
            renderedW = maxWidth;
            renderedH = maxWidth / videoRatio;
        } else {
            // Video is taller than container — constrained by height
            renderedH = maxHeight;
            renderedW = maxHeight * videoRatio;
        }

        const container = video.parentElement
        container.style.width = Math.floor(renderedW) + 'px'
        container.style.height = Math.floor(renderedH) + 'px'
    }
    matchOverlaySize()
    window.addEventListener('resize', matchOverlaySize);


    input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) {
            return;
        }

        video.src = URL.createObjectURL(file);
        video.load();

        const {
            BlobSource,
            Input,
            ALL_FORMATS,
        } = Mediabunny;

        // Create a new input from the resource to extract FPS
        const MBInput = new Input({
            source: new BlobSource(file),
            formats: ALL_FORMATS, // Accept all formats
        });

        const vidTrack = await MBInput.getPrimaryVideoTrack()
        const audioTrack = await MBInput.getPrimaryAudioTrack()

        const vidStats = await vidTrack.computePacketStats()
        const fps = vidStats.averagePacketRate.toFixed(2)

        const format = await MBInput.getFormat()
        const endTime = await MBInput.computeDuration() 

        // Set vid info
        const fpsInfo = info.querySelector("#fps")
        fpsInfo.textContent = `${fps}`

        const codecInfo = info.querySelector("#codec")
        codecInfo.textContent = `${vidTrack.codec} + ${audioTrack.codec}`

        const resolution = info.querySelector("#resolution")
        resolution.textContent = `${vidTrack.displayWidth}x${vidTrack.displayHeight}px`

        const duration = info.querySelector("#duration")
        duration.textContent = formatTime(endTime)

        // Set export settings
        const startTimeInput = document.getElementById("start_time")
        startTimeInput.value = 0

        const endTimeInput = document.getElementById("end_time")
        endTimeInput.value = endTime

        const exportWidthInput = document.getElementById("export_width")
        exportWidthInput.value = vidTrack.displayWidth

        const exportHeightInput = document.getElementById("export_height")
        exportHeightInput.value = vidTrack.displayHeight

        // Match up the codec settings and FPS as best as possible
        MatchExportFormatToInput(format.name, vidTrack.codec, audioTrack.codec, fps)

    });

    const playBtn = document.getElementById('play');
    const seek = document.getElementById('seek');
    const timeDisplay = document.getElementById('time');
    const syncField = document.getElementById("sync_plot_field")
    const syncSlider = document.getElementById("sync_plot_slider")
    const syncPanel = document.getElementById("sync_panel")
    const syncToggle = document.getElementById("sync_panel_toggle")

    const updateSyncField = () => {
        if (!syncPlotState.optionValues.has(syncField.value)) {
            clearSyncPlotSeries()
            updateSyncPlotTime(video.currentTime)
            return
        }
        setSyncPlotItem(syncField.value)
    }
    syncField.oninput = updateSyncField
    syncField.onchange = updateSyncField

    const updateSyncSlider = () => {
        const selectedLogTime = parseFloat(syncSlider.value)
        if (!Number.isFinite(selectedLogTime)) {
            return
        }

        setCurrentLogOffset(video.currentTime - selectedLogTime)
        scheduleWidgetTimeUpdate(video.currentTime)
        updateSyncPlotTime(video.currentTime)
    }
    syncSlider.oninput = updateSyncSlider
    syncSlider.onchange = updateSyncSlider

    syncToggle.onclick = () => {
        const collapsed = syncPanel.classList.toggle("collapsed")
        syncToggle.textContent = collapsed ? "Show" : "Hide"
        syncToggle.title = collapsed ? "Expand sync plot" : "Collapse sync plot"
        if (!collapsed) {
            requestSyncPlotDraw()
        }
    }
    window.addEventListener('resize', requestSyncPlotDraw)
    updateSyncPlotTime(video.currentTime)

    let syncPlaybackFrame = null
    function stopSyncPlaybackFollow() {
        if (syncPlaybackFrame != null) {
            cancelAnimationFrame(syncPlaybackFrame)
            syncPlaybackFrame = null
        }
    }

    function followSyncPlayback() {
        updateSyncPlotTime(video.currentTime)
        if (!video.paused && !video.ended) {
            syncPlaybackFrame = requestAnimationFrame(followSyncPlayback)
        } else {
            syncPlaybackFrame = null
        }
    }

    function startSyncPlaybackFollow() {
        if (syncPlaybackFrame == null) {
            syncPlaybackFrame = requestAnimationFrame(followSyncPlayback)
        }
    }

    // Play / Pause
    playBtn.onclick = () => {
        if (video.paused) {
            video.play();
        } else {
            video.pause();
        }
    };

    // Update play / pause button
    video.onplay = () => {
        playBtn.textContent = "||"
        startSyncPlaybackFollow()
    }
    video.onpause = () => {
        playBtn.textContent = "▶"
        stopSyncPlaybackFollow()
        updateSyncPlotTime(video.currentTime)
    }

    // Skip buttons
    document.getElementById('skip-back').onclick  = () => video.currentTime -= 5;
    document.getElementById('skip-fwd').onclick   = () => video.currentTime += 5;
    document.getElementById('frame-back').onclick = () => video.currentTime -= 1 / parseFloat(document.getElementById("frame_rate").value);
    document.getElementById('frame-fwd').onclick  = () => video.currentTime += 1 / parseFloat(document.getElementById("frame_rate").value);

    // Volume control
    document.getElementById('mute').onclick = () => {
        video.muted = !video.muted;
        document.getElementById('mute').textContent = video.muted ? '🔇' : '🔊';
    };
    document.getElementById('volume').oninput = e => {
        video.volume = parseFloat(e.target.value);
    };

    // Speed
    document.getElementById('rate').onchange = e => {
        video.playbackRate = parseFloat(e.target.value);
    }

    const start_time = document.getElementById("start_time")
    const end_time = document.getElementById("end_time")

    // Set start and end buttons
    document.getElementById('set-start').onclick  = () => {
        start_time.value = video.currentTime;
        start_time.onchange()
    }
    document.getElementById('set-end').onclick  = () => {
        end_time.value = video.currentTime;
        end_time.onchange()
    }

    function updateSeekBar() {
        const seek = document.getElementById('seek');

        const start = parseFloat(start_time.value) / video.duration;
        const end = parseFloat(end_time.value) / video.duration;

        const gradient = `linear-gradient(to right,
            #555 0%,
            #555 ${start * 100}%,
            #4CAF50 ${start * 100}%,
            #4CAF50 ${end * 100}%,
            #555 ${end * 100}%,
            #555 100%
          )`;

        seek.style.cssText = `
        -webkit-appearance: none !important;
        background: ${gradient} !important;
      `;

    }
    start_time.onchange = updateSeekBar
    end_time.onchange = updateSeekBar

    video.onloadedmetadata = () => {
        matchOverlaySize()
        updateTimeline()
        updateSeekBar()
        updateSyncPlotTime(video.currentTime)
    };

    function updateTimeline() {
        const t = video.currentTime;
        const d = video.duration || 1;

        seek.value = t / d;
        timeDisplay.textContent = `${formatTime(t)} / ${formatTime(d)}`;
    }

    // Timeline update
    video.ontimeupdate = () => {
        // There is no auto slow down here, assume widgets can keep up with playback
        scheduleWidgetTimeUpdate(video.currentTime)
        updateTimeline()
        updateSyncPlotTime(video.currentTime)
    };

    // Seek
    seek.oninput = () => {
        video.currentTime = seek.value * video.duration;
        scheduleWidgetTimeUpdate(video.currentTime)
        updateSyncPlotTime(video.currentTime)
    };

    function formatTime(t) {
        const m = Math.floor(t / 60);
        const s = Math.floor(t % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    // Log input
    const logInput = document.getElementById("log-input")
    logInput.onchange = () => {
        const file = logInput.files[0];
        if (!file) {
            return;
        }
        let reader = new FileReader()
        reader.onload = function (e) {
            loading_call(async () => { 
                await Promise.allSettled(import_done)

                log = new DataflashParser()
                log.processData(reader.result, [])

                const info = document.getElementById('log-info')
                const date = info.querySelector("#date")
                date.textContent = luxon.DateTime.fromJSDate(log.extractStartTime()).toFormat('dd/MM/yyyy hh:mm:ss a')

                const flightTime = info.querySelector("#flight-time")
                flightTime.textContent = getFlightTime(log)

                const durationUs = getLogDurationUS()
                const duration = info.querySelector("#duration")
                if (durationUs != undefined) {
                    const dur = luxon.Duration.fromMillis(Math.round(durationUs / 1000000) * 1000)
                    duration.textContent = dur.rescale().toHuman({listStyle: 'narrow', unitDisplay: 'short'})
                }

                setDefaultOffset()
                updateSyncPlotOptions()

                for (const widget of grid.getGridItems()) {
                    widget.loadLog()
                }
                scheduleWidgetTimeUpdate(video.currentTime)
                updateSyncPlotTime(video.currentTime)
            })
        }
        reader.readAsArrayBuffer(file)

    }

    // Update time when offset is changed
    const logOffsetInput = document.getElementById("log_offset")
    const updateOffset = () => {
        scheduleWidgetTimeUpdate(video.currentTime)
        updateSyncPlotTime(video.currentTime)
    }
    logOffsetInput.oninput = updateOffset
    logOffsetInput.onchange = updateOffset

    // Overlay input
    const overlayInput = document.getElementById("overlay-input")
    overlayInput.onchange = () => {
        const file = overlayInput.files[0];
        if (!file) {
            return;
        }
        let reader = new FileReader()
        reader.onload = function (e) {
            const obj = JSON.parse(reader.result)
            if (obj?.header?.tool !== "videoOverlay") {
                alert("Layout not for this tool!")
                return
            }
            if ("widgets" in obj) {
                load_layout(obj.grid, obj.widgets)
            } else if ("widget" in obj) {
                const widget = add_widget(grid, obj.widget)
                if (widget != null) {
                    widget.init()
                    widget.loadLog()
                    scheduleWidgetTimeUpdate(video.currentTime)
                }
            } else {
                alert("Unable to load from: " + file)
            }
        }
        reader.readAsText(file)
    }

}

async function renderOverlay(renderCtx, parentsBB) {

    // Iterate over each widget to get a full list of items to be rendered
    let items = []
    for (const widget of grid.getGridItems()) {
        items = items.concat(widget.getContentForRender(parentsBB))
    }

    // Scale to correct export size
    const scale = renderCtx.canvas.width / parentsBB.width

    // Render each item
    for (const item of items) {
        // Convert to canvas
        const snap = await html2canvas(item.content, {
            backgroundColor: null,
            scale,
            useCORS: true,
            allowTaint: false,
            logging: false,
            // Ignore grid stack resize handles
            ignoreElements: el => el.classList.contains('ui-resizable-handle')
        });

        // Add to context
        renderCtx.drawImage(snap, item.pos.x * scale, item.pos.y * scale)
    }

}

async function setWidgetTime(vidTime) {
    // No point if grid if not valid
    if (grid == null) {
        return Promise.resolve()
    }

    // Apply offset to correct to log time
    const offset = parseFloat(document.getElementById("log_offset").value)
    const logTime = vidTime - offset

    // Send the time to each widget
    let timeUpdate = []
    for (const widget of grid.getGridItems()) {
        timeUpdate.push(widget.setTime(logTime))
    }

    // Wait for all widgets to complete
    return Promise.allSettled(timeUpdate)
}

function scheduleWidgetTimeUpdate(vidTime) {
    widgetPreviewTimeState.pendingVidTime = vidTime

    if (widgetPreviewTimeState.running) {
        return
    }

    widgetPreviewTimeState.running = true
    runScheduledWidgetTimeUpdate()
}

async function runScheduledWidgetTimeUpdate() {
    while (widgetPreviewTimeState.pendingVidTime != null) {
        const vidTime = widgetPreviewTimeState.pendingVidTime
        widgetPreviewTimeState.pendingVidTime = null
        await setWidgetTime(vidTime)
    }

    widgetPreviewTimeState.running = false
}

async function exportVideo() {
    await Promise.allSettled(import_done)

    const start = performance.now()

    const exportSettings = {
        fps: parseFloat(document.getElementById("frame_rate").value),
        width: parseFloat(document.getElementById("export_width").value),
        height: parseFloat(document.getElementById("export_height").value),
        start: parseFloat(document.getElementById("start_time").value),
        end: parseFloat(document.getElementById("end_time").value),
        format: document.getElementById("output_format").value,
        vidCodec: document.getElementById("video_codec").value,
        audioCodec: document.getElementById("audio_codec").value,
    }

    const {
        Input,
        Output,
        Conversion,
        Mp4OutputFormat,
        WebMOutputFormat,
        MkvOutputFormat,
        MovOutputFormat,
        BlobSource,
        BufferTarget,
        QUALITY_VERY_HIGH,
        ALL_FORMATS
    } = Mediabunny;

    // find the matching format object
    let fmtConstructor
    switch (exportSettings.format) {
        case "mp4":
            fmtConstructor = Mp4OutputFormat
            break

        case "webm":
            fmtConstructor = WebMOutputFormat
            break

        case "mkv":
            fmtConstructor = MkvOutputFormat
            break

        case "mov":
            fmtConstructor = MovOutputFormat
            break

        default:
            throw new Error(`Unknown format: ${exportSettings.format}`)
    }

    const inputFile = document.getElementById('vid-upload').files[0];

    const input = new Input({
        formats: ALL_FORMATS,
        source: new BlobSource(inputFile),
    });
 
    const output = new Output({
      format: new fmtConstructor(),
      target: new BufferTarget(),
    });

    const overlayDivBBox = document.getElementById('overlay').getBoundingClientRect()

    const renderCanvas = new OffscreenCanvas(exportSettings.width, exportSettings.height);
    const renderCtx = renderCanvas.getContext('2d', { alpha: false });

    const loadingOverlay = document.getElementById("loading")

    const conversion = await Conversion.init({
        input,
        output,
        video: {
            codec: exportSettings.vidCodec,
            frameRate: exportSettings.fps,
            bitrate: QUALITY_VERY_HIGH,
            // Called for each decoded video frame
            process: async (sample) => {
                // Update progress
                loadingOverlay.firstChild.innerHTML = `${((sample.timestamp / (exportSettings.end - exportSettings.start)) * 100).toFixed(2)}%`

                // Set the widget time and Wait for all widgets to update
                // Here sample timestamp is relative to the export not the import, so we need to correct for the start time
                await setWidgetTime(sample.timestamp + exportSettings.start)

                // Draw video frame
                sample.draw(renderCtx, 0, 0);

                // Refresh overlay snapshot at this timestamp
                await renderOverlay(renderCtx, overlayDivBBox);

                return renderCanvas;
            },
            processedWidth: exportSettings.width,
            processedHeight: exportSettings.height,
        },
        audio:{
            codec: exportSettings.audioCodec,
        },
        trim: {
            start: exportSettings.start,
            end: exportSettings.end,
        }
    });

    if (!conversion.isValid) {
        console.warn('Discarded tracks:', conversion.discardedTracks);
    }

    // Run the conversion
    await conversion.execute();

    // Put back the loading overlay
    loadingOverlay.firstChild.innerHTML = `Loading`

    // Download
    const blob = new Blob([output.target.buffer], { type: output.format.mimeType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `VideoOverlay${output.format.fileExtension}`;
    a.click();

    // Print stats to console
    const exportTime = (performance.now() - start) / 1000
    const originalTime = exportSettings.end - exportSettings.start
    const exportFPS = (originalTime * exportSettings.fps) / exportTime
    const timeRatio = originalTime / exportTime
    console.log(`Export took: ${exportTime.toFixed(2)}s, ${exportFPS.toFixed(2)} FPS, ${(timeRatio * 100).toFixed(2)}% realtime`)

    // Reset widgets to match video preview
    scheduleWidgetTimeUpdate(video.currentTime)
}

function seekTo(video, time) {
    return new Promise(resolve => {
        video.onseeked = () => { video.onseeked = null; resolve(); };
        video.currentTime = time;
    });
}

// Clear all widgets and destroy grid
function clear_grid(target_grid) {

    if (target_grid == null) {
        return
    }

    // Call the destroy method on each widget in the sub grid removed
    for (const widget of target_grid.getGridItems()) {
        widget.destroy()
        target_grid.removeWidget(widget)
    }

    // Make sure there is nothing left
    target_grid.removeAll()

    target_grid.destroy(false)
}

// Load the palette grid
function loadPalette() {

    // Clear grid
    clear_grid(palette)

    // Make new one
    palette = GridStack.init({
        float: true,
        disableOneColumnMode: true,
        column: 7,
        row: 1,
        cellHeight: "100px",
        disableResize: true,
    }, document.getElementById("palette"))

    fetch("Default_Palette.json").then((res) => {
        return res.json()
    }).then((obj) => {
        // Load widgets
        load_widgets(palette, obj.widgets)

        // Add tip to each widget to give more information
        for (const widget of palette.getGridItems()) {
            const about = widget.get_about()

            const widget_tip_div = document.createElement("div")

            const heading = document.createElement("h6")
            heading.innerText = about.name
            widget_tip_div.appendChild(heading)

            if ("info" in about) {
                widget_tip_div.appendChild(document.createTextNode(about.info))
            }

            tippy(widget, {
                content: widget_tip_div,
                appendTo: () => document.body,
                theme: 'light-border', // differentiate from the interactive tip were in already
            })
        }
    })
}

// Initialize gird with a given number of rows and columns
function init_grid(columns, rows) {

    clear_grid(grid)

    grid = GridStack.init({
        float: true,
        disableDrag: true,
        disableResize: true,
        column: columns,
        row: rows,
        cellHeight: (100 / rows) + "%",
        disableOneColumnMode: true,
        alwaysShowResizeHandle: true,
        acceptWidgets: true
    })

    // Set the input values to match the current grid
    document.getElementById("grid_rows").value = rows
    document.getElementById("grid_columns").value = columns

    // Bind dropped callback
    grid.on('dropped', widget_dropped)

    // Bind changed callback
    grid.on('change added removed', () => { 
        grid_changed = true
    })
}

// Get the details of the passed in widget for copy or save
function get_widget_object(widget) {
    return {
        x: widget.getAttribute("gs-x"),
        y: widget.getAttribute("gs-y"),
        w: widget.getAttribute("gs-w"),
        h: widget.getAttribute("gs-h"),
        type: widget.constructor.name,
        options: widget.get_options()
    }
}

// Called when a widget is dropped, sub grids don't like being moved for some reason.
// The fix seems to be to delete and re-create them.
function widget_dropped(event, previousWidget, newWidget) {

    // Copy
    const obj = get_widget_object(newWidget.el)
    const target = newWidget.grid

    // Remove ordinal
    newWidget.el.destroy()
    target.removeWidget(newWidget.el)

    // Add copy
    const copy = add_widget(target, obj)
    if (copy != null) {
        copy.init()
        copy.loadLog()
    }

    scheduleWidgetTimeUpdate(video.currentTime)

    // If the widget was removed from the palette grid then reload it
    if (previousWidget.grid === palette) {
        loadPalette()
    }
}

function load_default_grid() {

    // Read in file and load
    fetch("Default_Layout.json").then((res) => {
        return res.json()
    }).then((obj) => {
        load_layout(obj.grid, obj.widgets)
    })

}

function new_widget(type, options) {

    switch (type) {
        case "WidgetSandBoxVideoOverlay":
            return new WidgetSandBoxVideoOverlay(options)

        case "WidgetSubGridVideoOverlay":
            return new WidgetSubGridVideoOverlay(options)

        case "WidgetCustomHTMLVideoOverlay":
            return new WidgetCustomHTMLVideoOverlay(options)
    }

    throw new Error("Unknown widget type: " + type)
}

// Add a widget checking if it will fit
function add_widget(target_grid, obj) {

    const pos_opts =  {
        x: (obj.x == null) ? null : parseInt(obj.x),
        y: (obj.y == null) ? null : parseInt(obj.y),
        w: (obj.w == null) ? null : parseInt(obj.w),
        h: (obj.h == null) ? null : parseInt(obj.h),
        autoPosition: false
    }

    // See if there is in the closest position
    if (!target_grid.willItFit(pos_opts)) {
        // See if it would fit with auto-position
        pos_opts.autoPosition = true
        if (!target_grid.willItFit(pos_opts)) {
            alert("Widget won't fit on Grid")
            return
        }
    }

    let widget = new_widget(obj.type, obj.options)

    target_grid.addWidget(widget, pos_opts)

    widget.set_edit(true)

    return widget
}

function grid_set_edit(target_grid, b) {
    if (target_grid == null) {
        return false
    }

    // Set the grid itself
    if (b) {
        target_grid.enable()
    } else {
        target_grid.disable()
    }

    // Set the widgets on the grid
    for (const widget of target_grid.getGridItems()) {
        widget.set_edit(b)
    }
}

// Load widget object to target grid
function load_widgets(target_grid, widgets) {

    target_grid.batchUpdate(true)

    for (const widget of Object.values(widgets)) {
        add_widget(target_grid, widget)
    }

    target_grid.batchUpdate(false)

    // Call init on each widget after grid has updated
    for (const widget of target_grid.getGridItems()) {
        widget.init()
        widget.loadLog()
    }

    scheduleWidgetTimeUpdate(video.currentTime)
}

function load_layout(grid_layout, widgets) {

    try {
        // Set background color TODO:
        //const dashboard_div = document.getElementById("dashboard")
        //dashboard_div.style.backgroundColor = grid_layout.color

        // Reload grid
        init_grid(parseInt(grid_layout.columns), parseInt(grid_layout.rows))

        load_widgets(grid, widgets)

    } catch (error) {
        load_default_grid()

        alert('Grid load failed\n' + error.message)
    }

    grid_set_edit(grid, true)

    // Clear changed flag after load
    grid_changed = false

}

// Get array of widgets from the target grid for saving
function get_widgets(target_grid) {
    const save_widgets = {}

    const widgets = target_grid.getGridItems()
    for (let i = 0; i<widgets.length; i++) {
        save_widgets[i] = get_widget_object(widgets[i])
    }

    return save_widgets
}

// Get the current layout as a object
function get_layout() {

    return {
        header: {
            tool: "videoOverlay",
            version: 1.0,
        },
        grid: {
            columns: grid.opts.column,
            rows: grid.opts.maxRow,
            color: document.getElementById("dashboard").style.backgroundColor
        },
        widgets: get_widgets(grid)
    }

}

// Save the layout to a json file
function save_layout() {

    var blob = new Blob([JSON.stringify(get_layout(), null, 2)], { type: "text/plain;charset=utf-8" })
    saveAs(blob, "VideoOverlay.json")

    // Mark grid and widgets as saved
    grid_changed = false

    // Each widget on grid
    for (const widget of grid.getGridItems()) {
        widget.saved()
    }

}

// Save single widget to json file
function save_widget(widget) {

    let grid_layout = {
        header: {
            tool: "videoOverlay",
            version: 1.0,
        },
        widget: get_widget_object(widget)
    }

    var blob = new Blob([JSON.stringify(grid_layout, null, 2)], { type: "text/plain;charset=utf-8" })
    saveAs(blob, "VideoOverlay_Widget.json")
}


function gridSizeUpdate() {
    // Can't dynamically change the number of rows, get layout, update rows and re-load
    const layout = get_layout()
    layout.grid.rows = document.getElementById("grid_rows").value
    layout.grid.columns = document.getElementById("grid_columns").value
    load_layout(layout.grid, layout.widgets)
    grid_changed = true
}

function handle_unload(event) {

    let all_saved = true

    if (grid != null) {
        // The grid itself
        if (grid_changed) {
            all_saved = false
        }

        // Each widget on grid
        for (const widget of grid.getGridItems()) {
            if (widget.get_changed()) {
                all_saved = false
            }
        }
    }

    if (all_saved) {
        // No need to warn
        return
    }

    // Cancel the event as stated by the standard.
    event.preventDefault()
    event.returnValue = ""

}
