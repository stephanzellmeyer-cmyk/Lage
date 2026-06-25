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

## Lizenz / Verwendung

Frei verwendbares Grundgerüst. Vor produktivem Einsatz sind die Inhalte durch die
zuständige Fachstelle zu verifizieren und freizugeben.
