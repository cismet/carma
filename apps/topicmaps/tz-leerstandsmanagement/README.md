# Teilzwilling Leerstandsmanagement

Mobile Erfassung von leerstehenden Ladenlokalen (wupp #4138, Datenschema aus wupp #4137). Läuft als PWA gegen den WuNDa-Cloud-Server; Standard ist die Testinstanz „rot“ (`https://wunda-rot-cloud.cismet.de/wunda/api`).

## Ablauf

Die Karte folgt dem Muster von `tz-baumbewirtschaftung`: ein Vektor-Layer (`CismapLayer`) mit Selektion, die `FeatureInfobox` aus `@carma-appframeworks/portals`, ein Dialog, der aus der Infobox heraus geöffnet wird, und ein Datenblatt-Modal.

1. Anmeldung mit WuNDa-Login (Domain `WUNDA_BLAU`).
2. Der Vektor-Layer zeigt die ALKIS-Gebäude (`tiles.cismet.de/alkis`, Source-Layer `building`) und die erfassten Leerstände (GeoJSON-Source, per `setData` befüllt). Ein Tipp auf ein Gebäude selektiert es und zeigt in der Infobox Adresse, Gebäudefunktion und Geschosszahl aus den Kachel-Attributen. Zum eigenen Standort geht es mit dem Locate-Control.
3. Das Plus-Symbol in der Infobox öffnet den Erfassungsdialog. Der angetippte Punkt wird als Geometrie übernommen, die Geschosszahl aus dem Gebäude vorgeschlagen, Adresse und Stadtbezirk (`kst_stadtbezirk`, nächste `adresse` als Rückfall) werden angezeigt. Für beides hat das Datenschema keine Spalten.
4. Fotos werden im Browser verkleinert (max. 1600 px, JPEG) und per WebDAV in den Ordner `leerstand/` des in `geoportal.files` konfigurierten Servers hochgeladen.
5. Der Datensatz wird mit einem verschachtelten Insert (`ls_info` + `ls_info_ls_foto` + `ls_foto`) über den cids-GraphQL-Proxy gespeichert.
6. Ein Tipp auf einen roten Punkt zeigt den Leerstand in der Infobox (mit Fotovorschau), das Info-Symbol öffnet das Datenblatt.

## Konfiguration

| Variable | Standard |
|---|---|
| `VITE_TZ_LEERSTANDSMANAGEMENT_REST_SERVICE` | `https://wunda-rot-cloud.cismet.de/wunda/api/` |
| `VITE_TZ_LEERSTANDSMANAGEMENT_DOMAIN` | `WUNDA_BLAU` |

Für die lokale Entwicklung kann `public/devSecrets.json` (git-ignoriert) mit `cheatingUser` und `cheatingPassword` angelegt werden.

## Nachschlagetabellen

Die App erwartet gefüllte Tabellen `ls_foto_art`, `ls_vorhanden`, `ls_nutzungsart` und `ls_gastronomie`. Die Zuordnung läuft über die Spalte `key`, die `id` ist egal. Auf „rot“ wurden sie am 09.09.2026 mit dieser Mutation angelegt (Werte aus wupp #4137):

```json
{"query":"mutation($fotoArt:[ls_foto_art_insert_input!]!,$vorhanden:[ls_vorhanden_insert_input!]!,$nutzungsart:[ls_nutzungsart_insert_input!]!,$gastronomie:[ls_gastronomie_insert_input!]!){ insert_ls_foto_art(objects:$fotoArt){ affected_rows } insert_ls_vorhanden(objects:$vorhanden){ affected_rows } insert_ls_nutzungsart(objects:$nutzungsart){ affected_rows } insert_ls_gastronomie(objects:$gastronomie){ affected_rows } }",
 "variables":{
  "fotoArt":[{"key":1,"name":"Außenansicht"},{"key":2,"name":"Zuweg/Umgebung links"},{"key":3,"name":"Zuweg/Umgebung rechts"},{"key":4,"name":"Innen"}],
  "vorhanden":[{"key":1,"name":"Ja"},{"key":2,"name":"Nein"},{"key":3,"name":"unbekannt"}],
  "nutzungsart":[{"key":1,"name":"Einzelhandel"},{"key":2,"name":"Gastronomie mit Großküche (bspw. Systemgastronomie)"},{"key":3,"name":"Gastronomie ohne Großküche (bspw. Café)"},{"key":4,"name":"Dienstleistung - Handwerk"},{"key":5,"name":"Dienstleistung - Büro"},{"key":6,"name":"Praxisfläche/Gesundheit/Kosmetik"},{"key":7,"name":"Kunst-/Kulturangebot"},{"key":8,"name":"Unbekannt"}],
  "gastronomie":[{"key":1,"name":"Ja"},{"key":2,"name":"Nein"},{"key":3,"name":"Unklar"}]
 }}
```

## Besonderheiten des GraphQL-Proxys

- `returning` in Mutationen wird abgelehnt, deshalb wird die neue `ls_info`-Zeile über `erfasser` und `letzte_aenderung_zeit` (Millisekunden) zurückgelesen und der cids-Array-Schlüssel (`fotos`, `ls_info_reference`) danach auf die echte `id` gesetzt.
- Objekt-Literale in Mutationen werden vom Proxy verändert, Geometrien und verschachtelte Inserts gehen daher immer über `variables`.
- `_st_d_within` ist nicht nutzbar, die Adresssuche verwendet `_st_intersects` mit einem Quadrat um den Punkt.
- `alkis_gebaeude` hat keine abfragbare Geometrie, der Weg zum Gebäude führt über `alkis_adresse` (Straßenschlüssel in Klammern plus Hausnummer).

## Entwicklung

```bash
npx nx run tz-leerstandsmanagement:serve
```
