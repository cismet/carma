import { getProj4Converter } from "@carma-geo/proj";
import type {
  ObliqueDataset,
  ObliqueSelectionData,
  PointWithSector,
} from "../../core/types";
import { buildImageRecords } from "../../core/utils/imageRecord";
import {
  estimateGroundCenter,
  estimateGroundFootprint,
} from "../../core/utils/selection";
import {
  fetchGeoJson,
  getFootprintCenterpoints,
  type FootprintCollection,
} from "./footprints";

/** Footprints belong to image records; do not clone a second full GeoJSON catalog. */
export type ObliqueData = ObliqueSelectionData;
export const loadObliqueSeriesData = async (
  dataset: ObliqueDataset
): Promise<ObliqueData> => {
  const response = await fetch(dataset.exteriorOrientationsURI);
  if (!response.ok) throw new Error(`Metadaten: HTTP ${response.status}`);
  const converter = getProj4Converter(dataset.crs, "EPSG:4326");
  const built = buildImageRecords(await response.json(), dataset, converter);
  // Delivered footprints are optional. Unavailable ones do not hide valid image metadata.
  let delivered: FootprintCollection = {
    type: "FeatureCollection",
    features: [],
  };
  if (dataset.footprintsURI) {
    try {
      delivered = await fetchGeoJson(dataset.footprintsURI);
    } catch {
      /* Calibrated ground-plane approximations remain visibly marked below. */
    }
  }
  const deliveredCenters = new Map(
    getFootprintCenterpoints(delivered, converter).map((point) => [
      point.id,
      point,
    ])
  );
  const deliveredById = new Map(
    delivered.features.map((feature) => [feature.properties.FILENAME, feature])
  );
  const centers = new Map<string, PointWithSector>();
  for (const record of built.imageRecords.values()) {
    const original = deliveredById.get(record.sourceId);
    const rawCenter = deliveredCenters.get(record.sourceId);
    if (rawCenter)
      centers.set(record.id, {
        ...rawCenter,
        id: record.id,
        cardinal: record.sector,
      });
    else
      centers.set(
        record.id,
        estimateGroundCenter(record, built.dataset, converter)
      );
    if (original) {
      record.footprint = original.geometry.coordinates[0].map((position) => [
        position[0],
        position[1],
      ]);
      record.footprintApproximate = false;
    } else {
      record.footprint = estimateGroundFootprint(
        record,
        built.dataset,
        converter
      );
      record.footprintApproximate = true;
    }
  }
  return {
    imageRecords: built.imageRecords,
    datasets: new Map([[dataset.id, built.dataset]]),
    centers,
  };
};
