# Bevölkerungsschutz-Lage Kanton Bern

Statische Webseite zur **monatlichen Darstellung der Bevölkerungsschutz-Lage** im Kanton Bern.
Sie zeigt je Berichtsmonat:

- die **aktuelle Lage**,
- die **Entwicklung der letzten Wochen**,
- die **Entwicklungstendenzen für den nächsten Monat** sowie
- eine **Einschätzung der Auswirkungen** aktueller Entwicklungen **weltweit, in der Schweiz und im Kanton Bern** auf die Leistungsfähigkeit der Versorgungssektoren:
  Wasserversorgung · Lebensmittelversorgung · Medizinische Versorgung · Energieversorgung · Mobilität · Bargeldversorgung und Zahlungsverkehr · Kommunikation · Unterbringung · Sicherheit.

> **Hinweis:** Die mitgelieferten Inhalte sind *illustrative Beispieldaten* und stellen keine offizielle Lagebeurteilung dar.

## Aufbau

```
index.html              Einstiegsseite / Layout
assets/css/styles.css   Gestaltung
assets/js/app.js         Lädt Manifest + Bericht und rendert die Seite
data/index.json          Manifest: Liste aller verfügbaren Berichte (Dropdown)
data/JJJJ-MM.json        Ein Lagebericht pro Monat
data/_vorlage.json       Kopiervorlage für einen neuen Monat
```

Die Seite ist rein statisch – **kein Build-Schritt, kein Backend**. Sie läuft auf jedem
Webserver (z. B. GitHub Pages) sowie lokal über einen einfachen HTTP-Server.

## Lokal ausführen

Wegen `fetch()` auf die JSON-Dateien muss die Seite über einen Webserver geöffnet werden
(nicht per Doppelklick als `file://`):

```bash
python3 -m http.server 8000
# danach im Browser: http://localhost:8000
```

## Monatliche Aktualisierung (in 3 Schritten)

1. **Neue Datei anlegen:** `data/_vorlage.json` kopieren nach `data/JJJJ-MM.json`
   (z. B. `data/2026-07.json`) und die Felder ausfüllen.
2. **Manifest ergänzen:** in `data/index.json` einen neuen Eintrag **zuoberst** hinzufügen:
   ```json
   { "id": "2026-07", "label": "Juli 2026" }
   ```
   Der neueste Bericht wird automatisch beim Öffnen angezeigt; ältere bleiben über das
   Dropdown abrufbar.
3. **Veröffentlichen:** Änderungen committen und pushen.

### Statuswerte (Leistungsfähigkeit)

| Wert | Bedeutung |
|------|-----------|
| `normal` | Voll leistungsfähig |
| `beobachtung` | Unter Beobachtung / leicht beeinträchtigt |
| `eingeschraenkt` | Eingeschränkt |
| `kritisch` | Kritisch |

### Trend (Risikoentwicklung)

| Wert | Bedeutung |
|------|-----------|
| `steigend` | Risiko steigend (↑) |
| `stabil` | unverändert (→) |
| `sinkend` | Risiko sinkend (↓) |

### Inhaltsfelder je Bericht

- `monat`, `stand`: Anzeigetexte für Titel und Stand-Datum.
- `gesamtlage.stufe` / `.titel` / `.text`: Gesamtbeurteilung (Stufe steuert die Farbe).
- `aktuelleLage`, `entwicklungWochen`, `tendenzen`: je ein Array aus Strings (Absätze)
  und/oder Listen-Objekten `{ "liste": ["…", "…"] }`.
- `sektoren[]`: pro Sektor `status`, `trend` sowie die Einschätzungen
  `global` (weltweit), `schweiz`, `bern` und ein `fazit`.

## Automatisierung (KI-gestützter Entwurf)

Der monatliche Bericht kann als **Entwurf automatisch generiert** werden. Mechanik
(Datei anlegen, Manifest ergänzen, PR öffnen) und Inhalt sind dabei getrennt: die
KI liefert einen **Entwurf**, der vor der Veröffentlichung fachlich geprüft und
freigegeben werden muss. Es wird **nichts automatisch veröffentlicht**.

### Bestandteile

```
scripts/generate-report.mjs              Generator (Node.js)
.github/workflows/monatlicher-lagebericht.yml   Geplanter Workflow (Cron + manuell)
package.json                             Abhängigkeit: @anthropic-ai/sdk
```

### Funktionsweise

1. **Recherche** – die Claude-API erstellt mit aktivierter **Websuche** eine
   quellengestützte Lagebeurteilung (weltweit / Schweiz / Kanton Bern, alle Sektoren).
2. **Strukturierung** – das Ergebnis wird über *Structured Outputs* in das strikte
   JSON-Schema der Seite überführt und als `data/<jahr-monat>.json` mit
   `"entwurf": true` geschrieben (die Seite zeigt dazu ein „Entwurf"-Badge).
3. **Pull Request** – der Workflow öffnet einen PR. Erst nach fachlicher Prüfung,
   Korrektur und Freigabe wird gemergt (und `"entwurf"` entfernt).

### Lokal ausführen

```bash
npm install
ANTHROPIC_API_KEY=… npm run generate            # aktueller Monat
ANTHROPIC_API_KEY=… node scripts/generate-report.mjs 2026-07   # bestimmter Monat
```

Optional: `LAGE_MODEL` setzt das verwendete Claude-Modell (Standard: aktuelles Modell).

### Automatischer Betrieb (GitHub Actions)

- **Secret hinterlegen:** Repo → *Settings → Secrets and variables → Actions* →
  `ANTHROPIC_API_KEY` anlegen.
- Der Workflow läuft am **1. jedes Monats** automatisch und kann unter
  *Actions → Monatlicher Lagebericht* auch manuell gestartet werden (mit optionaler
  Monatsangabe `JJJJ-MM`).
- Ergebnis ist jeweils ein **Pull Request mit dem Entwurf** – Review und Merge bleiben
  in menschlicher Hand.

> **Wichtig:** Eine vollautomatische Veröffentlichung ohne Review ist für
> Lageinhalte bewusst nicht vorgesehen.

## Lizenz / Verwendung

Frei verwendbares Grundgerüst. Vor produktivem Einsatz sind die Inhalte durch die
zuständige Fachstelle zu verifizieren und freizugeben.
