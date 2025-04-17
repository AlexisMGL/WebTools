import { float, int16_t, int32_t, uint8_t, uint16_t, uint32_t, uint64_t } from './types';
import { MavLinkPacketRegistry, MavLinkPacketField, MavLinkData } from './mavlink';
import { MavFrame, MavLinkCommandRegistry } from './common';
/**
 * MAV_CMD
 */
export declare enum MavCmd {
    /**
     * Mission command to reset Maximum Power Point Tracker (MPPT)
     * @param1 MPPT number
     * @param2 Empty
     * @param3 Empty
     * @param4 Empty
     * @param5 Empty
     * @param6 Empty
     * @param7 Empty
     */
    'RESET_MPPT' = 40001,
    /**
     * Mission command to perform a power cycle on payload
     * @param1 Complete power cycle
     * @param2 VISensor power cycle
     * @param3 Empty
     * @param4 Empty
     * @param5 Empty
     * @param6 Empty
     * @param7 Empty
     */
    'PAYLOAD_CONTROL' = 40002
}
/**
 * GSM_LINK_TYPE
 */
export declare enum GsmLinkType {
    /**
     * no service
     */
    'NONE' = 0,
    /**
     * link type unknown
     */
    'UNKNOWN' = 1,
    /**
     * 2G (GSM/GRPS/EDGE) link
     */
    'GSM_LINK_TYPE_2G' = 2,
    /**
     * 3G link (WCDMA/HSDPA/HSPA)
     */
    'GSM_LINK_TYPE_3G' = 3,
    /**
     * 4G link (LTE)
     */
    'GSM_LINK_TYPE_4G' = 4
}
/**
 * GSM_MODEM_TYPE
 */
export declare enum GsmModemType {
    /**
     * not specified
     */
    'UNKNOWN' = 0,
    /**
     * HUAWEI LTE USB Stick E3372
     */
    'HUAWEI_E3372' = 1
}
/**
 * Message encoding a command with parameters as scaled integers and additional metadata. Scaling
 * depends on the actual command value.
 */
export declare class CommandIntStamped extends MavLinkData {
    static MSG_ID: number;
    static MSG_NAME: string;
    static PAYLOAD_LENGTH: number;
    static MAGIC_NUMBER: number;
    static FIELDS: MavLinkPacketField[];
    constructor();
    /**
     * UTC time, seconds elapsed since 01.01.1970
     */
    utcTime: uint32_t;
    /**
     * Microseconds elapsed since vehicle boot
     */
    vehicleTimestamp: uint64_t;
    /**
     * System ID
     */
    targetSystem: uint8_t;
    /**
     * Component ID
     */
    targetComponent: uint8_t;
    /**
     * The coordinate system of the COMMAND, as defined by MAV_FRAME enum
     */
    frame: MavFrame;
    /**
     * The scheduled action for the mission item, as defined by MAV_CMD enum
     */
    command: MavCmd;
    /**
     * false:0, true:1
     */
    current: uint8_t;
    /**
     * autocontinue to next wp
     */
    autocontinue: uint8_t;
    /**
     * PARAM1, see MAV_CMD enum
     */
    param1: float;
    /**
     * PARAM2, see MAV_CMD enum
     */
    param2: float;
    /**
     * PARAM3, see MAV_CMD enum
     */
    param3: float;
    /**
     * PARAM4, see MAV_CMD enum
     */
    param4: float;
    /**
     * PARAM5 / local: x position in meters * 1e4, global: latitude in degrees * 10^7
     */
    x: int32_t;
    /**
     * PARAM6 / local: y position in meters * 1e4, global: longitude in degrees * 10^7
     */
    y: int32_t;
    /**
     * PARAM7 / z position: global: altitude in meters (MSL, WGS84, AGL or relative to home - depending on
     * frame).
     */
    z: float;
}
/**
 * Send a command with up to seven parameters to the MAV and additional metadata
 */
export declare class CommandLongStamped extends MavLinkData {
    static MSG_ID: number;
    static MSG_NAME: string;
    static PAYLOAD_LENGTH: number;
    static MAGIC_NUMBER: number;
    static FIELDS: MavLinkPacketField[];
    constructor();
    /**
     * UTC time, seconds elapsed since 01.01.1970
     */
    utcTime: uint32_t;
    /**
     * Microseconds elapsed since vehicle boot
     */
    vehicleTimestamp: uint64_t;
    /**
     * System which should execute the command
     */
    targetSystem: uint8_t;
    /**
     * Component which should execute the command, 0 for all components
     */
    targetComponent: uint8_t;
    /**
     * Command ID, as defined by MAV_CMD enum.
     */
    command: MavCmd;
    /**
     * 0: First transmission of this command. 1-255: Confirmation transmissions (e.g. for kill command)
     */
    confirmation: uint8_t;
    /**
     * Parameter 1, as defined by MAV_CMD enum.
     */
    param1: float;
    /**
     * Parameter 2, as defined by MAV_CMD enum.
     */
    param2: float;
    /**
     * Parameter 3, as defined by MAV_CMD enum.
     */
    param3: float;
    /**
     * Parameter 4, as defined by MAV_CMD enum.
     */
    param4: float;
    /**
     * Parameter 5, as defined by MAV_CMD enum.
     */
    param5: float;
    /**
     * Parameter 6, as defined by MAV_CMD enum.
     */
    param6: float;
    /**
     * Parameter 7, as defined by MAV_CMD enum.
     */
    param7: float;
}
/**
 * Voltage and current sensor data
 */
export declare class SensPower extends MavLinkData {
    static MSG_ID: number;
    static MSG_NAME: string;
    static PAYLOAD_LENGTH: number;
    static MAGIC_NUMBER: number;
    static FIELDS: MavLinkPacketField[];
    constructor();
    /**
     * Power board voltage sensor reading
     * Units: V
     */
    adc121VspbVolt: float;
    /**
     * Power board current sensor reading
     * Units: A
     */
    adc121CspbAmp: float;
    /**
     * Board current sensor 1 reading
     * Units: A
     */
    adc121Cs1Amp: float;
    /**
     * Board current sensor 2 reading
     * Units: A
     */
    adc121Cs2Amp: float;
}
/**
 * Maximum Power Point Tracker (MPPT) sensor data for solar module power performance tracking
 */
export declare class SensMppt extends MavLinkData {
    static MSG_ID: number;
    static MSG_NAME: string;
    static PAYLOAD_LENGTH: number;
    static MAGIC_NUMBER: number;
    static FIELDS: MavLinkPacketField[];
    constructor();
    /**
     * MPPT last timestamp
     * Units: us
     */
    mpptTimestamp: uint64_t;
    /**
     * MPPT1 voltage
     * Units: V
     */
    mppt1Volt: float;
    /**
     * MPPT1 current
     * Units: A
     */
    mppt1Amp: float;
    /**
     * MPPT1 pwm
     * Units: us
     */
    mppt1Pwm: uint16_t;
    /**
     * MPPT1 status
     */
    mppt1Status: uint8_t;
    /**
     * MPPT2 voltage
     * Units: V
     */
    mppt2Volt: float;
    /**
     * MPPT2 current
     * Units: A
     */
    mppt2Amp: float;
    /**
     * MPPT2 pwm
     * Units: us
     */
    mppt2Pwm: uint16_t;
    /**
     * MPPT2 status
     */
    mppt2Status: uint8_t;
    /**
     * MPPT3 voltage
     * Units: V
     */
    mppt3Volt: float;
    /**
     * MPPT3 current
     * Units: A
     */
    mppt3Amp: float;
    /**
     * MPPT3 pwm
     * Units: us
     */
    mppt3Pwm: uint16_t;
    /**
     * MPPT3 status
     */
    mppt3Status: uint8_t;
}
/**
 * ASL-fixed-wing controller data
 */
export declare class AslctrlData extends MavLinkData {
    static MSG_ID: number;
    static MSG_NAME: string;
    static PAYLOAD_LENGTH: number;
    static MAGIC_NUMBER: number;
    static FIELDS: MavLinkPacketField[];
    constructor();
    /**
     * Timestamp
     * Units: us
     */
    timestamp: uint64_t;
    /**
     * ASLCTRL control-mode (manual, stabilized, auto, etc...)
     */
    aslctrlMode: uint8_t;
    /**
     * See sourcecode for a description of these values...
     */
    h: float;
    hRef: float;
    hRefT: float;
    /**
     * Pitch angle
     * Units: deg
     */
    PitchAngle: float;
    /**
     * Pitch angle reference
     * Units: deg
     */
    PitchAngleRef: float;
    q: float;
    qRef: float;
    uElev: float;
    uThrot: float;
    uThrot2: float;
    nZ: float;
    /**
     * Airspeed reference
     * Units: m/s
     */
    AirspeedRef: float;
    SpoilersEngaged: uint8_t;
    /**
     * Yaw angle
     * Units: deg
     */
    YawAngle: float;
    /**
     * Yaw angle reference
     * Units: deg
     */
    YawAngleRef: float;
    /**
     * Roll angle
     * Units: deg
     */
    RollAngle: float;
    /**
     * Roll angle reference
     * Units: deg
     */
    RollAngleRef: float;
    p: float;
    pRef: float;
    r: float;
    rRef: float;
    uAil: float;
    uRud: float;
}
/**
 * ASL-fixed-wing controller debug data
 */
export declare class AslctrlDebug extends MavLinkData {
    static MSG_ID: number;
    static MSG_NAME: string;
    static PAYLOAD_LENGTH: number;
    static MAGIC_NUMBER: number;
    static FIELDS: MavLinkPacketField[];
    constructor();
    /**
     * Debug data
     */
    i321: uint32_t;
    /**
     * Debug data
     */
    i81: uint8_t;
    /**
     * Debug data
     */
    i82: uint8_t;
    /**
     * Debug data
     */
    f1: float;
    /**
     * Debug data
     */
    f2: float;
    /**
     * Debug data
     */
    f3: float;
    /**
     * Debug data
     */
    f4: float;
    /**
     * Debug data
     */
    f5: float;
    /**
     * Debug data
     */
    f6: float;
    /**
     * Debug data
     */
    f7: float;
    /**
     * Debug data
     */
    f8: float;
}
/**
 * Extended state information for ASLUAVs
 */
export declare class AsluavStatus extends MavLinkData {
    static MSG_ID: number;
    static MSG_NAME: string;
    static PAYLOAD_LENGTH: number;
    static MAGIC_NUMBER: number;
    static FIELDS: MavLinkPacketField[];
    constructor();
    /**
     * Status of the position-indicator LEDs
     */
    LEDStatus: uint8_t;
    /**
     * Status of the IRIDIUM satellite communication system
     */
    SATCOMStatus: uint8_t;
    /**
     * Status vector for up to 8 servos
     */
    ServoStatus: uint8_t[];
    /**
     * Motor RPM
     */
    MotorRpm: float;
}
/**
 * Extended EKF state estimates for ASLUAVs
 */
export declare class EkfExt extends MavLinkData {
    static MSG_ID: number;
    static MSG_NAME: string;
    static PAYLOAD_LENGTH: number;
    static MAGIC_NUMBER: number;
    static FIELDS: MavLinkPacketField[];
    constructor();
    /**
     * Time since system start
     * Units: us
     */
    timestamp: uint64_t;
    /**
     * Magnitude of wind velocity (in lateral inertial plane)
     * Units: m/s
     */
    Windspeed: float;
    /**
     * Wind heading angle from North
     * Units: rad
     */
    WindDir: float;
    /**
     * Z (Down) component of inertial wind velocity
     * Units: m/s
     */
    WindZ: float;
    /**
     * Magnitude of air velocity
     * Units: m/s
     */
    Airspeed: float;
    /**
     * Sideslip angle
     * Units: rad
     */
    beta: float;
    /**
     * Angle of attack
     * Units: rad
     */
    alpha: float;
}
/**
 * Off-board controls/commands for ASLUAVs
 */
export declare class AslObctrl extends MavLinkData {
    static MSG_ID: number;
    static MSG_NAME: string;
    static PAYLOAD_LENGTH: number;
    static MAGIC_NUMBER: number;
    static FIELDS: MavLinkPacketField[];
    constructor();
    /**
     * Time since system start
     * Units: us
     */
    timestamp: uint64_t;
    /**
     * Elevator command [~]
     */
    uElev: float;
    /**
     * Throttle command [~]
     */
    uThrot: float;
    /**
     * Throttle 2 command [~]
     */
    uThrot2: float;
    /**
     * Left aileron command [~]
     */
    uAilL: float;
    /**
     * Right aileron command [~]
     */
    uAilR: float;
    /**
     * Rudder command [~]
     */
    uRud: float;
    /**
     * Off-board computer status
     */
    obctrlStatus: uint8_t;
}
/**
 * Atmospheric sensors (temperature, humidity, ...)
 */
export declare class SensAtmos extends MavLinkData {
    static MSG_ID: number;
    static MSG_NAME: string;
    static PAYLOAD_LENGTH: number;
    static MAGIC_NUMBER: number;
    static FIELDS: MavLinkPacketField[];
    constructor();
    /**
     * Time since system boot
     * Units: us
     */
    timestamp: uint64_t;
    /**
     * Ambient temperature
     * Units: degC
     */
    TempAmbient: float;
    /**
     * Relative humidity
     * Units: %
     */
    Humidity: float;
}
/**
 * Battery pack monitoring data for Li-Ion batteries
 */
export declare class SensBatmon extends MavLinkData {
    static MSG_ID: number;
    static MSG_NAME: string;
    static PAYLOAD_LENGTH: number;
    static MAGIC_NUMBER: number;
    static FIELDS: MavLinkPacketField[];
    constructor();
    /**
     * Time since system start
     * Units: us
     */
    batmonTimestamp: uint64_t;
    /**
     * Battery pack temperature
     * Units: degC
     */
    temperature: float;
    /**
     * Battery pack voltage
     * Units: mV
     */
    voltage: uint16_t;
    /**
     * Battery pack current
     * Units: mA
     */
    current: int16_t;
    /**
     * Battery pack state-of-charge
     */
    SoC: uint8_t;
    /**
     * Battery monitor status report bits in Hex
     */
    batterystatus: uint16_t;
    /**
     * Battery monitor serial number in Hex
     */
    serialnumber: uint16_t;
    /**
     * Battery monitor safetystatus report bits in Hex
     */
    safetystatus: uint32_t;
    /**
     * Battery monitor operation status report bits in Hex
     */
    operationstatus: uint32_t;
    /**
     * Battery pack cell 1 voltage
     * Units: mV
     */
    cellvoltage1: uint16_t;
    /**
     * Battery pack cell 2 voltage
     * Units: mV
     */
    cellvoltage2: uint16_t;
    /**
     * Battery pack cell 3 voltage
     * Units: mV
     */
    cellvoltage3: uint16_t;
    /**
     * Battery pack cell 4 voltage
     * Units: mV
     */
    cellvoltage4: uint16_t;
    /**
     * Battery pack cell 5 voltage
     * Units: mV
     */
    cellvoltage5: uint16_t;
    /**
     * Battery pack cell 6 voltage
     * Units: mV
     */
    cellvoltage6: uint16_t;
}
/**
 * Fixed-wing soaring (i.e. thermal seeking) data
 */
export declare class FwSoaringData extends MavLinkData {
    static MSG_ID: number;
    static MSG_NAME: string;
    static PAYLOAD_LENGTH: number;
    static MAGIC_NUMBER: number;
    static FIELDS: MavLinkPacketField[];
    constructor();
    /**
     * Timestamp
     * Units: ms
     */
    timestamp: uint64_t;
    /**
     * Timestamp since last mode change
     * Units: ms
     */
    timestampModeChanged: uint64_t;
    /**
     * Thermal core updraft strength
     * Units: m/s
     */
    xW: float;
    /**
     * Thermal radius
     * Units: m
     */
    xR: float;
    /**
     * Thermal center latitude
     * Units: deg
     */
    xLat: float;
    /**
     * Thermal center longitude
     * Units: deg
     */
    xLon: float;
    /**
     * Variance W
     */
    VarW: float;
    /**
     * Variance R
     */
    VarR: float;
    /**
     * Variance Lat
     */
    VarLat: float;
    /**
     * Variance Lon
     */
    VarLon: float;
    /**
     * Suggested loiter radius
     * Units: m
     */
    LoiterRadius: float;
    /**
     * Suggested loiter direction
     */
    LoiterDirection: float;
    /**
     * Distance to soar point
     * Units: m
     */
    DistToSoarPoint: float;
    /**
     * Expected sink rate at current airspeed, roll and throttle
     * Units: m/s
     */
    vSinkExp: float;
    /**
     * Measurement / updraft speed at current/local airplane position
     * Units: m/s
     */
    z1LocalUpdraftSpeed: float;
    /**
     * Measurement / roll angle tracking error
     * Units: deg
     */
    z2DeltaRoll: float;
    /**
     * Expected measurement 1
     */
    z1Exp: float;
    /**
     * Expected measurement 2
     */
    z2Exp: float;
    /**
     * Thermal drift (from estimator prediction step only)
     * Units: m/s
     */
    ThermalGSNorth: float;
    /**
     * Thermal drift (from estimator prediction step only)
     * Units: m/s
     */
    ThermalGSEast: float;
    /**
     * Total specific energy change (filtered)
     * Units: m/s
     */
    TSEDot: float;
    /**
     * Debug variable 1
     */
    DebugVar1: float;
    /**
     * Debug variable 2
     */
    DebugVar2: float;
    /**
     * Control Mode [-]
     */
    ControlMode: uint8_t;
    /**
     * Data valid [-]
     */
    valid: uint8_t;
}
/**
 * Monitoring of sensorpod status
 */
export declare class SensorpodStatus extends MavLinkData {
    static MSG_ID: number;
    static MSG_NAME: string;
    static PAYLOAD_LENGTH: number;
    static MAGIC_NUMBER: number;
    static FIELDS: MavLinkPacketField[];
    constructor();
    /**
     * Timestamp in linuxtime (since 1.1.1970)
     * Units: ms
     */
    timestamp: uint64_t;
    /**
     * Rate of ROS topic 1
     */
    visensorRate1: uint8_t;
    /**
     * Rate of ROS topic 2
     */
    visensorRate2: uint8_t;
    /**
     * Rate of ROS topic 3
     */
    visensorRate3: uint8_t;
    /**
     * Rate of ROS topic 4
     */
    visensorRate4: uint8_t;
    /**
     * Number of recording nodes
     */
    recordingNodesCount: uint8_t;
    /**
     * Temperature of sensorpod CPU in
     * Units: degC
     */
    cpuTemp: uint8_t;
    /**
     * Free space available in recordings directory in [Gb] * 1e2
     */
    freeSpace: uint16_t;
}
/**
 * Monitoring of power board status
 */
export declare class SensPowerBoard extends MavLinkData {
    static MSG_ID: number;
    static MSG_NAME: string;
    static PAYLOAD_LENGTH: number;
    static MAGIC_NUMBER: number;
    static FIELDS: MavLinkPacketField[];
    constructor();
    /**
     * Timestamp
     * Units: us
     */
    timestamp: uint64_t;
    /**
     * Power board status register
     */
    pwrBrdStatus: uint8_t;
    /**
     * Power board leds status
     */
    pwrBrdLedStatus: uint8_t;
    /**
     * Power board system voltage
     * Units: V
     */
    pwrBrdSystemVolt: float;
    /**
     * Power board servo voltage
     * Units: V
     */
    pwrBrdServoVolt: float;
    /**
     * Power board digital voltage
     * Units: V
     */
    pwrBrdDigitalVolt: float;
    /**
     * Power board left motor current sensor
     * Units: A
     */
    pwrBrdMotLAmp: float;
    /**
     * Power board right motor current sensor
     * Units: A
     */
    pwrBrdMotRAmp: float;
    /**
     * Power board analog current sensor
     * Units: A
     */
    pwrBrdAnalogAmp: float;
    /**
     * Power board digital current sensor
     * Units: A
     */
    pwrBrdDigitalAmp: float;
    /**
     * Power board extension current sensor
     * Units: A
     */
    pwrBrdExtAmp: float;
    /**
     * Power board aux current sensor
     * Units: A
     */
    pwrBrdAuxAmp: float;
}
/**
 * Status of GSM modem (connected to onboard computer)
 */
export declare class GsmLinkStatus extends MavLinkData {
    static MSG_ID: number;
    static MSG_NAME: string;
    static PAYLOAD_LENGTH: number;
    static MAGIC_NUMBER: number;
    static FIELDS: MavLinkPacketField[];
    constructor();
    /**
     * Timestamp (of OBC)
     * Units: us
     */
    timestamp: uint64_t;
    /**
     * GSM modem used
     */
    gsmModemType: GsmModemType;
    /**
     * GSM link type
     */
    gsmLinkType: GsmLinkType;
    /**
     * RSSI as reported by modem (unconverted)
     */
    rssi: uint8_t;
    /**
     * RSRP (LTE) or RSCP (WCDMA) as reported by modem (unconverted)
     */
    rsrpRscp: uint8_t;
    /**
     * SINR (LTE) or ECIO (WCDMA) as reported by modem (unconverted)
     */
    sinrEcio: uint8_t;
    /**
     * RSRQ (LTE only) as reported by modem (unconverted)
     */
    rsrq: uint8_t;
}
/**
 * Status of the SatCom link
 */
export declare class SatcomLinkStatus extends MavLinkData {
    static MSG_ID: number;
    static MSG_NAME: string;
    static PAYLOAD_LENGTH: number;
    static MAGIC_NUMBER: number;
    static FIELDS: MavLinkPacketField[];
    constructor();
    /**
     * Timestamp
     * Units: us
     */
    timestamp: uint64_t;
    /**
     * Timestamp of the last successful sbd session
     * Units: us
     */
    lastHeartbeat: uint64_t;
    /**
     * Number of failed sessions
     */
    failedSessions: uint16_t;
    /**
     * Number of successful sessions
     */
    successfulSessions: uint16_t;
    /**
     * Signal quality
     */
    signalQuality: uint8_t;
    /**
     * Ring call pending
     */
    ringPending: uint8_t;
    /**
     * Transmission session pending
     */
    txSessionPending: uint8_t;
    /**
     * Receiving session pending
     */
    rxSessionPending: uint8_t;
}
/**
 * Calibrated airflow angle measurements
 */
export declare class SensorAirflowAngles extends MavLinkData {
    static MSG_ID: number;
    static MSG_NAME: string;
    static PAYLOAD_LENGTH: number;
    static MAGIC_NUMBER: number;
    static FIELDS: MavLinkPacketField[];
    constructor();
    /**
     * Timestamp
     * Units: us
     */
    timestamp: uint64_t;
    /**
     * Angle of attack
     * Units: deg
     */
    angleofattack: float;
    /**
     * Angle of attack measurement valid
     */
    angleofattackValid: uint8_t;
    /**
     * Sideslip angle
     * Units: deg
     */
    sideslip: float;
    /**
     * Sideslip angle measurement valid
     */
    sideslipValid: uint8_t;
}
import { CommandLong } from './common';
/**
 * Mission command to reset Maximum Power Point Tracker (MPPT)
 */
export declare class ResetMpptCommand extends CommandLong {
    constructor(targetSystem?: number, targetComponent?: number);
}
/**
 * Mission command to perform a power cycle on payload
 */
export declare class PayloadControlCommand extends CommandLong {
    constructor(targetSystem?: number, targetComponent?: number);
}
export declare const REGISTRY: MavLinkPacketRegistry;
export declare const COMMANDS: MavLinkCommandRegistry;
