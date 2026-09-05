/**
 * Reduces a GTFS feed to the timetable of one line, in the shape the
 * `vehicleAnimation` addon runs a fleet from (`timetable.ts`): the stations
 * in line order with one position each, the service calendar, and every trip
 * as its departure time at each station.
 *
 * Written for the Schwebebahn in the VRR's Soll-Fahrplandaten
 * (opendata-oepnv.de, CC-BY), but nothing in here is specific to it beyond the
 * default route id and the way station names are shortened.
 *
 * What it does:
 *
 *   1. finds the route and its trips, and the services those trips run on,
 *   2. streams stop_times.txt once, keeping the rows of those trips,
 *   3. takes the station order from the longest trip in direction 0 and checks
 *      that every other trip follows it (forwards or backwards),
 *   4. positions each station at the mean of its platforms,
 *   5. writes the calendar of the services used, with their exception days.
 *
 * Usage:
 *   unzip google_transit.zip -d <gtfs-dir>
 *   node scripts/geodata/build-schwebebahn-timetable.mjs <gtfs-dir> <target.json> [route id]
 */
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

const DEFAULT_ROUTE_ID = "de:vrr:60-W-60:WSW-64-60";

const [, , gtfsDir, targetPath, routeIdArg] = process.argv;
if (!gtfsDir || !targetPath) {
  console.error(
    "usage: node build-schwebebahn-timetable.mjs <gtfs-dir> <target.json> [route id]"
  );
  process.exit(1);
}
const routeId = routeIdArg ?? DEFAULT_ROUTE_ID;

/* ------------------------------------------------------------------ *
 *  CSV
 * ------------------------------------------------------------------ */

/** one CSV line as fields; quotes and doubled quotes as RFC 4180 has them */
const parseLine = (line) => {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
};

const stripBom = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

/** a whole GTFS table as records keyed by its header */
const readTable = (name) => {
  const text = stripBom(readFileSync(join(gtfsDir, name), "utf8"));
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  const header = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const fields = parseLine(line);
    const record = {};
    header.forEach((key, index) => {
      record[key] = fields[index] ?? "";
    });
    return record;
  });
};

/** "HH:MM:SS" as seconds after midnight; hours may run past 23 */
const toSeconds = (text) => {
  const [h, m, s] = text.split(":").map(Number);
  return h * 3600 + m * 60 + (s || 0);
};

/* ------------------------------------------------------------------ *
 *  Route, trips, services
 * ------------------------------------------------------------------ */

const routes = readTable("routes.txt");
const route = routes.find((row) => row.route_id === routeId);
if (!route) {
  console.error(`route ${routeId} not in routes.txt`);
  process.exit(1);
}

const agencies = readTable("agency.txt");
const agency = agencies.find((row) => row.agency_id === route.agency_id) ?? agencies[0];
const timezone = agency?.agency_timezone || "Europe/Berlin";

const trips = readTable("trips.txt").filter((row) => row.route_id === routeId);
if (trips.length === 0) {
  console.error(`route ${routeId} has no trips`);
  process.exit(1);
}
const tripById = new Map(trips.map((trip) => [trip.trip_id, trip]));
const serviceIds = new Set(trips.map((trip) => trip.service_id));

const feedInfo = readTable("feed_info.txt")[0] ?? {};

/* ------------------------------------------------------------------ *
 *  Stop times, streamed: the table is the bulk of the feed
 * ------------------------------------------------------------------ */

/** trip id -> [{ sequence, stopId, departure }] */
const stopTimes = new Map();
{
  const stream = createReadStream(join(gtfsDir, "stop_times.txt"), "utf8");
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let header = null;
  for await (const rawLine of lines) {
    const line = stripBom(rawLine);
    if (!header) {
      header = parseLine(line);
      continue;
    }
    if (line.length === 0) continue;
    const fields = parseLine(line);
    const tripId = fields[header.indexOf("trip_id")];
    if (!tripById.has(tripId)) continue;
    const entry = {
      sequence: Number(fields[header.indexOf("stop_sequence")]),
      stopId: fields[header.indexOf("stop_id")],
      departure: toSeconds(fields[header.indexOf("departure_time")]),
    };
    const list = stopTimes.get(tripId);
    if (list) list.push(entry);
    else stopTimes.set(tripId, [entry]);
  }
}
for (const list of stopTimes.values()) {
  list.sort((a, b) => a.sequence - b.sequence);
}

/* ------------------------------------------------------------------ *
 *  Stations: a stop's parent, positioned at the mean of its platforms
 * ------------------------------------------------------------------ */

const stops = readTable("stops.txt");
const stopById = new Map(stops.map((stop) => [stop.stop_id, stop]));

/** the station a platform belongs to */
const stationOf = (stopId) => {
  const stop = stopById.get(stopId);
  if (stop?.parent_station) return stop.parent_station;
  // DHID platforms are `country:region:stop:area:platform`; the stop is the
  // first three parts
  const parts = stopId.split(":");
  return parts.length > 3 ? parts.slice(0, 3).join(":") : stopId;
};

/** "Wuppertal Hbf Bstg 1" -> "Hauptbahnhof": the name a map label wants */
const shortName = (name) =>
  name
    .replace(/^Wuppertal\s+/, "")
    .replace(/^W-/, "")
    .replace(/\s+Bstg\s+\S+$/, "")
    .replace(/\s+Schwebebahn$/, "")
    .replace(/\s+Bf$/, "")
    .replace(/\/Stadth\.$/, "")
    .replace(/^Hbf$/, "Hauptbahnhof")
    .trim();

const stationRecord = (stationId) => {
  const platforms = stops.filter(
    (stop) =>
      stop.stop_id !== stationId &&
      stationOf(stop.stop_id) === stationId &&
      stop.stop_lat &&
      stop.stop_lon
  );
  const parent = stopById.get(stationId);
  const positioned =
    platforms.length > 0
      ? platforms
      : parent?.stop_lat
        ? [parent]
        : [];
  if (positioned.length === 0) {
    console.error(`station ${stationId} has no positioned stop`);
    process.exit(1);
  }
  const lon =
    positioned.reduce((sum, stop) => sum + Number(stop.stop_lon), 0) /
    positioned.length;
  const lat =
    positioned.reduce((sum, stop) => sum + Number(stop.stop_lat), 0) /
    positioned.length;
  const names = [...new Set([parent, ...platforms].filter(Boolean).map((stop) => shortName(stop.stop_name)))];
  names.sort((a, b) => a.length - b.length);
  return {
    id: stationId,
    name: names[0],
    lon: Number(lon.toFixed(6)),
    lat: Number(lat.toFixed(6)),
  };
};

/* ------------------------------------------------------------------ *
 *  Station order, from the longest trip in direction 0
 * ------------------------------------------------------------------ */

const sequenceOf = (tripId) => (stopTimes.get(tripId) ?? []).map((entry) => stationOf(entry.stopId));

const longestForward = trips
  .filter((trip) => (trip.direction_id || "0") === "0")
  .map((trip) => trip.trip_id)
  .sort((a, b) => sequenceOf(b).length - sequenceOf(a).length)[0];
const order = sequenceOf(longestForward);
if (order.length < 2) {
  console.error("no trip with at least two stops in direction 0");
  process.exit(1);
}
const indexOf = new Map(order.map((stationId, index) => [stationId, index]));

/** whether `sequence` visits stations of `order` strictly in that direction */
const runs = (sequence, backwards) => {
  let last = backwards ? Infinity : -Infinity;
  for (const stationId of sequence) {
    const index = indexOf.get(stationId);
    if (index === undefined) return false;
    if (backwards ? index >= last : index <= last) return false;
    last = index;
  }
  return true;
};

const tripRecords = [];
let skipped = 0;
for (const trip of trips) {
  const entries = stopTimes.get(trip.trip_id);
  if (!entries || entries.length < 2) {
    skipped++;
    continue;
  }
  const sequence = entries.map((entry) => stationOf(entry.stopId));
  const forward = runs(sequence, false);
  const backward = !forward && runs(sequence, true);
  if (!forward && !backward) {
    console.error(`trip ${trip.trip_id} does not follow the station order: ${sequence.join(" > ")}`);
    process.exit(1);
  }
  const times = order.map(() => null);
  entries.forEach((entry, position) => {
    times[indexOf.get(sequence[position])] = entry.departure;
  });
  tripRecords.push({
    service: trip.service_id,
    direction: forward ? "forward" : "backward",
    times,
  });
}

/* ------------------------------------------------------------------ *
 *  Calendar of the services used
 * ------------------------------------------------------------------ */

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const calendar = new Map(
  readTable("calendar.txt")
    .filter((row) => serviceIds.has(row.service_id))
    .map((row) => [row.service_id, row])
);
const exceptions = readTable("calendar_dates.txt").filter((row) => serviceIds.has(row.service_id));

const services = {};
for (const serviceId of [...serviceIds].sort()) {
  const row = calendar.get(serviceId);
  const added = exceptions
    .filter((entry) => entry.service_id === serviceId && entry.exception_type === "1")
    .map((entry) => entry.date)
    .sort();
  const removed = exceptions
    .filter((entry) => entry.service_id === serviceId && entry.exception_type === "2")
    .map((entry) => entry.date)
    .sort();
  services[serviceId] = {
    days: DAY_KEYS.map((key) => (row?.[key] === "1" ? 1 : 0)),
    // a service that only exists as exception days runs on those days alone
    start: row?.start_date ?? added[0] ?? "00000000",
    end: row?.end_date ?? added[added.length - 1] ?? "00000000",
    added,
    removed,
  };
}

/* ------------------------------------------------------------------ *
 *  Write
 * ------------------------------------------------------------------ */

const stations = order.map(stationRecord);

const asset = {
  type: "VehicleTimetable",
  name: route.route_long_name || route.route_short_name || routeId,
  routeId,
  source: [
    feedInfo.feed_publisher_name,
    feedInfo.feed_version ? `feed_version ${feedInfo.feed_version}` : "",
  ]
    .filter(Boolean)
    .join(", "),
  timezone,
  validFrom: feedInfo.feed_start_date ?? "",
  validTo: feedInfo.feed_end_date ?? "",
  stations,
  services,
  trips: tripRecords,
};

// header readable, one trip per line: a diff of a new feed month then shows
// which trips changed instead of one rewritten blob
const { trips: tripsOut, ...head } = asset;
const headText = JSON.stringify(head, null, 2);
const tripsText = tripsOut.map((trip) => `    ${JSON.stringify(trip)}`).join(",\n");
writeFileSync(
  targetPath,
  `${headText.slice(0, -2)},\n  "trips": [\n${tripsText}\n  ]\n}\n`
);

console.log(
  `${asset.name}: ${stations.length} stations, ${tripRecords.length} trips` +
    ` (${skipped} without stop times), ${Object.keys(services).length} services,` +
    ` ${feedInfo.feed_start_date ?? "?"} to ${feedInfo.feed_end_date ?? "?"}, ${timezone}`
);
console.log(stations.map((station) => station.name).join(" > "));
