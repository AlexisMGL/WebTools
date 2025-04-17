"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DESERIALIZERS = exports.SERIALIZERS = void 0;
const SPECIAL_TYPES_SERIALIZERS = {
    'uint8_t_mavlink_version': (value, buffer, offset) => buffer.writeUInt8(value, offset),
};
const SINGULAR_TYPES_SERIALIZERS = {
    'char': (value, buffer, offset) => buffer.writeUInt8(value, offset),
    'int8_t': (value, buffer, offset) => buffer.writeInt8(value, offset),
    'uint8_t': (value, buffer, offset) => buffer.writeUInt8(value, offset),
    'int16_t': (value, buffer, offset) => buffer.writeInt16LE(value, offset),
    'uint16_t': (value, buffer, offset) => buffer.writeUInt16LE(value, offset),
    'int32_t': (value, buffer, offset) => buffer.writeInt32LE(value, offset),
    'uint32_t': (value, buffer, offset) => buffer.writeUInt32LE(value, offset),
    'int64_t': (value, buffer, offset) => buffer.writeBigInt64LE(value, offset),
    'uint64_t': (value, buffer, offset) => buffer.writeBigUInt64LE(value, offset),
    'float': (value, buffer, offset) => buffer.writeFloatLE(value, offset),
    'double': (value, buffer, offset) => buffer.writeDoubleLE(value, offset),
};
const ARRAY_TYPES_SERIALIZERS = {
    'char[]': (value, buffer, offset, maxLen) => {
        for (let i = 0; i < value.length && i < maxLen; i++) {
            const code = value.charCodeAt(i);
            buffer.writeUInt8(code, offset + i);
        }
    },
    'int8_t[]': (value, buffer, offset, maxLen) => {
        for (let i = 0; i < value.length && i < maxLen; i++) {
            buffer.writeInt8(value[i], offset + i);
        }
    },
    'uint8_t[]': (value, buffer, offset, maxLen) => {
        for (let i = 0; i < value.length && i < maxLen; i++) {
            buffer.writeUInt8(value[i], offset + i);
        }
    },
    'int16_t[]': (value, buffer, offset, maxLen) => {
        for (let i = 0; i < value.length && i < maxLen; i++) {
            buffer.writeInt16LE(value[i], offset + i * 2);
        }
    },
    'uint16_t[]': (value, buffer, offset, maxLen) => {
        for (let i = 0; i < value.length && i < maxLen; i++) {
            buffer.writeUInt16LE(value[i], offset + i * 2);
        }
    },
    'int32_t[]': (value, buffer, offset, maxLen) => {
        for (let i = 0; i < value.length && i < maxLen; i++) {
            buffer.writeInt32LE(value[i], offset + i * 4);
        }
    },
    'uint32_t[]': (value, buffer, offset, maxLen) => {
        for (let i = 0; i < value.length && i < maxLen; i++) {
            buffer.writeUInt32LE(value[i], offset + i * 4);
        }
    },
    'int64_t[]': (value, buffer, offset, maxLen) => {
        for (let i = 0; i < value.length && i < maxLen; i++) {
            buffer.writeBigInt64LE(value[i], offset + i * 8);
        }
    },
    'uint64_t[]': (value, buffer, offset, maxLen) => {
        for (let i = 0; i < value.length && i < maxLen; i++) {
            buffer.writeBigUInt64LE(value[i], offset + i * 8);
        }
    },
    'float[]': (value, buffer, offset, maxLen) => {
        for (let i = 0; i < value.length && i < maxLen; i++) {
            buffer.writeFloatLE(value[i], offset + i * 4);
        }
    },
    'double[]': (value, buffer, offset, maxLen) => {
        for (let i = 0; i < value.length && i < maxLen; i++) {
            buffer.writeDoubleLE(value[i], offset + i * 8);
        }
    },
};
/**
 * A dictionary containing functions that serialize a certain value based on the field type
 */
exports.SERIALIZERS = {
    ...SPECIAL_TYPES_SERIALIZERS,
    ...SINGULAR_TYPES_SERIALIZERS,
    ...ARRAY_TYPES_SERIALIZERS,
};
const SPECIAL_DESERIALIZERS = {
    'uint8_t_mavlink_version': (buffer, offset) => buffer.readUInt8(offset),
};
const SINGULAR_TYPES_DESERIALIZERS = {
    'char': (buffer, offset) => String.fromCharCode(buffer.readUInt8(offset)),
    'int8_t': (buffer, offset) => buffer.readInt8(offset),
    'uint8_t': (buffer, offset) => buffer.readUInt8(offset),
    'int16_t': (buffer, offset) => buffer.readInt16LE(offset),
    'uint16_t': (buffer, offset) => buffer.readUInt16LE(offset),
    'int32_t': (buffer, offset) => buffer.readInt32LE(offset),
    'uint32_t': (buffer, offset) => buffer.readUInt32LE(offset),
    'int64_t': (buffer, offset) => buffer.readBigInt64LE(offset),
    'uint64_t': (buffer, offset) => buffer.readBigUInt64LE(offset),
    'float': (buffer, offset) => buffer.readFloatLE(offset),
    'double': (buffer, offset) => buffer.readDoubleLE(offset),
};
const ARRAY_TYPES_DESERIALIZERS = {
    'char[]': (buffer, offset, length) => {
        let result = '';
        for (let i = 0; i < length; i++) {
            const charCode = buffer.readUInt8(offset + i);
            if (charCode !== 0) {
                result += String.fromCharCode(charCode);
            }
            else {
                break;
            }
        }
        return result;
    },
    'int8_t[]': (buffer, offset, length) => {
        const result = new Array(length);
        for (let i = 0; i < length; i++)
            result[i] = buffer.readInt8(offset + i);
        return result;
    },
    'uint8_t[]': (buffer, offset, length) => {
        const result = new Array(length);
        for (let i = 0; i < length; i++)
            result[i] = buffer.readUInt8(offset + i);
        return result;
    },
    'int16_t[]': (buffer, offset, length) => {
        const result = new Array(length);
        for (let i = 0; i < length; i++)
            result[i] = buffer.readInt16LE(offset + i * 2);
        return result;
    },
    'uint16_t[]': (buffer, offset, length) => {
        const result = new Array(length);
        for (let i = 0; i < length; i++)
            result[i] = buffer.readUInt16LE(offset + i * 2);
        return result;
    },
    'int32_t[]': (buffer, offset, length) => {
        const result = new Array(length);
        for (let i = 0; i < length; i++)
            result[i] = buffer.readInt32LE(offset + i * 4);
        return result;
    },
    'uint32_t[]': (buffer, offset, length) => {
        const result = new Array(length);
        for (let i = 0; i < length; i++)
            result[i] = buffer.readUInt32LE(offset + i * 4);
        return result;
    },
    'int64_t[]': (buffer, offset, length) => {
        const result = new Array(length);
        for (let i = 0; i < length; i++)
            result[i] = buffer.readBigInt64LE(offset + i * 8);
        return result;
    },
    'uint64_t[]': (buffer, offset, length) => {
        const result = new Array(length);
        for (let i = 0; i < length; i++)
            result[i] = buffer.readBigUInt64LE(offset + i * 8);
        return result;
    },
    'float[]': (buffer, offset, length) => {
        const result = new Array(length);
        for (let i = 0; i < length; i++)
            result[i] = buffer.readFloatLE(offset + i * 4);
        return result;
    },
    'double[]': (buffer, offset, length) => {
        const result = new Array(length);
        for (let i = 0; i < length; i++)
            result[i] = buffer.readDoubleLE(offset + i * 8);
        return result;
    },
};
/**
 * A dictionary containing functions that deserialize a certain value based on the field type
 */
exports.DESERIALIZERS = {
    ...SPECIAL_DESERIALIZERS,
    ...SINGULAR_TYPES_DESERIALIZERS,
    ...ARRAY_TYPES_DESERIALIZERS,
};
