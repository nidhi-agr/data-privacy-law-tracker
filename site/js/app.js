/* Data Privacy Law Tracker — SPA (map, profiles, news, insights, library) */
(function () {
  "use strict";

  // ---------- constants ----------
  const STATUS_LABELS = {
    comprehensive_law_in_force: "Comprehensive law in force",
    law_passed_not_in_force: "Law passed, not yet in force",
    draft_bill: "Draft bill under consideration",
    sectoral_only: "Sectoral rules only",
    not_covered: "Not tracked",
  };
  const STATUS_COLORS = {
    comprehensive_law_in_force: "var(--st-comprehensive)",
    law_passed_not_in_force: "var(--st-passed)",
    draft_bill: "var(--st-draft)",
    sectoral_only: "var(--st-sectoral)",
    not_covered: "var(--st-none)",
  };
  const INSTRUMENT_LABELS = {
    act: "Act", rules: "Rules", regulation: "Regulation", order: "Order",
    circular: "Circular", guideline: "Guideline", bill: "Bill",
    decree: "Decree", directive: "Directive", standard: "Standard",
  };
  const INSTRUMENT_STATUS_LABELS = {
    in_force: "In force", partially_in_force: "Partially in force",
    passed_not_in_force: "Passed, not in force", draft: "Draft", repealed: "Repealed",
  };

  // ISO 3166-1 numeric -> tracker code (world-atlas feature ids)
  const NUMERIC_TO_CODE = {
    356: "in", 156: "cn", 392: "jp", 410: "kr", 702: "sg", 344: "hk", 158: "tw",
    36: "au", 554: "nz", 360: "id", 764: "th", 704: "vn", 458: "my", 608: "ph",
    826: "uk", 756: "ch", 792: "tr", 784: "ae", 682: "sa", 634: "qa", 48: "bh",
    376: "il", 818: "eg", 566: "ng", 404: "ke", 710: "za", 288: "gh", 504: "ma", 643: "ru",
  };
  // EU member states all resolve to the EU bloc profile
  const EU_NUMERIC = [40, 56, 100, 191, 196, 203, 208, 233, 246, 250, 276, 300, 348,
    372, 380, 428, 440, 442, 470, 528, 616, 620, 642, 703, 705, 724, 752];
  EU_NUMERIC.forEach((n) => (NUMERIC_TO_CODE[n] = "eu"));

  // Small jurisdictions invisible at 110m resolution -> clickable dots [lon, lat]
  const DOT_MARKERS = { sg: [103.82, 1.35], hk: [114.17, 22.3], bh: [50.55, 26.05] };

  // ---------- state ----------
  const state = { jurisdictions: [], byCode: {}, news: null, insights: null, world: null };
  const view = document.getElementById("view");
  const tooltip = document.getElementById("tooltip");

  // ---------- utilities ----------
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const fmtDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00Z");
    return isNaN(d) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  };
  const statusBadge = (s) => `<span class="badge status-${esc(s)}">${esc(STATUS_LABELS[s] || s)}</span>`;

  function showTooltip(evt, html) {
    tooltip.innerHTML = html;
    tooltip.style.display = "block";
    const pad = 14;
    let x = evt.clientX + pad, y = evt.clientY + pad;
    const r = tooltip.getBoundingClientRect();
    if (x + r.width > innerWidth - 8) x = evt.clientX - r.width - pad;
    if (y + r.height > innerHeight - 8) y = evt.clientY - r.height - pad;
    tooltip.style.left = x + "px";
    tooltip.style.top = y + "px";
  }
  const hideTooltip = () => (tooltip.style.display = "none");

  // ---------- theme ----------
  const themeBtn = document.getElementById("themeToggle");
  themeBtn.addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
    if (location.hash.includes("insights") || !location.hash || location.hash.includes("map")) route();
  });
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;

  // ---------- data loading ----------
  async function loadAll() {
    const idx = await fetch("data/jurisdictions/index.json").then((r) => r.json());
    const [jurs, news, insights, world] = await Promise.all([
      Promise.all(idx.codes.map((c) => fetch(`data/jurisdictions/${c}.json`).then((r) => r.json()))),
      fetch("data/news.json").then((r) => (r.ok ? r.json() : { items: [] })),
      fetch("data/insights.json").then((r) => (r.ok ? r.json() : null)),
      fetch("vendor/countries-110m.json").then((r) => r.json()),
    ]);
    state.jurisdictions = jurs.sort((a, b) => a.name.localeCompare(b.name));
    jurs.forEach((j) => (state.byCode[j.code] = j));
    state.news = news;
    state.insights = insights;
    state.world = world;
    if (news.generated_at) {
      document.getElementById("genStamp").textContent =
        "Newsfeed generated " + fmtDate(news.generated_at.slice(0, 10)) + ".";
    }
  }

  // ---------- router ----------
  function route() {
    const hash = location.hash || "#/map";
    const [, page, arg] = hash.split("/");
    document.querySelectorAll("nav.tabs a").forEach((a) => {
      a.classList.toggle("active", a.dataset.route === page || (page === "jurisdiction" && a.dataset.route === "map"));
    });
    hideTooltip();
    if (page === "jurisdiction" && arg) renderProfile(arg);
    else if (page === "news") renderNews(arg);
    else if (page === "insights") renderInsights();
    else if (page === "library") renderLibrary();
    else renderMap();
    window.scrollTo(0, 0);
  }

  // ---------- map view ----------
  function renderMap() {
    view.innerHTML = `
      <div class="card">
        <h1>Data privacy laws across APAC &amp; EMEA</h1>
        <p class="muted small" style="margin-top:-6px">Click a country to open its profile — laws, regulators, official texts, penalties and latest developments.</p>
        <div id="mapwrap"><svg id="map" role="img" aria-label="World map of data privacy law status"></svg></div>
        <div class="map-legend" id="mapLegend"></div>
      </div>
      <div class="card">
        <h2>All jurisdictions</h2>
        <div class="jur-grid">${state.jurisdictions.map((j) => `
          <a class="jur-card" href="#/jurisdiction/${j.code}">
            <span class="name">${esc(j.name)}</span>
            <span class="region">${esc(j.region)}</span><br/>
            ${statusBadge(j.status)}
          </a>`).join("")}
        </div>
      </div>`;

    // legend
    document.getElementById("mapLegend").innerHTML =
      Object.keys(STATUS_LABELS).map((s) =>
        `<span class="key"><span class="swatch" style="background:${STATUS_COLORS[s]}"></span>${esc(STATUS_LABELS[s])}</span>`
      ).join("");

    const width = 1160, height = 560;
    const svg = d3.select("#map").attr("viewBox", `0 0 ${width} ${height}`);
    const countries = topojson.feature(state.world, state.world.objects.countries);
    // Focus on APAC + EMEA: crop out the Americas
    const projection = d3.geoNaturalEarth1().rotate([-78, 0]).fitExtent(
      [[-290, 8], [width + 60, height - 4]], { type: "Sphere" });
    const path = d3.geoPath(projection);

    const codeOf = (f) => NUMERIC_TO_CODE[parseInt(f.id, 10)];

    svg.append("g").selectAll("path")
      .data(countries.features.filter((f) => parseInt(f.id, 10) !== 10)) // drop Antarctica
      .join("path")
      .attr("class", (f) => "country" + (state.byCode[codeOf(f)] ? "" : " inactive"))
      .attr("d", path)
      .attr("fill", (f) => {
        const j = state.byCode[codeOf(f)];
        return j ? STATUS_COLORS[j.status] : "var(--st-none)";
      })
      .on("mousemove", (evt, f) => {
        const j = state.byCode[codeOf(f)];
        if (!j) return hideTooltip();
        showTooltip(evt, `<div class="t">${esc(j.name)}</div><div class="s">${esc(STATUS_LABELS[j.status])} · click for profile</div>`);
      })
      .on("mouseleave", hideTooltip)
      .on("click", (evt, f) => {
        const j = state.byCode[codeOf(f)];
        if (j) location.hash = `#/jurisdiction/${j.code}`;
      });

    // dot markers for small jurisdictions
    svg.append("g").selectAll("circle")
      .data(Object.entries(DOT_MARKERS).filter(([c]) => state.byCode[c]))
      .join("circle")
      .attr("class", "city-dot")
      .attr("r", 5)
      .attr("cx", ([, ll]) => projection(ll)[0])
      .attr("cy", ([, ll]) => projection(ll)[1])
      .attr("fill", ([c]) => STATUS_COLORS[state.byCode[c].status])
      .on("mousemove", (evt, [c]) => {
        const j = state.byCode[c];
        showTooltip(evt, `<div class="t">${esc(j.name)}</div><div class="s">${esc(STATUS_LABELS[j.status])} · click for profile</div>`);
      })
      .on("mouseleave", hideTooltip)
      .on("click", (evt, [c]) => (location.hash = `#/jurisdiction/${c}`));
  }

  // ---------- jurisdiction profile ----------
  function renderProfile(code) {
    const j = state.byCode[code];
    if (!j) { view.innerHTML = `<div class="card">Unknown jurisdiction “${esc(code)}”. <a href="#/map">Back to map</a></div>`; return; }

    const groups = {};
    (j.legal_instruments || []).forEach((inst) => {
      (groups[inst.type] = groups[inst.type] || []).push(inst);
    });
    const typeOrder = ["act", "decree", "regulation", "rules", "directive", "order", "circular", "guideline", "standard", "bill"];
    const yes = (v) => (v ? "Yes" : "No");

    const newsForJur = (state.news.items || []).filter((n) => n.jurisdiction === code).slice(0, 6);

    view.innerHTML = `
      <div class="card">
        <div class="profile-head">
          <h1 style="margin:0">${esc(j.name)}</h1>
          ${statusBadge(j.status)}
          <span class="muted small">${esc(j.region)} · last reviewed ${fmtDate(j.last_reviewed)}</span>
        </div>
        <p>${esc(j.overview)}</p>
        <div class="obligations">
          <div class="ob"><div class="k">Regulator</div><div class="v">${j.regulator.url ? `<a href="${esc(j.regulator.url)}" target="_blank" rel="noopener">${esc(j.regulator.name)}</a>` : esc(j.regulator.name)}</div></div>
          <div class="ob"><div class="k">DPO required</div><div class="v">${yes(j.dpo_required)}</div></div>
          <div class="ob"><div class="k">Breach notification</div><div class="v">${yes(j.breach_notification)}</div></div>
        </div>
        <h3>Penalties</h3><p class="small">${esc(j.penalties || "—")}</p>
        <h3>Cross-border transfers</h3><p class="small">${esc(j.cross_border || "—")}</p>
      </div>

      <div class="card">
        <h2>Legal instruments &amp; official texts</h2>
        ${typeOrder.filter((t) => groups[t]).map((t) => `
          <h3>${esc(INSTRUMENT_LABELS[t] || t)}s</h3>
          ${groups[t].map((inst) => `
            <div class="instrument">
              <div class="title">${esc(inst.title)}</div>
              <div class="meta">
                <span class="badge inst-${esc(inst.status)}">${esc(INSTRUMENT_STATUS_LABELS[inst.status] || inst.status)}</span>
                ${inst.date ? " · " + fmtDate(inst.date) : ""}
                ${inst.issuing_authority ? " · " + esc(inst.issuing_authority) : ""}
              </div>
              <div class="small">${esc(inst.summary)}</div>
              <div class="small"><a href="${esc(inst.official_text_url)}" target="_blank" rel="noopener">Official text ↗</a></div>
            </div>`).join("")}`).join("")}
      </div>

      <div class="card">
        <h2>Latest developments</h2>
        ${(j.developments || []).map((d) => `
          <div class="dev">
            <div class="date">${fmtDate(d.date)}</div>
            <div><strong>${esc(d.title)}</strong></div>
            <div class="small">${esc(d.summary)} ${d.source_url ? `<a href="${esc(d.source_url)}" target="_blank" rel="noopener">source ↗</a>` : ""}</div>
          </div>`).join("") || '<p class="muted">None recorded.</p>'}
        ${newsForJur.length ? `<h3>From the newsfeed</h3>${newsForJur.map((n) => `
          <div class="news-item">
            <div class="meta">${fmtDate(n.date)} · ${esc(n.source)}</div>
            <div class="title"><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a></div>
          </div>`).join("")}` : ""}
        <p class="small" style="margin-top:14px"><a href="#/map">← Back to map</a></p>
      </div>`;
  }

  // ---------- newsfeed ----------
  function renderNews(filterArg) {
    const items = state.news.items || [];
    const filter = filterArg || "all";
    const regions = ["all", "APAC", "EMEA"];
    const filtered = filter === "all" ? items
      : regions.includes(filter) ? items.filter((n) => n.region === filter)
      : items.filter((n) => n.jurisdiction === filter);

    const jurCounts = {};
    items.forEach((n) => (jurCounts[n.jurisdiction] = (jurCounts[n.jurisdiction] || 0) + 1));
    const topJurs = Object.entries(jurCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

    view.innerHTML = `
      <div class="card">
        <h1>Newsfeed</h1>
        <p class="muted small" style="margin-top:-6px">Privacy-law news from regulator feeds and curated news searches, last ${esc(state.news.window_days || 30)} days. Updated daily.</p>
        <div class="chip-row">
          ${regions.map((r) => `<button class="chip ${filter === r ? "active" : ""}" data-f="${r}">${r === "all" ? "All regions" : r}</button>`).join("")}
          ${topJurs.map(([c]) => state.byCode[c] ? `<button class="chip ${filter === c ? "active" : ""}" data-f="${c}">${esc(state.byCode[c].name)}</button>` : "").join("")}
        </div>
        ${filtered.map((n) => `
          <div class="news-item">
            <div class="meta">${fmtDate(n.date)} · ${esc(n.source)} · ${state.byCode[n.jurisdiction] ? `<a href="#/jurisdiction/${esc(n.jurisdiction)}">${esc(state.byCode[n.jurisdiction].name)}</a>` : esc(n.jurisdiction)}</div>
            <div class="title"><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a></div>
          </div>`).join("") || '<p class="muted">No items for this filter.</p>'}
      </div>`;

    view.querySelectorAll(".chip").forEach((b) =>
      b.addEventListener("click", () => (location.hash = `#/news/${b.dataset.f}`)));
  }

  // ---------- insights dashboard ----------
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function hbar(el, rows, { color = "--series-1", labelWidth = 150 } = {}) {
    // rows: [{label, value, hint?}] — horizontal bars, direct value labels
    const barH = 22, gap = 8, width = 520;
    const height = rows.length * (barH + gap) + 6;
    const max = d3.max(rows, (r) => r.value) || 1;
    const x = d3.scaleLinear([0, max], [0, width - labelWidth - 56]);
    const svg = d3.select(el).append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`).attr("width", "100%");
    const g = svg.selectAll("g").data(rows).join("g")
      .attr("transform", (r, i) => `translate(0,${i * (barH + gap)})`);
    g.append("text").attr("x", labelWidth - 8).attr("y", barH / 2 + 4)
      .attr("text-anchor", "end").attr("class", "bar-label")
      .text((r) => r.label.length > 22 ? r.label.slice(0, 21) + "…" : r.label);
    g.append("rect")
      .attr("x", labelWidth).attr("y", 2).attr("height", barH - 4)
      .attr("rx", 4).attr("fill", cssVar(color) || color)
      .attr("width", (r) => Math.max(2, x(r.value)))
      .on("mousemove", function (evt, r) {
        showTooltip(evt, `<div class="t">${esc(r.label)}</div><div class="s">${esc(r.hint || r.value)}</div>`);
      })
      .on("mouseleave", hideTooltip);
    g.append("text").attr("class", "bar-label")
      .attr("x", (r) => labelWidth + x(r.value) + 6).attr("y", barH / 2 + 4)
      .text((r) => r.value);
  }

  function timelineChart(el, timeline) {
    // Dot plot: adoption year of each jurisdiction's primary law
    const width = 1120, height = 190, m = { l: 46, r: 16, t: 14, b: 28 };
    const years = d3.extent(timeline, (d) => d.year);
    const x = d3.scaleLinear([years[0] - 1, Math.max(years[1] + 1, 2026)], [m.l, width - m.r]);
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("width", "100%");

    // stack dots per year
    const byYear = d3.group(timeline, (d) => d.year);
    const rowsOut = [];
    byYear.forEach((list, year) => list.forEach((d, i) => rowsOut.push({ ...d, year: +year, level: i })));

    const axis = d3.axisBottom(x).tickFormat(d3.format("d")).ticks(12);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - m.b})`).call(axis);

    svg.selectAll("circle").data(rowsOut).join("circle")
      .attr("cx", (d) => x(d.year))
      .attr("cy", (d) => height - m.b - 14 - d.level * 18)
      .attr("r", 6.5)
      .attr("fill", (d) => cssVar(d.region === "APAC" ? "--series-1" : "--series-2"))
      .attr("stroke", cssVar("--surface-1")).attr("stroke-width", 2)
      .style("cursor", "pointer")
      .on("mousemove", (evt, d) =>
        showTooltip(evt, `<div class="t">${esc(d.jurisdiction)} · ${d.year}</div><div class="s">${esc(d.title)}</div>`))
      .on("mouseleave", hideTooltip)
      .on("click", (evt, d) => (location.hash = `#/jurisdiction/${d.code}`));

    // legend
    const leg = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
    [["APAC", "--series-1"], ["EMEA", "--series-2"]].forEach(([label, c], i) => {
      leg.append("circle").attr("cx", i * 90).attr("cy", 0).attr("r", 6).attr("fill", cssVar(c));
      leg.append("text").attr("x", i * 90 + 12).attr("y", 4).attr("class", "bar-label").text(label);
    });
  }

  function renderInsights() {
    const ins = state.insights;
    if (!ins) { view.innerHTML = '<div class="card">Insights not available.</div>'; return; }
    const newsItems = (state.news.items || []);

    view.innerHTML = `
      <div class="card"><h1>Insights</h1>
        <p class="muted small" style="margin-top:-6px">Aggregated from ${ins.total_jurisdictions} jurisdiction profiles and the live newsfeed. Rebuilt daily.</p>
        <div class="stat-row">
          <div class="stat-tile"><div class="label">Jurisdictions tracked</div><div class="value">${ins.total_jurisdictions}</div><div class="note">APAC ${Object.values(ins.status_by_region.APAC || {}).reduce((a, b) => a + b, 0)} · EMEA ${Object.values(ins.status_by_region.EMEA || {}).reduce((a, b) => a + b, 0)}</div></div>
          <div class="stat-tile"><div class="label">Comprehensive laws in force</div><div class="value">${ins.status_totals.comprehensive_law_in_force || 0}</div><div class="note">of ${ins.total_jurisdictions} tracked</div></div>
          <div class="stat-tile"><div class="label">Require breach notification</div><div class="value">${ins.obligations.breach_notification}</div><div class="note">jurisdictions</div></div>
          <div class="stat-tile"><div class="label">Require a DPO</div><div class="value">${ins.obligations.dpo_required}</div><div class="note">in at least some cases</div></div>
          <div class="stat-tile"><div class="label">News items (30 days)</div><div class="value">${newsItems.length}</div><div class="note">across all sources</div></div>
        </div>
      </div>
      <div class="card chart-card">
        <h2>When comprehensive laws took effect</h2>
        <p class="muted small">Each dot is a jurisdiction's primary data protection law, placed at its effective year. Click a dot to open the profile.</p>
        <div id="chartTimeline"></div>
      </div>
      <div class="chart-grid">
        <div class="card chart-card">
          <h2>Legal instruments by type</h2>
          <p class="muted small">Instruments in the Legal Texts Library (excluding repealed).</p>
          <div id="chartTypes"></div>
        </div>
        <div class="card chart-card">
          <h2>News activity by jurisdiction</h2>
          <p class="muted small">Newsfeed items in the last 30 days, top 10.</p>
          <div id="chartNews"></div>
        </div>
      </div>`;

    timelineChart("#chartTimeline", ins.adoption_timeline);

    const typeRows = Object.entries(ins.instrument_types)
      .sort((a, b) => b[1] - a[1])
      .map(([t, v]) => ({ label: INSTRUMENT_LABELS[t] || t, value: v }));
    hbar("#chartTypes", typeRows, { color: "--series-1", labelWidth: 110 });

    const newsRows = Object.entries(ins.news_activity_by_jurisdiction)
      .filter(([c]) => state.byCode[c])
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([c, v]) => ({ label: state.byCode[c].name, value: v }));
    hbar("#chartNews", newsRows, { color: "--series-2", labelWidth: 130 });
  }

  // ---------- legal texts library ----------
  function renderLibrary() {
    const all = [];
    state.jurisdictions.forEach((j) =>
      (j.legal_instruments || []).forEach((inst) => all.push({ jur: j, inst })));
    all.sort((a, b) => a.jur.name.localeCompare(b.jur.name) || a.inst.title.localeCompare(b.inst.title));
    const types = [...new Set(all.map((r) => r.inst.type))].sort();

    view.innerHTML = `
      <div class="card">
        <h1>Legal Texts Library</h1>
        <p class="muted small" style="margin-top:-6px">Every act, rule, regulation, order and circular tracked — each linking to its official government or regulator text. ${all.length} instruments.</p>
        <div class="chip-row" id="typeChips">
          <button class="chip active" data-t="all">All types</button>
          ${types.map((t) => `<button class="chip" data-t="${esc(t)}">${esc(INSTRUMENT_LABELS[t] || t)}</button>`).join("")}
        </div>
        <div class="table-wrap"><table class="lib">
          <thead><tr><th>Jurisdiction</th><th>Instrument</th><th>Type</th><th>Status</th><th>Date</th><th>Official text</th></tr></thead>
          <tbody id="libBody"></tbody>
        </table></div>
      </div>`;

    const body = document.getElementById("libBody");
    function draw(typeFilter) {
      const rows = typeFilter === "all" ? all : all.filter((r) => r.inst.type === typeFilter);
      body.innerHTML = rows.map(({ jur, inst }) => `
        <tr>
          <td><a href="#/jurisdiction/${jur.code}">${esc(jur.name)}</a></td>
          <td>${esc(inst.title)}</td>
          <td><span class="badge type">${esc(INSTRUMENT_LABELS[inst.type] || inst.type)}</span></td>
          <td><span class="badge inst-${esc(inst.status)}">${esc(INSTRUMENT_STATUS_LABELS[inst.status] || inst.status)}</span></td>
          <td>${fmtDate(inst.date)}</td>
          <td><a href="${esc(inst.official_text_url)}" target="_blank" rel="noopener">Open ↗</a></td>
        </tr>`).join("");
    }
    draw("all");
    document.getElementById("typeChips").querySelectorAll(".chip").forEach((b) =>
      b.addEventListener("click", () => {
        document.querySelectorAll("#typeChips .chip").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        draw(b.dataset.t);
      }));
  }

  // ---------- search ----------
  const searchInput = document.getElementById("search");
  const searchResults = document.getElementById("searchResults");
  function runSearch(q) {
    q = q.trim().toLowerCase();
    if (q.length < 2) { searchResults.classList.remove("open"); return; }
    const hits = [];
    state.jurisdictions.forEach((j) => {
      if (j.name.toLowerCase().includes(q) || j.code === q) {
        hits.push({ href: `#/jurisdiction/${j.code}`, title: j.name, kind: "Jurisdiction · " + j.region });
      }
      (j.legal_instruments || []).forEach((inst) => {
        if (inst.title.toLowerCase().includes(q)) {
          hits.push({ href: `#/jurisdiction/${j.code}`, title: inst.title, kind: (INSTRUMENT_LABELS[inst.type] || inst.type) + " · " + j.name });
        }
      });
    });
    searchResults.innerHTML = hits.slice(0, 12).map((h) =>
      `<a href="${h.href}"><span class="kind">${esc(h.kind)}</span>${esc(h.title)}</a>`).join("") ||
      '<a><span class="kind">No matches</span></a>';
    searchResults.classList.add("open");
  }
  searchInput.addEventListener("input", () => runSearch(searchInput.value));
  searchInput.addEventListener("focus", () => runSearch(searchInput.value));
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".searchbox")) searchResults.classList.remove("open");
  });
  searchResults.addEventListener("click", () => {
    searchResults.classList.remove("open");
    searchInput.value = "";
  });

  // ---------- boot ----------
  window.addEventListener("hashchange", route);
  loadAll().then(route).catch((e) => {
    view.innerHTML = `<div class="card">Failed to load data: ${esc(e.message)}</div>`;
  });
})();
