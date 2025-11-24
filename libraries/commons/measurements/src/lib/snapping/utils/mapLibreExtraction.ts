import {
  type LayerSpecification,
  Map as MapLibreMap,
  type MapGeoJSONFeature,
  Point,
  type PointLike,
} from "maplibre-gl";
import { LayerCarmaConf } from "@carma/types";
import { SnappingPoint } from "../../types";
import { extractPointsFromGeometry } from "./coordinateExtraction";

export const getSnappingPointsFromMapLibre = (
  maps: MapLibreMap[],
  screenPoint: { x: number; y: number },
  radius: number
): SnappingPoint[] => {
  const coordinatePoints: SnappingPoint[] = [];

  maps.forEach((currentMaplibreMap) => {
    if (
      currentMaplibreMap &&
      currentMaplibreMap.getStyle &&
      currentMaplibreMap.getCanvas
    ) {
      try {
        const style = currentMaplibreMap.getStyle();
        if (style && style.layers) {
          const canvas = currentMaplibreMap.getCanvas();
          const rect = canvas.getBoundingClientRect();

          // Calculate point relative to this map's canvas
          const pointX = screenPoint.x - rect.left;
          const pointY = screenPoint.y - rect.top;

          // Use Point objects directly to avoid internal conversion overhead in MapLibre
          const bbox: [PointLike, PointLike] = [
            new Point(pointX - radius, pointY - radius),
            new Point(pointX + radius, pointY + radius),
          ];

          const features = currentMaplibreMap.queryRenderedFeatures(bbox, {
            layers: style.layers
              .filter((layer: LayerSpecification) => {
                // Skip layers with skipSnapping metadata
                const skipSnapping = (
                  (layer.metadata as any)?.carmaConf as LayerCarmaConf
                )?.skipSnapping;
                return !skipSnapping && !layer.id.startsWith("highlight-");
              })
              .map((layer: LayerSpecification) => layer.id),
          });

          features.forEach((feature: MapGeoJSONFeature) => {
            const points = extractPointsFromGeometry(
              feature.geometry,
              "vector-features"
            );
            coordinatePoints.push(...points);
          });
        }
      } catch (error) {
        console.warn("Error extracting vector features:", error);
      }
    }
  });

  return coordinatePoints;
};
