import { Matrix3 } from "three";
import {
  degToRad,
  degToRadNumeric,
  type Degrees,
  type Radians,
} from "@carma-units";
import type { Matrix3RowMajor } from "@carma-commons/math";
import { getProj4Converter, type TypedConverter } from "@carma-geo/proj";
import type {
  BasicObliqueImageRecord,
  CardinalDirection,
  ObliquePitchSummary,
  ExteriorOrientationDataArray,
  ObliqueDataset,
  ObliqueImageIdInfo,
  ObliqueImageRecord,
  ObliqueImageRecordMap,
  ObliqueMetadata,
  ObliqueSelectionData,
} from "../types";
import {
  calibrationFromMetadata,
  calibrationImageOffset,
  getCameraCalibration,
  imageCenterPitchOffsetRad,
} from "./calibration";
import { computePose } from "./exteriorOrientation";
import { getCardinalDirectionFromHeading } from "./orientation";

/** Summarize image-centre pitch once per catalog parse; nadir never affects browsing pitch. */
export const summarizeObliquePitchStatistics = (
  data: Pick<ObliqueSelectionData, "imageRecords" | "datasets">
): Required<
  Pick<
    ObliqueSelectionData,
    "obliquePitchBySeries" | "obliquePitchByDirectionBySeries"
  >
> => {
  const obliquePitchBySeries = new Map<string, ObliquePitchSummary>();
  const obliquePitchByDirectionBySeries = new Map<
    string,
    Map<CardinalDirection, ObliquePitchSummary>
  >();
  const add = <Key>(
    totals: Map<Key, ObliquePitchSummary>,
    key: Key,
    pitchRad: Radians
  ) => {
    const previous = totals.get(key);
    if (previous) {
      previous.pitchSumRad = (previous.pitchSumRad + pitchRad) as Radians;
      previous.imageCount++;
    } else totals.set(key, { pitchSumRad: pitchRad, imageCount: 1 });
  };
  for (const record of data.imageRecords.values()) {
    const dataset = data.datasets.get(record.seriesId);
    const pitchDeg = record.pose?.pitchDeg;
    if (
      !dataset ||
      dataset.cameras?.[record.cameraId]?.view === "nadir" ||
      pitchDeg === undefined ||
      !Number.isFinite(pitchDeg) ||
      pitchDeg <= 0 ||
      pitchDeg >= 90
    )
      continue;
    // Average where the image centres look, not the optical axes.
    const camera = dataset.cameras?.[record.cameraId];
    const pitchRad = (degToRad(pitchDeg as Degrees) +
      (camera ? imageCenterPitchOffsetRad(camera) : 0)) as Radians;
    add(obliquePitchBySeries, record.seriesId, pitchRad);
    const bearingDeg = record.pose?.bearingDeg;
    if (bearingDeg === undefined || !Number.isFinite(bearingDeg)) continue;
    let directions = obliquePitchByDirectionBySeries.get(record.seriesId);
    if (!directions) {
      directions = new Map();
      obliquePitchByDirectionBySeries.set(record.seriesId, directions);
    }
    add(
      directions,
      getCardinalDirectionFromHeading(degToRad(bearingDeg as Degrees)),
      pitchRad
    );
  }
  return { obliquePitchBySeries, obliquePitchByDirectionBySeries };
};

/** Backwards-compatible series totals for callers that do not need bearing sectors. */
export const summarizeObliquePitch = (
  data: Pick<ObliqueSelectionData, "imageRecords" | "datasets">
): NonNullable<ObliqueSelectionData["obliquePitchBySeries"]> =>
  summarizeObliquePitchStatistics(data).obliquePitchBySeries;

export type DatasetConverter = TypedConverter<"EPSG:25832", "EPSG:4326">;

export const wgs84ToDatasetXY = (
  converter: DatasetConverter,
  longitude: number,
  latitude: number
): [number, number] =>
  converter.inverse([longitude, latitude] as unknown as Parameters<
    DatasetConverter["inverse"]
  >[0]) as [number, number];

/** Source IDs remain unchanged in URLs; this key is only for state and indexes. */
export const qualifiedImageId = (seriesId: string, sourceId: string): string =>
  `${encodeURIComponent(seriesId)}::${encodeURIComponent(sourceId)}`;

export const unpackIdInfo = (id: string): ObliqueImageIdInfo | null => {
  const match = /^(\d+)_(\d+)_(\d{3})(\d+)$/.exec(id);
  if (!match) return null;
  return {
    lineIndex: Number(match[1]),
    waypointIndex: Number(match[2]),
    cameraId: match[3],
    photoIndex: Number(match[4]),
    stationId: `${match[1]}_${match[2]}`,
  };
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const finiteTriplet = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((entry) => typeof entry === "number" && Number.isFinite(entry));

const rotationRows = (value: unknown): value is Matrix3RowMajor => {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every(finiteTriplet)
  )
    return false;
  const [a, b, c] = value;
  const matrix = new Matrix3().set(...a, ...b, ...c);
  if (Math.abs(matrix.determinant() - 1) > 1e-3) return false;
  const product = matrix.clone().multiply(matrix.clone().transpose()).elements;
  return product.every(
    (entry, index) => Math.abs(entry - (index % 4 === 0 ? 1 : 0)) <= 1e-3
  );
};

export const mapExtOriArrToRecord = (
  sourceId: string,
  arr: ExteriorOrientationDataArray,
  seriesId: string
): BasicObliqueImageRecord | null => {
  if (
    !Array.isArray(arr) ||
    arr.length !== 6 ||
    !finiteTriplet(arr.slice(0, 3)) ||
    !rotationRows(arr.slice(3))
  )
    return null;
  const unpacked = unpackIdInfo(sourceId);
  if (!unpacked) return null;
  return {
    id: qualifiedImageId(seriesId, sourceId),
    sourceId,
    seriesId,
    ...unpacked,
    x: arr[0],
    y: arr[1],
    z: arr[2],
    m: [arr[3], arr[4], arr[5]],
  };
};

export const extendObliqueImageRecord = (
  image: BasicObliqueImageRecord,
  converter: DatasetConverter,
  dataset: ObliqueDataset
): ObliqueImageRecord => {
  const [longitude, latitude, height] = converter.forward([
    image.x,
    image.y,
    image.z,
  ]) as [number, number, number];
  if (![longitude, latitude, height ?? image.z].every(Number.isFinite))
    throw new Error(`Invalid projected position for ${image.sourceId}.`);
  const camera = getCameraCalibration(dataset, image.cameraId);
  const pose = computePose(
    image,
    [longitude, latitude],
    camera.upMapping,
    camera.imageUpInCamera
  );
  const heading = degToRadNumeric(pose.bearingDeg);
  return {
    ...image,
    centerWGS84: [longitude, latitude, height ?? image.z],
    fallbackHeading: heading,
    sector: getCardinalDirectionFromHeading(
      heading - degToRadNumeric(dataset.headingOffsetDeg)
    ),
    pose,
  };
};

/** Validate conventions before reading any source row or trusting a camera mapping. */
export const validateMetadata = (
  input: unknown,
  dataset: ObliqueDataset
): ObliqueMetadata => {
  if (
    !isObject(input) ||
    input.schemaVersion !== 1 ||
    input.seriesId !== dataset.id ||
    !isObject(input.conventions) ||
    !isObject(input.cameras) ||
    !isObject(input.images)
  ) {
    throw new Error(`Invalid metadata schema or series ID for ${dataset.id}.`);
  }
  const conventions = input.conventions;
  if (
    conventions.horizontalCrs !== dataset.crs ||
    !["dhhn2016", "ellipsoidal", "unknown"].includes(
      String(conventions.verticalDatum)
    ) ||
    conventions.positionUnit !== "m" ||
    conventions.rotationLayout !== "row-major" ||
    conventions.rotationTransform !== "world-to-camera" ||
    conventions.opticalAxis !== "-z" ||
    conventions.pixelOrigin !== "top-left" ||
    conventions.pixelReference !== "pixel-center" ||
    conventions.cameraAxes !== "source-image-mm" ||
    JSON.stringify(conventions.worldAxes) !==
      JSON.stringify(["easting", "northing", "up"]) ||
    !isObject(conventions.pixelAxes) ||
    conventions.pixelAxes.x !== "right" ||
    conventions.pixelAxes.y !== "down"
  )
    throw new Error(`Unsupported source conventions for ${dataset.id}.`);
  if (
    dataset.heightDatum !== "unknown" &&
    conventions.verticalDatum !== dataset.heightDatum
  )
    throw new Error(`Vertical datum differs from series ${dataset.id}.`);
  for (const [cameraId, value] of Object.entries(input.cameras)) {
    if (
      !isObject(value) ||
      !Array.isArray(value.imageMmToPixelAffine) ||
      value.imageMmToPixelAffine.length !== 2 ||
      !value.imageMmToPixelAffine.every(finiteTriplet)
    )
      throw new Error(`Invalid calibration for camera ${cameraId}.`);
    calibrationFromMetadata(
      value as unknown as ObliqueMetadata["cameras"][string]
    );
  }
  for (const [sourceId, value] of Object.entries(input.images)) {
    if (
      !isObject(value) ||
      typeof value.cameraId !== "string" ||
      !Object.prototype.hasOwnProperty.call(input.cameras, value.cameraId) ||
      !finiteTriplet(value.positionM) ||
      !rotationRows(value.rotationMatrixRows)
    )
      throw new Error(
        `Invalid pose or camera reference for image ${sourceId}.`
      );
    if (
      value.cameraEcefMeters !== undefined &&
      !finiteTriplet(value.cameraEcefMeters)
    )
      throw new Error(`Invalid ECEF camera for ${sourceId}.`);
    if (
      value.sensorGroundRangeMeters !== undefined &&
      value.sensorGroundRangeMeters !== null &&
      (typeof value.sensorGroundRangeMeters !== "number" ||
        !Number.isFinite(value.sensorGroundRangeMeters) ||
        value.sensorGroundRangeMeters < 0)
    )
      throw new Error(`Invalid catalogue centre range for ${sourceId}.`);
    for (const key of ["lineIndex", "waypointIndex"]) {
      if (
        value[key] !== undefined &&
        (!Number.isInteger(value[key]) ||
          !Number.isFinite(value[key] as number))
      )
        throw new Error(`Invalid ${key} for image ${sourceId}.`);
    }
    if (value.stationId !== undefined && typeof value.stationId !== "string")
      throw new Error(`Invalid station ID for image ${sourceId}.`);
    if (
      value.assets !== undefined &&
      (!isObject(value.assets) ||
        Object.values(value.assets).some(
          (asset) =>
            !isObject(asset) ||
            typeof asset.href !== "string" ||
            !/^https?:\/\//.test(asset.href)
        ))
    )
      throw new Error(`Invalid image asset URL for ${sourceId}.`);
  }
  return input as unknown as ObliqueMetadata;
};

export const buildImageRecords = (
  metadata: unknown,
  dataset: ObliqueDataset,
  converter: DatasetConverter = getProj4Converter(dataset.crs, "EPSG:4326")
): { imageRecords: ObliqueImageRecordMap; dataset: ObliqueDataset } => {
  let resolved = dataset;
  let basics: BasicObliqueImageRecord[];
  if (dataset.metadataFormat !== "legacy-array-map") {
    const parsed = validateMetadata(metadata, dataset);
    const cameras = Object.fromEntries(
      Object.entries(parsed.cameras).map(([id, camera]) => [
        id,
        calibrationFromMetadata(camera),
      ])
    );
    resolved = {
      ...dataset,
      sourceConventions: parsed.conventions,
      heightDatum: parsed.conventions.verticalDatum,
      cameras,
      cameraIdToUpVector: Object.fromEntries(
        Object.entries(cameras).map(([id, camera]) => [id, camera.upMapping])
      ),
      interiorOrientationOffsets: Object.fromEntries(
        Object.entries(cameras).map(([id, camera]) => [
          id,
          calibrationImageOffset(camera),
        ])
      ),
    };
    basics = Object.entries(parsed.images).map(([sourceId, image]) => ({
      id: qualifiedImageId(dataset.id, sourceId),
      sourceId,
      seriesId: dataset.id,
      cameraId: image.cameraId,
      x: image.positionM[0],
      y: image.positionM[1],
      z: image.positionM[2],
      m: image.rotationMatrixRows,
      stationId: image.stationId,
      lineIndex: image.lineIndex,
      waypointIndex: image.waypointIndex,
      assets: image.assets,
      cameraEcefMeters: image.cameraEcefMeters,
      sensorGroundRangeMeters: image.sensorGroundRangeMeters,
    }));
  } else {
    if (!isObject(metadata))
      throw new Error("Legacy orientation metadata must be an image map.");
    basics = Object.entries(metadata).map(([sourceId, value]) => {
      const record = mapExtOriArrToRecord(
        sourceId,
        value as ExteriorOrientationDataArray,
        dataset.id
      );
      if (!record) throw new Error(`Invalid legacy image record ${sourceId}.`);
      return record;
    });
  }
  const imageRecords = new Map(
    basics
      .filter((record) => {
        const view = getCameraCalibration(resolved, record.cameraId).view;
        return (
          !resolved.availableCameraViews ||
          (view !== undefined && resolved.availableCameraViews.includes(view))
        );
      })
      .map((record) => {
        const extended = extendObliqueImageRecord(record, converter, resolved);
        return [extended.id, extended] as const;
      })
  );
  return { imageRecords, dataset: resolved };
};
