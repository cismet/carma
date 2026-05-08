import { useCallback, useRef } from "react";

import { type Easing as EasingFunction } from "@carma-commons/math";
import { Color, Model, type Scene } from "@carma-cesium";
import type { ModelConfig } from "@carma-mapping/engines/cesium/core";

import { DEFAULT_MODEL_SELECTION_HIGHLIGHT_EDGE_WIDTH_PX } from "../utils/modelHighlightShader";
import { findModelPrimitiveBySelectionId } from "../utils/modelManager";
import type { ModelSelectionHighlightEdgeMode } from "../utils/modelSelectionHighlight";
import { useCesiumModelPrimitives } from "./useCesiumModelPrimitives";
import { useCesiumModelSelectionHighlight } from "./useCesiumModelSelectionHighlight";
import { useCesiumModelSelectionInteraction } from "./useCesiumModelSelectionInteraction";

export type { ModelSelectionHighlightEdgeMode } from "../utils/modelSelectionHighlight";

export interface UseCesiumModelManagerOptions {
  models: ModelConfig[];
  enabled: boolean;
  getScene: () => Scene | null | undefined;
  requestRender?: () => void;
  selection?: {
    enabled?: boolean;
    onSelect?: (feature: unknown) => void;
    onClearSelection?: () => void;
    onModelAdded?: (primitiveId: string, primitive: Model) => void;
    onModelFirstRendered?: (primitiveId: string, primitive: Model) => void;
    deselectOnEmptyClick?: boolean;
    highlightEdgeColor?: Color;
    highlightEdgeOpacity?: number;
    highlightEdgeWidthPx?: number;
    highlightFadeDurationMs?: number;
    highlightFadeEasing?: EasingFunction;
    highlightEdgeMode?: ModelSelectionHighlightEdgeMode;
    highlightFillColor?: Color;
    highlightFlashColor?: Color;
    highlightFlashDurationMs?: number;
    highlightFlashOpacity?: number;
    highlightHoverClearDelayMs?: number;
    highlightHoverFadeDurationMs?: number;
    highlightHoverFadeEasing?: EasingFunction;
    hoverHighlightEnabled?: boolean;
    silhouettePickRadiusPx?: number;
    selectedId?: string | null;
  };
}

export const useCesiumModelManager = ({
  models,
  enabled,
  getScene,
  requestRender: requestRenderFromOptions,
  selection,
}: UseCesiumModelManagerOptions) => {
  const modelPrimitivesRef = useRef<Map<string, Model>>(new Map());
  const requestRender = useCallback(() => {
    if (requestRenderFromOptions) {
      requestRenderFromOptions();
      return;
    }
    const scene = getScene();
    if (scene && !scene.isDestroyed()) {
      scene.requestRender();
    }
  }, [getScene, requestRenderFromOptions]);

  const readPrimitiveBySelectionId = useCallback(
    (primitiveId: string) =>
      findModelPrimitiveBySelectionId(
        modelPrimitivesRef.current.values(),
        primitiveId
      ),
    []
  );

  const selectionEnabled = Boolean(selection?.enabled && enabled);
  const selectionHighlight = useCesiumModelSelectionHighlight({
    edgeColor: selection?.highlightEdgeColor,
    edgeOpacity: selection?.highlightEdgeOpacity,
    edgeWidthPx: selection?.highlightEdgeWidthPx,
    enabled: selectionEnabled,
    fadeDurationMs: selection?.highlightFadeDurationMs,
    fadeEasing: selection?.highlightFadeEasing,
    fillColor: selection?.highlightFillColor,
    flashColor: selection?.highlightFlashColor,
    flashDurationMs: selection?.highlightFlashDurationMs,
    flashOpacity: selection?.highlightFlashOpacity,
    getPrimitiveBySelectionId: readPrimitiveBySelectionId,
    highlightEdgeMode: selection?.highlightEdgeMode,
    hoverClearDelayMs: selection?.highlightHoverClearDelayMs,
    hoverFadeDurationMs: selection?.highlightHoverFadeDurationMs,
    hoverFadeEasing: selection?.highlightHoverFadeEasing,
    requestRender,
    selectedId: selection?.selectedId,
  });

  useCesiumModelPrimitives({
    enabled,
    getScene,
    modelPrimitivesRef,
    models,
    onClearSelection: selection?.onClearSelection,
    onModelAdded: selection?.onModelAdded,
    onModelFirstRendered: selection?.onModelFirstRendered,
    requestRender,
    selectedId: selection?.selectedId,
    selectionEnabled,
    selectionHighlight,
  });

  useCesiumModelSelectionInteraction({
    deselectOnEmptyClick: selection?.deselectOnEmptyClick,
    enabled: selectionEnabled,
    getScene,
    hoverHighlightEnabled: selection?.hoverHighlightEnabled,
    silhouettePickRadiusPx:
      selection?.silhouettePickRadiusPx ??
      selection?.highlightEdgeWidthPx ??
      DEFAULT_MODEL_SELECTION_HIGHLIGHT_EDGE_WIDTH_PX,
    onClearSelection: selection?.onClearSelection,
    onSelect: selection?.onSelect,
    selectionHighlight,
  });
};
