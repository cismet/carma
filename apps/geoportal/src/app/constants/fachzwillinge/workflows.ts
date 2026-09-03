import type { TimeSeriesDefinition } from "@carma-mapping/addons";

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

export const workflowsFachzwilling: FachzwillingRoute = {
  path: "workflows",
  hideFromCatalog: true,
  title: "Workflows",
  availability: {
    deployments: ["localDev", "dev", "pr"],
  },
  // the bare engine, idle until a workflow card launches a series into it
  addons: ["timeSlider"],
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
      ],
    },
  ],
};
