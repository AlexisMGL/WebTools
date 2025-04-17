"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = exports.LogLevel = void 0;
const events_1 = require("events");
/**
 * Level of the log entry
 */
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["trace"] = 5] = "trace";
    LogLevel[LogLevel["debug"] = 4] = "debug";
    LogLevel[LogLevel["info"] = 3] = "info";
    LogLevel[LogLevel["warn"] = 2] = "warn";
    LogLevel[LogLevel["error"] = 1] = "error";
    LogLevel[LogLevel["fatal"] = 0] = "fatal";
})(LogLevel = exports.LogLevel || (exports.LogLevel = {}));
/**
 * Simplified interface for logging facilities
 */
class Logger {
    static events = new events_1.EventEmitter();
    static registry = {};
    /**
     * Gets a logger by name
     *
     * @param context logger context
     */
    static getLogger(context) {
        let name = '';
        if (typeof context === 'function')
            name = context.name;
        else if (typeof context === 'object')
            name = context.constructor.name;
        else if (typeof context === 'string')
            name = context;
        else
            throw new Error(`Do not know how to get logger for ${context} (${typeof context})`);
        if (!Logger.registry[name])
            Logger.registry[name] = new Logger(name);
        return Logger.registry[name];
    }
    /**
     * Binds an event handler
     *
     * @param event event to react to
     * @param handler event handler
     */
    static on(event, handler) {
        this.events.on(event, handler);
    }
    /**
     * Removes an event handler
     *
     * @param event event to react to
     * @param handler event handler
     */
    static off(event, handler) {
        this.events.off(event, handler);
    }
    context;
    /**
     * Constructs a new logger instance
     *
     * @param context logger context
     */
    constructor(context) {
        this.context = context;
        Logger.events.emit('logger-created', Logger.registry[context]);
    }
    /**
     * Sends a log message if the trace level is enabled for this logger
     *
     * @param args parameters for the log entry
     */
    trace(...args) {
        Logger.events.emit('log', { context: this.context, level: LogLevel.trace, message: args });
    }
    /**
     * Sends a log message if the debug level is enabled for this logger
     *
     * @param args parameters for the log entry
     */
    debug(...args) {
        Logger.events.emit('log', { context: this.context, level: LogLevel.debug, message: args });
    }
    /**
     * Sends a log message if the info level is enabled for this logger
     *
     * @param args parameters for the log entry
     */
    info(...args) {
        Logger.events.emit('log', { context: this.context, level: LogLevel.info, message: args });
    }
    /**
     * Sends a log message if the warn level is enabled for this logger
     *
     * @param args parameters for the log entry
     */
    warn(...args) {
        Logger.events.emit('log', { context: this.context, level: LogLevel.warn, message: args });
    }
    /**
     * Sends a log message if the error level is enabled for this logger
     *
     * @param args parameters for the log entry
     */
    error(...args) {
        Logger.events.emit('log', { context: this.context, level: LogLevel.error, message: args });
    }
    /**
     * Sends a log message if the fatal level is enabled for this logger
     *
     * @param args parameters for the log entry
     */
    fatal(...args) {
        Logger.events.emit('log', { context: this.context, level: LogLevel.fatal, message: args });
    }
}
exports.Logger = Logger;
