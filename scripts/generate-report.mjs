#!/usr/bin/env node
/**
 * KI-gestützter Entwurfsgenerator für die Bevölkerungsschutz-Lage Kanton Bern.
 *
 * Ablauf (zwei Phasen):
 *   1. Recherche  – die Claude-API mit aktivierter Websuche erstellt eine
 *                   quellen­gestützte Lagebeurteilung (weltweit / Schweiz / Bern).
 *   2. Strukturierung – das Rechercheergebnis wird über Structured Outputs in
 *                   das strikte JSON-Schema der Webseite überführt.
 *
 * Das Ergebnis ist ein ENTWURF (data/<jahr-monat>.json) und muss vor der
 * Veröffentlichung fachlich geprüft und freigegeben werden.
 *
 * Aufruf:
 *   ANTHROPIC_API_KEY=… node scripts/generate-report.mjs            # aktueller Monat
 *   ANTHROPIC_API_KEY=… node scripts/generate-report.mjs 2026-07    # bestimmter Monat
 *   LAGE_MONTH=2026-07 node scripts/generate-report.mjs             # via Umgebungsvariable
 */

import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

// Standardmodell für die automatische Berichtserstellung. Überschreibbar via
// Umgebungsvariable LAGE_MODEL (z. B. im GitHub-Actions-Workflow als
// Repository-Variable LAGE_MODEL konfigurierbar, ohne diese Datei zu ändern).
const STANDARD_MODELL = "claude-sonnet-5";
const MODEL = process.env.LAGE_MODEL || STANDARD_MODELL;

const DATA_DIR = path.resolve(fileURLToPath(import.meta.url), "../../data");

const MONATE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const STATUS = ["normal", "beobachtung", "eingeschraenkt", "kritisch"];
const TREND = ["steigend", "stabil", "sinkend"];

// Kanonische Sektorliste – Reihenfolge, Namen und Icons sind fix.
const SEKTOREN = [
  { id: "wasser",        name: "Wasserversorgung",                      icon: "💧" },
  { id: "lebensmittel",  name: "Lebensmittelversorgung",                icon: "🥖" },
  { id: "medizin",       name: "Medizinische Versorgung",               icon: "🏥" },
  { id: "energie",       name: "Energieversorgung",                     icon: "⚡" },
  { id: "mobilitaet",    name: "Mobilität",                             icon: "🚆" },
  { id: "bargeld",       name: "Bargeldversorgung und Zahlungsverkehr", icon: "💳" },
  { id: "kommunikation", name: "Kommunikation",                         icon: "📡" },
  { id: "unterbringung", name: "Unterbringung",                         icon: "🏠" },
  { id: "sicherheit",    name: "Sicherheit",                            icon: "🛡️" },
];

const client = new Anthropic();

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function resolveMonth() {
  const arg = process.argv[2] || process.env.LAGE_MONTH || "";
  let year, month;
  if (/^\d{4}-\d{2}$/.test(arg)) {
    [year, month] = arg.split("-").map(Number);
  } else {
    const now = new Date();
    year = now.getUTCFullYear();
    month = now.getUTCMonth() + 1;
  }
  if (month < 1 || month > 12) throw new Error(`Ungültiger Monat: ${arg}`);
  const id = `${year}-${String(month).padStart(2, "0")}`;
  const label = `${MONATE[month - 1]} ${year}`;
  return { id, label, monthIndex: month - 1, year };
}

function standDatum() {
  const d = new Date();
  return `${d.getUTCDate()}. ${MONATE[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Rollierendes Vier-Wochen-Fenster bis heute, als Text für den Recherche-Prompt. */
function vierWochenFenster() {
  const bis = new Date();
  const von = new Date(bis.getTime() - 28 * 24 * 60 * 60 * 1000);
  const fmt = (d) => `${d.getUTCDate()}. ${MONATE[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return `${fmt(von)} bis ${fmt(bis)}`;
}

function textBlocks(message) {
  return message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

// ---------------------------------------------------------------------------
// Phase 1 – Recherche mit Websuche
// ---------------------------------------------------------------------------

async function recherche(monatLabel) {
  const sektorenListe = SEKTOREN.map((s) => `- ${s.name}`).join("\n");
  const fenster = vierWochenFenster();

  const system =
    "Du bist Lageanalyst:in im Bevölkerungsschutz des Kantons Bern (Schweiz). " +
    "Du erstellst eine sachliche, nüchterne und faktenbasierte Lagebeurteilung, " +
    "gestützt auf OSINT-Quellen: Nachrichtenmedien, offizielle Kanäle von Behörden " +
    "und Betreibern sowie Social Media. Du fokussierst konsequent auf konkrete " +
    "Ereignisse, Vorfälle und Berichterstattung der letzten vier Wochen – nicht auf " +
    "strukturelle Dauerthemen. Beschlossene oder angekündigte Massnahmen, Programme " +
    "oder Investitionen, deren Wirkung erst in mehreren Monaten oder Jahren eintritt, " +
    "lässt du unabhängig von ihrer Aktualität in der Berichterstattung weg – auch " +
    "wenn kürzlich darüber berichtet wurde. Du unterscheidest klar zwischen " +
    "gesicherten Fakten und Einschätzungen. Keine Panikmache, keine Spekulation.";

  const user =
    `Erstelle eine recherchierte Lagebeurteilung für den Berichtsmonat ${monatLabel} ` +
    `zur Bevölkerungsschutz-Lage im Kanton Bern.\n\n` +
    `ZEITFENSTER: Berücksichtige ausschliesslich Ereignisse und Berichterstattung aus ` +
    `den letzten vier Wochen (${fenster}). Suche gezielt nach aktuellen Nachrichten, ` +
    `Medienberichten, Meldungen von Behörden/Betreibern und Social-Media-Beiträgen aus ` +
    `diesem Zeitraum.\n\n` +
    `WAS NICHT EINFLIESSEN SOLL:\n` +
    `- Rein strukturelle oder langfristige Themen (z. B. Versorgungsindizes, ` +
    `mehrjährige Investitions- oder Ausbauprogramme, internationale Abkommen), sofern ` +
    `sie nicht durch ein konkretes Ereignis der letzten vier Wochen ausgelöst wurden.\n` +
    `- Beschlüsse, Ankündigungen oder Massnahmen, deren Wirkung erst in einigen Monaten ` +
    `oder Jahren eintritt (z. B. Bauprojekte, Gesetzesänderungen mit späterem ` +
    `Inkrafttreten, Reservekraftwerk- oder Netzausbauprojekte) – auch wenn die Meldung ` +
    `dazu aktuell ist.\n` +
    `- Umfrage- oder Stimmungsergebnisse ohne unmittelbaren Bezug zu einem Ereignis der ` +
    `letzten vier Wochen.\n\n` +
    `Recherchiere mit der Websuche und beurteile:\n` +
    `1. Die aktuelle Lage – gestützt auf Ereignisse der letzten vier Wochen.\n` +
    `2. Die Entwicklung der letzten Wochen – als zeitlicher Verlauf konkreter Ereignisse.\n` +
    `3. Die Entwicklungstendenzen für den nächsten Monat – als direkte Fortschreibung ` +
    `der beobachteten aktuellen Entwicklung, nicht als struktureller Ausblick.\n` +
    `4. Für jeden der folgenden Versorgungssektoren die Auswirkungen der aktuellen, ` +
    `in den letzten vier Wochen beobachteten Entwicklungen jeweils WELTWEIT, in der ` +
    `SCHWEIZ und im KANTON BERN auf die Leistungsfähigkeit, sowie ein kurzes Fazit und ` +
    `eine Einstufung (voll leistungsfähig / unter Beobachtung / eingeschränkt / ` +
    `kritisch) und eine Risikotendenz (steigend / stabil / sinkend). Wenn es für einen ` +
    `Sektor keine relevante aktuelle Entwicklung gibt, halte das kurz fest, statt auf ` +
    `strukturelle Themen auszuweichen:\n` +
    `${sektorenListe}\n\n` +
    `Gib eine strukturierte, ausführliche Lagebeurteilung in Deutsch aus. ` +
    `Nenne Quellen und deren Datum, wo möglich.`;

  const messages = [{ role: "user", content: user }];

  for (let i = 0; i < 6; i++) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      system,
      thinking: { type: "adaptive" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
      messages,
    });
    const message = await stream.finalMessage();

    if (message.stop_reason === "pause_turn") {
      // Server-Tool-Schleife pausiert – Antwort anhängen und fortsetzen.
      messages.push({ role: "assistant", content: message.content });
      continue;
    }

    const text = textBlocks(message);
    if (!text.trim()) throw new Error("Recherche lieferte keinen Text.");
    return text;
  }
  throw new Error("Recherche wurde nach mehreren Fortsetzungen nicht abgeschlossen.");
}

// ---------------------------------------------------------------------------
// Phase 2 – Strukturierung in striktes JSON
// ---------------------------------------------------------------------------

function schema() {
  const absatzArray = { type: "array", items: { type: "string" } };
  const sektorSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      id: { type: "string", enum: SEKTOREN.map((s) => s.id) },
      status: { type: "string", enum: STATUS },
      trend: { type: "string", enum: TREND },
      global: { type: "string" },
      schweiz: { type: "string" },
      bern: { type: "string" },
      fazit: { type: "string" },
    },
    required: ["id", "status", "trend", "global", "schweiz", "bern", "fazit"],
  };
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      gesamtlage: {
        type: "object",
        additionalProperties: false,
        properties: {
          stufe: { type: "string", enum: STATUS },
          titel: { type: "string" },
          text: { type: "string" },
        },
        required: ["stufe", "titel", "text"],
      },
      aktuelleLage: absatzArray,
      entwicklungWochen: absatzArray,
      tendenzen: absatzArray,
      sektoren: { type: "array", items: sektorSchema },
    },
    required: ["gesamtlage", "aktuelleLage", "entwicklungWochen", "tendenzen", "sektoren"],
  };
}

async function strukturieren(monatLabel, rechercheText) {
  const system =
    "Du wandelst eine Lagebeurteilung in striktes JSON gemäss dem vorgegebenen Schema um. " +
    "Schreibe in sachlichem Deutsch. Pro Sektor je 1–2 prägnante Sätze für 'global', 'schweiz', " +
    "'bern' und 'fazit'. 'aktuelleLage', 'entwicklungWochen' und 'tendenzen' jeweils als Liste " +
    "kurzer Absätze. Liefere alle neun Sektoren. Übernimm nur Inhalte, die sich auf konkrete " +
    "Ereignisse der letzten vier Wochen stützen; strukturelle Dauerthemen oder Massnahmen mit " +
    "erst langfristiger Wirkung, die in der Vorlage dennoch vorkommen, lässt du weg, statt sie " +
    "zu übernehmen.";

  const user =
    `Berichtsmonat: ${monatLabel}\n\n` +
    `Wandle die folgende Lagebeurteilung in das geforderte JSON um:\n\n${rechercheText}`;

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    system,
    thinking: { type: "adaptive" },
    output_config: { format: { type: "json_schema", schema: schema() } },
    messages: [{ role: "user", content: user }],
  });
  const message = await stream.finalMessage();
  const text = textBlocks(message);
  return JSON.parse(text);
}

// ---------------------------------------------------------------------------
// Zusammenbau & Persistenz
// ---------------------------------------------------------------------------

function baueBericht({ id, label }, strukturiert) {
  const sektorMap = new Map((strukturiert.sektoren || []).map((s) => [s.id, s]));
  const sektoren = SEKTOREN.map((basis) => {
    const k = sektorMap.get(basis.id);
    if (!k) throw new Error(`Sektor fehlt im KI-Ergebnis: ${basis.id}`);
    return {
      id: basis.id,
      name: basis.name,
      icon: basis.icon,
      status: k.status,
      trend: k.trend,
      global: k.global,
      schweiz: k.schweiz,
      bern: k.bern,
      fazit: k.fazit,
    };
  });

  return {
    id,
    monat: label,
    stand: standDatum(),
    entwurf: true,
    gesamtlage: strukturiert.gesamtlage,
    aktuelleLage: strukturiert.aktuelleLage,
    entwicklungWochen: strukturiert.entwicklungWochen,
    tendenzen: strukturiert.tendenzen,
    sektoren,
  };
}

async function aktualisiereManifest({ id, label }) {
  const manifestPfad = path.join(DATA_DIR, "index.json");
  const manifest = JSON.parse(await readFile(manifestPfad, "utf8"));
  manifest.berichte = manifest.berichte || [];
  if (!manifest.berichte.some((b) => b.id === id)) {
    manifest.berichte.unshift({ id, label });
    manifest.berichte.sort((a, b) => (a.id < b.id ? 1 : -1));
    await writeFile(manifestPfad, JSON.stringify(manifest, null, 2) + "\n");
  }
}

// ---------------------------------------------------------------------------
// Hauptablauf
// ---------------------------------------------------------------------------

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Umgebungsvariable ANTHROPIC_API_KEY ist nicht gesetzt.");
  }
  const monat = resolveMonth();
  console.log(`▶ Generiere Entwurf für ${monat.label} (${monat.id}) …`);
  console.log(`  Modell: ${MODEL}${process.env.LAGE_MODEL ? " (via LAGE_MODEL überschrieben)" : " (Standard)"}`);

  console.log("  1/3  Recherche mit Websuche …");
  const rechercheText = await recherche(monat.label);

  console.log("  2/3  Strukturierung in JSON …");
  const strukturiert = await strukturieren(monat.label, rechercheText);

  console.log("  3/3  Schreiben der Dateien …");
  const bericht = baueBericht(monat, strukturiert);
  const zielPfad = path.join(DATA_DIR, `${monat.id}.json`);
  await writeFile(zielPfad, JSON.stringify(bericht, null, 2) + "\n");
  await aktualisiereManifest(monat);

  console.log(`✓ Entwurf geschrieben: data/${monat.id}.json`);
  console.log("  ⚠ KI-generierter Entwurf – vor Veröffentlichung fachlich prüfen und freigeben.");
}

main().catch((err) => {
  console.error("✗ Fehler:", err.message);
  process.exit(1);
});
