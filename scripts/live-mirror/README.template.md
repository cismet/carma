# DigiTal Zwilling Wuppertal: Quellcode der Live-Anwendungen

Dieses Repository enthält den Quellcode, aus dem die öffentlich betriebenen Anwendungen des DigiTal Zwillings Wuppertal gebaut werden. Er ist ein Auszug aus dem Monorepo [carma](https://github.com/cismet/carma) der cismet GmbH und aus dem Repository [carma-wuppertal-collab](https://github.com/cismet-collab/carma-wuppertal-collab).

Der Inhalt wird automatisch aus carma erzeugt. Entwickelt wird in carma; Änderungen, die direkt hier eingereicht werden, überschreibt der nächste Abgleich.

## Enthaltene Anwendungen

{{apps}}

Zu jeder Anwendung gehören die Bibliotheken, von denen sie abhängt, und die Konfigurationsdateien für den Build.

## Stand

{{sources}}

Jede Live-Auslieferung einer der Anwendungen legt hier einen Commit mit dem gesamten Code an und setzt ein Tag `<anwendung>/v<version>`. Wird dieselbe Version noch einmal ausgeliefert, bekommt das neue Tag einen Zusatz wie `-2`. `main` zeigt den Stand der letzten Auslieferung, gleich welcher Anwendung. Für eine Anwendung, die länger nicht ausgeliefert wurde, kann der Code auf `main` deshalb neuer sein als das, was live läuft; den ausgelieferten Stand enthält ihr Tag. Welche Version welcher Anwendung live ist, steht in `LIVE.json`.

## Nicht enthaltene Erweiterungen

Einige Erweiterungen der Kartendarstellung liegen in einem nicht öffentlichen Repository der cismet GmbH und sind hier nicht enthalten, darunter die Überblendung zwischen WMS-Kartenebenen und die animierte Darstellung von Strömungsfeldern. Die Software lässt sich ohne sie bauen und betreiben, diese Funktionen fehlen dann.

## Bauen

Der Produktionsbuild großer Anwendungen wie des Geoportals braucht mehr Arbeitsspeicher, als Node.js standardmäßig zulässt, und bricht sonst mit „JavaScript heap out of memory“ ab. carma baut deshalb mit 8 GiB:

```bash
NODE_OPTIONS=--max-old-space-size=8192 npx nx run geoportal:build --configuration=production
```

## Lizenz

MIT, siehe [LICENSE](LICENSE). Eine nicht offizielle deutsche Übersetzung steht in [LICENSE.de.md](LICENSE.de.md). Für die Teile aus carma-wuppertal-collab gilt dessen eigene Lizenzdatei unter `libraries/collaboration/carma-wuppertal-collab/wuppertal-collab-submodule/`.
