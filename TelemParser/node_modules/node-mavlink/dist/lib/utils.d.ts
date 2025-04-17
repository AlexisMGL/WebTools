/// <reference types="node" />
/**
 * Convert a number to hexadecimal representation with a minimum
 * number of characters and optional prefix (0x by default)
 *
 * @param n value to convert
 * @param len length of the converted string (without prefix)
 * @param prefix prefix to prepend the generated string with
 */
export declare function hex(n: number, len?: number, prefix?: string): string;
/**
 * Dump a buffer in a readable form
 *
 * @param buffer buffer to dump
 * @param lineWidth width of the line, in bytes of buffer
 */
export declare function dump(buffer: Buffer, lineWidth?: number): void;
/**
 * Sleep for a given number of milliseconds
 *
 * @param {number} ms of milliseconds to sleep
 */
export declare function sleep(ms: number): Promise<unknown>;
/**
 * Execute a callback every <code>interval</code>ms and if it will not return
 * a truthy value in the <code>timeout<code>ms then throw a Timeout exception.
 * This is a very useful utility that will allow you to specify how often
 * a particular expression should be evaluated and how long will it take to end
 * the execution without success. Great for time-sensitive operations.
 *
 * @param cb callback to call every <code>interval</code>ms. Waiting stops if the callback returns a truthy value.
 * @param timeout number of milliseconds that need to pass before the Timeout exception is thrown
 * @param interval number of milliseconds before re-running the callback
 */
export declare function waitFor<T>(cb: () => T, timeout?: number, interval?: number): Promise<T>;
//# sourceMappingURL=utils.d.ts.map