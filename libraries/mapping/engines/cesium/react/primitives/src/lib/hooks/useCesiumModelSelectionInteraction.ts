import { useCallback } from "react";

import type { Scene } from "@carma-cesium";

import { extractPickedProperties } from "../utils/modelManager";
import type { CesiumModelSelectionHighlightController } from "./useCesiumModelSelectionHighlight";
import {
  useCesiumModelSelectionInputHandler,
  type PickedCesiumModel,
} from "./useCesiumModelSelectionInputHandler";

type ModelSelectionInteractionHighlightActions = Pick<
  CesiumModelSelectionHighlightController,
  "applyHighlight" | "applyHoverHighlight" | "clearPreviousHighlight"
>;

type UseCesiumModelSelectionInteractionOptions = {
  deselectOnEmptyClick?: boolean;
  enabled: boolean;
  getScene: () => Scene | null | undefined;
  hoverHighlightEnabled?: boolean;
  onClearSelection?: () => void;
  onSelect?: (feature: unknown) => void;
  selectionHighlight: ModelSelectionInteractionHighlightActions;
};

export const useCesiumModelSelectionInteraction = ({
  deselectOnEmptyClick,
  enabled,
  getScene,
  hoverHighlightEnabled,
  onClearSelection,
  onSelect,
  selectionHighlight,
}: UseCesiumModelSelectionInteractionOptions) => {
  const { applyHighlight, applyHoverHighlight, clearPreviousHighlight } =
    selectionHighlight;

  const handleModelClick = useCallback(
    (picked: PickedCesiumModel) => {
      clearPreviousHighlight();
      applyHighlight(picked.primitive);
      onSelect?.({
        id: picked.id?.id,
        properties: extractPickedProperties(picked),
        is3dModel: true,
      });
    },
    [applyHighlight, clearPreviousHighlight, onSelect]
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
    onEmptyClick: handleEmptyClick,
    onModelClick: handleModelClick,
    onModelHover: applyHoverHighlight,
  });
};
