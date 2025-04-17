// netlify/functions/analyze.js
const {
    MavLinkPacketSplitter,
    MavLinkPacketParser,
    minimal,
    common,
    ardupilotmega
} = require('node-mavlink');

const REGISTRY = {
    ...minimal.REGISTRY,
    ...common.REGISTRY,
    ...ardupilotmega.REGISTRY
};

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // On attend un JSON { tlog: "<base64?encoded log>" }
    let payload;
    try {
        payload = JSON.parse(event.body);
    } catch {
        return { statusCode: 400, body: 'Invalid JSON' };
    }

    const buffer = Buffer.from(payload.tlog, 'base64');
    const { Readable } = require('stream');
    const splitter = new MavLinkPacketSplitter();
    const parser = new MavLinkPacketParser();

    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity, maxClip = 0;

    // Parse en mémoire
    await new Promise((resolve, reject) => {
        Readable.from(buffer)
            .pipe(splitter)
            .pipe(parser)
            .on('data', pkt => {
                const Cls = REGISTRY[pkt.header.msgid];
                if (!Cls) return;
                const msg = pkt.protocol.data(pkt.payload, Cls);
                if (msg.constructor.name === 'Vibration') {
                    maxX = Math.max(maxX, msg.vibrationX);
                    maxY = Math.max(maxY, msg.vibrationY);
                    maxZ = Math.max(maxZ, msg.vibrationZ);
                    const clip = Math.max(msg.clipping0, msg.clipping1, msg.clipping2);
                    maxClip = Math.max(maxClip, clip);
                }
            })
            .on('end', resolve)
            .on('error', reject);
    });

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            vibration: {
                maxX: isFinite(maxX) ? maxX : null,
                maxY: isFinite(maxY) ? maxY : null,
                maxZ: isFinite(maxZ) ? maxZ : null,
                maxClipping: maxClip
            }
        })
    };
};
