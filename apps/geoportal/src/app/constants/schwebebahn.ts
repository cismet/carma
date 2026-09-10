import type { VehicleAnimationDefinition } from "@carma-mapping/addons";
import { ASSET_BASE_URL } from "@carma-mapping/layers";

/**
 * The Schwebebahn as the `vehicleAnimation` addon runs it, in every variant the
 * app offers. Two consumers: the workflow cards of the `workflows`
 * Fachzwilling, and the always-on default workflow (`default-workflows.ts`),
 * which is why these live here rather than next to the cards.
 */

/** the Schwebebahn geometry and timetable, too big to ship with the app */
const SCHWEBEBAHN_GEOMETRY = `${ASSET_BASE_URL}/geoportal/geojson`;
const SCHWEBEBAHN_DATA = `${ASSET_BASE_URL}/geoportal/data`;

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
export const SCHWEBEBAHN_VEHICLE: VehicleAnimationDefinition = {
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
export const SCHWEBEBAHN_GERUEST_VEHICLE: VehicleAnimationDefinition = {
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
export const SCHWEBEBAHN_FAHRPLAN_VEHICLE: VehicleAnimationDefinition = {
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
