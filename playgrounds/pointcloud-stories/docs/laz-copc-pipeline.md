# Von LAZ zum streambaren COPC

## Ziel

Die Pipeline macht gelieferte LAZ Pointclouds als COPC im Browser nutzbar. Quelldateien bleiben unverändert. Abgeleitete Dateien werden getrennt vom Source Code und vom Application Build gespeichert.

```text
Server-LAZ → unveränderte lokale Quelle → Prüfung und Aufbereitung
           → COPC-Octree → Verifikation → Runtime Data Server
```

## 1. Quelle sichern und prüfen

Die benötigten Dateien werden fortsetzbar vom Server gespiegelt. Vor jeder Ableitung werden Dateigröße, SHA-256, Punktzahl, LAS-Version, Point Format, Bounding Box, Attribute sowie vorhandene CRS- und Height-Datum-Angaben erfasst. Leere oder konstante Attribute gelten nicht als Sensor-Metadaten. Fehlende Angaben werden als Annahme dokumentiert und nicht still ergänzt.

Bereits gelieferte COPCs bleiben bytegleich. Nur Archive oder einzelne LAS-Dateien müssen neu aufgebaut werden.

## 2. Daten vorbereiten

Archive werden reproduzierbar entpackt und unverändert aufbewahrt. Normale Pointcloud-Segmente können direkt zusammengeführt werden.

Die Tools laufen in fest definierten Container Images. Dadurch bleiben PDAL, PROJ, Python und Untwine unabhängig von der lokalen Installation reproduzierbar.

## 3. CRS und Registrierung

COPC-Erzeugung und Scene Registration sind getrennte Schritte. Die AO- Berechnung registriert alle Quellen in `EPSG:25832` mit ellipsoidischer Höhe, weil das Mesh 2024 in diesem Raum ausgewertet wird. Die ausgegebenen Punktkoordinaten und deren CRS-Metadaten bleiben dagegen unverändert in ihrem jeweiligen Source Frame. Der Viewer wendet beim Mounten exakt dieselbe Registrierung an; Datumstransformation oder Rigid Fit dürfen nicht ein zweites Mal in das COPC eingebacken werden.

KWH und Oelberg-MLS werden mit dem gebündelten GCG2016-5×5-Natural-Spline von DHHN2016 auf ellipsoidische Höhe gebracht. AWG2 verwendet den dokumentierten Rigid Fit samt aktueller Mesh-Mikrokorrektur. Nordbahntrasse verwendet die bestbekannte Identität im ellipsoidischen Frame; deren vertikales Datum bleibt als nicht vom Lieferanten bestätigt markiert.

| Cloud               | Registrierung für AO und Scene Mount                                                                                                                | Ausgabe-XYZ                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Kaiser-Wilhelm-Hain | DHHN2016 → ellipsoidisch via GCG2016                                                                                                                | Quelle, `EPSG:25832+7837`        |
| AWG 2               | Pivot `(370327.584, 5680082.375, 200.265)`, Euler XYZ `(5.103344567°, 4.281994042°, 0°)`, Fit `(0, 0, −11.042280815) m`, Mikro `(1.7, −1.0, 3.7) m` | Quelle, ellipsoidisch angenommen |
| Oelberg MLS         | DHHN2016 → ellipsoidisch via GCG2016                                                                                                                | Quelle, `EPSG:25832+7837`        |
| Nordbahntrasse      | Identität im bestbekannten ellipsoidischen Frame; Lieferantendatum offen                                                                            | Quelle, ellipsoidisch angenommen |

## 4. Optionale Display Attributes

Stabile Display Attributes dürfen in einem ausdrücklich abgeleiteten COPC als LAS Extra Bytes gespeichert werden. Vorgesehen ist `AO:uint8`: `0` bedeutet verdeckt, `255` freie Sky Visibility. Der Bake verwendet den registrierten East/North/Up Frame und dokumentiert Referenzgeometrie, Voxel Size, Range, Ray Count, Algorithm Version und Source Hash.

Für die Punktokklusion wird keine mittlere Punktdichte angenommen. Der Bake markiert die tatsächlich belegten 0,5-m-Zellen und rasterisiert die Dreiecke des Mesh 2024 per Triangle/AABB-Test in dieselbe Belegung. 256 deterministische Hemisphärenstrahlen über 50 m pro belegter Punktzelle liefern die Sky Visibility. Große Clouds werden chunkweise gelesen und geschrieben. Nur die gemeinsame Punkt/Mesh-Belegung ist ein dichtes temporäres Byte-Raster; Punktzellen und deren AO-Werte bleiben sortierte Sparse Arrays. Die vollständige Punktwolke liegt nie im RAM. Die Mesh-Auswahl folgt dem exakten 25-m-Footprint der registrierten Punkte mit demselben 50-m-Halo; lange Trassen laden daher nicht das gesamte umschließende Rechteck.

Height above DGM 2020 wird nicht gespeichert. Das Feld hängt vom gewählten DEM ab und wird bei Bedarf billig aus dessen Tiles berechnet.

## 5. COPC schreiben und verifizieren

Untwine schreibt einen LAZ-1.4-COPC mit räumlichem Octree. Point Attributes bleiben an ihren Punkten. Der Client kann Hierarchie und sichtbare Nodes per HTTP Byte Range laden, ohne die ganze Datei zu übertragen.

Untwines temporärer Pyramidenbaum liegt in einem kurzlebigen Docker-Volume. Das ist für große Clouds relevant: Die mmap-intensive Bottom-up-Phase arbeitet damit im Linux-Dateisystem der VM statt über einen macOS-Bind-Mount. Oelberg benötigt dabei ungefähr 75 GiB logischen Scratch-Speicher; das Volume wird nach Erfolg oder Abbruch automatisch entfernt.

Die 969-Millionen-Punkte-Cloud wird vor Untwine verlustfrei in begrenzte LAZ-Teile gestreamt. Das gepinnte Untwine-1.5.1-Image behebt den Upstream-Fehler, bei dem der `--dims`-Iterator benachbarte Standardfelder überspringen konnte, und begrenzt die speicherintensive Bottom-up-Pyramide standardmäßig auf vier Worker. Oelberg benötigt trotzdem keinen `--dims`-Filter: Der vorherige vollständige Audit und AO-Bake haben das Schema bereits reduziert, daher übernimmt Untwine es unverändert. Die Teile werden nach erfolgreicher Verpackung entfernt.

Der exakte Streaming-Audit entfernt optionale leere oder konstante Nutzfelder. LAS-Pflichtfelder bleiben strukturell Teil des Point Formats, auch wenn sie keine Information tragen. KWH und Oelberg benötigen Format 7 wegen RGB; AWG und Nordbahntrasse verwenden Format 6. Alle vier erhalten ausschließlich `AO:uint8` als Extra Byte. Geprüft werden mindestens Decoding, Punktzahl, Bounding Box, Attribute und Datentypen, Classification, Stichprobenkoordinaten und HTTP Range Requests.

Im Browser gilt für alle Punktwolken ein einheitliches lowercase-Schema, etwa `classification`, `intensity`, `userdata` und `ao`. Die binären LAS/COPC-Dateien behalten die standardisierten nativen Dimensionsnamen; die Normalisierung erfolgt genau einmal an der Loader-Grenze. RGB wird nur publiziert, wenn Red, Green und Blue im vollständigen Quell-Audit jeweils echte Variation enthalten.

| Cloud                  | RGB-Audit                      | Ausgabe                |
| ---------------------- | ------------------------------ | ---------------------- |
| Kaiser-Wilhelm-Hain    | alle drei Kanäle variieren     | Format 7, RGB bleibt   |
| AWG 2                  | keine RGB-Dimensionen          | Format 6, kein RGB     |
| Oelberg MLS            | alle drei Kanäle variieren     | Format 7, RGB bleibt   |
| Nordbahntrasse 12/2025 | R/G/B jeweils konstant `32896` | Format 6, RGB entfernt |

Georeferenzierte Flächen werden zusätzlich gegen DGM1 und gegebenenfalls GCG2016 geprüft. Eine visuell passende Lage ersetzt keine CRS-Prüfung.

Produktiv liegen COPCs auf einem separaten Data Server oder Object Store mit Byte Ranges und CORS. Der Viewer lädt Nodes nach Frustum, Screen Density, Memory Budget und Target Frame Rate. Große Runtime-Daten gelangen dadurch nicht in den Application Build oder Nx Cache.

Eine zusätzliche Aufteilung nach Straßenabschnitten ist vorerst nicht sinnvoll: COPC unterteilt die lineare Belegung bereits räumlich und speichert keine leeren Octree-Nodes als Punktpayload. Separate Dateien würden dagegen weitere Roots, Hierarchie-Requests und Sonderlogik an Kreuzungen erzeugen. Falls ein Profiling bei der 969-Millionen-Punkte-Cloud noch CPU-Kosten zeigt, ist der nächste Hebel eine echte hierarchische Bildschirmfehler-Traversierung im Client statt des flachen Rankings aller sichtbaren Nodes; das Datenformat muss dafür nicht geändert werden.

## Veröffentlichung

Die unveränderten Lieferdaten bleiben außerhalb des Repositories. Die abgeleiteten Dateien gehören neben das Mesh 2024 in den vorhandenen öffentlichen Datenbestand; erreichbar als `https://wupp-3d-data.cismet.de/mesh2024/pointclouds/`. Alle vier AO-COPCs und ihre Reports erhalten content-versionierte Dateinamen. Der genaue Deploymentpfad bleibt Betreiberkonfiguration und wird nicht im Repository abgelegt. Eine Cloud wird im Viewer erst aktiviert, nachdem Upload, SHA-256 und ein HTTP-Range-Request gegen ihre endgültige URL geprüft wurden. KWH, AWG2, Oelberg und Nordbahntrasse sind dort mit HTTP 206, korrektem `Content-Range`, CORS und immutable Cache Policy verifiziert. Das finale Oelberg-COPC umfasst `11.465.093.116` Byte und `969.061.406` Punkte.

`scripts/build-pointcloud-aos.sh` kann die vier Clouds nacheinander bauen, damit Mesh-Cache, Zwischen-LAZ und Memory Maps nie gleichzeitig für alle Assets Platz belegen. Der Viewer liest gebackenes `AO:uint8` direkt und überspringt jede Laufzeit-AO-Berechnung. Der Georadar-COPC gehört ausdrücklich nicht zu dieser Pipeline.
