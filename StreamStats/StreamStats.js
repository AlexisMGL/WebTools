
var DataflashParser
import('../modules/JsDataflashParser/parser.js').then((mod) => { DataflashParser = mod.default });

function plot_visibility(plot, hide) {
    plot.parentElement.hidden = hide
}

// Time stamp for each bin
function bin_time(low_bin, high_bin, bin_width) {
    let time = array_from_range(low_bin, high_bin, 1.0)
    time = array_scale(time, bin_width)
    return array_offset(time, bin_width * 0.5)
}

// Splint time into bins and count size of instances in each bin
function bin_count(time_in, size, bin_width, total) {

    // Bin index for given time array
    function bin_index(time, bin_width) {
        const len = time.length
        let ret = new Array(len)
        for (i = 0; i < len; i++) {
            ret[i] = Math.floor(time[i] / bin_width)
        }
        return ret
    }

    // Size of msg at index, deal with array size
    function get_size(i) {
        if (Array.isArray(size)) {
            return size[i]
        }
        return size
    }

    const bins = bin_index(time_in, bin_width)

    let low_bin = Infinity
    let high_bin = -Infinity
    const len = bins.length
    for (let i = 0; i < len; i++) {
        low_bin = Math.min(low_bin, bins[i])
        high_bin = Math.max(high_bin, bins[i])
    }
    total.low_bin = Math.min(total.low_bin, low_bin)
    total.high_bin = Math.max(total.high_bin, high_bin)

    const time = bin_time(low_bin, high_bin, bin_width)

    // Sort bins into counts
    let count = new Array(time.length).fill(0)
    for (let i = 0; i < len; i++) {
        const bin = bins[i]
        const size = get_size(i)

        // Add to msg count
        count[bin - low_bin] += size

        // Add to total count
        if (total.count[bin] == null) {
            total.count[bin] = 0
        }
        total.count[bin] += size
    }

    // Normalize by bin width
    count = array_scale(count, 1 / bin_width)

    return { time, count }
}

// Take total object and return time and count
function total_count(total, bin_width) {

    if (total.count.length == 0) {
        // No data
        return { time: null, count: null }
    }

    let time = bin_time(total.low_bin, total.high_bin, bin_width)
    let count = total.count.slice(total.low_bin, total.high_bin + 1)

    // Fill in any any missing data and normalize for bin size
    const len = count.length
    for (let i = 0; i < len; i++) {
        if (count[i] == null) {
            count[i] = 0
        }
        count[i] /= bin_width
    }

    return { time, count }
}

let log
function load_log(log_file) {
    const start = performance.now()

    log = new DataflashParser()
    log.processData(log_file, [])

    open_in_update(log)

    plot_log()

    const end = performance.now()
    console.log(`Load took: ${end - start} ms`)
}

function plot_tlog() {
    const bin_width = parseFloat(document.getElementById("WindowSize").value);
    const use_size = document.getElementById("Unit_bps").checked;
    const plot_labels = use_size ? rate_plot.bits : rate_plot.count;

    // 1) On reconstruit les traces “data_rates”
    data_rates.data = [];
    let total = { count: [], low_bin: Infinity, high_bin: -Infinity };
    let composition = {};

    for (const [sys_id, sys] of Object.entries(system)) {
        for (const [comp_id, comp] of Object.entries(sys)) {
            if (!comp.include.checked) {
                // désactive les messages si le composant est décoché
                Object.values(comp.msg).forEach(m => m.include.disabled = true);
                continue;
            }
            Object.values(comp.msg).forEach(m => m.include.disabled = false);

            for (const [name, msg] of Object.entries(comp.msg)) {
                if (!msg.include.checked) continue;
                // binning des messages
                const binned = bin_count(
                    msg.time,
                    use_size ? msg.size : 1,
                    bin_width,
                    total
                );
                data_rates.data.push({
                    mode: 'lines',
                    x: binned.time,
                    y: binned.count,
                    name,
                    meta: name,
                    hovertemplate: plot_labels.hovertemplate
                });
                // calcul de la composition initiale
                const key = `(${sys_id},${comp_id}) ${name}`;
                composition[key] = use_size
                    ? array_sum(msg.size)
                    : msg.size.length;
            }
        }
    }

    // 2) Tracés “Message Rates”
    data_rates.layout.yaxis.title.text = plot_labels.yaxis;
    let plot = document.getElementById("data_rates");
    Plotly.purge(plot);
    Plotly.newPlot(plot, data_rates.data, data_rates.layout, { displaylogo: false });
    plot_visibility(plot, false);

    // 3) Tracé “Total Rate”
    const total_binned = total_count(total, bin_width);
    total_rate.data[0].x = total_binned.time;
    total_rate.data[0].y = total_binned.count;
    total_rate.data[0].hovertemplate = plot_labels.hovertemplate;
    total_rate.layout.yaxis.title.text = plot_labels.yaxis;

    plot = document.getElementById("total_rate");
    Plotly.purge(plot);
    Plotly.newPlot(plot, total_rate.data, total_rate.layout, { displaylogo: false });
    plot_visibility(plot, false);

    // 4) Tracé “Composition” initial
    log_stats.data[0].labels = Object.keys(composition);
    log_stats.data[0].values = Object.values(composition);
    log_stats.data[0].hovertemplate = plot_labels.pie_hovertemplate;

    plot = document.getElementById("log_stats");
    Plotly.redraw(plot);
    plot_visibility(plot, false);

    // 5) On recale les axes et le reset
    document.getElementById("total_rate").removeAllListeners("plotly_relayout");
    document.getElementById("data_rates").removeAllListeners("plotly_relayout");

    link_plot_axis_range([
        ["total_rate", "x", "", total_rate],
        ["data_rates", "x", "", data_rates],
    ]);
    link_plot_reset([
        ["total_rate", total_rate],
        ["data_rates", data_rates],
    ]);

    // ———————————————— NOUVEAUTÉS ————————————————

    // A) Fonction qui refait le camembert selon [x0, x1]
    function updateComposition(x0, x1) {
        const comp2 = {};
        for (const [sys_id, sys] of Object.entries(system)) {
            for (const [comp_id, compObj] of Object.entries(sys)) {
                if (!compObj.include.checked) continue;
                for (const [name, msg] of Object.entries(compObj.msg)) {
                    if (!msg.include.checked) continue;
                    // on filtre les temps
                    const times = msg.time.filter(t => t >= x0 && t <= x1);
                    if (!times.length) continue;
                    const key = `(${sys_id},${comp_id}) ${name}`;
                    if (use_size) {
                        let sum = 0;
                        times.forEach(t => {
                            const idx = msg.time.indexOf(t);
                            sum += msg.size[idx];
                        });
                        comp2[key] = (comp2[key] || 0) + sum;
                    } else {
                        comp2[key] = (comp2[key] || 0) + times.length;
                    }
                }
            }
        }
        Plotly.restyle(
            document.getElementById("log_stats"),
            {
                labels: [Object.keys(comp2)],
                values: [Object.values(comp2)]
            }
        );
    }

    // B) Gestion des événements de zoom/sélection
    function handleRelayout(evt) {
        let x0, x1;
        if (evt["xaxis.range[0]"] != null) {
            x0 = evt["xaxis.range[0]"];
            x1 = evt["xaxis.range[1]"];
        } else if (Array.isArray(evt["xaxis.range"])) {
            [x0, x1] = evt["xaxis.range"];
        } else return;
        updateComposition(x0, x1);
    }

    ["total_rate", "data_rates"].forEach(id => {
        const gd = document.getElementById(id);
        gd.on("plotly_relayout", handleRelayout);
    });
}


let system
function load_tlog(log_file) {
    const start = performance.now()

    // Very basic Tlog parsing, does not look into messages, just gets type and size
    let data = new DataView(log_file)

    // Start at 8 since were looking for MAVlink header which comes after 64 bit timestamp
    const timestamp_length = 8

    let first_timestamp
    let end_time = 0

    system = {}
    let offset = timestamp_length
    while (offset < log_file.byteLength) {
        const magic = data.getUint8(offset)
        let header
        if (magic == 0xFE) {
            // MAVLink 1
            // 6 byte header, 2 byte crc
            const header_length = 8
            if ((offset + header_length) > log_file.byteLength) {
                // Header does not fit in remaining space
                break
            }
            header = {
                version: 1,
                header_length,
                payload_length: data.getUint8(offset + 1),
                sequence: data.getUint8(offset + 2),
                srcSystem: data.getUint8(offset + 3),
                srcComponent: data.getUint8(offset + 4),
                msgId: data.getUint8(offset + 5),
                signed: false
            }

        } else if (magic == 0xFD) {
            // MAVLink 2
            // 10 byte header, 2 byte crc
            const header_length = 12
            if ((offset + header_length) > log_file.byteLength) {
                // Header does not fit in remaining space
                break
            }

            const incompat_flags = data.getUint8(offset + 2)
            //const compat_flags = data.getUint8(offset + 3)

            header = {
                version: 2,
                header_length,
                payload_length: data.getUint8(offset + 1),
                sequence: data.getUint8(offset + 4),
                srcSystem: data.getUint8(offset + 5),
                srcComponent: data.getUint8(offset + 6),
                msgId: (data.getUint8(offset + 9) << 16) + (data.getUint8(offset + 8) << 8) + data.getUint8(offset + 7),
                signed: (incompat_flags & 0x01) != 0
            }

        } else {
            // Invalid header
            offset += 1
            continue
        }

        const total_msg_length = header.header_length + header.payload_length + (header.signed ? 13 : 0)
        if ((offset + total_msg_length) > log_file.byteLength) {
            // Message does not fit in remaining space
            break
        }

        const message = mavlink_msgs[header.msgId]
        if (message == null) {
            // Invalid ID
            offset += 1
            continue
        }

        // CRC-16/MCRF4XX checksum helper
        function x25Crc(byte, crc) {
            var tmp = byte ^ (crc & 0xFF)
            tmp = (tmp ^ (tmp << 4)) & 0xFF
            crc = (crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)
            return crc & 0xFFFF
        }

        // Calculate checksum
        let crc = 0xFFFF
        const crc_len = header.header_length + header.payload_length - 2
        for (let i = 1; i < crc_len; i++) {
            crc = x25Crc(data.getUint8(offset + i), crc)
        }
        crc = x25Crc(message.CRC, crc)

        const expected_crc = data.getUint16(offset + crc_len, true)
        if (crc != expected_crc) {
            // Invalid crc
            offset += 1
            continue
        }

        // Get system
        if (!(header.srcSystem in system)) {
            system[header.srcSystem] = {}
        }
        let sys = system[header.srcSystem]

        // Get component
        if (!(header.srcComponent in sys)) {
            sys[header.srcComponent] = {
                next_seq: header.sequence,
                received: 0,
                dropped: 0,
                msg: {},
                version: new Set(),
                signed: false
            }
        }
        let comp = sys[header.srcComponent]
        comp.received++

        // Get message
        if (!(message.name in comp.msg)) {
            comp.msg[message.name] = {
                time: [],
                size: [],
                version: new Set(),
                signed: false
            }
        }
        let msg = comp.msg[message.name]

        // Get timestamp
        const time_stamp = data.getBigUint64(offset - timestamp_length)
        if (first_timestamp == null) {
            first_timestamp = time_stamp

            const date = new Date(Number(time_stamp / 1000n))
            console.log("Start time: " + date.toString())
        }

        // Time since log start in seconds
        const time = Number(time_stamp - first_timestamp) / 1000000

        if (time < end_time) {
            alert("Time went backwards!")
            throw new Error()
        }
        end_time = time

        // Update message stats
        msg.time.push(time)
        msg.size.push(total_msg_length * 8)
        msg.version.add(header.version)
        msg.signed |= header.signed

        // Update component stats
        comp.version.add(header.version)
        comp.signed |= header.signed

        // Check sequence for dropped packets
        let seq = header.sequence
        if (seq < comp.next_seq) {
            // Deal with wrap at 255
            seq += 255
        }
        comp.dropped += seq - comp.next_seq
        comp.next_seq = (header.sequence + 1) % 256

        // Advance by message length
        offset += total_msg_length + timestamp_length
    }

    // Print stats for each system detected
    let section = document.getElementById("MAVLink")
    section.hidden = false
    section.previousElementSibling.hidden = false
    for (const [sys_id, sys] of Object.entries(system)) {

        let heading = document.createElement("h4")
        heading.innerHTML = "System ID: " + sys_id
        section.appendChild(heading)

        let table = document.createElement("table")
        section.appendChild(table)

        for (const [comp_id, comp] of Object.entries(sys)) {

            let colum = document.createElement("td")
            table.appendChild(colum)

            let fieldset = document.createElement("fieldset")
            colum.appendChild(fieldset)

            let legend = document.createElement("legend")
            legend.innerHTML = "Component ID: " + comp_id
            fieldset.appendChild(legend)

            let name = "Unknown"
            if (comp_id in MAV_COMPONENT) {
                name = MAV_COMPONENT[comp_id]
            }

            fieldset.appendChild(document.createTextNode("ID Name: " + name))
            fieldset.appendChild(document.createElement("br"))

            function get_version_string(version_set) {
                let version = Array.from(version_set)
                version = version.toSorted()
                return version.join(", ")
            }

            fieldset.appendChild(document.createTextNode("MAVLink Version: " + get_version_string(comp.version)))
            fieldset.appendChild(document.createElement("br"))

            fieldset.appendChild(document.createTextNode("Signing: " + (comp.signed ? "\u2705" : "\u274C")))
            fieldset.appendChild(document.createElement("br"))

            const drop_pct = (comp.dropped / comp.received) * 100
            fieldset.appendChild(document.createTextNode("Dropped messages: " + comp.dropped + " / " + comp.received + " (" + drop_pct.toFixed(2) + "%)"))
            fieldset.appendChild(document.createElement("br"))

            function add_include(parent, name) {
                let check = document.createElement("input")
                check.setAttribute('type', 'checkbox')
                check.setAttribute('id', name)
                check.checked = true
                check.addEventListener('change', plot_tlog)

                parent.appendChild(check)

                let label = document.createElement("label")
                label.setAttribute('for', name)
                label.innerHTML = "Include"
                parent.appendChild(label)

                return check
            }

            comp.include = add_include(fieldset, sys_id + "," + comp_id)


            let details = document.createElement("details")
            fieldset.appendChild(details)

            let summary = document.createElement("summary")
            summary.innerHTML = "Messages"
            details.appendChild(summary)

            for (const [name, msg] of Object.entries(comp.msg)) {
                let msg_fieldset = document.createElement("fieldset")
                details.appendChild(msg_fieldset)

                let msg_legend = document.createElement("legend")
                msg_legend.innerHTML = name
                msg_fieldset.appendChild(msg_legend)

                msg_fieldset.appendChild(document.createTextNode("Count: " + msg.time.length))
                msg_fieldset.appendChild(document.createElement("br"))

                if (comp.version.size > 1) {
                    msg_fieldset.appendChild(document.createTextNode("MAVLink Version: " + get_version_string(msg.version)))
                    msg_fieldset.appendChild(document.createElement("br"))
                }

                if (comp.signed) {
                    msg_fieldset.appendChild(document.createTextNode("Signing: " + (msg.signed ? "\u2705" : "\u274C")))
                    msg_fieldset.appendChild(document.createElement("br"))
                }

                msg.include = add_include(msg_fieldset, sys_id + "," + comp_id + "," + name)

            }

        }
    }

    plot_tlog()

    const end = performance.now()
    console.log(`Load took: ${end - start} ms`)
}
function plot_tlog() {
    const bin_width = parseFloat(document.getElementById("WindowSize").value);
    const use_size = document.getElementById("Unit_bps").checked;
    const plot_labels = use_size ? rate_plot.bits : rate_plot.count;

    // 1) Construction des traces “Message Rates” et collecte pour la compo
    data_rates.data = [];
    let total = { count: [], low_bin: Infinity, high_bin: -Infinity };
    let composition = {};

    for (const [sys_id, sys] of Object.entries(system)) {
        for (const [comp_id, comp] of Object.entries(sys)) {
            if (!comp.include.checked) {
                Object.values(comp.msg).forEach(m => m.include.disabled = true);
                continue;
            }
            Object.values(comp.msg).forEach(m => m.include.disabled = false);

            for (const [name, msg] of Object.entries(comp.msg)) {
                if (!msg.include.checked) continue;
                const binned = bin_count(msg.time, use_size ? msg.size : 1, bin_width, total);

                data_rates.data.push({
                    mode: 'lines',
                    x: binned.time,
                    y: binned.count,
                    name,
                    meta: name,
                    hovertemplate: plot_labels.hovertemplate
                });

                const key = `(${sys_id},${comp_id}) ${name}`;
                composition[key] = use_size ? array_sum(msg.size) : msg.size.length;
            }
        }
    }

    // 2) Affichage “Message Rates”
    data_rates.layout.yaxis.title.text = plot_labels.yaxis;
    let plot = document.getElementById("data_rates");
    Plotly.purge(plot);
    Plotly.newPlot(plot, data_rates.data, data_rates.layout, { displaylogo: false });
    plot_visibility(plot, false);

    // 3) Affichage “Total Rate”
    const total_binned = total_count(total, bin_width);
    total_rate.data[0].x = total_binned.time;
    total_rate.data[0].y = total_binned.count;
    total_rate.data[0].hovertemplate = plot_labels.hovertemplate;
    total_rate.layout.yaxis.title.text = plot_labels.yaxis;

    plot = document.getElementById("total_rate");
    Plotly.purge(plot);
    Plotly.newPlot(plot, total_rate.data, total_rate.layout, { displaylogo: false });
    plot_visibility(plot, false);

    // 4) **NOUVEAU** : Affichage initial du camembert “Composition”
    const compTrace = {
        type: 'pie',
        labels: Object.keys(composition),
        values: Object.values(composition),
        hovertemplate: plot_labels.pie_hovertemplate,
        textinfo: "label+percent",
        textposition: "inside"
    };
    plot = document.getElementById("log_stats");
    Plotly.purge(plot);
    Plotly.newPlot(plot, [compTrace], log_stats.layout, { displaylogo: false });
    plot_visibility(plot, false);

    // 5) Raccordements axes + reset (inchangés)
    document.getElementById("total_rate").removeAllListeners("plotly_relayout");
    document.getElementById("data_rates").removeAllListeners("plotly_relayout");
    link_plot_axis_range([["total_rate", "x", "", total_rate], ["data_rates", "x", "", data_rates]]);
    link_plot_reset([["total_rate", total_rate], ["data_rates", data_rates]]);

    // —————————————————————————————————————————
    // 6) Fonction interne pour mettre à jour le pie-chart selon [x0,x1]
    function updatePie(x0, x1) {
        const comp2 = {};
        for (const [sys_id, sys] of Object.entries(system)) {
            for (const [comp_id, compObj] of Object.entries(sys)) {
                if (!compObj.include.checked) continue;
                for (const [name, msg] of Object.entries(compObj.msg)) {
                    if (!msg.include.checked) continue;
                    const times = msg.time.filter(t => t >= x0 && t <= x1);
                    if (!times.length) continue;
                    const key = `(${sys_id},${comp_id}) ${name}`;
                    if (use_size) {
                        let sum = 0;
                        times.forEach(t => {
                            const idx = msg.time.indexOf(t);
                            sum += msg.size[idx];
                        });
                        comp2[key] = (comp2[key] || 0) + sum;
                    } else {
                        comp2[key] = (comp2[key] || 0) + times.length;
                    }
                }
            }
        }
        // On réaffiche le camembert avec Plotly.react
        Plotly.react(
            document.getElementById("log_stats"),
            [{
                type: 'pie',
                labels: Object.keys(comp2),
                values: Object.values(comp2),
                hovertemplate: plot_labels.pie_hovertemplate,
                textinfo: "label+percent",
                textposition: "inside"
            }],
            log_stats.layout
        );
    }

    // 7) On attache un seul listener pour les deux graphes
    ["data_rates", "total_rate"].forEach(id => {
        document.getElementById(id).on("plotly_relayout", evt => {
            const x0 = evt["xaxis.range[0]"] ?? (Array.isArray(evt["xaxis.range"]) ? evt["xaxis.range"][0] : null);
            const x1 = evt["xaxis.range[1]"] ?? (Array.isArray(evt["xaxis.range"]) ? evt["xaxis.range"][1] : null);
            if (x0 != null && x1 != null) updatePie(x0, x1);
        });
    });
}


function replot() {
    if (system != null) {
        plot_tlog()

    } else if (log != null) {
        plot_log()

    }
}

async function load(e) {
    reset()

    const file = e.files[0]
    if (file == null) {
        return
    }

    if (file.name.toLowerCase().endsWith(".bin")) {
        let reader = new FileReader()
        reader.onload = function (e) {
            loading_call(() => { load_log(reader.result) })
        }
        reader.readAsArrayBuffer(file)

    } else if (file.name.toLowerCase().endsWith(".tlog")) {
        let reader = new FileReader()
        reader.onload = function (e) {
            loading_call(() => { load_tlog(reader.result) })
        }
        reader.readAsArrayBuffer(file)
    }

}

// Axis labels used in different modes
const rate_plot = {
    bits: {
        hovertemplate: "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} bps",
        yaxis: "bits per second",
        pie_hovertemplate: '%{label}<br>%{value:,i} bits<br>%{percent}<extra></extra>'
    },
    count: {
        hovertemplate: "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} messages",
        yaxis: "messages per second",
        pie_hovertemplate: '%{label}<br>%{value:,i} messages<br>%{percent}<extra></extra>'
    }
}

let log_stats = {}
let data_rates = {}
let total_rate = {}
function reset() {

    // Clear bin
    log = null

    // Clear tlog
    system = null

    function setup_section(section) {
        // Remove all children
        section.replaceChildren()

        // Hide
        section.hidden = true
        section.previousElementSibling.hidden = true
    }

    setup_section(document.getElementById("MAVLink"))

    document.getElementById("plotsetup").hidden = true
    document.getElementById("LOGSTATS").replaceChildren()

    // Log Composition
    log_stats.data = [{
        type: 'pie', textposition: 'inside', textinfo: "label+percent",
        hovertemplate: '%{label}<br>%{value:,i} bits<br>%{percent}<extra></extra>'
    }]
    log_stats.layout = {
        showlegend: false,
        margin: { b: 10, l: 50, r: 50, t: 10 },
    }

    plot = document.getElementById("log_stats")
    Plotly.purge(plot)
    Plotly.newPlot(plot, log_stats.data, log_stats.layout, { displaylogo: false });
    plot_visibility(plot, true)

    const time_scale_label = "Time (s)"

    // Per msg data rates
    data_rates.layout = {
        showlegend: false,
        //legend: { itemclick: false, itemdoubleclick: false }, 
        margin: { b: 50, l: 50, r: 50, t: 20 },
        xaxis: { title: { text: time_scale_label } },
        yaxis: { title: { text: "" } },
    }
    plot_visibility(document.getElementById("data_rates"), true)

    // Total data rates
    total_rate.data = [{ type: 'scattergl', mode: 'lines', name: "Total", meta: "Total", hovertemplate: "" }]
    total_rate.layout = {
        showlegend: false,
        //legend: { itemclick: false, itemdoubleclick: false }, 
        margin: { b: 50, l: 50, r: 50, t: 20 },
        xaxis: { title: { text: time_scale_label } },
        yaxis: { title: { text: "" } },
    }
    plot_visibility(document.getElementById("total_rate"), true)

}
