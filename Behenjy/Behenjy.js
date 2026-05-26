"use strict";

const SAMPLE_LOG = "2026-05-22 13-20-42.tlog";
const TLOG_TIMESTAMP_LENGTH = 8;
const MAVLINK_V1_MAGIC = 0xfe;
const MAVLINK_V2_MAGIC = 0xfd;
const VFR_HUD_MSG_ID = 74;
const VFR_HUD_CRC_EXTRA = 20;
const VFR_HUD_ALT_OFFSET = 8;
const VFR_HUD_MIN_PAYLOAD = VFR_HUD_ALT_OFFSET + 4;

const state = {
  lastObjectUrl: null,
};

window.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("fileInput");
  const chooseFileButton = document.getElementById("chooseFileButton");
  const sampleButton = document.getElementById("sampleButton");
  const dropZone = document.getElementById("dropZone");

  chooseFileButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) {
      loadFile(file);
    }
  });

  sampleButton.addEventListener("click", loadSampleLog);

  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove("is-dragging");
    });
  });

  dropZone.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) {
      loadFile(file);
    }
  });

  window.addEventListener("resize", () => {
    Plotly.Plots.resize(document.getElementById("altitudePlot"));
  });

  renderEmptyPlot();

  if (new URLSearchParams(window.location.search).get("sample") === "1") {
    loadSampleLog();
  }
});

async function loadFile(file) {
  if (!file.name.toLowerCase().endsWith(".tlog")) {
    showStatus("Please choose a .tlog file.", true);
    return;
  }

  setLoading(true);
  setFileName(file.name);
  showStatus("Reading file...");

  try {
    const buffer = await file.arrayBuffer();
    await parseAndRender(buffer, {
      name: file.name,
      size: file.size,
      source: "Local file",
    });
  } catch (error) {
    console.error(error);
    showStatus(error.message || "Unable to load this TLOG.", true);
  } finally {
    setLoading(false);
  }
}

async function loadSampleLog() {
  setLoading(true);
  setFileName(SAMPLE_LOG);
  showStatus("Fetching sample log...");

  try {
    const response = await fetch(encodeURI(SAMPLE_LOG));
    if (!response.ok) {
      throw new Error("Sample log could not be loaded from this location.");
    }

    const buffer = await response.arrayBuffer();
    await parseAndRender(buffer, {
      name: SAMPLE_LOG,
      size: buffer.byteLength,
      source: "Sample log",
    });
  } catch (error) {
    console.error(error);
    showStatus("Sample log loading needs a local web server. Use Choose TLOG, or open Behenjy through the provided local URL.", true);
  } finally {
    setLoading(false);
  }
}

async function parseAndRender(buffer, fileInfo) {
  showStatus("Parsing MAVLink VFR_HUD messages...");
  await nextFrame();

  const result = parseTlogVfrHud(buffer);
  if (result.samples.length === 0) {
    resetStats(fileInfo);
    renderEmptyPlot();
    showStatus("No VFR_HUD altitude samples were found in this TLOG.", true);
    return;
  }

  renderStats(result, fileInfo);
  renderAltitudePlot(result);
  showStatus(`Loaded ${formatInteger(result.samples.length)} VFR_HUD samples.`);
}

function parseTlogVfrHud(buffer) {
  const data = new DataView(buffer);
  const samples = [];
  const systems = new Set();
  let firstTimestamp = null;
  let startDate = null;
  let parsedFrames = 0;
  let crcRejected = 0;
  let offset = TLOG_TIMESTAMP_LENGTH;

  while (offset < buffer.byteLength) {
    const header = readMavlinkHeader(data, offset, buffer.byteLength);
    if (!header) {
      offset += 1;
      continue;
    }

    const totalMessageLength = header.headerLength + header.payloadLength + (header.signed ? 13 : 0);
    if (offset + totalMessageLength > buffer.byteLength) {
      break;
    }

    const timestamp = data.getBigUint64(offset - TLOG_TIMESTAMP_LENGTH);
    if (firstTimestamp === null) {
      firstTimestamp = timestamp;
      startDate = new Date(Number(timestamp / 1000n));
    }

    parsedFrames += 1;
    systems.add(header.srcSystem);

    if (header.msgId === VFR_HUD_MSG_ID) {
      if (header.payloadLength >= VFR_HUD_MIN_PAYLOAD && isValidMavlinkCrc(data, offset, header, VFR_HUD_CRC_EXTRA)) {
        const time = Number(timestamp - firstTimestamp) / 1000000;
        const altitude = data.getFloat32(header.payloadOffset + VFR_HUD_ALT_OFFSET, true);

        if (Number.isFinite(time) && Number.isFinite(altitude) && time >= 0) {
          samples.push({
            time,
            altitude,
            system: header.srcSystem,
            component: header.srcComponent,
          });
        }
      } else {
        crcRejected += 1;
      }
    }

    offset += totalMessageLength + TLOG_TIMESTAMP_LENGTH;
  }

  return {
    samples,
    systems: Array.from(systems).sort((a, b) => a - b),
    parsedFrames,
    crcRejected,
    startDate,
  };
}

function readMavlinkHeader(data, offset, byteLength) {
  const magic = data.getUint8(offset);

  if (magic === MAVLINK_V1_MAGIC) {
    const headerLength = 8;
    if (offset + headerLength > byteLength) {
      return null;
    }

    const payloadLength = data.getUint8(offset + 1);
    return {
      version: 1,
      headerLength,
      payloadLength,
      sequence: data.getUint8(offset + 2),
      srcSystem: data.getUint8(offset + 3),
      srcComponent: data.getUint8(offset + 4),
      msgId: data.getUint8(offset + 5),
      payloadOffset: offset + 6,
      signed: false,
    };
  }

  if (magic === MAVLINK_V2_MAGIC) {
    const headerLength = 12;
    if (offset + headerLength > byteLength) {
      return null;
    }

    const incompatFlags = data.getUint8(offset + 2);
    return {
      version: 2,
      headerLength,
      payloadLength: data.getUint8(offset + 1),
      sequence: data.getUint8(offset + 4),
      srcSystem: data.getUint8(offset + 5),
      srcComponent: data.getUint8(offset + 6),
      msgId: (data.getUint8(offset + 9) << 16) + (data.getUint8(offset + 8) << 8) + data.getUint8(offset + 7),
      payloadOffset: offset + 10,
      signed: (incompatFlags & 0x01) !== 0,
    };
  }

  return null;
}

function isValidMavlinkCrc(data, offset, header, crcExtra) {
  let crc = 0xffff;
  const crcLength = header.headerLength + header.payloadLength - 2;

  for (let i = 1; i < crcLength; i += 1) {
    crc = x25Crc(data.getUint8(offset + i), crc);
  }

  crc = x25Crc(crcExtra, crc);
  return crc === data.getUint16(offset + crcLength, true);
}

function x25Crc(byte, crc) {
  let tmp = byte ^ (crc & 0xff);
  tmp = (tmp ^ (tmp << 4)) & 0xff;
  return ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff;
}

function renderAltitudePlot(result) {
  const plot = document.getElementById("altitudePlot");
  const times = result.samples.map((sample) => sample.time);
  const altitudes = result.samples.map((sample) => sample.altitude);

  document.getElementById("emptyState").classList.add("is-hidden");

  Plotly.react(plot, [{
    x: times,
    y: altitudes,
    type: "scattergl",
    mode: "lines",
    name: "Altitude",
    line: {
      color: "#177e89",
      width: 2,
    },
    hovertemplate: "Time %{x:.2f} s<br>Altitude %{y:.2f} m<extra>VFR_HUD</extra>",
  }], {
    margin: { l: 96, r: 28, t: 16, b: 58 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#fbfcfa",
    font: {
      family: "Inter, Segoe UI, Roboto, Arial, sans-serif",
      color: "#18211f",
    },
    xaxis: {
      title: "Time since log start (s)",
      zeroline: false,
      gridcolor: "#e5ece5",
      linecolor: "#aab7b0",
      mirror: true,
      showspikes: true,
      spikemode: "across",
      spikesnap: "cursor",
      spikecolor: "#c45f38",
    },
    yaxis: {
      title: "Altitude (m)",
      zeroline: false,
      gridcolor: "#e5ece5",
      linecolor: "#aab7b0",
      mirror: true,
      fixedrange: false,
    },
    hovermode: "x unified",
    dragmode: "zoom",
    showlegend: false,
  }, {
    displaylogo: false,
    responsive: true,
    modeBarButtonsToRemove: ["lasso2d", "select2d"],
  });
}

function renderEmptyPlot() {
  const plot = document.getElementById("altitudePlot");
  document.getElementById("emptyState").classList.remove("is-hidden");

  Plotly.react(plot, [], {
    margin: { l: 96, r: 28, t: 16, b: 58 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#fbfcfa",
    xaxis: {
      title: "Time since log start (s)",
      gridcolor: "#e5ece5",
      zeroline: false,
    },
    yaxis: {
      title: "Altitude (m)",
      gridcolor: "#e5ece5",
      zeroline: false,
    },
  }, {
    displaylogo: false,
    responsive: true,
  });
}

function renderStats(result, fileInfo) {
  const first = result.samples[0];
  const last = result.samples[result.samples.length - 1];
  const duration = Math.max(0, last.time - first.time);
  let minAltitude = Infinity;
  let maxAltitude = -Infinity;

  for (const sample of result.samples) {
    minAltitude = Math.min(minAltitude, sample.altitude);
    maxAltitude = Math.max(maxAltitude, sample.altitude);
  }

  const averageRate = duration > 0 ? result.samples.length / duration : 0;

  document.getElementById("sampleCount").textContent = formatInteger(result.samples.length);
  document.getElementById("durationValue").textContent = `${formatNumber(duration, 1)} s`;
  document.getElementById("altitudeRange").textContent = `${formatNumber(minAltitude, 1)} to ${formatNumber(maxAltitude, 1)} m`;
  document.getElementById("sampleRate").textContent = `${formatNumber(averageRate, 1)} Hz`;

  const systemText = result.systems.length > 0 ? `Systems ${result.systems.join(", ")}` : "No system IDs";
  const dateText = result.startDate ? result.startDate.toLocaleString() : "unknown start";
  document.getElementById("fileMeta").textContent =
    `${fileInfo.source}: ${fileInfo.name} | ${formatBytes(fileInfo.size)} | ${systemText} | Start ${dateText}`;
}

function resetStats(fileInfo) {
  document.getElementById("sampleCount").textContent = "0";
  document.getElementById("durationValue").textContent = "0.0 s";
  document.getElementById("altitudeRange").textContent = "-";
  document.getElementById("sampleRate").textContent = "0.0 Hz";
  document.getElementById("fileMeta").textContent = `${fileInfo.source}: ${fileInfo.name} | ${formatBytes(fileInfo.size)}`;
}

function setLoading(isLoading) {
  document.getElementById("chooseFileButton").disabled = isLoading;
  document.getElementById("sampleButton").disabled = isLoading;
}

function setFileName(name) {
  document.getElementById("selectedFileName").textContent = name;
}

function showStatus(message, isError = false) {
  const statusText = document.getElementById("statusText");
  statusText.textContent = message;
  statusText.style.color = isError ? "#a83d24" : "";
}

function nextFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(resolve));
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${formatNumber(bytes / Math.pow(1024, power), power === 0 ? 0 : 1)} ${units[power]}`;
}

function formatNumber(value, fractionDigits) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function formatInteger(value) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
