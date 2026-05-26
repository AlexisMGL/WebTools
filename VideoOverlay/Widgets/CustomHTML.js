// Custom HTML widget
// Loads iframe and sends messages to it

class WidgetCustomHTMLVideoOverlay extends WidgetCustomHTML {
    timeUpdateRunning
    pendingTime
    timeUpdatePromise
    timeRequestId

    constructor(options) {

        if (options == null) {
            options = {}
        }

        if (options?.custom_HTML == null) {
            options.custom_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8"/>
    <title>Custom HTML Example</title>
</head>
<body>
    <div style="position:absolute; top:0; bottom:0; left:0; right:0; margin:10px; border:5px solid; border-radius:10px; border-color:#c8c8c8; background-color:#ffffff; padding;5px;">
        HTML Example
    </div>
</body>
<script type="module">
    var DataflashParser
    const import_done = import(window.parent.location.href + '../modules/JsDataflashParser/parser.js').then((mod) => { DataflashParser = mod.default })

    let options

    // Load required values from log
    async function loadLog(logData) {
        await import_done

        const log = new DataflashParser()
        log.processData(logData, [])
    }

    async function setTime(time) {
        return Promise.resolve()
    }

    window.addEventListener('message', function (e) {
        const data = e.data

        // User has changed options
        if ("options" in data) {
            // Call init once we have some options
            options = data.options
        }

        // new log data
        if ("logData" in data) {
            loadLog(data.logData)
        }

        // Set time and render, reply once render is done
        if ("time" in data) {
            setTime(data.time).then(() => {
                if ("requestId" in data) {
                    e.source.postMessage({ renderDone: data.requestId })
                } else {
                    e.source.postMessage("renderDone")
                }
            })
        }

    })

</script>
</html>
`
        }

        super(options)
        this.timeUpdateRunning = false
        this.pendingTime = null
        this.timeUpdatePromise = Promise.resolve()
        this.timeRequestId = 0

        // Wait a short time to give the html a chance to load
        setTimeout(() => this.loadLog(), 100)
    }

    getContentForRender(parentsBB) {
        const BB = this.getBoundingClientRect()
        return [{
            pos: { 
                x: BB.x - parentsBB.x,
                y: BB.y - parentsBB.y,
                height: BB.height, 
                width: BB.width
            },
            content: this.iframe.contentDocument.body
        }]
    }

    loadLog() {
        if ((log == null) || (this.iframe.contentWindow == null)){
            return
        }
        const data = { logData: log.buffer }
        this.iframe.contentWindow.postMessage(data, '*')
    }

    form_changed() {
        super.form_changed()

        // Wait a short time to give the html a chance to load
        setTimeout(() => this.loadLog(), 100)
    }

    set_edited_text(text) {
        super.set_edited_text(text)

        // Wait a short time to give the html a chance to load
        setTimeout(() => this.loadLog(), 100)
    }

    #postTime(time) {
        if (this.iframe.contentWindow == null) {
            return Promise.resolve()
        }

        return new Promise((resolve) => {

            const contentWindow = this.iframe.contentWindow
            const requestId = ++this.timeRequestId
            const timeout = setTimeout(() => {
                window.removeEventListener('message', messageHandler)
                resolve()
            }, 1000)

            const messageHandler = function(event) {
                // Make sure the event is for us
                if (event.source !== contentWindow) { 
                    return
                }

                // Make sure its the correct message
                if ((event.data?.renderDone !== requestId) && (event.data !== "renderDone")) {
                    return
                }

                // Remove self
                clearTimeout(timeout)
                window.removeEventListener('message', messageHandler)

                // Done
                resolve()
            }
            window.addEventListener('message', messageHandler)

            contentWindow.postMessage({ time, requestId }, '*')
        })
    }

    setTime(time) {
        this.pendingTime = time

        if (!this.timeUpdateRunning) {
            this.timeUpdateRunning = true
            this.timeUpdatePromise = this.#runTimeUpdates()
        }

        return this.timeUpdatePromise
    }

    async #runTimeUpdates() {
        while (this.pendingTime != null) {
            const time = this.pendingTime
            this.pendingTime = null
            await this.#postTime(time)
        }

        this.timeUpdateRunning = false
    }
}
customElements.define('widget-custom-html-video-overlay', WidgetCustomHTMLVideoOverlay)
