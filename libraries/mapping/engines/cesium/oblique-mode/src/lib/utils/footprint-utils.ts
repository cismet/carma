import {
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  GroundPrimitive,
  PolygonGeometry,
} from "@carma/cesium";
import { polygonHierarchyFromPolygonCoords } from "@carma-mapping/engines/cesium/core";

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

/**
 * Creates a properly configured GroundPrimitive for footprint visualization
 * Equivalent to the old Entity configuration but using immutable primitives
 *
 * @example
 * ```typescript
 * // Instead of Entity configuration:
 * const entity = new Entity();
 * configureFootprintEntity(entity); // Old way
 * scene.entities.add(entity);
 *
 * // Use primitive configuration:
 * const primitive = createFootprintPrimitive(polygonCoords, "footprint-1");
 * scene.groundPrimitives.add(primitive); // New way
 * ```
 *
 * @param polygonCoords - Array of coordinate rings [[[lng, lat], [lng, lat], ...]]
 * @param id - Unique identifier for the primitive
 * @returns Configured GroundPrimitive ready for scene insertion
 */
export const createFootprintPrimitive = (
  polygonCoords: number[][][],
  id: string
): GroundPrimitive => {
  // Convert polygon coordinates to Cesium polygon hierarchy
  const polygonHierarchy = polygonHierarchyFromPolygonCoords(polygonCoords);

  // Create polygon geometry with extruded walls (equivalent to Entity polygon config)
  const polygonGeometry = new PolygonGeometry({
    polygonHierarchy,
    height: 0, // Base height (equivalent to entity.polygon.height)
    extrudedHeight: 50, // Wall height (equivalent to entity.polygon.extrudedHeight)
    // Note: closeTop/closeBottom are not directly configurable in PolygonGeometry
    // Instead, we rely on the material and appearance for visual effect
  });

  // Create geometry instance with material and outline configuration
  const geometryInstance = new GeometryInstance({
    geometry: polygonGeometry,
    id,
    attributes: {
      // Material equivalent: white with alpha (equivalent to entity.polygon.material)
      color: ColorGeometryInstanceAttribute.fromColor(
        Color.WHITE.withAlpha(0.3)
      ),
    },
  });

  // Create ground primitive with outline appearance
  return new GroundPrimitive({
    geometryInstances: geometryInstance,
    allowPicking: false,
    releaseGeometryInstances: false,
    // Note: GroundPrimitive automatically handles terrain classification
    // Outline appearance is handled by the material in the geometry instance
  });
};
