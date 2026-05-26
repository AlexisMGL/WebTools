// Sandbox widget
// Loads iframe and sends messages to it

class WidgetSandBoxVideoOverlay extends WidgetSandBox {
    initDone
    timeUpdateRunning
    pendingTime
    timeUpdatePromise
    timeRequestId

    constructor(options) {

        if (options == null) {
            options = {}
        }

        if (options?.sandbox == null) {
            options.sandbox = `// Initialization
div.appendChild(document.createTextNode("Widget Example:"))
div.appendChild(document.createElement("br"))

message_report = document.createTextNode("No Log")
div.appendChild(message_report)

div.appendChild(document.createElement("br"))

logTime = document.createTextNode("")
div.appendChild(logTime)

// Load function
loadLog = function (log) {
    message_report.nodeValue = "Got log starting at: " + log.extractStartTime()
}

// Runtime function
setTime = function(time) {
    logTime.nodeValue = "Log Time: " + time.toFixed(2)
}
`
        }

        super(options, true)
        this.timeUpdateRunning = false
        this.pendingTime = null
        this.timeUpdatePromise = Promise.resolve()
        this.timeRequestId = 0

        // Sandboxed iframe for user content
        this.iframe.src = 'Widgets/SandBox.html'

        // Send over user config as soon as iframe is loaded
        this.initDone = new Promise((resolve) => {
            this.iframe.addEventListener("load", (e) => {
                this.init()
                resolve()
            })
        })

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
        if (log == null) {
            return
        }
        const data = { logData: log.buffer }
        this.initDone.then(() => {
            if (this.iframe.contentWindow == null) {
                return
            }
            this.iframe.contentWindow.postMessage(data, '*')
        })
    }

    form_changed() {
        super.form_changed()
        this.loadLog(log)
    }

    set_edited_text(text) {
        super.set_edited_text(text)
        this.loadLog(log)
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
                if (event.data?.renderDone !== requestId) {
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
customElements.define('widget-sand-box-video-overlay', WidgetSandBoxVideoOverlay)
