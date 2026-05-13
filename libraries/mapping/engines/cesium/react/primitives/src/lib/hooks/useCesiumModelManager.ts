import { useCallback, useRef } from "react";

import { type Easing as EasingFunction } from "@carma-commons/math";
import { Color, Model, type Scene } from "@carma-cesium";
import type { ModelConfig } from "@carma-mapping/engines/cesium/core";

import { findModelPrimitiveBySelectionId } from "../utils/modelManager";
import { modelShader, type ModelShaderEdgeMode } from "../utils/modelShader";
import { useCesiumModelPrimitives } from "./useCesiumModelPrimitives";
import { useCesiumModelSelectionHighlight } from "./useCesiumModelSelectionHighlight";
import { useCesiumModelSelectionInteraction } from "./useCesiumModelSelectionInteraction";

export type { ModelShaderEdgeMode } from "../utils/modelShader";

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
    highlightEdgeMode?: ModelShaderEdgeMode;
    flashInDurationMs?: number;
    flashInEasing?: EasingFunction;
    flashOutDurationMs?: number;
    flashOutEasing?: EasingFunction;
    flashOpacity?: number;
    highlightFillColor?: Color;
    highlightFlashColor?: Color;
    highlightHoverClearDelayMs?: number;
    highlightHoverFadeDurationMs?: number;
    highlightHoverFadeEasing?: EasingFunction;
    selectionFlashColor?: Color;
    hoverHighlightEnabled?: boolean;
    silhouettePickRadiusPx?: number;
    selectedFlashKey?: string | null;
    selectedFlashVersion?: number;
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
    flashInDurationMs: selection?.flashInDurationMs,
    flashInEasing: selection?.flashInEasing,
    flashOpacity: selection?.flashOpacity,
    flashOutDurationMs: selection?.flashOutDurationMs,
    flashOutEasing: selection?.flashOutEasing,
    getPrimitiveBySelectionId: readPrimitiveBySelectionId,
    highlightFlashColor: selection?.highlightFlashColor,
    highlightEdgeMode: selection?.highlightEdgeMode,
    hoverClearDelayMs: selection?.highlightHoverClearDelayMs,
    hoverFadeDurationMs: selection?.highlightHoverFadeDurationMs,
    hoverFadeEasing: selection?.highlightHoverFadeEasing,
    requestRender,
    selectionFlashColor: selection?.selectionFlashColor,
    selectedFlashKey: selection?.selectedFlashKey,
    selectedFlashVersion: selection?.selectedFlashVersion,
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
    stylePresentationFadeDurationMs: selection?.highlightFadeDurationMs,
    stylePresentationFadeEasing: selection?.highlightFadeEasing,
  });

  useCesiumModelSelectionInteraction({
    deselectOnEmptyClick: selection?.deselectOnEmptyClick,
    enabled: selectionEnabled,
    getScene,
    hoverHighlightEnabled: selection?.hoverHighlightEnabled,
    silhouettePickRadiusPx:
      selection?.silhouettePickRadiusPx ??
      selection?.highlightEdgeWidthPx ??
      modelShader.defaults.selection.edge.widthPx,
    onClearSelection: selection?.onClearSelection,
    onSelect: selection?.onSelect,
    selectionHighlight,
  });
};
