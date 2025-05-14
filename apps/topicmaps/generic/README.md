# Generic Topic Map (GTM)

Mit der **Generic Topic Map (GTM)** kann man ohne Programmierkenntnisse eigene interaktive Kartenanwendungen (TopicMaps) allein durch Konfiguration erstellen. Die GTM ist Teil des carma-Repos und wurde zur schnellen Erstellung von TopicMaps für die Wuppertaler Stadtverwaltung entwickelt.

## Einleitung

Im Gegensatz zu anderen TopicMap-Projekten in diesem Repository benötigt man bei der GTM keine eigenen Komponenten oder Code-Anpassungen. Man erstellt lediglich eine passende Konfiguration, und die App übernimmt automatisch die Darstellung und Funktionalität.

**Die Auswahl der Konfiguration erfolgt über den Namen nach dem /#/ in der URL** (Beispiel: `/#/Wohnlagenkarte_Wuppertal`).

- **Im Entwicklungsbetrieb** wird die Konfiguration direkt aus dem Ordner `./public/dev/` geladen.
- **Im dev oder live-Deployment** wird die Konfiguration aus einem GitHub-Projekt geladen (Standard: https://github.com/cismet/wupp-generic-topic-map-config). Der Ort der Konfiguration ist per ENV-Variablen einstellbar:
  - `VITE_GTM_CONFIGSERVER` (Standard: https://raw.githubusercontent.com/cismet/wupp-generic-topic-map-config/refs/heads/)
  - `VITE_GTM_CONFIG_PATH` (Standard: /dev/)

Die GTM lädt die gewünschte Konfiguration anhand des Namens nach dem /#/ (z.B. `/Wohnlagenkarte_Wuppertal` lädt `wohnlagenkarte_wuppertal/config.json`).

---

## 1. Was ist eine Konfiguration?

Eine Konfiguration definiert, wie eine bestimmte Karte oder ein Thema in der Generic Topic Map dargestellt wird. Sie enthält beispielsweise:
- Layer-Definitionen (WMS, VectorLayer, GeoJSON, etc.)
- Metadaten (Titel, Beschreibung, ...)
- Style-Optionen
- UI-spezifische Einstellungen

---

## 2. Neue Konfiguration anlegen

### 2.1. Verzeichnisstruktur

Für eine neue Karte wird im Konfigurationsordner (siehe oben) ein eigener Unterordner angelegt, beispielsweise `Meine_Neue_Karte`.

```text
meine_neue_karte/
```

### 2.2. Konfigurationsdateien anlegen

In diesem Ordner wird mindestens eine Datei, `config.json`, benötigt. Optional können weitere Dateien wie `layers.json`, `style.json` etc. angelegt werden, je nach Bedarf und Komplexität.

**Beispiel:**
- `config.json` (Haupteinstiegspunkt)
- `simpleHelp.mdn` (Absatz Zweckbestimmung in Kompaktanleitung)


#### Beispiel: Minimalistische `config.json` (macht wenig Sinn)

```json
{
    "tm": {
      "noFeatureCollection": true    
    }
  }
  
```
Diese Konfiguration zeigt eine leere Karte ohne spziellen Layer mit ZUsatzinformation. Im Menu kann man ziwschen den 3 voreingestellten Hintergrundlayern wechseln.

#### Beispiel: Minimalistische `config.json` mit einem Vektorlayer mit Punkten und Infoboxmapping



```json
{
    "tm": {
      "noFeatureCollection": true,
      "vectorLayers": [
        {
          "name": "Kinderspielplätze 2022",
          "style": "https://tiles.cismet.de/kinderspielplatz/style.json",
          "layer": "poi_ksp@https://maps.wuppertal.de/poi?service=WMS&request=GetCapabilities&version=1.1.1",
          "addMetaInfoToHelp": true  
        }
      ]
    }
  }
  
  
```

Ohne den angegebenen `style` wird der Style aus dem `carmaConf` Parametern des WMS gesetzt. Das Ffunktioniert auch, dauert aber etwas länger, da zuerst die Capabilities geladen und geparst werden müssen. Wir empfehlen deshalb den Style zusätzlich (wie oben angegeben) zu setzen.


### 2.3. Layer und weitere Einstellungen

Layer-Definitionen und weitere Einstellungen können nach Bedarf angepasst werden. Für Inspiration können die bestehenden Beispiele in `trinkbrunnenkarte_wuppertal` und `wohnlagenkarte_wuppertal` herangezogen werden.

---

## 3. Einbindung der Konfiguration in die App

Die App lädt die Konfiguration abhängig vom Startparameter oder der URL. Im Code wird beim Start geprüft, welche Konfiguration geladen werden soll.

**Typischer Ablauf:**
- Die App prüft die URL um den Namen der Konfiguration zu bestimmen.
- Die entsprechende Konfiguration wird aus dem Konfigurationsordner geladen.


Gibt es dabei einen Fehler wird eine Standardkonfiguration geladen und ein Hinweis in einer Textbox ausgeprägt, der so oder so ähnlich aussieht:

Bei https://carma-dev-deployments.github.io/generic-topicmap/#/keine_Karte


```text
Probleme beim Laden der Konfigurationsdateien
... where i get my config from: {"configServer":"https://raw.githubusercontent.com/cismet/wupp-generic-topic-map-config/refs/heads/","configPath":"/dev/"}
... try to read config at https://raw.githubusercontent.com/cismet/wupp-generic-topic-map-config/refs/heads//dev/gtm_ohne_konfiguration/config.json
... config: loaded gtm_ohne_konfiguration/config
... projectConfig:[object Object]
No vectorLayers found in projectConfig.tm.vectorLayers
... try to read config at https://raw.githubusercontent.com/cismet/wupp-generic-topic-map-config/refs/heads//dev/gtm_ohne_konfiguration/simpleHelp.json
... no config found at https://raw.githubusercontent.com/cismet/wupp-generic-topic-map-config/refs/heads//dev/gtm_ohne_konfiguration/simpleHelp.json
... try to read config at https://raw.githubusercontent.com/cismet/wupp-generic-topic-map-config/refs/heads//dev/keine_karte/config.json
... no config found at https://raw.githubusercontent.com/cismet/wupp-generic-topic-map-config/refs/heads//dev/keine_karte/config.json
... projectConfig:
No vectorLayers found in projectConfig.tm.vectorLayers
... try to read config at https://raw.githubusercontent.com/cismet/wupp-generic-topic-map-config/refs/heads//dev/keine_karte/simpleHelp.json
... no config found at https://raw.githubusercontent.com/cismet/wupp-generic-topic-map-config/refs/heads//dev/keine_karte/simpleHelp.json
```


Damit kann man dann leicht überprüfen, ob die Konfiguration an einem korrekten Ort liegt, bzw. die Umsetzung aus dem Namen (Namen in Kleinbuchstaben umgewandelt) und der URL (mit dem Prefix `/#/`) korrekt ist.

---

## 4. Erweiterte Möglichkeiten: Styles anpassen (`StyleModification.js`)

Um die Symbolgröße von Punktsignaturen auf die gleiche Weise wei den den normalen Topic-Maps mit GeoJSON Datasources anzupassen,muss der Style dynamisch verändert werden. 

Dazu wird eine StyleModification benötigt, die in der `config.json` referenziert wird. In dieser Javascript Datei muss es eine Funktion mit dem Namen und der Signatur `function styleManipulation(markerSymbolSize, style) {}` geben, die den MarkerSymbolSize und den Style als Parameter übergeben bekommt. Der MarkerSymbolSize ist eine Zahl (25,35 oder 45), die die Größe des Symbols angibt. Mit der Funktion muss dann der Style an jeder Stellem wo es entsprechede Icon-Größen gibt, verändert werden.


Beispiel der Trinkwasserbrunnen:

```js
function styleManipulation(markerSymbolSize, style) {
  const scale = (markerSymbolSize / 35) * 1.35;
  const newStyle = JSON.parse(JSON.stringify(style)); // Deep clone

  // trinkwasserbrunnen-selection icon-size
  const selection = newStyle.layers.find(
    (l) => l.id === "trinkwasserbrunnen-selection"
  );
  if (selection) {
    selection.layout["icon-size"].stops[0][1] *= scale;
    selection.layout["icon-size"].stops[1][1] *= scale;
  }

  // trinkwasserbrunnen-poi-images icon-size
  const images = newStyle.layers.find(
    (l) => l.id === "trinkwasserbrunnen-poi-images"
  );
  if (images) {
    images.layout["icon-size"].stops[0][1] *= scale;
    images.layout["icon-size"].stops[1][1] *= scale;
  }

  // trinkwasserbrunnen-poi-labels text-size and text-offset
  const labels = newStyle.layers.find(
    (l) => l.id === "trinkwasserbrunnen-poi-labels"
  );
  if (labels) {
    labels.layout["text-size"] *= scale;
    labels.layout["text-offset"].stops[0][1][1] *= scale;
    labels.layout["text-offset"].stops[1][1][1] *= scale;
  }

  return newStyle;
}

```

### 4.1. StyleModification in der Konfiguration nutzen

In der jeweiligen `config.json` kann gegebenenfalls ein Verweis auf die StyleModification-Funktion gesetzt werden.

hier im Beispiel der Trinkwasserbrunnenkarte 

```json
{
  "tm": {
    "windowtitle": "Trinkwasserbrunnenkart Wuppertal",
    "noFeatureCollection": true,
    "applicationMenuIntroductionMarkdown": "Die Trinkwasserbrunnenkarte Wuppertal ist eine Anwendung der **GenericTopicMap Wuppertal**. Dies ist eine Komponente aus dem Gesamtsystem des Digitalen Zwillings der Stadt Wuppertal (**DigiTal Zwilling**), mit der eine einfache, für den mobilen Einsatz prädestinierte Web-Karte erzeugt werden kann, indem zwei Konfigurationsdateien angepasst werden. Über **Einstellungen** können Sie die Darstellung der Hintergrundkarte an Ihre Vorlieben anpassen. Wählen Sie **Kompaktanleitung** für detailliertere Bedienungsinformationen und **Urbaner Digitaler Zwilling** für eine Einordnung der Trinkwasserbrunnenkarte in den Kontext des DigiTal Zwillings.",
    "applicationMenuSkipSymbolsizeSetting": false,
    "previewMapPosition": "lat=51.25181635396065&lng=7.119569778442384&zoom=13",
    "vectorLayers": [
      {
        "name": "Trinkwasserbrunnen",
        "style": "https://tiles.cismet.de/poi/trinkwasserbrunnen.style.json",
        "layer": "poi_trinkwasser@https://maps.wuppertal.de/poi?service=WMS&request=GetCapabilities&version=1.1.1",
        "addMetaInfoToHelp": true,
        "styleManipulation": "@trinkwasserbrunnenStyleModification.js",
        "settingsSymbol":"@tw_outdoor.svg"
      }
    ]
  }
}
```

### 4.1. SettingsSymbol definieren

In der Konfiguration kann auch ein Symbol für die Einstellungen definiert werden. Dazu wird in der Konfiguration der Name mit @ Symbol des Symbols angegeben. Das Symbol muss im SVG-Format vorliegen und im gleichen Ordner abgelegt sein. 

```json
        "settingsSymbol":"@tw_outdoor.svg"
```



### 4.2 Automatische Information zum Layer in der Kompaktanleitung

Wenn

```json
          "addMetaInfoToHelp": true  
          "name": "Kinderspielplätze 2022",
```

in der Layerkonfiguration gesetzt ist, wird automatisch ein Eintrag in der Kompaktanleitung erzeugt.   Das Attribut `name`wird für die Überschrift verwendet. Der Inhalt des Bereichs wird aus den Metainformationen die auch im Geoportal angezeigt werden erzeugt.

