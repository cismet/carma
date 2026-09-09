import type {
  AddonEntry,
  FloodDefinition,
  FlowFieldDefinition,
  TimeSeriesDefinition,
  VehicleAnimationDefinition,
} from "@carma-mapping/addons";

import {
  ASSET_BASE_URL,
  type WorkflowDefinition,
} from "@carma-mapping/layers";

import type { FachzwillingRoute } from ".";

/** the Schwebebahn geometry and timetable, too big to ship with the app */
const SCHWEBEBAHN_GEOMETRY = `${ASSET_BASE_URL}/geoportal/geojson`;
const SCHWEBEBAHN_DATA = `${ASSET_BASE_URL}/geoportal/data`;

/**
 * The Starkregen T50 time series: water depth of the SRI 6 / T50 simulation
 * over two hours in 24 five-minute steps. Taken from
 * `envirometrics/wuppertal/rainhazardmap/src/config.js`, first entry of
 * `simulations`. Declared in full here on purpose: the `timeSlider` addon
 * ships no scenario of its own, whatever runs is spelled out where it is used.
 */
const STARKREGEN_T50_SERIES: TimeSeriesDefinition = {
  title: "Starkregen T50 (zeitlicher Verlauf)",
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
    wmsUrl:
      "https://starkregenwms-wuppertal.cismet.de/geoserver/wms?SERVICE=WMS",
    layers: "starkregen:L_T50_direction3857",
    styles: "starkregen:direction",
  },
};

/** The same animation over the scenario's maximum water depths. */
const STARKREGEN_T50_FLOW_WITH_DEPTH: FlowFieldDefinition = {
  ...STARKREGEN_T50_FLOW,
  title: "Starkregen T50 Fließwege und Wassertiefen",
  backdrop: {
    wmsUrl:
      "https://starkregenwms-wuppertal.cismet.de/geoserver/wms?SERVICE=WMS",
    layers: "starkregen:L_T50_depth3857",
    styles: "starkregen:depth",
    opacity: 0.85,
  },
};

/**
 * Starkregen SRI 7: zwei Stunden mit 42 l/m², statistische Wiederkehrzeit 100
 * Jahre. Zweiter Eintrag von `simulations` in
 * `envirometrics/wuppertal/rainhazardmap/src/config.js`.
 */
const STARKREGEN_T100_SERIES: TimeSeriesDefinition = {
  title: "Starkregen T100 (zeitlicher Verlauf)",
  wmsUrl: "https://starkregenwms-wuppertal.cismet.de/geoserver/wms?SERVICE=WMS",
  styles: "starkregen:depth",
  intermediateValuesCount: 20,
  opacity: 0.85,
  initialStep: 2,
  /** one WMS layer per time step */
  layers: [
    "starkregen:L_T100_steps_depth3857_00h_05m",
    "starkregen:L_T100_steps_depth3857_00h_10m",
    "starkregen:L_T100_steps_depth3857_00h_15m",
    "starkregen:L_T100_steps_depth3857_00h_20m",
    "starkregen:L_T100_steps_depth3857_00h_25m",
    "starkregen:L_T100_steps_depth3857_00h_30m",
    "starkregen:L_T100_steps_depth3857_00h_35m",
    "starkregen:L_T100_steps_depth3857_00h_39m",
    "starkregen:L_T100_steps_depth3857_00h_44m",
    "starkregen:L_T100_steps_depth3857_00h_49m",
    "starkregen:L_T100_steps_depth3857_00h_55m",
    "starkregen:L_T100_steps_depth3857_00h_59m",
    "starkregen:L_T100_steps_depth3857_01h_04m",
    "starkregen:L_T100_steps_depth3857_01h_09m",
    "starkregen:L_T100_steps_depth3857_01h_15m",
    "starkregen:L_T100_steps_depth3857_01h_19m",
    "starkregen:L_T100_steps_depth3857_01h_24m",
    "starkregen:L_T100_steps_depth3857_01h_30m",
    "starkregen:L_T100_steps_depth3857_01h_34m",
    "starkregen:L_T100_steps_depth3857_01h_39m",
    "starkregen:L_T100_steps_depth3857_01h_44m",
    "starkregen:L_T100_steps_depth3857_01h_49m",
    "starkregen:L_T100_steps_depth3857_01h_54m",
    "starkregen:L_T100_steps_depth3857_01h_59m",
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

/** The same scenario as a flow field, animated from its u/v velocity rasters. */
const STARKREGEN_T100_FLOW: FlowFieldDefinition = {
  title: "Starkregen T100 Fließwege",
  service: "https://rain-rasterfari-wuppertal.cismet.de",
  scenario: "T100/",
  // Leaflet 17 in the old rain hazard map; MapLibre counts one lower
  minZoom: 16,
  // without cage: the same scenario's direction arrows as a plain WMS
  fallback: {
    wmsUrl:
      "https://starkregenwms-wuppertal.cismet.de/geoserver/wms?SERVICE=WMS",
    layers: "starkregen:L_T100_direction3857",
    styles: "starkregen:direction",
  },
};

/** The same animation over the scenario's maximum water depths. */
const STARKREGEN_T100_FLOW_WITH_DEPTH: FlowFieldDefinition = {
  ...STARKREGEN_T100_FLOW,
  title: "Starkregen T100 Fließwege und Wassertiefen",
  backdrop: {
    wmsUrl:
      "https://starkregenwms-wuppertal.cismet.de/geoserver/wms?SERVICE=WMS",
    layers: "starkregen:L_T100_depth3857",
    styles: "starkregen:depth",
    opacity: 0.85,
  },
};

/**
 * Starkregen SRI 10: eine Stunde mit 90 l/m². Dritter Eintrag von
 * `simulations` in `envirometrics/wuppertal/rainhazardmap/src/config.js`.
 */
const STARKREGEN_90MM_SERIES: TimeSeriesDefinition = {
  title: "Starkregen 90 mm (zeitlicher Verlauf)",
  wmsUrl: "https://starkregenwms-wuppertal.cismet.de/geoserver/wms?SERVICE=WMS",
  styles: "starkregen:depth",
  intermediateValuesCount: 20,
  opacity: 0.85,
  initialStep: 2,
  /** one WMS layer per time step */
  layers: [
    "starkregen:L_90mm_steps_depth3857_00h_05m",
    "starkregen:L_90mm_steps_depth3857_00h_09m",
    "starkregen:L_90mm_steps_depth3857_00h_15m",
    "starkregen:L_90mm_steps_depth3857_00h_20m",
    "starkregen:L_90mm_steps_depth3857_00h_25m",
    "starkregen:L_90mm_steps_depth3857_00h_30m",
    "starkregen:L_90mm_steps_depth3857_00h_35m",
    "starkregen:L_90mm_steps_depth3857_00h_40m",
    "starkregen:L_90mm_steps_depth3857_00h_45m",
    "starkregen:L_90mm_steps_depth3857_00h_50m",
    "starkregen:L_90mm_steps_depth3857_00h_55m",
    "starkregen:L_90mm_steps_depth3857_00h_59m",
    "starkregen:L_90mm_steps_depth3857_01h_04m",
    "starkregen:L_90mm_steps_depth3857_01h_09m",
    "starkregen:L_90mm_steps_depth3857_01h_14m",
    "starkregen:L_90mm_steps_depth3857_01h_19m",
    "starkregen:L_90mm_steps_depth3857_01h_24m",
    "starkregen:L_90mm_steps_depth3857_01h_29m",
    "starkregen:L_90mm_steps_depth3857_01h_34m",
    "starkregen:L_90mm_steps_depth3857_01h_39m",
    "starkregen:L_90mm_steps_depth3857_01h_44m",
    "starkregen:L_90mm_steps_depth3857_01h_49m",
    "starkregen:L_90mm_steps_depth3857_01h_54m",
    "starkregen:L_90mm_steps_depth3857_01h_59m",
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

/** The same scenario as a flow field, animated from its u/v velocity rasters. */
const STARKREGEN_90MM_FLOW: FlowFieldDefinition = {
  title: "Starkregen 90 mm Fließwege",
  service: "https://rain-rasterfari-wuppertal.cismet.de",
  scenario: "90mm/",
  // Leaflet 17 in the old rain hazard map; MapLibre counts one lower
  minZoom: 16,
  // without cage: the same scenario's direction arrows as a plain WMS
  fallback: {
    wmsUrl:
      "https://starkregenwms-wuppertal.cismet.de/geoserver/wms?SERVICE=WMS",
    layers: "starkregen:L_90mm_direction3857",
    styles: "starkregen:direction",
  },
};

/** The same animation over the scenario's maximum water depths. */
const STARKREGEN_90MM_FLOW_WITH_DEPTH: FlowFieldDefinition = {
  ...STARKREGEN_90MM_FLOW,
  title: "Starkregen 90 mm Fließwege und Wassertiefen",
  backdrop: {
    wmsUrl:
      "https://starkregenwms-wuppertal.cismet.de/geoserver/wms?SERVICE=WMS",
    layers: "starkregen:L_90mm_depth3857",
    styles: "starkregen:depth",
    opacity: 0.85,
  },
};

/**
 * Der Regen vom 29.05.2018, SRI 11, aus den gemessenen Niederschlagsmengen
 * gerechnet. Vierter Eintrag von `simulations` in
 * `envirometrics/wuppertal/rainhazardmap/src/config.js`.
 */
const STARKREGEN_EXTREM2018_SERIES: TimeSeriesDefinition = {
  title: "Regen vom 29.05.2018 (zeitlicher Verlauf)",
  wmsUrl: "https://starkregenwms-wuppertal.cismet.de/geoserver/wms?SERVICE=WMS",
  styles: "starkregen:depth",
  intermediateValuesCount: 20,
  opacity: 0.85,
  initialStep: 2,
  /** one WMS layer per time step */
  layers: [
    "starkregen:L_Extrem2018_steps_depth3857_00h_05m",
    "starkregen:L_Extrem2018_steps_depth3857_00h_10m",
    "starkregen:L_Extrem2018_steps_depth3857_00h_15m",
    "starkregen:L_Extrem2018_steps_depth3857_00h_20m",
    "starkregen:L_Extrem2018_steps_depth3857_00h_25m",
    "starkregen:L_Extrem2018_steps_depth3857_00h_30m",
    "starkregen:L_Extrem2018_steps_depth3857_00h_35m",
    "starkregen:L_Extrem2018_steps_depth3857_00h_40m",
    "starkregen:L_Extrem2018_steps_depth3857_00h_45m",
    "starkregen:L_Extrem2018_steps_depth3857_00h_50m",
    "starkregen:L_Extrem2018_steps_depth3857_00h_54m",
    "starkregen:L_Extrem2018_steps_depth3857_01h_00m",
    "starkregen:L_Extrem2018_steps_depth3857_01h_05m",
    "starkregen:L_Extrem2018_steps_depth3857_01h_09m",
    "starkregen:L_Extrem2018_steps_depth3857_01h_14m",
    "starkregen:L_Extrem2018_steps_depth3857_01h_19m",
    "starkregen:L_Extrem2018_steps_depth3857_01h_24m",
    "starkregen:L_Extrem2018_steps_depth3857_01h_29m",
    "starkregen:L_Extrem2018_steps_depth3857_01h_34m",
    "starkregen:L_Extrem2018_steps_depth3857_01h_39m",
    "starkregen:L_Extrem2018_steps_depth3857_01h_44m",
    "starkregen:L_Extrem2018_steps_depth3857_01h_49m",
    "starkregen:L_Extrem2018_steps_depth3857_01h_54m",
    "starkregen:L_Extrem2018_steps_depth3857_01h_59m",
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

/** The same scenario as a flow field, animated from its u/v velocity rasters. */
const STARKREGEN_EXTREM2018_FLOW: FlowFieldDefinition = {
  title: "Regen vom 29.05.2018 Fließwege",
  service: "https://rain-rasterfari-wuppertal.cismet.de",
  scenario: "Extrem2018/",
  // Leaflet 17 in the old rain hazard map; MapLibre counts one lower
  minZoom: 16,
  // without cage: the same scenario's direction arrows as a plain WMS
  fallback: {
    wmsUrl:
      "https://starkregenwms-wuppertal.cismet.de/geoserver/wms?SERVICE=WMS",
    layers: "starkregen:L_Extrem2018_direction3857",
    styles: "starkregen:direction",
  },
};

/** The same animation over the scenario's maximum water depths. */
const STARKREGEN_EXTREM2018_FLOW_WITH_DEPTH: FlowFieldDefinition = {
  ...STARKREGEN_EXTREM2018_FLOW,
  title: "Regen vom 29.05.2018 Fließwege und Wassertiefen",
  backdrop: {
    wmsUrl:
      "https://starkregenwms-wuppertal.cismet.de/geoserver/wms?SERVICE=WMS",
    layers: "starkregen:L_Extrem2018_depth3857",
    styles: "starkregen:depth",
    opacity: 0.85,
  },
};

/**
 * The three thermal indices of the PALM-4U training run around the Rathaus
 * (wupp #4113, data described in #4098) share one hourly grid: 06:00 to 20:00,
 * and the model numbers its output steps by the hour, so `ts006` is 06:00.
 *
 * The Starkregen series above spell their layers out because their timestamps
 * are irregular (00h_54m, 00h_59m). These are not, so they are built from the
 * hour, and only the layer prefix and the style differ between the indices.
 */
const PALM4U_THERMAL_HOURS = [
  6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
];

/** 15:00, in the middle of the afternoon band where the values peak */
const PALM4U_THERMAL_INITIAL_STEP = PALM4U_THERMAL_HOURS.indexOf(15);

/**
 * One thermal index as an hourly series.
 *
 * The model area is only 1200 x 1200 m: outside that square the layers are
 * empty, and a workflow card cannot move the map (see the comment on the cards
 * below). The masked building footprints come through as nodata and stay
 * transparent, so the series shows the ground between the buildings.
 */
const palm4uThermalSeries = (
  title: string,
  /** everything between the workspace and the `_tsNNN` suffix */
  layerPrefix: string,
  styles: string
): TimeSeriesDefinition => ({
  title,
  wmsUrl: "https://wupp-palm4u-wms.cismet.de/geoserver/wms?SERVICE=WMS",
  styles,
  intermediateValuesCount: 20,
  opacity: 0.85,
  initialStep: PALM4U_THERMAL_INITIAL_STEP,
  /** one WMS layer per full hour */
  layers: PALM4U_THERMAL_HOURS.map(
    (hour) => `palm4u:${layerPrefix}_ts${String(hour).padStart(3, "0")}`
  ),
  /** what the slider shows for each step, the hour of the simulated day */
  labels: PALM4U_THERMAL_HOURS.map(
    (hour) => `${String(hour).padStart(2, "0")}:00`
  ),
});

/** physiologisch äquivalente Temperatur, classified after Matzarakis and Mayer */
const PALM4U_PET_SERIES = palm4uThermalSeries(
  "PET Tagesgang (PALM-4U)",
  "L_PET_pet3857",
  "palm4u:pet"
);

/** gefühlte Temperatur, the DWD Klima-Michel scale after Staiger et al. */
const PALM4U_PERCT_SERIES = palm4uThermalSeries(
  "Gefühlte Temperatur Tagesgang (PALM-4U)",
  "L_PERCT_perct3857",
  "palm4u:perct"
);

/** universeller thermischer Klimaindex, classified after Bröde et al. 2012 */
const PALM4U_UTCI_SERIES = palm4uThermalSeries(
  "UTCI Tagesgang (PALM-4U)",
  "L_UTCI_utci3857",
  "palm4u:utci"
);

/**
 * The PALM-4U wind field as particles, first step of the nocturnal run.
 *
 * The rasterfari behind this is the one the PALM-4U stack brought with it, and
 * its `WIND/` folder holds one u/v pair per time step: `u84_ts021.tif` through
 * `v84_ts030.tif`, 21:00 to 06:00. `scenario` and `layerPostfix` compose that
 * path, so a single step is all a `FlowFieldDefinition` can carry; the other
 * nine steps wait for the meta-workflow layer that can drive a series.
 *
 * `uvCorrection` is the one number here that is not free: the build script on
 * amy writes `u = wspeed * cos(rad(270 - wdir))`, i.e. `-wspeed * sin(wdir)`,
 * which is the meteorological "wind from" conversion, so u84 and v84 already
 * are the eastward and northward components of the motion. cage defaults to
 * `{ u: -1, v: -1 }` for the Starkregen rasters, and taking that default here
 * would run every particle against the wind. Whether PALM really writes wdir
 * as "from" is the open question on wupp #4114; if it turns out to be
 * "toward", this goes back to the default and the wdir style gains a +180.
 *
 * The gate sits one zoom below the Starkregen one because the model is only
 * 1200 m across: at zoom 16 the viewport is already inside it. Below 15 the
 * particle count still follows the viewport while every one of them is born in
 * that same square, so the field turns into a solid smear.
 */
const PALM4U_WIND_FLOW: FlowFieldDefinition = {
  title: "Windfeld 21:00 Uhr (PALM-4U)",
  service: "https://wupp-palm4u-rasterfari.cismet.de",
  scenario: "WIND/",
  layerPostfix: "_ts021",
  uvCorrection: { u: 1, v: 1 },
  minZoom: 15,
  params: {
    // The Starkregen default `#326C88` is a water blue and would read as
    // running water. White carries over both grounds the wind cards use, the
    // orthophoto and the blue-to-purple wind speed ramp.
    color: "#FFFFFF",
  },
};

/** The same animation over the wind speed of that step. */
const PALM4U_WIND_FLOW_WITH_SPEED: FlowFieldDefinition = {
  ...PALM4U_WIND_FLOW,
  title: "Windfeld und Windgeschwindigkeit 21:00 Uhr (PALM-4U)",
  backdrop: {
    wmsUrl: "https://wupp-palm4u-wms.cismet.de/geoserver/wms?SERVICE=WMS",
    layers: "palm4u:L_WIND_wspeed3857_ts021",
    styles: "palm4u:wspeed",
    // the SLD already carries 0.85, so the layer stays fully opaque here
    opacity: 1,
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
  trackUrl: `${SCHWEBEBAHN_GEOMETRY}/schwebebahn-trasse.json`,
  lengthMeters: 24.06,
  widthMeters: 2.2,
  // two driving sections around the short middle module
  sectionShares: [1, 0.17, 1],
  jointMeters: 0.7,
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
  structureUrl: `${SCHWEBEBAHN_GEOMETRY}/schwebebahn-geruest.json`,
  showTrack: false,
};

/**
 * The same service and structure in three dimensions: girders, bracing and
 * supports as box members at the model's heights, the cars as low-poly
 * bodies hanging under the rail. Registers as a 3D layer, which unlocks the
 * camera tilt, and with it the terrain, while it runs.
 */
const SCHWEBEBAHN_3D_VEHICLE: VehicleAnimationDefinition = {
  ...SCHWEBEBAHN_GERUEST_VEHICLE,
  title: "Schwebebahn in 3D",
  renderer: "three",
};

/**
 * The same fleet, run to the published timetable instead of a fixed headway.
 *
 * The asset is the Schwebebahn's share of the VRR's GTFS feed, reduced by
 * `scripts/geodata/build-schwebebahn-timetable.mjs`: every trip of the feed's
 * validity with its departure at each of the twenty stations, and the
 * calendar that says which trip runs on which day. The engine places the
 * cars by the clock, so the map shows what the timetable has between
 * Hammerstein and Robert-Daum-Platz at this moment: a car comes onto the
 * modelled stretch at one end and leaves it at the other. Headway and speed
 * are not configured, the timetable carries both; the stations come from the
 * asset too, hence the empty list, and the 70 m radius is what the feed's
 * platform positions need to find their rail.
 *
 * There is no realtime for the line to sync to: the VRR's EFA, bahn.de and
 * the gtfs.de realtime feed all carry the Schwebebahn as planned times only
 * (checked 2026-09-05), so "nach Fahrplan" is what it is.
 */
const SCHWEBEBAHN_FAHRPLAN_VEHICLE: VehicleAnimationDefinition = {
  ...SCHWEBEBAHN_VEHICLE,
  title: "Schwebebahn nach Fahrplan",
  timetableUrl: `${SCHWEBEBAHN_DATA}/schwebebahn-fahrplan.json`,
  schedule: {
    headwaySeconds: 0,
    dwellSeconds: 25,
    stations: [],
    stationRadiusMeters: 70,
  },
};

const SCHWEBEBAHN_GERUEST_FAHRPLAN_VEHICLE: VehicleAnimationDefinition = {
  ...SCHWEBEBAHN_GERUEST_VEHICLE,
  title: "Schwebebahn mit Gerüst nach Fahrplan",
  timetableUrl: SCHWEBEBAHN_FAHRPLAN_VEHICLE.timetableUrl,
  schedule: SCHWEBEBAHN_FAHRPLAN_VEHICLE.schedule,
};

const SCHWEBEBAHN_3D_FAHRPLAN_VEHICLE: VehicleAnimationDefinition = {
  ...SCHWEBEBAHN_3D_VEHICLE,
  title: "Schwebebahn in 3D nach Fahrplan",
  timetableUrl: SCHWEBEBAHN_FAHRPLAN_VEHICLE.timetableUrl,
  schedule: SCHWEBEBAHN_FAHRPLAN_VEHICLE.schedule,
};

/**
 * A flood as a plane of water over the Geobasis NRW DGM1 (wupp #4199). No
 * level and no range here on purpose: the slider takes its bounds from the
 * ground in view and starts two metres above the lowest point, so the same
 * card works in the Wupper valley and on the Ronsdorf plateau.
 */
const HOCHWASSER_FLOOD: FloodDefinition = {
  title: "Hochwasser",
};

const SCHWEBEBAHN_CARD: WorkflowDefinition<AddonEntry> = {
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
  tools: [{ addon: "vehicleAnimation", config: SCHWEBEBAHN_VEHICLE }],
};

const SCHWEBEBAHN_GERUEST_CARD: WorkflowDefinition<AddonEntry> = {
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
    { addon: "vehicleAnimation", config: SCHWEBEBAHN_GERUEST_VEHICLE },
  ],
};

const SCHWEBEBAHN_3D_CARD: WorkflowDefinition<AddonEntry> = {
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
    { addon: "vehicleAnimation", config: SCHWEBEBAHN_3D_VEHICLE },
  ],
};

const SCHWEBEBAHN_FAHRPLAN_CARD: WorkflowDefinition<AddonEntry> = {
  id: "schwebebahn-fahrplan",
  title: "Schwebebahn nach Fahrplan",
  description:
    "Inhalt: Die Schwebebahnen, die der Fahrplan für den jetzigen " +
    "Zeitpunkt vorsieht. Jede Bahn, die laut Fahrplan gerade zwischen " +
    "Hammerstein und Robert-Daum-Platz unterwegs ist, fährt auf der " +
    "Trasse; sie kommt an einem Ende des Modells herein und verlässt " +
    "es am anderen. " +
    "Sichtbarkeit: öffentlich. " +
    "Nutzung: Zeigt den Betrieb zur aktuellen Uhrzeit, nachts also " +
    "keine Bahn. Die Lupe in der Layer-Zeile springt zur " +
    "nächstgelegenen Bahn.",
  metaDataText:
    "Grundlage sind die Soll-Fahrplandaten des VRR (GTFS, Stand " +
    "August 2026, Lizenz CC-BY) für die Schwebebahn, mit den " +
    "Abfahrtszeiten an allen 20 Stationen und dem Kalender, an " +
    "welchen Tagen welche Fahrt stattfindet. Echtzeitdaten gibt es " +
    "für die Schwebebahn nicht öffentlich; die Bahnen fahren deshalb " +
    "nach dem veröffentlichten Fahrplan. Zwischen zwei Abfahrten " +
    "fährt eine Bahn so schnell, wie es der Fahrplan verlangt, und " +
    "steht 25 Sekunden vor jeder Abfahrt an der Station. Trasse und " +
    "Fahrzeuge wie in der Karte „Schwebebahn“.",
  tools: [
    { addon: "vehicleAnimation", config: SCHWEBEBAHN_FAHRPLAN_VEHICLE },
  ],
};

const SCHWEBEBAHN_GERUEST_FAHRPLAN_CARD: WorkflowDefinition<AddonEntry> = {
  id: "schwebebahn-geruest-fahrplan",
  title: "Schwebebahn mit Gerüst nach Fahrplan",
  description:
    "Inhalt: Die Fahrten nach Fahrplan aus der Karte „Schwebebahn " +
    "nach Fahrplan“, dazu das Gerüst aus der Vogelperspektive: die " +
    "beiden Fahrschienen auf ihren Trägern, der Windverband " +
    "dazwischen und die Stützen. " +
    "Sichtbarkeit: öffentlich. " +
    "Nutzung: Zeigt die Bahnen unter dem Gerüst zur aktuellen " +
    "Uhrzeit.",
  metaDataText:
    "Gerüst wie in der Karte „Schwebebahn mit Gerüst“, Fahrplan und " +
    "Fahrzeuge wie in der Karte „Schwebebahn nach Fahrplan“.",
  tools: [
    {
      addon: "vehicleAnimation",
      config: SCHWEBEBAHN_GERUEST_FAHRPLAN_VEHICLE,
    },
  ],
};

const SCHWEBEBAHN_3D_FAHRPLAN_CARD: WorkflowDefinition<AddonEntry> = {
  id: "schwebebahn-3d-fahrplan",
  title: "Schwebebahn in 3D nach Fahrplan",
  description:
    "Inhalt: Die Fahrten nach Fahrplan, räumlich: Träger, Windverband " +
    "und Stützen stehen in ihrer Höhe über dem Gelände, die Bahnen " +
    "hängen unter der Fahrschiene. " +
    "Sichtbarkeit: öffentlich. " +
    "Nutzung: Karte mit gedrückter rechter Maustaste oder mit zwei " +
    "Fingern kippen und drehen. Solange die Fahrten laufen, ist die " +
    "Kamera frei und die Geländedarstellung lässt sich einschalten.",
  metaDataText:
    "Geometrie wie in der Karte „Schwebebahn in 3D“, Fahrplan wie in " +
    "der Karte „Schwebebahn nach Fahrplan“.",
  tools: [
    {
      addon: "vehicleAnimation",
      config: SCHWEBEBAHN_3D_FAHRPLAN_VEHICLE,
    },
  ],
};

/**
 * The same card with nothing drawn at the stations, neither the dot nor the
 * name. Held stops are unaffected: the schedule keeps its stations, only their
 * markers stay off the map. For the projection mapping show, where the map is
 * thrown onto the printed model and the labels would land on the buildings.
 */
const withoutStationMarkers = (
  card: WorkflowDefinition<AddonEntry>,
  vehicle: VehicleAnimationDefinition
): WorkflowDefinition<AddonEntry> => ({
  ...card,
  id: `${card.id}_nt`,
  title: `${card.title} ohne Stationen`,
  description: card.description
    ? `${card.description} An den Stationen wird nichts gezeichnet, weder ein ` +
      "Punkt noch ein Name; gehalten wird an ihnen trotzdem."
    : card.description,
  tools: [
    {
      addon: "vehicleAnimation",
      config: {
        ...vehicle,
        schedule: vehicle.schedule
          ? { ...vehicle.schedule, showStations: false }
          : vehicle.schedule,
      },
    },
  ],
});

/**
 * The Schwebebahn cards that stay in the map plane. Shared with routes that
 * offer no 3d at all (projectionMapping.ts), which is why they are named
 * rather than written into the perspective below.
 */
export const schwebebahn2dWorkflows: WorkflowDefinition<AddonEntry>[] = [
  SCHWEBEBAHN_CARD,
  SCHWEBEBAHN_GERUEST_CARD,
  SCHWEBEBAHN_FAHRPLAN_CARD,
  SCHWEBEBAHN_GERUEST_FAHRPLAN_CARD,
];

/**
 * The same four for a map that shows no station markers at all.
 */
export const schwebebahn2dWorkflowsWithoutStations: WorkflowDefinition<AddonEntry>[] =
  [
    withoutStationMarkers(SCHWEBEBAHN_CARD, SCHWEBEBAHN_VEHICLE),
    withoutStationMarkers(SCHWEBEBAHN_GERUEST_CARD, SCHWEBEBAHN_GERUEST_VEHICLE),
    withoutStationMarkers(
      SCHWEBEBAHN_FAHRPLAN_CARD,
      SCHWEBEBAHN_FAHRPLAN_VEHICLE
    ),
    withoutStationMarkers(
      SCHWEBEBAHN_GERUEST_FAHRPLAN_CARD,
      SCHWEBEBAHN_GERUEST_FAHRPLAN_VEHICLE
    ),
  ];


export const workflowsFachzwilling: FachzwillingRoute = {
  path: "workflows",
  hideFromCatalog: true,
  title: "Workflows",
  availability: {
    deployments: ["localDev", "dev", "pr"],
  },
  // the bare engines, idle until a workflow card launches something into them
  addons: ["timeSlider", "flowField", "vehicleAnimation", "floodSimulation"],
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
          title: "Starkregen T50 (zeitlicher Verlauf)",
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
          tools: [{ addon: "timeSlider", config: STARKREGEN_T50_SERIES }],
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
          tools: [{ addon: "flowField", config: STARKREGEN_T50_FLOW }],
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
            { addon: "flowField", config: STARKREGEN_T50_FLOW_WITH_DEPTH },
          ],
        },
        {
          // No `layers`: this card adds no layer group. Its timeSlider tool
          // carries the series, and the click launches it into the engine the
          // route mounts, see `startTimeSeries` in resource-layer-updater.ts.
          id: "t100-zeitreihe",
          title: "Starkregen T100 (zeitlicher Verlauf)",
          thumbnail:
            "https://geoportal-files.cismet.de/1769010841464-1527766833261-b09c3163a791.jpg",
          description:
            "Inhalt: Simulierte Wassertiefen eines zweistündigen Starkregens " +
            "mit 42 Liter/m² Niederschlag (SRI 7), als abspielbare Zeitreihe " +
            "in 24 Schritten. Sichtbarkeit: öffentlich. Nutzung: Zeigt, wie " +
            "sich die Überflutung während des Ereignisses entwickelt.",
          metaDataText:
            "Die Zeitreihe zeigt die Simulationsergebnisse der " +
            "Starkregengefahrenkarte Wuppertal für das Szenario T100 (SRI 7) " +
            "in Schritten von fünf Minuten. Die statistische Wiederkehrzeit " +
            "des Ereignisses liegt bei 100 Jahren.",
          tools: [{ addon: "timeSlider", config: STARKREGEN_T100_SERIES }],
        },
        {
          // No `layers`: like the time series card, this one adds no layer
          // group. Its flowField tool carries the scenario and the click
          // launches it into the engine the route mounts.
          id: "t100-fliesswege",
          title: "Starkregen T100 Fließwege",
          thumbnail:
            "https://geoportal-files.cismet.de/1769010841464-1527766833261-b09c3163a791.jpg",
          description:
            "Inhalt: Fließwege eines zweistündigen Starkregens mit 42 " +
            "Liter/m² Niederschlag (SRI 7), animiert aus den maximalen " +
            "Fließgeschwindigkeiten. Sichtbarkeit: öffentlich. Nutzung: " +
            "Zeigt, wohin das Wasser an der Oberfläche abläuft. Die Animation " +
            "läuft erst ab einem größeren Maßstab, weiter herausgezoomt " +
            "bleibt die Karte ruhig.",
          metaDataText:
            "Grundlage sind die u- und v-Komponenten der Simulation zum " +
            "Szenario T100 (SRI 7). Das Feld enthält die Maximalwerte des " +
            "Ereignisses und keine Zeitschritte.",
          tools: [{ addon: "flowField", config: STARKREGEN_T100_FLOW }],
        },
        {
          // The backdrop raster travels in the tool's own config rather than
          // as a layer group, so this card also adds no layers of its own.
          id: "t100-fliesswege-wassertiefen",
          title: "Starkregen T100 Fließwege und Wassertiefen",
          thumbnail:
            "https://geoportal-files.cismet.de/1769010841464-1527766833261-b09c3163a791.jpg",
          description:
            "Inhalt: Die Fließwege des Szenarios T100 über der Karte der " +
            "maximalen Wassertiefen desselben Ereignisses. Sichtbarkeit: " +
            "öffentlich. Nutzung: Verbindet die Frage, wo Wasser steht, mit " +
            "der Frage, wohin es läuft. Die Animation läuft erst ab einem " +
            "größeren Maßstab, die Wassertiefen sind in jedem Maßstab zu " +
            "sehen.",
          metaDataText:
            "Grundlage sind die u- und v-Komponenten der Simulation zum " +
            "Szenario T100 (SRI 7). Das Feld enthält die Maximalwerte des " +
            "Ereignisses und keine Zeitschritte.",
          tools: [
            { addon: "flowField", config: STARKREGEN_T100_FLOW_WITH_DEPTH },
          ],
        },
        {
          // No `layers`: this card adds no layer group. Its timeSlider tool
          // carries the series, and the click launches it into the engine the
          // route mounts, see `startTimeSeries` in resource-layer-updater.ts.
          id: "90mm-zeitreihe",
          title: "Starkregen 90 mm (zeitlicher Verlauf)",
          thumbnail:
            "https://geoportal-files.cismet.de/1769010841464-1527766833261-b09c3163a791.jpg",
          description:
            "Inhalt: Simulierte Wassertiefen eines einstündigen Starkregens " +
            "mit 90 Liter/m² Niederschlag (SRI 10), als abspielbare Zeitreihe " +
            "in 24 Schritten. Sichtbarkeit: öffentlich. Nutzung: Zeigt, wie " +
            "sich die Überflutung während des Ereignisses entwickelt.",
          metaDataText:
            "Die Zeitreihe zeigt die Simulationsergebnisse der " +
            "Starkregengefahrenkarte Wuppertal für einen einstündigen Regen " +
            "mit 90 Liter/m² (SRI 10) in Schritten von fünf Minuten.",
          tools: [{ addon: "timeSlider", config: STARKREGEN_90MM_SERIES }],
        },
        {
          // No `layers`: like the time series card, this one adds no layer
          // group. Its flowField tool carries the scenario and the click
          // launches it into the engine the route mounts.
          id: "90mm-fliesswege",
          title: "Starkregen 90 mm Fließwege",
          thumbnail:
            "https://geoportal-files.cismet.de/1769010841464-1527766833261-b09c3163a791.jpg",
          description:
            "Inhalt: Fließwege eines einstündigen Starkregens mit 90 Liter/m² " +
            "Niederschlag (SRI 10), animiert aus den maximalen " +
            "Fließgeschwindigkeiten. Sichtbarkeit: öffentlich. Nutzung: " +
            "Zeigt, wohin das Wasser an der Oberfläche abläuft. Die Animation " +
            "läuft erst ab einem größeren Maßstab, weiter herausgezoomt " +
            "bleibt die Karte ruhig.",
          metaDataText:
            "Grundlage sind die u- und v-Komponenten der Simulation zum Regen " +
            "mit 90 Liter/m² (SRI 10). Das Feld enthält die Maximalwerte des " +
            "Ereignisses und keine Zeitschritte.",
          tools: [{ addon: "flowField", config: STARKREGEN_90MM_FLOW }],
        },
        {
          // The backdrop raster travels in the tool's own config rather than
          // as a layer group, so this card also adds no layers of its own.
          id: "90mm-fliesswege-wassertiefen",
          title: "Starkregen 90 mm Fließwege und Wassertiefen",
          thumbnail:
            "https://geoportal-files.cismet.de/1769010841464-1527766833261-b09c3163a791.jpg",
          description:
            "Inhalt: Die Fließwege des Szenarios mit 90 Liter/m² über der " +
            "Karte der maximalen Wassertiefen desselben Ereignisses. " +
            "Sichtbarkeit: öffentlich. Nutzung: Verbindet die Frage, wo " +
            "Wasser steht, mit der Frage, wohin es läuft. Die Animation läuft " +
            "erst ab einem größeren Maßstab, die Wassertiefen sind in jedem " +
            "Maßstab zu sehen.",
          metaDataText:
            "Grundlage sind die u- und v-Komponenten der Simulation zum Regen " +
            "mit 90 Liter/m² (SRI 10). Das Feld enthält die Maximalwerte des " +
            "Ereignisses und keine Zeitschritte.",
          tools: [
            { addon: "flowField", config: STARKREGEN_90MM_FLOW_WITH_DEPTH },
          ],
        },
        {
          // No `layers`: this card adds no layer group. Its timeSlider tool
          // carries the series, and the click launches it into the engine the
          // route mounts, see `startTimeSeries` in resource-layer-updater.ts.
          id: "extrem2018-zeitreihe",
          title: "Regen vom 29.05.2018 (zeitlicher Verlauf)",
          thumbnail:
            "https://geoportal-files.cismet.de/1769010841464-1527766833261-b09c3163a791.jpg",
          description:
            "Inhalt: Simulierte Wassertiefen des Regens vom 29.05.2018 (SRI " +
            "11), als abspielbare Zeitreihe in 24 Schritten. Sichtbarkeit: " +
            "öffentlich. Nutzung: Zeigt, wie sich die Überflutung während des " +
            "Ereignisses entwickelt.",
          metaDataText:
            "Die Zeitreihe zeigt die Simulationsergebnisse der " +
            "Starkregengefahrenkarte Wuppertal für den Regen vom 29.05.2018 " +
            "(SRI 11) in Schritten von fünf Minuten. Gerechnet wurde er aus " +
            "den gemessenen Niederschlagsmengen des Ereignisses.",
          tools: [
            { addon: "timeSlider", config: STARKREGEN_EXTREM2018_SERIES },
          ],
        },
        {
          // No `layers`: like the time series card, this one adds no layer
          // group. Its flowField tool carries the scenario and the click
          // launches it into the engine the route mounts.
          id: "extrem2018-fliesswege",
          title: "Regen vom 29.05.2018 Fließwege",
          thumbnail:
            "https://geoportal-files.cismet.de/1769010841464-1527766833261-b09c3163a791.jpg",
          description:
            "Inhalt: Fließwege des Regens vom 29.05.2018 (SRI 11), animiert " +
            "aus den maximalen Fließgeschwindigkeiten. Sichtbarkeit: " +
            "öffentlich. Nutzung: Zeigt, wohin das Wasser an der Oberfläche " +
            "abläuft. Die Animation läuft erst ab einem größeren Maßstab, " +
            "weiter herausgezoomt bleibt die Karte ruhig.",
          metaDataText:
            "Grundlage sind die u- und v-Komponenten der Simulation zum Regen " +
            "vom 29.05.2018 (SRI 11). Das Feld enthält die Maximalwerte des " +
            "Ereignisses und keine Zeitschritte.",
          tools: [{ addon: "flowField", config: STARKREGEN_EXTREM2018_FLOW }],
        },
        {
          // The backdrop raster travels in the tool's own config rather than
          // as a layer group, so this card also adds no layers of its own.
          id: "extrem2018-fliesswege-wassertiefen",
          title: "Regen vom 29.05.2018 Fließwege und Wassertiefen",
          thumbnail:
            "https://geoportal-files.cismet.de/1769010841464-1527766833261-b09c3163a791.jpg",
          description:
            "Inhalt: Die Fließwege des Regens vom 29.05.2018 über der Karte " +
            "der maximalen Wassertiefen desselben Ereignisses. Sichtbarkeit: " +
            "öffentlich. Nutzung: Verbindet die Frage, wo Wasser steht, mit " +
            "der Frage, wohin es läuft. Die Animation läuft erst ab einem " +
            "größeren Maßstab, die Wassertiefen sind in jedem Maßstab zu " +
            "sehen.",
          metaDataText:
            "Grundlage sind die u- und v-Komponenten der Simulation zum Regen " +
            "vom 29.05.2018 (SRI 11). Das Feld enthält die Maximalwerte des " +
            "Ereignisses und keine Zeitschritte.",
          tools: [
            {
              addon: "flowField",
              config: STARKREGEN_EXTREM2018_FLOW_WITH_DEPTH,
            },
          ],
        },
      ],
    },
    {
      id: "stadtklima",
      title: "Stadtklima",
      workflows: [
        {
          // No `layers`: like the Starkregen time series, this card adds no
          // layer group. Its timeSlider tool carries the series and the click
          // launches it into the engine the route mounts. That path returns
          // before any layer group is built, so the card can neither move the
          // map to the model area nor show a legend; the map has to be over
          // the Rathaus already for the series to be visible.
          id: "pet-tagesgang",
          title: "PET Tagesgang (PALM-4U)",
          description:
            "Inhalt: Die physiologisch äquivalente Temperatur (PET) an " +
            "einem heißen Tag, stündlich von 06:00 bis 20:00 Uhr, als " +
            "abspielbare Zeitreihe. " +
            "Sichtbarkeit: öffentlich. " +
            "Nutzung: Zeigt, wo es im Tagesverlauf heiß wird und welche " +
            "Flächen im Schatten bleiben. Die Simulation deckt nur einen " +
            "Quadratkilometer rund um das Rathaus ab; außerhalb bleibt die " +
            "Karte leer.",
          metaDataText:
            "Grundlage ist eine PALM-4U-Simulation aus einer Schulung der " +
            "Stadt Wuppertal beim Fraunhofer IBP, ein Gebiet von 1200 mal " +
            "1200 Metern um das Rathaus mit 5 Metern Rasterweite. Die " +
            "Gebäudeflächen sind im Modell ausmaskiert und bleiben " +
            "durchsichtig. Die Farbklassen folgen der Skala von Matzarakis " +
            "und Mayer für das thermische Empfinden in Mitteleuropa; sie " +
            "sind nicht an diese Simulation angepasst. Die Daten sind ein " +
            "Testdatensatz und beschreiben keinen gemessenen Tag.",
          tools: [{ addon: "timeSlider", config: PALM4U_PET_SERIES }],
        },
        {
          // Same run and the same hours as the PET card, a different index.
          id: "perct-tagesgang",
          title: "Gefühlte Temperatur Tagesgang (PALM-4U)",
          description:
            "Inhalt: Die gefühlte Temperatur an einem heißen Tag, stündlich " +
            "von 06:00 bis 20:00 Uhr, als abspielbare Zeitreihe. " +
            "Sichtbarkeit: öffentlich. " +
            "Nutzung: Dasselbe Simulationsergebnis wie beim PET-Tagesgang, " +
            "bewertet nach der Skala des Deutschen Wetterdienstes. Die " +
            "Simulation deckt nur einen Quadratkilometer rund um das " +
            "Rathaus ab; außerhalb bleibt die Karte leer.",
          metaDataText:
            "Grundlage ist eine PALM-4U-Simulation aus einer Schulung der " +
            "Stadt Wuppertal beim Fraunhofer IBP, ein Gebiet von 1200 mal " +
            "1200 Metern um das Rathaus mit 5 Metern Rasterweite. Die " +
            "Gebäudeflächen sind im Modell ausmaskiert und bleiben " +
            "durchsichtig. Die Farbklassen sind die Belastungsklassen der " +
            "gefühlten Temperatur nach Staiger et al. aus dem " +
            "Klima-Michel-Modell des DWD; sie sind nicht an diese " +
            "Simulation angepasst. Die Daten sind ein Testdatensatz und " +
            "beschreiben keinen gemessenen Tag.",
          tools: [{ addon: "timeSlider", config: PALM4U_PERCT_SERIES }],
        },
        {
          // Same run and the same hours as the PET card, a different index.
          id: "utci-tagesgang",
          title: "UTCI Tagesgang (PALM-4U)",
          description:
            "Inhalt: Der universelle thermische Klimaindex (UTCI) an einem " +
            "heißen Tag, stündlich von 06:00 bis 20:00 Uhr, als abspielbare " +
            "Zeitreihe. " +
            "Sichtbarkeit: öffentlich. " +
            "Nutzung: Dasselbe Simulationsergebnis wie beim PET-Tagesgang, " +
            "bewertet nach der international abgestimmten UTCI-Skala. Die " +
            "Simulation deckt nur einen Quadratkilometer rund um das " +
            "Rathaus ab; außerhalb bleibt die Karte leer.",
          metaDataText:
            "Grundlage ist eine PALM-4U-Simulation aus einer Schulung der " +
            "Stadt Wuppertal beim Fraunhofer IBP, ein Gebiet von 1200 mal " +
            "1200 Metern um das Rathaus mit 5 Metern Rasterweite. Die " +
            "Gebäudeflächen sind im Modell ausmaskiert und bleiben " +
            "durchsichtig. Die Farbklassen sind die Wärmebelastungsklassen " +
            "der UTCI-Skala nach Bröde et al. 2012; sie sind nicht an diese " +
            "Simulation angepasst. Die Daten sind ein Testdatensatz und " +
            "beschreiben keinen gemessenen Tag.",
          tools: [{ addon: "timeSlider", config: PALM4U_UTCI_SERIES }],
        },
        {
          // The same run as the three Tagesgang cards, but its night hours and
          // its wind quantities, so this one goes to the flowField engine
          // instead of the timeSlider. No `layers` and no backdrop: the
          // particles are all this card puts on the map.
          id: "windfeld",
          title: "Windfeld 21:00 Uhr (PALM-4U)",
          description:
            "Inhalt: Das simulierte Windfeld um 21:00 Uhr, als " +
            "Partikelanimation über der Karte. " +
            "Sichtbarkeit: öffentlich. " +
            "Nutzung: Zeigt, wo der Wind zwischen den Gebäuden durchzieht " +
            "und wo er abgebremst wird. Die Animation läuft erst ab einem " +
            "größeren Maßstab, weiter herausgezoomt bleibt die Karte ruhig. " +
            "Die Simulation deckt nur einen Quadratkilometer rund um das " +
            "Rathaus ab; außerhalb bleibt die Karte leer.",
          metaDataText:
            "Grundlage ist dieselbe PALM-4U-Simulation wie bei den " +
            "Tagesgängen, ein Gebiet von 1200 mal 1200 Metern um das " +
            "Rathaus mit 5 Metern Rasterweite. Die Partikel folgen den u- " +
            "und v-Komponenten, die aus Windrichtung und " +
            "Windgeschwindigkeit des Zeitschritts berechnet sind. Der " +
            "Windteil der Simulation reicht von 21:00 bis 06:00 Uhr; hier " +
            "ist bisher nur die erste Stunde hinterlegt. Die Daten sind ein " +
            "Testdatensatz und beschreiben keine gemessene Nacht.",
          tools: [{ addon: "flowField", config: PALM4U_WIND_FLOW }],
        },
        {
          // The backdrop raster travels in the tool's own config rather than
          // as a layer group, so this card also adds no layers of its own.
          id: "windfeld-windgeschwindigkeit",
          title: "Windfeld und Windgeschwindigkeit 21:00 Uhr (PALM-4U)",
          description:
            "Inhalt: Dasselbe Windfeld über der Karte der simulierten " +
            "Windgeschwindigkeit desselben Zeitschritts. " +
            "Sichtbarkeit: öffentlich. " +
            "Nutzung: Verbindet die Frage, wohin der Wind weht, mit der " +
            "Frage, wie stark er ist. Die Animation läuft erst ab einem " +
            "größeren Maßstab, die Windgeschwindigkeit ist in jedem Maßstab " +
            "zu sehen.",
          metaDataText:
            "Die Farbskala der Windgeschwindigkeit ist auf diese Simulation " +
            "gelegt, deren Maximum bei 3,31 m/s liegt; sie lässt sich nicht " +
            "auf andere Läufe übertragen. Ansonsten gilt dasselbe wie beim " +
            "Windfeld ohne Hintergrund: eine PALM-4U-Simulation über 1200 " +
            "mal 1200 Meter um das Rathaus mit 5 Metern Rasterweite, " +
            "Zeitschritt 21:00 Uhr, ein Testdatensatz ohne gemessene Nacht.",
          tools: [{ addon: "flowField", config: PALM4U_WIND_FLOW_WITH_SPEED }],
        },
      ],
    },
    {
      id: "mobilitaet",
      title: "Mobilität",
      workflows: [
        SCHWEBEBAHN_CARD,
        SCHWEBEBAHN_GERUEST_CARD,
        SCHWEBEBAHN_3D_CARD,
        SCHWEBEBAHN_FAHRPLAN_CARD,
        SCHWEBEBAHN_GERUEST_FAHRPLAN_CARD,
        SCHWEBEBAHN_3D_FAHRPLAN_CARD,
      ],
    },
    {
      id: "hochwasser",
      title: "Hochwasser",
      workflows: [
        {
          // No `layers`: like the time series card, this one adds no layer
          // group. Its floodSimulation tool is the flood, and the click
          // launches it into the engine the route mounts.
          id: "wasserstand",
          title: "Hochwasser: Wasserstand",
          description:
            "Inhalt: Eine Wasserfläche in frei wählbarer Höhe über dem " +
            "Geländemodell, als Ebene ohne Abflussberechnung. " +
            "Sichtbarkeit: öffentlich. " +
            "Nutzung: Zeigt, welche Flächen bei einem angenommenen " +
            "Wasserstand unter Wasser stünden. Der Wasserstand wird mit " +
            "einem Regler eingestellt.",
          metaDataText:
            "Grundlage ist das Digitale Geländemodell DGM1 von Geobasis " +
            "NRW mit Höhen über Normalhöhennull (DHHN2016). Die " +
            "Darstellung ist ein ebener Wasserstand über dem Gelände und " +
            "keine hydraulische Simulation.",
          tools: [{ addon: "floodSimulation", config: HOCHWASSER_FLOOD }],
        },
      ],
    },
  ],
};
