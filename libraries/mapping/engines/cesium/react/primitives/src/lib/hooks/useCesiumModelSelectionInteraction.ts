import { useCallback } from "react";

import type { Scene } from "@carma-cesium";

import { extractPickedProperties } from "../utils/modelManager";
import type { CesiumModelShaderController } from "./useCesiumModelShader";
import {
  useCesiumModelSelectionInputHandler,
  type PickedCesiumModel,
} from "./useCesiumModelSelectionInputHandler";

type ModelSelectionInteractionShaderActions = Pick<
  CesiumModelShaderController,
  "applySelection" | "applyHover" | "clearSelection" | "isSelectedPrimitive"
>;

type UseCesiumModelSelectionInteractionOptions = {
  deselectOnEmptyClick?: boolean;
  enabled: boolean;
  getScene: () => Scene | null | undefined;
  hoverHighlightEnabled?: boolean;
  silhouettePickRadiusPx?: number;
  onClearSelection?: () => void;
  onSelect?: (feature: unknown) => void;
  modelShader: ModelSelectionInteractionShaderActions;
};

export const useCesiumModelSelectionInteraction = ({
  deselectOnEmptyClick,
  enabled,
  getScene,
  hoverHighlightEnabled,
  silhouettePickRadiusPx,
  onClearSelection,
  onSelect,
  modelShader,
}: UseCesiumModelSelectionInteractionOptions) => {
  const { applySelection, applyHover, clearSelection, isSelectedPrimitive } =
    modelShader;

  const handleModelClick = useCallback(
    (picked: PickedCesiumModel) => {
      const wasSelected = isSelectedPrimitive(picked.primitive);
      if (!wasSelected) {
        clearSelection();
      }
      applySelection(
        picked.primitive,
        wasSelected ? { flash: "selectionFlash" } : undefined
      );
      onSelect?.({
        id: picked.id?.id,
        properties: extractPickedProperties(picked),
        is3dModel: true,
      });
    },
    [applySelection, clearSelection, isSelectedPrimitive, onSelect]
  );

  const handleEmptyClick = useCallback(() => {
    clearSelection();
    onClearSelection?.();
  }, [clearSelection, onClearSelection]);

  useCesiumModelSelectionInputHandler({
    deselectOnEmptyClick,
    enabled,
    getScene,
    hoverHighlightEnabled,
    silhouettePickRadiusPx,
    onEmptyClick: handleEmptyClick,
    onModelClick: handleModelClick,
    onModelHover: applyHover,
  });
};
