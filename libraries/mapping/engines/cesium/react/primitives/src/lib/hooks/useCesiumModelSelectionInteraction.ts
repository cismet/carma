import { useCallback } from "react";

import type { Scene } from "@carma-cesium";

import { extractPickedProperties } from "../utils/modelManager";
import type { CesiumModelShaderController } from "./useCesiumModelSelectionHighlight";
import {
  useCesiumModelSelectionInputHandler,
  type PickedCesiumModel,
} from "./useCesiumModelSelectionInputHandler";

type ModelSelectionInteractionHighlightActions = Pick<
  CesiumModelShaderController,
  | "applyHighlight"
  | "applyHoverHighlight"
  | "clearPreviousHighlight"
  | "isSelectedPrimitive"
>;

type UseCesiumModelSelectionInteractionOptions = {
  deselectOnEmptyClick?: boolean;
  enabled: boolean;
  getScene: () => Scene | null | undefined;
  hoverHighlightEnabled?: boolean;
  silhouettePickRadiusPx?: number;
  onClearSelection?: () => void;
  onSelect?: (feature: unknown) => void;
  selectionHighlight: ModelSelectionInteractionHighlightActions;
};

export const useCesiumModelSelectionInteraction = ({
  deselectOnEmptyClick,
  enabled,
  getScene,
  hoverHighlightEnabled,
  silhouettePickRadiusPx,
  onClearSelection,
  onSelect,
  selectionHighlight,
}: UseCesiumModelSelectionInteractionOptions) => {
  const {
    applyHighlight,
    applyHoverHighlight,
    clearPreviousHighlight,
    isSelectedPrimitive,
  } = selectionHighlight;

  const handleModelClick = useCallback(
    (picked: PickedCesiumModel) => {
      const wasSelected = isSelectedPrimitive(picked.primitive);
      if (!wasSelected) {
        clearPreviousHighlight();
      }
      applyHighlight(
        picked.primitive,
        wasSelected ? { flash: "selectionFlash" } : undefined
      );
      onSelect?.({
        id: picked.id?.id,
        properties: extractPickedProperties(picked),
        is3dModel: true,
      });
    },
    [applyHighlight, clearPreviousHighlight, isSelectedPrimitive, onSelect]
  );

  const handleEmptyClick = useCallback(() => {
    clearPreviousHighlight();
    onClearSelection?.();
  }, [clearPreviousHighlight, onClearSelection]);

  useCesiumModelSelectionInputHandler({
    deselectOnEmptyClick,
    enabled,
    getScene,
    hoverHighlightEnabled,
    silhouettePickRadiusPx,
    onEmptyClick: handleEmptyClick,
    onModelClick: handleModelClick,
    onModelHover: applyHoverHighlight,
  });
};
