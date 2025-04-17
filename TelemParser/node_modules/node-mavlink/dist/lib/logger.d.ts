/**
 * Level of the log entry
 */
export declare enum LogLevel {
    trace = 5,
    debug = 4,
    info = 3,
    warn = 2,
    error = 1,
    fatal = 0
}
declare type LoggerEvents = 'log';
declare type LoggerEventHandler = (context: string, level: LogLevel, message: any[]) => void;
/**
 * Simplified interface for logging facilities
 */
export declare class Logger {
    private static readonly events;
    private static registry;
    /**
     * Gets a logger by name
     *
     * @param context logger context
     */
    static getLogger(context: any): Logger;
    /**
     * Binds an event handler
     *
     * @param event event to react to
     * @param handler event handler
     */
    static on(event: LoggerEvents, handler: (context: any, level: LogLevel, message: string) => void): void;
    /**
     * Removes an event handler
     *
     * @param event event to react to
     * @param handler event handler
     */
    static off(event: LoggerEvents, handler: LoggerEventHandler): void;
    private context;
    /**
     * Constructs a new logger instance
     *
     * @param context logger context
     */
    constructor(context: string);
    /**
     * Sends a log message if the trace level is enabled for this logger
     *
     * @param args parameters for the log entry
     */
    trace(...args: any): void;
    /**
     * Sends a log message if the debug level is enabled for this logger
     *
     * @param args parameters for the log entry
     */
    debug(...args: any): void;
    /**
     * Sends a log message if the info level is enabled for this logger
     *
     * @param args parameters for the log entry
     */
    info(...args: any): void;
    /**
     * Sends a log message if the warn level is enabled for this logger
     *
     * @param args parameters for the log entry
     */
    warn(...args: any): void;
    /**
     * Sends a log message if the error level is enabled for this logger
     *
     * @param args parameters for the log entry
     */
    error(...args: any): void;
    /**
     * Sends a log message if the fatal level is enabled for this logger
     *
     * @param args parameters for the log entry
     */
    fatal(...args: any): void;
}
export {};
//# sourceMappingURL=logger.d.ts.map