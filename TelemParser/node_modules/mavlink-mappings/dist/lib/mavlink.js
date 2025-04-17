"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MavLinkData = exports.MavLinkPacketField = void 0;
/**
 * Field definition
 */
class MavLinkPacketField {
    /**
     * @param source original name of the field
     * @param name name of the field
     * @param offset field offset in the payload
     * @param extension true if it is an extension field, false otherwise
     * @param size size of either the field or the size of an element in the array if it is an array field
     * @param type type of the field (ends with [] if it is an array field)
     * @param units unit of the field
     * @param length for array fields this is the length of the array
     */
    constructor(source, name, offset, extension, size, type, units, length = 0) {
        this.source = source;
        this.name = name;
        this.offset = offset;
        this.type = type;
        this.length = length;
        this.extension = extension;
        this.size = size;
        this.units = units;
    }
}
exports.MavLinkPacketField = MavLinkPacketField;
/**
 * Base class for all data classes
 */
class MavLinkData {
}
exports.MavLinkData = MavLinkData;
// static fields overriden by descendants of MavLinkData
MavLinkData.MSG_ID = -1;
MavLinkData.MSG_NAME = '';
MavLinkData.PAYLOAD_LENGTH = 0;
MavLinkData.MAGIC_NUMBER = 0;
MavLinkData.FIELDS = [];
