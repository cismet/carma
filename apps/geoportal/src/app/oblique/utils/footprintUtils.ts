import { Entity, Color, ColorMaterialProperty, ConstantProperty } from "cesium";
import { buffer, difference, featureCollection } from "@turf/turf";
import type { Feature } from "@turf/helpers";

export interface FootprintProperties {
  FILENAME: string;
  [key: string]: string | number | boolean;
}

export interface FootprintFeature {
  type: string;
  properties: FootprintProperties;
  geometry: {
    type: string;
    coordinates: number[][][];
  };
}

export interface FootprintCollection {
  type: string;
  features: FootprintFeature[];
}

export const FOOTPRINT_URL =
  "https://wupp-oblique.cismet.de/2024/metadata/fprfc.geojson";

export const BUFFER_WIDTH_METERS = 10;

export const fetchGeoJson = async (
  url: string
): Promise<FootprintCollection> => {
  const response = await fetch(url);
  return response.json();
};

export const findMatchingFeature = (
  features: FootprintFeature[],
  imageId: string
) => features.find((feature) => feature.properties.FILENAME === imageId);

export const createFilteredGeoJson = (
  feature: FootprintFeature
): FootprintCollection => {
  try {
    const featureCopy = JSON.parse(JSON.stringify(feature));
    const buffered = buffer(featureCopy, BUFFER_WIDTH_METERS, {
      units: "meters",
    });
    const outline = difference(
      featureCollection([buffered as Feature, featureCopy as Feature])
    );

    if (outline && outline.geometry) {
      const hollowFeature = {
        ...featureCopy,
        geometry: outline.geometry,
      } as Feature;

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
