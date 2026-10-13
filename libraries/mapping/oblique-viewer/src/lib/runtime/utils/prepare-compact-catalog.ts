import { Vector3 } from "three";
import { ecefCameraGridRotation } from "../../core/utils/ecef-camera-grid-rotation";
import {
  ecefToCartographic,
  getGcg2016HeightAnomalies,
  getProj4Converter,
} from "@carma-geo/proj";
import { latLngRadToDeg, latLngToLngLatArray } from "@carma-geo/helpers";
import type { Meters } from "@carma-units";
import type {
  ObliqueImageRecord,
  ObliqueMetadata,
  ObliqueMetadataImage,
} from "../../core/types";
import type { CompactCatalog } from "../../core/utils/compact-catalog";

/** Physical catalogue ECEF stays untouched. The current MapLibre presentation
 * uses DHHN heights as its geometric altitude, so convert that boundary once.
 * No terrain tiles, mesh receivers or scene-dependent raycasts participate. */
export const prepareCompactCatalog = async (
  catalog: CompactCatalog,
  signal?: AbortSignal
) => {
  const converter = getProj4Converter("EPSG:4326", "EPSG:25832");
  const images: Record<string, ObliqueMetadataImage> = Object.create(null);
  const centers = new Map<
    string,
    NonNullable<ObliqueImageRecord["catalogCenter"]>
  >();
  const entries = Object.entries(catalog.images);
  for (let start = 0; start < entries.length; start += 256) {
    signal?.throwIfAborted();
    const batch = entries.slice(start, start + 256).map(([id, image]) => {
      const eye = new Vector3(...image.cameraEcefMeters);
      const cartographic = ecefToCartographic(eye);
      const coordinate = latLngToLngLatArray(latLngRadToDeg(cartographic));
      const [longitude, latitude] = coordinate;
      const ecefRows = image.rotationMatrixRows;
      const camera = catalog.cameras[image.cameraId];
      if (!camera) throw new Error(`Missing camera for ${id}.`);
      const [[a, b, cx], [d, e, cy]] = camera.imageMmToPixelAffine;
      const determinant = a * e - b * d;
      if (
        !Number.isFinite(determinant) ||
        determinant === 0 ||
        !(camera.focalLengthMm > 0)
      )
        throw new Error(`Invalid calibrated image plane for ${id}.`);
      const x = (camera.widthPx - 1) / 2 - cx,
        y = (camera.heightPx - 1) / 2 - cy;
      const mmX = (e * x - b * y) / determinant;
      const mmY = (-d * x + a * y) / determinant;
      const direction = new Vector3(...ecefRows[0])
        .multiplyScalar(mmX)
        .addScaledVector(new Vector3(...ecefRows[1]), mmY)
        .addScaledVector(new Vector3(...ecefRows[2]), -camera.focalLengthMm)
        .normalize();
      const range = image.sensorGroundRangeMeters;
      const hit =
        range !== null && range !== undefined && range >= 0
          ? eye.clone().addScaledVector(direction, range)
          : null;
      const ground = hit ? ecefToCartographic(hit) : null;
      const groundCoordinate = ground
        ? latLngToLngLatArray(latLngRadToDeg(ground))
        : null;
      return {
        id,
        image,
        eye,
        cartographic,
        coordinate,
        longitude,
        latitude,
        ecefRows,
        hit,
        ground,
        groundCoordinate,
      };
    });
    const coordinates = batch.flatMap((row) => [
      row.coordinate,
      ...(row.groundCoordinate ? [row.groundCoordinate] : []),
    ]);
    const anomalies = await getGcg2016HeightAnomalies(coordinates);
    signal?.throwIfAborted();
    let index = 0;
    for (const row of batch) {
      const { id, image, longitude, latitude, ecefRows } = row;
      const altitude = row.cartographic.altitude - anomalies[index++];
      const xy = converter.forward([longitude, latitude]);
      // Existing projector multiplies its grid matrix by Rz(convergence).
      // This inverse factor cancels there, leaving the exact ECEF orientation.
      images[id] = {
        ...image,
        positionM: [xy[0], xy[1], altitude],
        rotationMatrixRows: ecefCameraGridRotation(
          ecefRows,
          row.eye,
          longitude,
          latitude
        ),
      };
      if (row.ground && row.groundCoordinate && row.hit)
        centers.set(id, {
          longitude: row.groundCoordinate[0],
          latitude: row.groundCoordinate[1],
          heightMeters: (row.ground.altitude - anomalies[index++]) as Meters,
          ecefMeters: row.hit.toArray() as [number, number, number],
        });
    }
    if (start + 256 < entries.length)
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const metadata: ObliqueMetadata = {
    schemaVersion: 1,
    seriesId: catalog.seriesId,
    cameras: catalog.cameras,
    conventions: { ...catalog.conventions, verticalDatum: "dhhn2016" },
    images,
  };
  return { metadata, centers };
};
