import type { VehicleAnimationDefinition } from "@carma-mapping/addons";

/**
 * The Schwebebahn as the `vehicleAnimation` addon runs it, in every variant the
 * workflow cards of the `workflows` Fachzwilling offer. The default
 * Schwebebahn is a layer now (`default-layers.ts`) whose style carries its own
 * copy of this config.
 */

/**
 * The Schwebebahn geometry and timetable, too big to ship with the app. The
 * tiling pipeline's `schwebebahn` layer publishes them; its styles, and with
 * them the default layer, load the same files.
 */
const SCHWEBEBAHN_ASSETS = "https://tiles.cismet.de/schwebebahn/assets";

/**
 * The twenty stations of the line, west to east, Vohwinkel to Oberbarmen.
 *
 * Coordinates from OpenStreetMap (the platforms of the Schwebebahn route
 * relations), the same list the timetable asset and the `schwebebahn` layer's
 * styles carry.
 */
const SCHWEBEBAHN_STATIONS = [
  { name: "Vohwinkel", lon: 7.0677466, lat: 51.2303639 },
  { name: "Bruch", lon: 7.0770378, lat: 51.2342593 },
  { name: "Hammerstein", lon: 7.0882804, lat: 51.2363701 },
  { name: "Sonnborner Straße", lon: 7.0966369, lat: 51.2381157 },
  { name: "Zoo/Stadion", lon: 7.1032614, lat: 51.2409356 },
  { name: "Varresbecker Straße", lon: 7.1070586, lat: 51.2465776 },
  { name: "Westende", lon: 7.1184923, lat: 51.2489628 },
  { name: "Pestalozzistraße", lon: 7.1254141, lat: 51.2486332 },
  { name: "Robert-Daum-Platz", lon: 7.1343585, lat: 51.252404 },
  { name: "Ohligsmühle", lon: 7.1426469, lat: 51.2553653 },
  { name: "Hauptbahnhof", lon: 7.14842, lat: 51.2559198 },
  { name: "Kluse", lon: 7.1544984, lat: 51.2556921 },
  { name: "Landgericht", lon: 7.1624765, lat: 51.2580825 },
  { name: "Völklinger Straße", lon: 7.1740735, lat: 51.2624917 },
  { name: "Loher Brücke", lon: 7.1813094, lat: 51.267174 },
  { name: "Adlerbrücke", lon: 7.1889406, lat: 51.2670462 },
  { name: "Alter Markt", lon: 7.1981616, lat: 51.2695117 },
  { name: "Werther Brücke", lon: 7.2067081, lat: 51.272337 },
  { name: "Wupperfeld", lon: 7.2138122, lat: 51.2732981 },
  { name: "Oberbarmen", lon: 7.2221704, lat: 51.2747291 },
];

/**
 * Schwebebahnen running the trasse to the real service pattern.
 *
 * The route asset is the horizontal centre line of the city's 3D trasse model
 * of the whole line (delivery of 19.10.2026), reduced by
 * `scripts/geodata/build-schwebebahn-track.mjs`. At Vohwinkel and Oberbarmen
 * the model's ends are replaced by OpenStreetMap's track through the depot
 * hall and round its turning loop (the pipeline's
 * `_in/schwebebahn/_build-wendeschleifen.js`). That makes a closed ring of
 * about 27 kilometres, out on one rail, round the loop and back on the other,
 * so a car drives the whole ring rather than turning around: hence
 * `mode: "loop"`, and hence each station being served twice per lap, once per
 * direction.
 *
 * The numbers are the WSW service: a 3:40 headway at peak times, a full run
 * from end to end in about half an hour. 36 km/h between stops plus 25 seconds
 * at each one gives the line's ~27 km/h average, and how many cars that takes
 * follows from the route rather than being configured. The car is a GTW 15:
 * 24.06 m long, 2.2 m wide, three sections with two rubber articulations, pale
 * blue.
 */
export const SCHWEBEBAHN_VEHICLE: VehicleAnimationDefinition = {
  title: "Schwebebahn",
  trackUrl: `${SCHWEBEBAHN_ASSETS}/schwebebahn-trasse.json`,
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
 * modelled, depot track included, the 512 supports as 19 shapes placed where
 * the model has them, and the wind bracing between the two rails, which the
 * model does not contain and which the script adds as five-metre X panels.
 * Inside the depot halls the rails lie too far apart for bracing, so there is
 * none. The plain route line is off: the rail drawn on top of the girder takes
 * its place.
 */
export const SCHWEBEBAHN_GERUEST_VEHICLE: VehicleAnimationDefinition = {
  ...SCHWEBEBAHN_VEHICLE,
  title: "Schwebebahn mit Gerüst",
  structureUrl: `${SCHWEBEBAHN_ASSETS}/schwebebahn-geruest.json`,
  showTrack: false,
};

/**
 * The same service and structure in three dimensions: girders, bracing and
 * supports as box members at the model's heights, the cars as low-poly
 * bodies hanging under the rail. Registers as a 3D layer, which unlocks the
 * camera tilt, and with it the terrain, while it runs.
 */
export const SCHWEBEBAHN_3D_VEHICLE: VehicleAnimationDefinition = {
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
 * cars by the clock, so the map shows what the timetable has on the line at
 * this moment: a car runs from Vohwinkel to Oberbarmen or back, turns in the
 * loop in the depot hall behind the terminus, and waits on the straight there,
 * first in, first out, until its next trip leaves. Headway and speed are not
 * configured, the timetable carries both; the stations come from the asset
 * too, hence the empty list, and the 40 m radius is the engine's default and
 * the `schwebebahn` layer's value.
 *
 * There is no realtime for the line to sync to: the VRR's EFA, bahn.de and
 * the gtfs.de realtime feed all carry the Schwebebahn as planned times only
 * (checked 2026-09-05), so "nach Fahrplan" is what it is.
 */
export const SCHWEBEBAHN_FAHRPLAN_VEHICLE: VehicleAnimationDefinition = {
  ...SCHWEBEBAHN_VEHICLE,
  title: "Schwebebahn nach Fahrplan",
  timetableUrl: `${SCHWEBEBAHN_ASSETS}/schwebebahn-fahrplan.json`,
  schedule: {
    headwaySeconds: 0,
    dwellSeconds: 25,
    stations: [],
    stationRadiusMeters: 40,
  },
};

export const SCHWEBEBAHN_GERUEST_FAHRPLAN_VEHICLE: VehicleAnimationDefinition =
  {
    ...SCHWEBEBAHN_GERUEST_VEHICLE,
    title: "Schwebebahn mit Gerüst nach Fahrplan",
    timetableUrl: SCHWEBEBAHN_FAHRPLAN_VEHICLE.timetableUrl,
    schedule: SCHWEBEBAHN_FAHRPLAN_VEHICLE.schedule,
  };

export const SCHWEBEBAHN_3D_FAHRPLAN_VEHICLE: VehicleAnimationDefinition = {
  ...SCHWEBEBAHN_3D_VEHICLE,
  title: "Schwebebahn in 3D nach Fahrplan",
  timetableUrl: SCHWEBEBAHN_FAHRPLAN_VEHICLE.timetableUrl,
  schedule: SCHWEBEBAHN_FAHRPLAN_VEHICLE.schedule,
};
