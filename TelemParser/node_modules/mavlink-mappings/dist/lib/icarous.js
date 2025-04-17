"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REGISTRY = exports.IcarousKinematicBands = exports.IcarousHeartbeat = exports.IcarousFmsState = exports.IcarousTrackBandTypes = void 0;
const mavlink_1 = require("./mavlink");
/**
 * ICAROUS_TRACK_BAND_TYPES
 */
var IcarousTrackBandTypes;
(function (IcarousTrackBandTypes) {
    IcarousTrackBandTypes[IcarousTrackBandTypes["NONE"] = 0] = "NONE";
    IcarousTrackBandTypes[IcarousTrackBandTypes["NEAR"] = 1] = "NEAR";
    IcarousTrackBandTypes[IcarousTrackBandTypes["RECOVERY"] = 2] = "RECOVERY";
})(IcarousTrackBandTypes = exports.IcarousTrackBandTypes || (exports.IcarousTrackBandTypes = {}));
/**
 * ICAROUS_FMS_STATE
 */
var IcarousFmsState;
(function (IcarousFmsState) {
    IcarousFmsState[IcarousFmsState["IDLE"] = 0] = "IDLE";
    IcarousFmsState[IcarousFmsState["TAKEOFF"] = 1] = "TAKEOFF";
    IcarousFmsState[IcarousFmsState["CLIMB"] = 2] = "CLIMB";
    IcarousFmsState[IcarousFmsState["CRUISE"] = 3] = "CRUISE";
    IcarousFmsState[IcarousFmsState["APPROACH"] = 4] = "APPROACH";
    IcarousFmsState[IcarousFmsState["LAND"] = 5] = "LAND";
})(IcarousFmsState = exports.IcarousFmsState || (exports.IcarousFmsState = {}));
/**
 * ICAROUS heartbeat
 */
class IcarousHeartbeat extends mavlink_1.MavLinkData {
    constructor() {
        super();
        this.status = 0;
    }
}
exports.IcarousHeartbeat = IcarousHeartbeat;
IcarousHeartbeat.MSG_ID = 42000;
IcarousHeartbeat.MSG_NAME = 'ICAROUS_HEARTBEAT';
IcarousHeartbeat.PAYLOAD_LENGTH = 1;
IcarousHeartbeat.MAGIC_NUMBER = 227;
IcarousHeartbeat.FIELDS = [
    new mavlink_1.MavLinkPacketField('status', 'status', 0, false, 1, 'uint8_t', ''),
];
/**
 * Kinematic multi bands (track) output from Daidalus
 */
class IcarousKinematicBands extends mavlink_1.MavLinkData {
    constructor() {
        super();
        this.numBands = 0;
        this.type1 = 0;
        this.min1 = 0;
        this.max1 = 0;
        this.type2 = 0;
        this.min2 = 0;
        this.max2 = 0;
        this.type3 = 0;
        this.min3 = 0;
        this.max3 = 0;
        this.type4 = 0;
        this.min4 = 0;
        this.max4 = 0;
        this.type5 = 0;
        this.min5 = 0;
        this.max5 = 0;
    }
}
exports.IcarousKinematicBands = IcarousKinematicBands;
IcarousKinematicBands.MSG_ID = 42001;
IcarousKinematicBands.MSG_NAME = 'ICAROUS_KINEMATIC_BANDS';
IcarousKinematicBands.PAYLOAD_LENGTH = 46;
IcarousKinematicBands.MAGIC_NUMBER = 239;
IcarousKinematicBands.FIELDS = [
    new mavlink_1.MavLinkPacketField('min1', 'min1', 0, false, 4, 'float', 'deg'),
    new mavlink_1.MavLinkPacketField('max1', 'max1', 4, false, 4, 'float', 'deg'),
    new mavlink_1.MavLinkPacketField('min2', 'min2', 8, false, 4, 'float', 'deg'),
    new mavlink_1.MavLinkPacketField('max2', 'max2', 12, false, 4, 'float', 'deg'),
    new mavlink_1.MavLinkPacketField('min3', 'min3', 16, false, 4, 'float', 'deg'),
    new mavlink_1.MavLinkPacketField('max3', 'max3', 20, false, 4, 'float', 'deg'),
    new mavlink_1.MavLinkPacketField('min4', 'min4', 24, false, 4, 'float', 'deg'),
    new mavlink_1.MavLinkPacketField('max4', 'max4', 28, false, 4, 'float', 'deg'),
    new mavlink_1.MavLinkPacketField('min5', 'min5', 32, false, 4, 'float', 'deg'),
    new mavlink_1.MavLinkPacketField('max5', 'max5', 36, false, 4, 'float', 'deg'),
    new mavlink_1.MavLinkPacketField('numBands', 'numBands', 40, false, 1, 'int8_t', ''),
    new mavlink_1.MavLinkPacketField('type1', 'type1', 41, false, 1, 'uint8_t', ''),
    new mavlink_1.MavLinkPacketField('type2', 'type2', 42, false, 1, 'uint8_t', ''),
    new mavlink_1.MavLinkPacketField('type3', 'type3', 43, false, 1, 'uint8_t', ''),
    new mavlink_1.MavLinkPacketField('type4', 'type4', 44, false, 1, 'uint8_t', ''),
    new mavlink_1.MavLinkPacketField('type5', 'type5', 45, false, 1, 'uint8_t', ''),
];
exports.REGISTRY = {
    42000: IcarousHeartbeat,
    42001: IcarousKinematicBands,
};
