import { Entity, Color, ColorMaterialProperty, ConstantProperty } from "cesium";

import type { Feature, FeatureCollection, Polygon } from "geojson";
export interface FootprintProperties {
  FILENAME: string;
  [key: string]: string | number | boolean;
}

export type FootprintFeature = Feature<Polygon, FootprintProperties>;

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
    // Simple deep copy of the feature without any buffering or modification
    const featureCopy = JSON.parse(JSON.stringify(feature));

    return {
      type: "FeatureCollection",
      features: [featureCopy],
    };
  } catch (error) {
    console.error("Error creating footprint:", error);
    return {
      type: "FeatureCollection",
      features: [feature],
    };
  }
};

export const configureFootprintEntity = (entity: Entity) => {
  if (entity.polygon) {
    // Configure polygon to create a simple extruded polygon with no top
    entity.polygon.height = new ConstantProperty(0);
    entity.polygon.extrudedHeight = new ConstantProperty(50); // Wall height in meters
    entity.polygon.closeTop = new ConstantProperty(false); // No top surface
    entity.polygon.closeBottom = new ConstantProperty(true); // Keep bottom surface
    entity.polygon.outline = new ConstantProperty(true);
    entity.polygon.outlineColor = new ConstantProperty(Color.WHITE);
    entity.polygon.outlineWidth = new ConstantProperty(2);
    entity.polygon.material = new ColorMaterialProperty(
      Color.WHITE.withAlpha(0.3)
    );
  }
  return entity;
};
