// Browser-side chart. Runs in the page (not Node), so it uses the global `d3`
// loaded by index.html and talks to the server through GET /api/sensor.

const API_URL = "/api/sensor";
const REFRESH_MS = 10000;
const MARGIN = { top: 40, right: 24, bottom: 34, left: 48 };

const formatLevel = d3.format(",");
const formatDateTime = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
});

const chartEl = document.getElementById("chart");
const tableWrapEl = document.getElementById("table-wrap");
const statusEl = document.getElementById("status");
const toggleEl = document.getElementById("view-toggle");

let events = [];
let showTable = false;

async function load() {
    try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = await res.json();

        // The API returns newest first; a time axis wants oldest first.
        events = rows
            .map(r => ({ id: r.id, level: Number(r.level), date: new Date(r.recorded_at) }))
            .filter(e => !Number.isNaN(+e.date))
            .sort((a, b) => a.date - b.date);

        statusEl.textContent =
            `${events.length} most recent events · updated ${new Date().toLocaleTimeString()}`;
        render();
        renderTable();
    } catch (err) {
        // Keep whatever is already drawn; just say the refresh failed.
        console.error("Failed to load sound events:", err);
        statusEl.textContent = "Couldn't load data";
    }
}

function render() {
    chartEl.replaceChildren();

    if (events.length === 0) {
        const p = document.createElement("p");
        p.className = "empty";
        p.textContent = "No sound events recorded yet.";
        chartEl.append(p);
        return;
    }

    const width = Math.max(chartEl.clientWidth, 280);
    const height = Math.round(Math.min(420, Math.max(260, width * 0.45)));
    const plotLeft = MARGIN.left;
    const plotRight = width - MARGIN.right;
    const plotTop = MARGIN.top;
    const plotBottom = height - MARGIN.bottom;

    // x is a local-time scale (scaleTime), so the axis reads in your timezone.
    let [t0, t1] = d3.extent(events, d => d.date);
    if (+t0 === +t1) {
        // One event gives a zero-width domain; pad it so the point is centered.
        t0 = new Date(+t0 - 30000);
        t1 = new Date(+t1 + 30000);
    }
    const x = d3.scaleTime()
        .domain([t0, t1])
        .range([plotLeft + 8, plotRight - 8]);

    const y = d3.scaleLinear()
        .domain([0, d3.max(events, d => d.level) || 1]).nice()
        .range([plotBottom, plotTop]);

    const svg = d3.create("svg")
        .attr("viewBox", [0, 0, width, height])
        .attr("role", "img")
        .attr("tabindex", 0)
        .attr("aria-label",
            `Line chart of ${events.length} sound events. Use the left and right arrow keys to inspect each one.`);

    // Hairline gridlines.
    svg.append("g").attr("class", "grid")
        .selectAll("line")
        .data(y.ticks(5))
        .join("line")
        .attr("x1", plotLeft)
        .attr("x2", plotRight)
        .attr("y1", d => y(d))
        .attr("y2", d => y(d));

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${plotBottom})`)
        .call(d3.axisBottom(x).ticks(Math.max(2, Math.floor(width / 120))).tickSize(0).tickPadding(10));

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(${plotLeft},0)`)
        .call(d3.axisLeft(y).ticks(5).tickSize(0).tickPadding(8).tickFormat(formatLevel))
        .call(g => g.select(".domain").remove());

    svg.append("text")
        .attr("class", "axis-title")
        .attr("x", 4)
        .attr("y", 14)
        .text("Peak amplitude (ADC units)");

    // Events are discrete, so every one gets a visible marker on top of the line.
    const line = d3.line()
        .x(d => x(d.date))
        .y(d => y(d.level));

    svg.append("path")
        .datum(events)
        .attr("class", "series-line")
        .attr("d", line);

    svg.append("g")
        .selectAll("circle")
        .data(events)
        .join("circle")
        .attr("class", "dot")
        .attr("cx", d => x(d.date))
        .attr("cy", d => y(d.level))
        .attr("r", 4);

    // Label only the extreme; the axis, tooltip, and table carry the rest.
    const peak = events.reduce((a, b) => (b.level > a.level ? b : a));
    svg.append("text")
        .attr("class", "peak-label")
        .attr("text-anchor", "middle")
        .attr("x", Math.min(Math.max(x(peak.date), plotLeft + 32), plotRight - 32))
        .attr("y", y(peak.level) - 12)
        .text(`Peak ${formatLevel(peak.level)}`);

    // Hover layer: a crosshair that snaps to the nearest event, plus one tooltip.
    const focus = svg.append("g").style("display", "none");
    const crosshair = focus.append("line")
        .attr("class", "crosshair")
        .attr("y1", plotTop)
        .attr("y2", plotBottom);
    const focusDot = focus.append("circle")
        .attr("class", "focus-dot")
        .attr("r", 6);

    const tip = document.createElement("div");
    tip.className = "tooltip";
    tip.hidden = true;
    const tipValueRow = document.createElement("div");
    tipValueRow.className = "tip-value";
    const tipKey = document.createElement("span");
    tipKey.className = "tip-key";
    const tipValue = document.createElement("strong");
    tipValueRow.append(tipKey, tipValue);
    const tipTime = document.createElement("div");
    tipTime.className = "tip-time";
    tip.append(tipValueRow, tipTime);

    const bisect = d3.bisector(d => d.date).center;
    let activeIndex = -1;

    function setActive(i) {
        activeIndex = Math.max(0, Math.min(events.length - 1, i));
        const d = events[activeIndex];
        const px = x(d.date);
        const py = y(d.level);

        focus.style("display", null);
        crosshair.attr("x1", px).attr("x2", px);
        focusDot.attr("cx", px).attr("cy", py);

        tipValue.textContent = formatLevel(d.level);
        tipTime.textContent = formatDateTime.format(d.date);
        tip.hidden = false;
        tip.style.left = `${(px / width) * chartEl.clientWidth}px`;
        tip.style.top = `${(py / height) * svg.node().clientHeight}px`;
        tip.classList.toggle("flip", px > width / 2);
    }

    function clearActive() {
        activeIndex = -1;
        focus.style("display", "none");
        tip.hidden = true;
    }

    // Nearest-point lookup on x, so the pointer never has to land on a dot.
    svg.append("rect")
        .attr("class", "overlay")
        .attr("x", plotLeft)
        .attr("y", plotTop)
        .attr("width", plotRight - plotLeft)
        .attr("height", plotBottom - plotTop)
        .on("pointermove", event => {
            const [mx] = d3.pointer(event, svg.node());
            setActive(bisect(events, x.invert(mx)));
        })
        .on("pointerleave", clearActive);

    // Keyboard gets the same readout as hover.
    svg.on("focus", () => setActive(activeIndex < 0 ? events.length - 1 : activeIndex))
        .on("blur", clearActive)
        .on("keydown", event => {
            if (event.key === "ArrowLeft") {
                event.preventDefault();
                setActive((activeIndex < 0 ? events.length : activeIndex) - 1);
            } else if (event.key === "ArrowRight") {
                event.preventDefault();
                setActive(activeIndex + 1);
            }
        });

    chartEl.append(svg.node(), tip);
}

// Table twin of the chart: every value reachable without hovering.
function renderTable() {
    tableWrapEl.replaceChildren();

    const table = document.createElement("table");
    const caption = document.createElement("caption");
    caption.textContent = "Sound events, newest first";
    table.append(caption);

    const head = table.createTHead().insertRow();
    for (const [label, cls] of [["Time", ""], ["Amplitude", "num"]]) {
        const th = document.createElement("th");
        th.scope = "col";
        th.className = cls;
        th.textContent = label;
        head.append(th);
    }

    const body = table.createTBody();
    for (const e of [...events].reverse()) {
        const row = body.insertRow();
        row.insertCell().textContent = formatDateTime.format(e.date);
        const levelCell = row.insertCell();
        levelCell.className = "num";
        levelCell.textContent = formatLevel(e.level);
    }

    tableWrapEl.append(table);
}

toggleEl.addEventListener("click", () => {
    showTable = !showTable;
    chartEl.hidden = showTable;
    tableWrapEl.hidden = !showTable;
    toggleEl.textContent = showTable ? "Chart view" : "Table view";
    toggleEl.setAttribute("aria-pressed", String(showTable));
    if (!showTable) render();  // size may have changed while the chart was hidden
});

let lastWidth = chartEl.clientWidth;
new ResizeObserver(() => {
    const w = chartEl.clientWidth;
    if (w > 0 && w !== lastWidth) {
        lastWidth = w;
        render();
    }
}).observe(chartEl);

load();
setInterval(() => {
    if (!document.hidden) load();
}, REFRESH_MS);
