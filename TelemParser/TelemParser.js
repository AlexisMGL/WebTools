// TelemParser.js (renderer side dans Electron)

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    MavLinkPacketSplitter,
    MavLinkPacketParser,
    minimal,
    common,
    ardupilotmega
} = require('node-mavlink');

// ——— 1) Prépare la registry MAVLink ———
const REGISTRY = {
    ...minimal.REGISTRY,
    ...common.REGISTRY,
    ...ardupilotmega.REGISTRY,
};

// ——— 2) Définit analyzeVibration AVANT de l’utiliser ———
/**
 * Lit et parse la section Vibration d'un .tlog
 * @param {string} filePath Chemin absolu vers le tlog
 * @returns {Promise<{maxX:number,maxY:number,maxZ:number,maxClipping:number}>}
 */
function analyzeVibration(filePath) {
    return new Promise((resolve, reject) => {
        const splitter = new MavLinkPacketSplitter();
        const parser = new MavLinkPacketParser();

        let maxX = -Infinity,
            maxY = -Infinity,
            maxZ = -Infinity,
            maxClipping = 0;

        fs.createReadStream(filePath)
            .pipe(splitter)
            .pipe(parser)
            .on('data', packet => {
                const Cls = REGISTRY[packet.header.msgid];
                if (!Cls) return;
                const msg = packet.protocol.data(packet.payload, Cls);
                if (msg.constructor.name === 'Vibration') {
                    maxX = Math.max(maxX, msg.vibrationX);
                    maxY = Math.max(maxY, msg.vibrationY);
                    maxZ = Math.max(maxZ, msg.vibrationZ);
                    const clip = Math.max(msg.clipping0, msg.clipping1, msg.clipping2);
                    maxClipping = Math.max(maxClipping, clip);
                }
            })
            .on('end', () => {
                resolve({
                    maxX: isFinite(maxX) ? maxX : NaN,
                    maxY: isFinite(maxY) ? maxY : NaN,
                    maxZ: isFinite(maxZ) ? maxZ : NaN,
                    maxClipping
                });
            })
            .on('error', reject);
    });
}

// ——— 3) Expose loadFile pour l’input onchange ———
window.loadFile = async function (input) {
    const file = input.files[0];
    if (!file) return;

    const section = document.getElementById('vibrationsSection');
    const content = document.getElementById('vibrationsContent');
    section.hidden = false;
    content.textContent = 'Analyse en cours…';

    try {
        // 1) Sauvegarde le File en temp
        const arrayBuffer = await file.arrayBuffer();
        const tmpDir = os.tmpdir();
        const tmpPath = path.join(tmpDir, file.name);
        fs.writeFileSync(tmpPath, Buffer.from(arrayBuffer));

        // 2) Lance l’analyse
        const result = await analyzeVibration(tmpPath);

        // 3) Supprime temporaire
        fs.unlinkSync(tmpPath);

        // 4) Affiche les résultats
        content.innerHTML =
            `<p>Max Vibe X        : ${result.maxX.toFixed(3)} m/s²</p>` +
            `<p>Max Vibe Y        : ${result.maxY.toFixed(3)} m/s²</p>` +
            `<p>Max Vibe Z        : ${result.maxZ.toFixed(3)} m/s²</p>` +
            `<p>Max clipping : ${result.maxClipping} counts</p>`;
    } catch (err) {
        content.textContent = 'Erreur : ' + err.message;
    }
};
