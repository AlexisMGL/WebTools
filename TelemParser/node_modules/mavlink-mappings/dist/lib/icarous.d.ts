import { int8_t, float } from './types';
import { MavLinkPacketRegistry, MavLinkPacketField, MavLinkData } from './mavlink';
/**
 * ICAROUS_TRACK_BAND_TYPES
 */
export declare enum IcarousTrackBandTypes {
    'NONE' = 0,
    'NEAR' = 1,
    'RECOVERY' = 2
}
/**
 * ICAROUS_FMS_STATE
 */
export declare enum IcarousFmsState {
    'IDLE' = 0,
    'TAKEOFF' = 1,
    'CLIMB' = 2,
    'CRUISE' = 3,
    'APPROACH' = 4,
    'LAND' = 5
}
/**
 * ICAROUS heartbeat
 */
export declare class IcarousHeartbeat extends MavLinkData {
    static MSG_ID: number;
    static MSG_NAME: string;
    static PAYLOAD_LENGTH: number;
    static MAGIC_NUMBER: number;
    static FIELDS: MavLinkPacketField[];
    constructor();
    /**
     * See the FMS_STATE enum.
     */
    status: IcarousFmsState;
}
/**
 * Kinematic multi bands (track) output from Daidalus
 */
export declare class IcarousKinematicBands extends MavLinkData {
    static MSG_ID: number;
    static MSG_NAME: string;
    static PAYLOAD_LENGTH: number;
    static MAGIC_NUMBER: number;
    static FIELDS: MavLinkPacketField[];
    constructor();
    /**
     * Number of track bands
     */
    numBands: int8_t;
    /**
     * See the TRACK_BAND_TYPES enum.
     */
    type1: IcarousTrackBandTypes;
    /**
     * min angle (degrees)
     * Units: deg
     */
    min1: float;
    /**
     * max angle (degrees)
     * Units: deg
     */
    max1: float;
    /**
     * See the TRACK_BAND_TYPES enum.
     */
    type2: IcarousTrackBandTypes;
    /**
     * min angle (degrees)
     * Units: deg
     */
    min2: float;
    /**
     * max angle (degrees)
     * Units: deg
     */
    max2: float;
    /**
     * See the TRACK_BAND_TYPES enum.
     */
    type3: IcarousTrackBandTypes;
    /**
     * min angle (degrees)
     * Units: deg
     */
    min3: float;
    /**
     * max angle (degrees)
     * Units: deg
     */
    max3: float;
    /**
     * See the TRACK_BAND_TYPES enum.
     */
    type4: IcarousTrackBandTypes;
    /**
     * min angle (degrees)
     * Units: deg
     */
    min4: float;
    /**
     * max angle (degrees)
     * Units: deg
     */
    max4: float;
    /**
     * See the TRACK_BAND_TYPES enum.
     */
    type5: IcarousTrackBandTypes;
    /**
     * min angle (degrees)
     * Units: deg
     */
    min5: float;
    /**
     * max angle (degrees)
     * Units: deg
     */
    max5: float;
}
export declare const REGISTRY: MavLinkPacketRegistry;
