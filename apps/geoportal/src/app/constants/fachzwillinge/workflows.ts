import type {
  FlowFieldDefinition,
  TimeSeriesDefinition,
  VehicleAnimationDefinition,
} from "@carma-mapping/addons";

import { APP_BASE_PATH } from "../../config/app.config";
import type { FachzwillingRoute } from ".";

/**
 * The Starkregen T50 time series: water depth of the SRI 6 / T50 simulation
 * over two hours in 24 five-minute steps. Taken from
 * `envirometrics/wuppertal/rainhazardmap/src/config.js`, first entry of
 * `simulations`. Declared in full here on purpose: the `timeSlider` addon
 * ships no scenario of its own, whatever runs is spelled out where it is used.
 */
const STARKREGEN_T50_SERIES: TimeSeriesDefinition = {
  title: "Starkregen  T50",
  wmsUrl: "https://starkregenwms-wuppertal.cismet.de/geoserver/wms?SERVICE=WMS",
  styles: "starkregen:depth",
  intermediateValuesCount: 20,
  opacity: 0.85,
  initialStep: 2,
  /** one WMS layer per time step */
  layers: [
    "starkregen:L_T50_steps_depth3857_00h_05m",
    "starkregen:L_T50_steps_depth3857_00h_10m",
    "starkregen:L_T50_steps_depth3857_00h_15m",
    "starkregen:L_T50_steps_depth3857_00h_20m",
    "starkregen:L_T50_steps_depth3857_00h_25m",
    "starkregen:L_T50_steps_depth3857_00h_30m",
    "starkregen:L_T50_steps_depth3857_00h_35m",
    "starkregen:L_T50_steps_depth3857_00h_40m",
    "starkregen:L_T50_steps_depth3857_00h_45m",
    "starkregen:L_T50_steps_depth3857_00h_50m",
    "starkregen:L_T50_steps_depth3857_00h_54m",
    "starkregen:L_T50_steps_depth3857_00h_59m",
    "starkregen:L_T50_steps_depth3857_01h_04m",
    "starkregen:L_T50_steps_depth3857_01h_09m",
    "starkregen:L_T50_steps_depth3857_01h_14m",
    "starkregen:L_T50_steps_depth3857_01h_19m",
    "starkregen:L_T50_steps_depth3857_01h_24m",
    "starkregen:L_T50_steps_depth3857_01h_29m",
    "starkregen:L_T50_steps_depth3857_01h_34m",
    "starkregen:L_T50_steps_depth3857_01h_39m",
    "starkregen:L_T50_steps_depth3857_01h_44m",
    "starkregen:L_T50_steps_depth3857_01h_49m",
    "starkregen:L_T50_steps_depth3857_01h_54m",
    "starkregen:L_T50_steps_depth3857_02h_00m",
  ],
  /** what the slider shows for each step, elapsed time since the event start */
  labels: [
    "00h 05m",
    "00h 10m",
    "00h 15m",
    "00h 20m",
    "00h 25m",
    "00h 30m",
    "00h 35m",
    "00h 40m",
    "00h 45m",
    "00h 50m",
    "00h 55m",
    "01h 00m",
    "01h 05m",
    "01h 09m",
    "01h 15m",
    "01h 20m",
    "01h 24m",
    "01h 30m",
    "01h 35m",
    "01h 40m",
    "01h 44m",
    "01h 50m",
    "01h 55m",
    "02h 00m",
  ],
};

/**
 * The Starkregen T50 flow field: where the surface water runs in the SRI 6 /
 * T50 simulation, animated from the model's u/v velocity rasters.
 *
 * One field per scenario and no time dimension: the `84` in `u84.tif` is
 * WGS84, not a time step, so this is the maximum-velocity field the Leaflet
 * rain hazard map has always animated. Declared in full here for the same
 * reason the time series is, the addon ships no scenario of its own.
 */
const STARKREGEN_T50_FLOW: FlowFieldDefinition = {
  title: "Starkregen T50 Fließwege",
  service: "https://rain-rasterfari-wuppertal.cismet.de",
  scenario: "T50/",
  // Leaflet 17 in the old rain hazard map; MapLibre counts one lower
  minZoom: 16,
  // without cage: the same scenario's direction arrows as a plain WMS
  fallback: {
    wmsUrl: "https://starkregenwms-wuppertal.cismet.de/geoserver/wms?SERVICE=WMS",
    layers: "starkregen:L_T50_direction3857",
    styles: "starkregen:direction",
  },
};

/** The same animation over the scenario's maximum water depths. */
const STARKREGEN_T50_FLOW_WITH_DEPTH: FlowFieldDefinition = {
  ...STARKREGEN_T50_FLOW,
  title: "Starkregen T50 Fließwege und Wassertiefen",
  backdrop: {
    wmsUrl: "https://starkregenwms-wuppertal.cismet.de/geoserver/wms?SERVICE=WMS",
    layers: "starkregen:L_T50_depth3857",
    styles: "starkregen:depth",
    opacity: 0.85,
  },
};

/**
 * The stations the trasse asset passes, west to east.
 *
 * Coordinates from OpenStreetMap (`public_transport=stop_position` on the
 * Schwebebahn route relation). The full line has twenty stations between
 * Vohwinkel and Oberbarmen; these seven are the ones inside the section the
 * trasse model covers, from Hammerstein to Robert-Daum-Platz.
 */
const SCHWEBEBAHN_STATIONS = [
  { name: "Hammerstein", lon: 7.088325, lat: 51.23639 },
  { name: "Sonnborner Straße", lon: 7.096763, lat: 51.238122 },
  { name: "Zoo/Stadion", lon: 7.103271, lat: 51.240938 },
  { name: "Varresbecker Straße", lon: 7.107128, lat: 51.24666 },
  { name: "Westende", lon: 7.118499, lat: 51.248965 },
  { name: "Pestalozzistraße", lon: 7.125398, lat: 51.248623 },
  { name: "Robert-Daum-Platz", lon: 7.134347, lat: 51.252396 },
];

/**
 * Schwebebahnen running the trasse to the real service pattern.
 *
 * The route asset is the horizontal centre line of the city's 3D trasse model
 * (`1596_SchwebTrasse.json`), reduced by
 * `scripts/geodata/build-schwebebahn-track.mjs`. It is a closed ring of about
 * nine kilometres, out on one rail and back on the other, so a car drives the
 * whole loop rather than turning around: hence `mode: "loop"`, and hence each
 * station being served twice per lap, once per direction.
 *
 * The numbers are the WSW service: a 3:40 headway at peak times, a full run
 * from end to end in about half an hour. 36 km/h between stops plus 25 seconds
 * at each one gives the line's ~27 km/h average, and how many cars that takes
 * follows from the route rather than being configured. The car is a GTW 15:
 * 24.06 m long, 2.2 m wide, three sections with two rubber articulations, pale
 * blue.
 */
const SCHWEBEBAHN_VEHICLE: VehicleAnimationDefinition = {
  title: "Schwebebahn",
  trackUrl: `${APP_BASE_PATH}data/geojson/schwebebahn-trasse.json`,
  lengthMeters: 24.06,
  widthMeters: 2.2,
  // two driving sections around the short middle module
  sectionShares: [1, 0.28, 1],
  jointMeters: 0.9,
  speedKmh: 36,
  mode: "loop",
  schedule: {
    headwaySeconds: 220,
    dwellSeconds: 25,
    stations: SCHWEBEBAHN_STATIONS,
  },
  bodyColor: "#6ec6f0",
  jointColor: "#a7b1b8",
  outlineColor: "#33556b",
  showTrack: true,
  trackColor: "#8c8c8c",
};

/**
 * The same service, seen from above with its Gerüst over it.
 *
 * The structure asset comes from the city's trasse and support wireframes via
 * `scripts/geodata/build-schwebebahn-structure.mjs`: the rail girders as
 * modelled, the supports as three shapes placed 160 times, and the wind
 * bracing between the two rails, which the model does not contain and which
 * the script adds as five-metre X panels. The plain route line is off: the
 * rail drawn on top of the girder takes its place.
 */
const SCHWEBEBAHN_GERUEST_VEHICLE: VehicleAnimationDefinition = {
  ...SCHWEBEBAHN_VEHICLE,
  title: "Schwebebahn mit Gerüst",
  structureUrl: `${APP_BASE_PATH}data/geojson/schwebebahn-geruest.json`,
  showTrack: false,
};

/**
 * The same service and structure in three dimensions: girders, bracing and
 * supports as box members at the model's heights, the cars as low-poly
 * bodies hanging under the rail. Registers as a 3D layer, which unlocks the
 * camera tilt and the terrain button while it runs.
 */
const SCHWEBEBAHN_3D_VEHICLE: VehicleAnimationDefinition = {
  ...SCHWEBEBAHN_GERUEST_VEHICLE,
  title: "Schwebebahn in 3D",
  renderer: "three",
};

export const workflowsFachzwilling: FachzwillingRoute = {
  path: "workflows",
  hideFromCatalog: true,
  title: "Workflows",
  availability: {
    deployments: ["localDev", "dev", "pr"],
  },
  // the bare engines, idle until a workflow card launches something into them
  addons: ["timeSlider", "flowField", "vehicleAnimation"],
  perspectives: [
    {
      id: "versorgung",
      title: "Gesundheitsversorgung",
      workflows: [
        {
          id: "einrichtungen",
          title: "Gesundheitseinrichtungen",
          description:
            "Inhalt: Krankenhäuser und Apotheken im Wuppertaler Stadtgebiet, " +
            "zusammengefasst als eine Layer-Gruppe. " +
            "Sichtbarkeit: öffentlich. " +
            "Nutzung: Zur Übersicht über die Gesundheitsversorgung im " +
            "Stadtgebiet.",
          thumbnail:
            "https://geo.wuppertal.de/geoportal/geoportal_vorschau/infra_apotheken.png",
          layers: ["wuppPOI:poi_krankenhaeuser", "wuppInfra:apotheken"],
          tools: ["layerVisibility", "zoomToExtent"],
          metaDataText:
            "Die Gruppe bündelt die Datensätze Krankenhäuser (wuppPOI) und " +
            "Apotheken (wuppInfra) aus dem Geoportal Wuppertal.",
          links: [
            {
              url: "https://www.wuppertal.de/vv/produkte/206/gesundheitsamt.php",
              text: "Gesundheitsamt Wuppertal",
            },
          ],
        },
      ],
    },
    {
      id: "starkregen",
      title: "Starkregenvorsorge",
      workflows: [
        {
          // No `layers`: this card adds no layer group. Its timeSlider tool
          // carries the series, and the click launches it into the engine the
          // route mounts, see `startTimeSeries` in resource-layer-updater.ts.
          id: "t50-zeitreihe",
          title: "Starkregen T50",
          // the Starkregen-Gefahrenkarte card's image (helper/config.ts)
          thumbnail:
            "https://geoportal-files.cismet.de/1769010841464-1527766833261-b09c3163a791.jpg",
          description:
            "Inhalt: Simulierte Wassertiefen eines 50-jährlichen " +
            "Starkregens (SRI 6) über zwei Stunden, als abspielbare " +
            "Zeitreihe in 24 Schritten. " +
            "Sichtbarkeit: öffentlich. " +
            "Nutzung: Zeigt, wie sich die Überflutung während des " +
            "Ereignisses entwickelt.",
          metaDataText:
            "Die Zeitreihe zeigt die Simulationsergebnisse der " +
            "Starkregengefahrenkarte Wuppertal für das Szenario T50 (SRI 6) " +
            "in Schritten von fünf Minuten.",
          tools: [{ kind: "timeSlider", config: STARKREGEN_T50_SERIES }],
        },
        {
          // No `layers`: like the time series card, this one adds no layer
          // group. Its flowField tool carries the scenario and the click
          // launches it into the engine the route mounts.
          id: "t50-fliesswege",
          title: "Starkregen T50 Fließwege",
          thumbnail:
            "https://geoportal-files.cismet.de/1769010841464-1527766833261-b09c3163a791.jpg",
          description:
            "Inhalt: Fließwege eines simulierten 50-jährlichen Starkregens " +
            "(SRI 6), animiert aus den maximalen Fließgeschwindigkeiten. " +
            "Sichtbarkeit: öffentlich. " +
            "Nutzung: Zeigt, wohin das Wasser an der Oberfläche abläuft. Die " +
            "Animation läuft erst ab einem größeren Maßstab, weiter " +
            "herausgezoomt bleibt die Karte ruhig.",
          metaDataText:
            "Grundlage sind die u- und v-Komponenten der Simulation zum " +
            "Szenario T50 (SRI 6). Das Feld enthält die Maximalwerte des " +
            "Ereignisses und keine Zeitschritte.",
          tools: [{ kind: "flowField", config: STARKREGEN_T50_FLOW }],
        },
        {
          // The backdrop raster travels in the tool's own config rather than
          // as a layer group, so this card also adds no layers of its own.
          id: "t50-fliesswege-wassertiefen",
          title: "Starkregen T50 Fließwege und Wassertiefen",
          thumbnail:
            "https://geoportal-files.cismet.de/1769010841464-1527766833261-b09c3163a791.jpg",
          description:
            "Inhalt: Die Fließwege des Szenarios T50 über der Karte der " +
            "maximalen Wassertiefen desselben Ereignisses. " +
            "Sichtbarkeit: öffentlich. " +
            "Nutzung: Verbindet die Frage, wo Wasser steht, mit der Frage, " +
            "wohin es läuft. Die Animation läuft erst ab einem größeren " +
            "Maßstab, die Wassertiefen sind in jedem Maßstab zu sehen.",
          metaDataText:
            "Die Wassertiefen stammen aus der Starkregengefahrenkarte " +
            "Wuppertal, Layer starkregen:L_T50_depth3857. Die Fließwege " +
            "entstehen aus den u- und v-Komponenten derselben Simulation.",
          tools: [
            { kind: "flowField", config: STARKREGEN_T50_FLOW_WITH_DEPTH },
          ],
        },
      ],
    },
    {
      id: "mobilitaet",
      title: "Mobilität",
      workflows: [
        {
          // No `layers`: like the time series card, this one adds no layer
          // group. Its vehicleAnimation tool carries the route and the click
          // launches it into the engine the route mounts.
          id: "schwebebahn",
          title: "Schwebebahn",
          description:
            "Inhalt: Mehrere Schwebebahnen, die im Takt über die Trasse " +
            "fahren und an jeder Station halten. " +
            "Sichtbarkeit: öffentlich. " +
            "Nutzung: Zeigt den Betrieb auf der Strecke, nicht nur ihren " +
            "Verlauf. Über den Knopf in der Layer-Zeile lassen sich die " +
            "Fahrten anhalten.",
          metaDataText:
            "Grundlage ist die Mittellinie des 3D-Trassenmodells der Stadt " +
            "Wuppertal, die Stationen stammen aus OpenStreetMap. Gefahren " +
            "wird im 3:40-Takt mit 25 Sekunden Halt je Station und 36 km/h " +
            "zwischen den Halten, zusammen die rund 27 km/h " +
            "Durchschnittsgeschwindigkeit der Schwebebahn. Die Fahrzeuge " +
            "sind GTW 15: 24,06 m lang, 2,2 m breit, zwei Fahrgastteile mit " +
            "einem kurzen Mittelteil dazwischen, verbunden über zwei Gelenke.",
          tools: [
            { kind: "vehicleAnimation", config: SCHWEBEBAHN_VEHICLE },
          ],
        },
        {
          id: "schwebebahn-geruest",
          title: "Schwebebahn mit Gerüst",
          description:
            "Inhalt: Dieselben Fahrten wie in der Karte „Schwebebahn“, dazu " +
            "das Gerüst aus der Vogelperspektive: die beiden Fahrschienen " +
            "auf ihren Trägern, der Windverband dazwischen und die Stützen. " +
            "Sichtbarkeit: öffentlich. " +
            "Nutzung: Zeigt die Bahnen unter dem Gerüst, so wie ein Luftbild " +
            "sie zeigen würde. Die Fahrten lassen sich über die Layer-Zeile " +
            "anhalten.",
          metaDataText:
            "Träger und Stützen stammen aus dem 3D-Modell der Stadt " +
            "Wuppertal (Trasse und Stützen der Schwebebahn). Das Modell " +
            "enthält keine Verbindung zwischen den beiden Trägern; der " +
            "Windverband ist deshalb als Fachwerk mit Feldern von fünf " +
            "Metern ergänzt. Die Stützen liegen im Modell rund 90 Meter " +
            "über der Trasse und werden auf deren Höhe gesetzt. Fahrplan " +
            "und Fahrzeuge wie in der Karte „Schwebebahn“.",
          tools: [
            { kind: "vehicleAnimation", config: SCHWEBEBAHN_GERUEST_VEHICLE },
          ],
        },
        {
          id: "schwebebahn-3d",
          title: "Schwebebahn in 3D",
          description:
            "Inhalt: Dieselben Fahrten, aber räumlich: Träger, Windverband " +
            "und Stützen stehen in ihrer Höhe über dem Gelände, die Bahnen " +
            "hängen unter der Fahrschiene. " +
            "Sichtbarkeit: öffentlich. " +
            "Nutzung: Karte mit gedrückter rechter Maustaste oder mit zwei " +
            "Fingern kippen und drehen. Solange die Fahrten laufen, ist die " +
            "Kamera frei und die Geländedarstellung lässt sich einschalten.",
          metaDataText:
            "Geometrie wie in der Karte „Schwebebahn mit Gerüst“. Die Höhen " +
            "stammen aus dem 3D-Modell der Stadt Wuppertal; ohne Gelände " +
            "wird der Boden unter der Trasse aus den Fußpunkten der Stützen " +
            "abgeleitet, mit Gelände gelten die Modellhöhen. Der " +
            "Wagenkasten ist ein vereinfachter GTW 15: 24,06 m lang, 2,2 m " +
            "breit, 2,7 m hoch, mit vier Laufwerken auf der Schiene.",
          tools: [
            { kind: "vehicleAnimation", config: SCHWEBEBAHN_3D_VEHICLE },
          ],
        },
      ],
    },
  ],
};
