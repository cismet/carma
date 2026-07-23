# Raumbezug und Szenentransformation

Stand: 17. Juli 2026. Dieses Dokument ist das prüfbare Raumbezugsregister der multimodalen Pointcloud-Szene. Es trennt Quellangaben, angewandte Transformationen, lokale Korrekturen und noch offene Annahmen.

## Kanonischer Szenenraum

Georeferenzierte 3D-Geometrie wird zuerst nach `EPSG:4978` (WGS 84, geozentrisches ECEF in Metern) transformiert. Die Three.js-Szene ist danach nur ein lokales kartesisches Darstellungsframe:

- Ursprung: ein dokumentierter ECEF-Anker mit ellipsoidischer Höhe;
- `+X`: lokal Ost, `+Y`: lokal oben, `+Z`: lokal Süd;
- Transformation: Inverse des `OBJECT_FRAME` von `3d-tiles-renderer`/`ReorientationPlugin`, anschließend Rotation um π um die lokale Y-Achse;
- keine lokale Szene-Y-Koordinate ist für sich eine amtliche Höhe.

Der gemeinsame Rechenweg steht in [`ecef-scene-frame.ts`](../src/components/ecef-scene-frame.ts). Mesh und Kontrollpunkte verwenden damit dieselbe ECEF→Szene-Matrix. Eine Höhenangabe für einen beliebigen Szenentreffer wird erst nach der Rücktransformation nach ECEF aus dem WGS84-Ellipsoid bestimmt.

### Abgrenzung zur MapLibre-Pointcloud-Route

Die Geoportal-Route `/#/pointcloud` verwendet horizontal MapLibre-Web-Mercator (`EPSG:3857`) und ein lokales Ost/Oben/Süd-Frame. Ihre Z-Werte folgen dagegen dem aktiven DGM1-Terrainprovider und damit numerischen DHHN2016-Höhen. Ellipsoidische Punktquellen werden dort mit `H = h - zeta_GCG2016` abgesenkt; das Terrain-RGB-Decoding bleibt unverändert. Die eigenständige Three.js-Szene bleibt dagegen im ECEF-/Ellipsoidrahmen. Assetstatus und empirische AWG2-Registrierung stehen in [`docs/pointcloud-data.md`](../../ng-topicmap-playground/docs/pointcloud-data.md) dokumentiert.

Für AWG2 ist die datumbezogene Absenkung am Anker exakt `-46,499918254 m`; sie bleibt getrennt von der empirischen starren Registrierung. Für Mesh 2024 darf nach der ECEF-Reorientierung dagegen kein weiterer GCG2016-Offset angewandt werden: Der zuvor zusätzlich subtrahierte Wert setzte das Mesh sichtbar rund 46 m zu tief. Der veröffentlichte Root-ECEF-Anker ergibt `h = 207,598429 m`; mit `zeta_GCG2016 = 46,596670 m` entspricht dies numerisch `H_DHHN2016 = 161,001759 m`. Weil die ursprüngliche Höhenbehandlung der sichtbaren Meshvertices nicht vollständig belegt ist, bleibt die jetzige Übereinstimmung eine dokumentierte empirische Montage und keine Datums-Garantie. Dasselbe gilt verstärkt für Mesh 2020.

## Assetregister

| Asset               | Native Deklaration und Beleg                                                                                                                                                                       | Transformation in die Szene                                                                                                                              | Korrekturen                                                            | Verwendungsstatus                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Mesh 2024           | Root-Metadaten: Ziel `EPSG:4978`; Original-WKT: `EPSG:25832` + `EPSG:7837`, `GCG2016.gtx`; geprüfter Root-JSON-Snapshot SHA-256 `66e520a51050d750f5a62397015c5917999712c48d6d166044b8b0ff01d2cec2` | ECEF-Inhalt wird durch `ReorientationPlugin` in das lokale Frame gesetzt. Der deklarierte Root-Ursprung wurde mit GCG2016 auf unter 1 mm reproduziert    | nur Achsenkonvention `X Ost / Y oben / Z Süd`, kein freier Höhenoffset | technisches Szenenframe bestätigt; Aufnahme-/Erzeugungsepoche und absolute Genauigkeit nicht belegt |
| NIV-Punkte          | Objektweise `EPSG:25832`; Feld `hoehe_ueber_nhn2016` = DHHN2016. Verwendeter Quellsnapshot SHA-256 `038c22bbafdbcdad33b8e85e75e90104fb70949ff88fa3940529314f4b6c0ef9`                              | offline `EPSG:25832+7837` → GCG2016 → ellipsoidische Höhe → `EPSG:4978`; im Browser ausschließlich vorab berechnetes ECEF, danach gemeinsame Mesh-Matrix | keine visuelle oder freie Höhenkorrektur                               | Quellreferenz und Rechenweg bestätigt; physische Punktgenauigkeit und WGS84-Epoche nicht garantiert |
| Panorama-Posen      | `reference.csv` benennt Breite/Länge und `altitude_ellipsoidal`, aber kein vollständiges CRS, keine Realisierung/Epoche                                                                            | derzeit lokale UTM-Differenzen und deklarationslose Posefelder                                                                                           | `PANO-HEADING-2024-v1` plus lokale Mikro-Pose                          | teilbestätigt; nicht als geodätische Referenz verwenden                                             |
| Planar 2/3          | wie Panorama; `projectedZ` ohne belegtes Vertikaldatum                                                                                                                                             | derzeit `projectedZ` als angenommene DHHN2016-Höhe, dann verlustfreie GCG2016-Rasterinterpolation und lokale Szene                                       | lokale Posekorrekturen                                                 | aktuelle 3D-Platzierung unbestätigt                                                                 |
| Georadar            | LAS-GeoKey `EPSG:32632`; abgeleitete Manifeste nennen widersprüchlich `EPSG:25832`; Z ist relative Tiefe                                                                                           | lokale Trajektoriengeometrie, Mesh-Raycast und frei gesetzter Oberflächenanker                                                                           | lokale entlang/rechts/unten-Korrektur                                  | Quarantäne/Diagnose; kein bestätigter absoluter Raumbezug                                           |
| DGM 2020 / DSM 2024 | Service- und Ressourcennamen, aber noch keine unveränderlich zugeordnete Build-/CRS-Provenienz                                                                                                     | angenommene DHHN2016-Zahlen, anschließend verlustfreie GCG2016-Rasterinterpolation                                                                       | Profilglättung und relativer Bezug                                     | unbestätigte Diagnosequelle                                                                         |
| basemap.de-Straßen  | versionierter WGS84-2D-Snapshot ohne Höhe                                                                                                                                                          | nur semantische Zuordnung; konstantes Szene-Y ist keine Georeferenzierung                                                                                | keine                                                                  | horizontal bestätigt, vertikal nicht anwendbar                                                      |

### Ressourcenweite Panorama-Orientierung

`PANO-HEADING-2024-v1` addiert **+2,3° Bearing** zu jeder Pose aus der Panorama-`reference.csv`, bevor lokale oder interpolierte Mikro-Korrekturen angewendet werden. Der Wert dokumentiert einen vom Bediener beobachteten, gemeinsamen Bias der Bildserie gegen das Mesh 2024; er wurde nicht unabhängig vermessen. Er ist deshalb eine dokumentierte Ressourcen-Korrektur, keine nachgewiesene Sensor- oder CRS-Transformation.

Insbesondere ist der Wert nicht die UTM-Grid-North-Korrektur. PROJ 9.8.1 ergibt für `+proj=utm +zone=32 +ellps=GRS80` über die Bounds der multimodalen Befahrung von `7,1318586563° E, 51,2555352413° N` bis `7,1425448676° E, 51,2626900255° N` eine Meridiankonvergenz von **−1,4573° bis −1,4491°**. Betrag und angewandtes Vorzeichen erklären die beobachteten +2,3° nicht. Die Heading-Konvention beziehungsweise Kalibrierung der gelieferten Sensorpose muss weiterhin durch den Datenlieferanten belegt werden.

## Offline-Transformation der NIV-Punkte

Für die NIV-Punkte lädt der Browser kein Geoid-/Quasigeoid-Grid. Ihr abgeleitetes Artefakt wird einmalig erzeugt:

```bash
node playgrounds/pointcloud-stories/scripts/derive-niv-ecef.mjs \
  --source /pfad/zum/unveraenderten/nivP.json \
  --output playgrounds/pointcloud-stories/.data/derived/niv-control-points/niv-points-ecef.json
```

Die Transformation ist explizit und nicht von einer zur Laufzeit ausgewählten PROJ-Operation abhängig:

```text
+proj=pipeline
+step +inv +proj=utm +zone=32 +ellps=GRS80
+step +proj=vgridshift +grids=de_bkg_gcg2016.tif +multiplier=1
+step +proj=cart +ellps=WGS84
```

Der aktuelle Lauf verwendet PROJ 9.8.1 und `de_bkg_gcg2016.tif` mit SHA-256 `598f18324dea7f8e72421d18add7ac6228259adf91eeb335cc9c27d98484f7ac`. Von 3.322 Quellobjekten sind 2.622 mit explizitem `EPSG:25832`, endlicher DHHN2016-Höhe und nichtnulliger Höhe transformierbar. 700 Datensätze bleiben im Artefakt mit Ablehnungsgrund erhalten. Der gemessene maximale Hin-und-zurück-Fehler des aktuellen Laufs beträgt horizontal `2,81 × 10⁻⁹ m` und vertikal `3,69 × 10⁻⁹ m` bei einer Abbruchgrenze von `10⁻⁵ m`.

Das Artefakt speichert Quelle, Quell-Hash, Bytezahl, Datensatzanzahl, PROJ-Version, Pipeline, Grid-Hash, Transformationsstatus, ellipsoidische Höhe und ECEF pro Punkt. Damit ist keine Online-Höhentransformation notwendig.

## Gekachelte Laufzeittransformation

Andere punktuelle DHHN2016-Werte, etwa Terrainprofil-Samples oder die derzeit als DHHN2016 angenommenen `projectedZ`-Werte der Planarbilder, verwenden den gemeinsamen Helper in `@carma-geo/proj`. Er enthält die originalen GCG2016-Float32-Rasterwerte für `[6°, 10°) Ost × [50°, 54°) Nord` in vier einzeln lazy ladbaren 2°-Kacheln ohne duplizierten Pixel-Halo. Bei internen Kachelgrenzen lädt der Helper nur die tatsächlich benötigte Nachbarkachel. Die bilineare Interpolation entspricht ohne zusätzlichen Modellfehler dem GDAL-Referenzweg. NoData und Koordinaten außerhalb der Region werden abgelehnt statt geklemmt oder extrapoliert.

Ableitung, Quell-Hash, Rasterparameter, 391.281 GDAL-Vergleichspunkte und die gemessene maximale numerische Differenz von `9,237055564881302 × 10⁻¹⁴ m` sind in [`GCG2016-Kacheln`](../../../libraries/commons/resources/src/lib/de/gcg2016/README.md) dokumentiert. Dieser Laufzeitweg ändert nicht die strengere, vollständig offline berechnete NIV-Provenienz.

## Was damit garantiert ist – und was nicht

Garantiert werden kann:

1. Derselbe Quellsnapshot, dieselbe Grid-Prüfsumme und dieselbe Pipeline erzeugen dieselben vollständig nachvollziehbaren ECEF-Koordinaten.
2. Jeder als `transformed` markierte Punkt wird ohne weitere Höhenannahme in genau dasselbe lokale Frame wie der Mesh-Tileset montiert.
3. Der Build bricht bei fehlendem Grid, strukturell ungültiger Quelle, Zeilenverlust oder überschrittener Roundtrip-Toleranz ab. Objekte mit falschem CRS oder ungültiger Höhe bleiben mit explizitem Ablehnungsgrund im Artefakt.

Nicht garantiert werden kann:

- dass die amtliche Punktkoordinate die physische Bolzenkante heute ohne Messfehler repräsentiert;
- dass Mesh-Geometrie und -Textur absolut zentimetergenau sind;
- eine epochengenaue ETRS89↔WGS84-Abbildung, weil die Quelle keine Koordinatenepoche liefert.

PROJ weist für die vertikale GCG2016-Operation 0,1 m und für die vollständige gewählte Transformation nach WGS84-ECEF 1,1 m Genauigkeit aus. Diese Operationsangaben sind keine Schätzung des konkreten NIV-Punktfehlers. Deshalb lautet der belastbare Status: **rechnerisch und szenentechnisch verifiziert, nicht absolut geodätisch garantiert**.

## Korrekturregister

Korrekturen dürfen die native Deklaration nie überschreiben. Jede dauerhafte Korrektur braucht künftig eine ID, betroffenes Asset/Hash, Motivation, Parameter, Einheit, Richtung, Erzeuger, Zeitpunkt und unabhängige Prüfevidenz.

| ID                     | Änderung                                                                                                                       | Status                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `FRAME-2024-001`       | äußere Y-Rotation um π zur Viewer-Konvention `X Ost / Z Süd`; keine geodätische Korrektur                                      | aktiv, durch gemeinsamen Frame-Test abgesichert                        |
| `NIV-2024-001`         | Ersatz der 3×3-Quasigeoid-Näherung und roher UTM-Differenzen durch offline GCG2016→ECEF                                        | aktiv; Quell-, Grid- und Pipeline-Hash stehen im Artefakt              |
| `HEIGHT-LIVE-001`      | Ersatz der lokalen 3×3-Näherung für Laufzeitwerte durch verlustfreie 2°-Float32-Kacheln und GDAL-äquivalente Interpolation     | aktiv; strikte Abdeckung, Quell-Hash und Vergleichsreport dokumentiert |
| `PANO-HEADING-2024-v1` | ressourcenweit +2,3° Bearing vor lokalen Korrekturen; empirisch gegen Mesh 2024 registriert, ausdrücklich keine UTM-Konvergenz | aktiv im Viewer; Sensor-/Exportursache offen                           |
| `PANO-LOCAL-v1`        | benutzerseitige lokale Mikro-Pose je Panorama                                                                                  | POC; erbt den unvollständigen Quell-CRS-Status                         |
| `GPR-ANCHOR-001`       | abgeleiteter/freier Oberflächenanker und Mesh-Snapping                                                                         | Diagnose; nicht als Datumsberichtigung freigegeben                     |
