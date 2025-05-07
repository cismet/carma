import { Entity, Color, ColorMaterialProperty, ConstantProperty } from "cesium";
import {
  buffer,
  difference,
  featureCollection,
  transformTranslate,
} from "@turf/turf";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import {
  getCardinalDirection,
  getHeadingFromCardinalDirection,
} from "./orientationUtils";

export interface FootprintProperties {
  FILENAME: string;
  [key: string]: string | number | boolean;
}

export type FootprintFeature = Feature<Polygon, FootprintProperties>;

export const BUFFER_WIDTH_METERS = 10;

export const BUFFER_SHIFT_FACTOR = 0.5;

export const fetchGeoJson = async (
  url: string
): Promise<FeatureCollection<Polygon, FootprintProperties>> => {
  const response = await fetch(url);
  return response.json();
};

export const findMatchingFeature = (
  features: FootprintFeature[],
  imageId: string
) => features.find((feature) => feature.properties.FILENAME === imageId);

export const createFilteredGeoJson = (
  feature: FootprintFeature
): FeatureCollection<Polygon, FootprintProperties> => {
  try {
    const featureCopy = JSON.parse(JSON.stringify(feature));

    const buffered = buffer(featureCopy, BUFFER_WIDTH_METERS, {
      units: "meters",
    });

    const direction = feature.properties.ORI;

    const heading = getCardinalDirection(direction.toString());

    // TODO: if verified method use headingoffset as Param;
    const headingDegree = heading * 90 - 34 + 180;

    const shiftedBuffered = transformTranslate(
      buffered,
      BUFFER_WIDTH_METERS * BUFFER_SHIFT_FACTOR,
      headingDegree,
      { units: "meters" }
    );

    const outline = difference(
      featureCollection([shiftedBuffered, featureCopy])
    );

    if (outline && outline.geometry) {
      const hollowFeature = {
        ...featureCopy,
        geometry: outline.geometry,
      } as FootprintFeature;

      return {
        type: "FeatureCollection",
        features: [hollowFeature],
      };
    }

    return {
      type: "FeatureCollection",
      features: [featureCopy],
    };
  } catch (error) {
    console.error("Error creating footprint buffer:", error);
    return {
      type: "FeatureCollection",
      features: [feature],
    };
  }
};

export const configureFootprintEntity = (entity: Entity) => {
  if (entity.polygon) {
    entity.polygon.height = undefined;
    entity.polygon.outline = new ConstantProperty(false);
    entity.polygon.material = new ColorMaterialProperty(
      Color.WHITE.withAlpha(0.8)
    );
  }
  return entity;
};
