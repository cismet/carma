import { Matrix4, Quaternion } from "three";
import type { Matrix3RowMajor } from "@carma-commons/math";
import type { Meters } from "@carma-units";
import type { ObliqueMetadata, ObliqueMetadataImage } from "../types";

/** One indexed catalogue replaces the directional JSON transport. Private PRJ/DEM
 * producers live outside this repository; only their bounded decoder is shipped. */
export const COMPACT_CATALOG_FORMAT = "oblique-compact-v2" as const;
const MAGIC = "OBCQ0002";
const MAX_IMAGES = 1_000_000;
const numericSections = [
  "ecefX",
  "ecefY",
  "ecefZ",
  "quaternionIndex",
  "quaternionSmall0",
  "quaternionSmall1",
  "quaternionSmall2",
  "sensorRange",
] as const;
type Header = {
  format: string;
  version: number;
  seriesId: string;
  imageCount: number;
  captureCount: number;
  cameraKeys: string[];
  cameras: ObliqueMetadata["cameras"];
  conventions: { sourceGridConventions: ObliqueMetadata["conventions"] };
  nameSchema: {
    imageIdTemplate: string;
    stationIdTemplate: string;
    cameraTokens: string[];
    lineDigits: number;
    waypointDigits: number;
    serialDigits?: number;
  };
  recordTemplates: string[];
  quaternion: { order: string; scale: number; sourceBasis: string };
  positionScale: number;
  rangeScale: number;
  rangeSentinels: Record<string, number>;
  predictor: "previous-capture" | "linear-capture";
  sections: { name: string; count: number; bytes: number }[];
};
export type CompactCatalogImage = Omit<ObliqueMetadataImage, "positionM"> & {
  cameraEcefMeters: [number, number, number];
};
export type CompactCatalog = Omit<ObliqueMetadata, "images"> & {
  images: Record<string, CompactCatalogImage>;
};
const invalid = (): never => {
  throw new Error("Invalid compact oblique catalogue.");
};
const safeInteger = (value: number) =>
  Number.isSafeInteger(value) ? value : invalid();
const count = (value: number, maximum: number) =>
  Number.isSafeInteger(value) && value >= 0 && value <= maximum
    ? value
    : invalid();

export const decodeCompactCatalog = (bytes: Uint8Array): CompactCatalog => {
  const text = new TextDecoder("utf-8", { fatal: true });
  if (bytes.length < 12 || text.decode(bytes.subarray(0, 8)) !== MAGIC)
    invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerBytes = count(
    view.getUint32(8, true),
    Math.min(1_048_576, bytes.length - 12)
  );
  const h = JSON.parse(
    text.decode(bytes.subarray(12, 12 + headerBytes))
  ) as Header;
  if (
    !h ||
    h.format !== MAGIC ||
    h.version !== 2 ||
    typeof h.seriesId !== "string" ||
    h.positionScale !== 1000 ||
    h.rangeScale !== 1000 ||
    h.quaternion?.scale !== 10_000_000 ||
    h.quaternion.order !== "xyzw" ||
    h.quaternion.sourceBasis !== "EPSG:4978 world-to-camera" ||
    !["previous-capture", "linear-capture"].includes(h.predictor) ||
    !Array.isArray(h.sections) ||
    !Array.isArray(h.cameraKeys) ||
    !h.cameraKeys.length ||
    !h.cameras ||
    !Array.isArray(h.recordTemplates) ||
    !h.recordTemplates.length ||
    !h.nameSchema ||
    !Array.isArray(h.nameSchema.cameraTokens) ||
    h.nameSchema.cameraTokens.length !== h.cameraKeys.length ||
    !h.rangeSentinels ||
    !h.conventions?.sourceGridConventions
  )
    invalid();
  const n = count(h.imageCount, MAX_IMAGES),
    nc = count(h.captureCount, n);
  for (const width of [
    h.nameSchema.lineDigits,
    h.nameSchema.waypointDigits,
    h.nameSchema.serialDigits ?? 0,
  ])
    count(width, 16);
  const columns = new Map<string, number[]>();
  let offset = 12 + headerBytes;
  for (const section of h.sections) {
    if (columns.has(section.name)) invalid();
    const size = count(section.bytes, bytes.length - offset);
    const length = count(section.count, MAX_IMAGES);
    if (length > size) invalid();
    const end = offset + size,
      values = new Array<number>(length);
    for (let i = 0; i < length; i++) {
      let value = 0,
        multiplier = 1,
        octets = 0;
      while (true) {
        if (offset >= end || ++octets > 8) invalid();
        const octet = bytes[offset++];
        value = safeInteger(value + (octet % 128) * multiplier);
        if (octet < 128) break;
        multiplier *= 128;
      }
      values[i] = value % 2 ? -(value + 1) / 2 : value / 2;
    }
    if (offset !== end) invalid();
    columns.set(section.name, values);
  }
  if (offset !== bytes.length) invalid();
  const column = (name: string, length = n) => {
    const values = columns.get(name);
    if (!values || values.length !== length) return invalid();
    return values;
  };
  const accumulate = (name: string, length = n) => {
    const values = column(name, length);
    let previous = 0;
    return values.map((delta) => (previous = safeInteger(previous + delta)));
  };
  const lines = accumulate("captureLine", nc);
  const waypoints = column("captureWaypoint", nc).map((v, i, a) => {
    a[i] = safeInteger(v + (i && lines[i] === lines[i - 1] ? a[i - 1] : 0));
    return a[i];
  });
  const captures = accumulate("photoCapture"),
    cameras = accumulate("photoCamera");
  const previousCamera = new Int32Array(n).fill(-1);
  const previousCameraSeries = new Int32Array(n).fill(-1);
  const lastCameraSeries = new Map<number, number>();
  const firstCapture = new Map<number, number>();
  const lastCapture = new Map<number, number>(),
    olderCapture = new Map<number, number>();
  const lastCamera = new Map<string, number>();
  const positionPrediction: {
    a: number;
    b: number;
    numerator: number;
    denominator: number;
  }[] = [];
  for (let i = 0; i < n; i++) {
    const capture = count(captures[i], nc - 1),
      camera = count(cameras[i], h.cameraKeys.length - 1);
    const line = count(lines[capture], Number.MAX_SAFE_INTEGER);
    count(waypoints[capture], Number.MAX_SAFE_INTEGER);
    previousCameraSeries[i] = lastCameraSeries.get(camera) ?? -1;
    lastCameraSeries.set(camera, i);
    const key = `${camera}:${line}`;
    previousCamera[i] = lastCamera.get(key) ?? -1;
    lastCamera.set(key, i);
    const first = firstCapture.get(capture);
    const a = first ?? lastCapture.get(line) ?? -1;
    const b = first === undefined ? olderCapture.get(line) ?? -1 : -1;
    const numerator = a >= 0 ? waypoints[capture] - waypoints[captures[a]] : 0;
    const denominator =
      b >= 0 ? waypoints[captures[a]] - waypoints[captures[b]] : 1;
    if (!denominator) invalid();
    positionPrediction.push({ a, b, numerator, denominator });
    if (first === undefined) {
      firstCapture.set(capture, i);
      olderCapture.set(line, a);
      lastCapture.set(line, i);
    }
  }
  const serials = columns.has("photoSerial")
    ? column("photoSerial")
    : undefined;
  if (serials)
    for (let i = 0; i < n; i++)
      serials[i] = safeInteger(
        serials[i] + (previousCamera[i] >= 0 ? serials[previousCamera[i]] : 0)
      );
  const templates = columns.has("photoTemplate")
    ? accumulate("photoTemplate")
    : new Array<number>(n).fill(0);
  const numeric = numericSections.map((name, index) => {
    const values = column(name);
    for (let i = 0; i < n; i++) {
      let predicted = 0;
      if (index < 3) {
        const { a, b, numerator, denominator } = positionPrediction[i];
        if (a >= 0) predicted = values[a];
        if (b >= 0 && h.predictor === "linear-capture")
          predicted = safeInteger(
            predicted +
              Math.trunc(
                safeInteger((values[a] - values[b]) * numerator) / denominator
              )
          );
      } else {
        const previous =
          name === "sensorRange" ? previousCameraSeries[i] : previousCamera[i];
        if (previous >= 0) predicted = values[previous];
      }
      values[i] = safeInteger(values[i] + predicted);
    }
    return values;
  });
  const missing = new Set(Object.values(h.rangeSentinels));
  const images: Record<string, CompactCatalogImage> = Object.create(null);
  for (let i = 0; i < n; i++) {
    const cap = captures[i],
      camera = cameras[i];
    const tokens: Record<string, string> = {
      camera: h.nameSchema.cameraTokens[camera],
      line: String(lines[cap]).padStart(h.nameSchema.lineDigits, "0"),
      waypoint: String(waypoints[cap]).padStart(
        h.nameSchema.waypointDigits,
        "0"
      ),
      serial: serials
        ? String(serials[i]).padStart(h.nameSchema.serialDigits ?? 0, "0")
        : "",
    };
    const expand = (template: string) => {
      if (typeof template !== "string") return invalid();
      const result = template.replace(
        /\{([^}]+)\}/g,
        (_, token: string) => tokens[token] ?? invalid()
      );
      if (!/^[a-zA-Z0-9_-]+$/.test(result)) invalid();
      return result;
    };
    const sourceId = expand(h.nameSchema.imageIdTemplate);
    if (Object.hasOwn(images, sourceId)) invalid();
    const dropped = count(numeric[3][i], 3),
      q: number[] = [];
    let small = 0,
      sum = 0;
    for (let axis = 0; axis < 4; axis++) {
      const v =
        axis === dropped ? 0 : numeric[4 + small++][i] / h.quaternion.scale;
      q.push(v);
      sum += v * v;
    }
    if (sum > 1) invalid();
    q[dropped] = Math.sqrt(1 - sum);
    const m = new Matrix4().makeRotationFromQuaternion(
      new Quaternion(q[0], q[1], q[2], q[3])
    ).elements;
    const matrix: Matrix3RowMajor = [
      [m[0], m[4], m[8]],
      [m[1], m[5], m[9]],
      [m[2], m[6], m[10]],
    ];
    const range = numeric[7][i];
    if (range < 0 && !missing.has(range)) invalid();
    const recordTemplate =
      h.recordTemplates[count(templates[i], h.recordTemplates.length - 1)];
    const extra = JSON.parse(
      recordTemplate.replaceAll("{imageId}", sourceId)
    ) as Pick<ObliqueMetadataImage, "assets">;
    images[sourceId] = {
      ...extra,
      cameraId: h.cameraKeys[camera],
      cameraEcefMeters: [
        numeric[0][i] / h.positionScale,
        numeric[1][i] / h.positionScale,
        numeric[2][i] / h.positionScale,
      ],
      rotationMatrixRows: matrix,
      lineIndex: lines[cap],
      waypointIndex: waypoints[cap],
      stationId: expand(h.nameSchema.stationIdTemplate),
      sensorGroundRangeMeters:
        range < 0 ? null : ((range / h.rangeScale) as Meters),
    };
  }
  return {
    schemaVersion: 1,
    seriesId: h.seriesId,
    cameras: h.cameras,
    conventions: h.conventions.sourceGridConventions,
    images,
  };
};
