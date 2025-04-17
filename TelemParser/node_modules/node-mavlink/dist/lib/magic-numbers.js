"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.overrideMessageMagicNumber = exports.registerCustomMessageMagicNumber = void 0;
const mavlink_mappings_1 = require("mavlink-mappings");
function registerCustomMessageMagicNumber(msgid, magic) {
    const numbers = mavlink_mappings_1.MSG_ID_MAGIC_NUMBER;
    if (numbers[msgid] !== undefined) {
        throw new Error(`Magic number for message "${msgid}" already registered`);
    }
    else {
        numbers[msgid] = magic;
    }
}
exports.registerCustomMessageMagicNumber = registerCustomMessageMagicNumber;
function overrideMessageMagicNumber(msgid, magic) {
    const numbers = mavlink_mappings_1.MSG_ID_MAGIC_NUMBER;
    if (numbers[msgid] === undefined) {
        throw new Error(`Magic number for message "${msgid}" not registered`);
    }
    else {
        numbers[msgid] = magic;
    }
}
exports.overrideMessageMagicNumber = overrideMessageMagicNumber;
