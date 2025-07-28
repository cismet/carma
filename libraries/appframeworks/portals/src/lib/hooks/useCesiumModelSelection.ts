import { useEffect, useState } from "react";
import {
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Viewer,
  Cartesian2,
  Cartesian3,
  CustomShader,
  LightingModel,
  Scene,
} from "cesium";
import { FeatureInfoProperties } from "@carma-commons/types";

export type ModelClickData = {
  id: string | null;
  position: Cartesian3 | null;
  screenPos: Cartesian2 | null;
  properties: FeatureInfoProperties;
};

type DrillPickResult = ReturnType<Scene["drillPick"]>;
type PickedObject = DrillPickResult[0];

// simple highlight shader
const highlightShader = new CustomShader({
  lightingModel: LightingModel.UNLIT,
  fragmentShaderText: `
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
  material.diffuse = vec3(0.8, 0.8, 0.0); // Orange highlight
  material.alpha = 1.0;
}
`,
});

export const useCesiumModelSelection = (
  viewer: Viewer | undefined,
  setSelectedFeature: (feature: unknown) => void,
  enabled: boolean = true
) => {
  const [clickData, setClickData] = useState<ModelClickData | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<PickedObject | null>(
    null
  );
  const [originalShader, setOriginalShader] = useState<unknown>(null);

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
          // Clear previous selection highlighting
          if (selectedEntity?.id?.model) {
            selectedEntity.id.model.customShader = originalShader;
            viewer.scene.requestRender();
            console.debug("[3D Model] Cleared previous shader");
          }

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

          // Add highlighting using custom shader on the model
          if (entity.id?.model) {
            // Store original shader
            setOriginalShader(entity.id.model.customShader || null);

            entity.id.model.customShader = highlightShader;
            viewer.scene.requestRender();
            console.debug("[3D Model] Applied orange highlight shader");
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

          const feature = {
            id: modelData.id,
            properties: extractedProperties,
            is3dModel: true, // Flag to identify 3D model selections
          };

          setSelectedFeature(feature);
          setClickData(modelData);
          setSelectedEntity(entity);
          foundModel = true;
          break;
        }
      }

      if (!foundModel) {
        // Clear previous selection highlighting when clicking empty space
        if (selectedEntity?.id?.model) {
          selectedEntity.id.model.customShader = originalShader;
          viewer.scene.requestRender();
          console.debug("[3D Model] Cleared shader on deselection");
        }
        setClickData(null);
        setSelectedFeature(null);
        setSelectedEntity(null);
        setOriginalShader(null);
      }
    };

    handler.setInputAction(clickAction, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      // Clear highlighting on cleanup
      if (selectedEntity?.id?.model) {
        selectedEntity.id.model.customShader = originalShader;
        viewer.scene.requestRender();
      }
      handler.removeInputAction(ScreenSpaceEventType.LEFT_CLICK);
      handler.destroy();
    };
  }, [viewer, setSelectedFeature, enabled, selectedEntity, originalShader]);

  return clickData;
};
