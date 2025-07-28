import { useEffect, useState } from "react";
import {
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Viewer,
  Cartesian2,
  Cartesian3,
} from "cesium";
import { FeatureInfoProperties } from "@carma-commons/types";

export type ModelClickData = {
  id: string | null;
  position: Cartesian3 | null;
  screenPos: Cartesian2 | null;
  properties: FeatureInfoProperties;
};

export const useCesiumModelSelection = (
  viewer: Viewer | undefined,
  setSelectedFeature: (feature: unknown) => void,
  enabled: boolean = true
) => {
  const [clickData, setClickData] = useState<ModelClickData | null>(null);

  useEffect(() => {
    if (!enabled || !viewer?.scene || !viewer?.canvas) return;

    const { canvas, scene } = viewer;
    const handler = new ScreenSpaceEventHandler(canvas);

    const clickAction = ({
      position,
    }: ScreenSpaceEventHandler.PositionedEvent) => {
      if (!position) return;

      // Use drillPick to get all objects at click position
      const entities = scene.drillPick(position, 5);
      const pickedPosition = scene.pickPosition(position);

      let foundModel = false;

      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];

        // Check if this is a 3D model (has primitive but not a tileset)
        if (entity && entity.primitive && !entity.primitive.isCesium3DTileset) {
          // Extract properties from the Cesium entity
          const entityProperties = entity.id?.properties;
          const extractedProperties: Record<string, unknown> = {};

          // Extract Cesium properties if they exist
          if (entityProperties) {
            const propertyNames = entityProperties.propertyNames || [];
            propertyNames.forEach((name: string) => {
              const property = entityProperties[name];
              // Handle ConstantProperty values
              extractedProperties[name] = property?.getValue
                ? property.getValue()
                : property;
            });
          }
          const modelData: ModelClickData = {
            id: entity.id?.id || entity.id?._id || `model_${Date.now()}`,
            position: pickedPosition,
            screenPos: position,
            properties: {
              header: "3D Objekt", // Fallbacks
              title: "3D Objekt",
              ...extractedProperties,
            },
          };

          // Extract URL from model properties

          // Create feature - use properties from model config directly
          const feature = {
            id: modelData.id,
            properties: extractedProperties,
          };

          setSelectedFeature(feature);
          setClickData(modelData);
          foundModel = true;
          break;
        }
      }

      if (!foundModel) {
        setClickData(null);
        setSelectedFeature(null);
      }
    };

    handler.setInputAction(clickAction, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.removeInputAction(ScreenSpaceEventType.LEFT_CLICK);
      handler.destroy();
    };
  }, [viewer, setSelectedFeature, enabled]);

  return clickData;
};
