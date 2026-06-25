/* Bevölkerungsschutz-Lage Kanton Bern – Renderer
 * Lädt das Berichts-Manifest (data/index.json) und stellt den gewählten
 * Monatsbericht (data/<id>.json) dar. Reines Frontend, kein Build-Schritt.
 */
(function () {
  "use strict";

  const STATUS = {
    normal:         { label: "Voll leistungsfähig", cls: "status-normal",         dot: "#1d7a3f" },
    beobachtung:    { label: "Unter Beobachtung",    cls: "status-beobachtung",    dot: "#9a6b00" },
    eingeschraenkt: { label: "Eingeschränkt",        cls: "status-eingeschraenkt", dot: "#b5500f" },
    kritisch:       { label: "Kritisch",             cls: "status-kritisch",       dot: "#b21f24" },
  };

  const TREND = {
    steigend: { arrow: "↑", label: "Risiko steigend", cls: "steigend" },
    stabil:   { arrow: "→", label: "stabil",          cls: "stabil" },
    sinkend:  { arrow: "↓", label: "Risiko sinkend",  cls: "sinkend" },
  };

  const $ = (sel) => document.querySelector(sel);

  const els = {
    loading: $("#loading"),
    error: $("#error"),
    report: $("#report"),
    select: $("#report-select"),
    month: $("#report-month"),
    stand: $("#report-stand"),
    gesamtStufe: $("#gesamtlage-stufe"),
    gesamtBox: $("#gesamtlage"),
    gesamtText: $("#gesamtlage-text"),
    aktuelle: $("#aktuelle-lage"),
    wochen: $("#entwicklung-wochen"),
    tendenzen: $("#tendenzen"),
    sectorGrid: $("#sector-grid"),
    legend: $("#legend"),
    source: $("#report-source"),
  };

  function showError(msg) {
    els.loading.hidden = true;
    els.report.hidden = true;
    els.error.hidden = false;
    els.error.textContent = msg;
  }

  async function getJSON(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${url} (HTTP ${res.status})`);
    return res.json();
  }

  /** Wandelt einen Text oder ein Array von Absätzen/Listen in HTML. */
  function richHTML(content) {
    if (!content) return "";
    const blocks = Array.isArray(content) ? content : [content];
    return blocks.map((block) => {
      if (typeof block === "string") return `<p>${escapeHTML(block)}</p>`;
      if (block && block.liste && Array.isArray(block.liste)) {
        return `<ul>${block.liste.map((i) => `<li>${escapeHTML(i)}</li>`).join("")}</ul>`;
      }
      if (block && block.absatz) return `<p>${escapeHTML(block.absatz)}</p>`;
      return "";
    }).join("");
  }

  function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  function statusBadge(stufe) {
    const s = STATUS[stufe] || STATUS.normal;
    return `<span class="status-badge ${s.cls}">${escapeHTML(s.label)}</span>`;
  }

  function renderLegend() {
    els.legend.innerHTML = Object.values(STATUS).map((s) =>
      `<span class="legend-item"><span class="legend-dot" style="background:${s.dot}"></span>${s.label}</span>`
    ).join("");
  }

  function renderSectors(sektoren) {
    els.sectorGrid.innerHTML = (sektoren || []).map((sek) => {
      const st = STATUS[sek.status] || STATUS.normal;
      const tr = TREND[sek.trend] || TREND.stabil;
      return `
        <div class="sector-card" style="--bar:${st.dot}">
          <div class="sector-top">
            <div class="sector-name">
              <span class="ico" aria-hidden="true">${escapeHTML(sek.icon || "•")}</span>
              <h3>${escapeHTML(sek.name)}</h3>
            </div>
            <div class="sector-status-row">
              ${statusBadge(sek.status)}
              <span class="trend ${tr.cls}" title="${escapeHTML(tr.label)}">
                <span class="arrow">${tr.arrow}</span>${escapeHTML(tr.label)}
              </span>
            </div>
          </div>
          <div class="sector-body">
            ${assessBlock("global", "Weltweit", sek.global)}
            ${assessBlock("schweiz", "Schweiz", sek.schweiz)}
            ${assessBlock("bern", "Kanton Bern", sek.bern)}
          </div>
          ${sek.fazit ? `<div class="sector-fazit"><strong>Fazit:</strong> ${escapeHTML(sek.fazit)}</div>` : ""}
        </div>`;
    }).join("");
  }

  function assessBlock(cls, label, text) {
    if (!text) return "";
    return `<div class="assess">
      <span class="assess-label ${cls}">${escapeHTML(label)}</span>
      <p>${escapeHTML(text)}</p>
    </div>`;
  }

  function renderReport(rep) {
    els.month.textContent = rep.monat || rep.id;
    els.stand.textContent = rep.stand || "—";
    els.source.textContent = `data/${rep.id}.json`;

    const stufe = (rep.gesamtlage && rep.gesamtlage.stufe) || "normal";
    const s = STATUS[stufe] || STATUS.normal;
    els.gesamtStufe.className = `status-badge ${s.cls}`;
    els.gesamtStufe.textContent = (rep.gesamtlage && rep.gesamtlage.titel) || s.label;
    els.gesamtBox.style.borderColor = s.dot;
    els.gesamtText.textContent = (rep.gesamtlage && rep.gesamtlage.text) || "";

    els.aktuelle.innerHTML = richHTML(rep.aktuelleLage);
    els.wochen.innerHTML = richHTML(rep.entwicklungWochen);
    els.tendenzen.innerHTML = richHTML(rep.tendenzen);

    renderSectors(rep.sektoren);

    els.loading.hidden = true;
    els.error.hidden = true;
    els.report.hidden = false;
    document.title = `${rep.monat || rep.id} · Bevölkerungsschutz-Lage Kanton Bern`;
  }

  async function loadReport(id) {
    try {
      els.loading.hidden = false;
      els.report.hidden = true;
      const rep = await getJSON(`data/${id}.json`);
      renderReport(rep);
      if (history.replaceState) {
        history.replaceState(null, "", `#${id}`);
      }
    } catch (e) {
      showError(`Lagebericht konnte nicht geladen werden: ${e.message}`);
    }
  }

  async function init() {
    let manifest;
    try {
      manifest = await getJSON("data/index.json");
    } catch (e) {
      showError(`Berichtsübersicht konnte nicht geladen werden: ${e.message}. ` +
        `Bitte die Seite über einen Webserver öffnen (nicht direkt als Datei).`);
      return;
    }

    const reports = (manifest.berichte || []).slice().sort((a, b) => (a.id < b.id ? 1 : -1));
    if (!reports.length) {
      showError("Keine Lageberichte vorhanden.");
      return;
    }

    renderLegend();

    els.select.innerHTML = reports.map((r) =>
      `<option value="${escapeHTML(r.id)}">${escapeHTML(r.label || r.id)}</option>`
    ).join("");

    els.select.addEventListener("change", () => loadReport(els.select.value));

    // Tiefenlink via #id oder neuester Bericht
    const fromHash = location.hash.replace("#", "");
    const initial = reports.some((r) => r.id === fromHash) ? fromHash : reports[0].id;
    els.select.value = initial;
    await loadReport(initial);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
