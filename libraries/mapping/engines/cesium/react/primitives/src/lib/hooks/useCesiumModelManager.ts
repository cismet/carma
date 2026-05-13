import { useCallback, useRef } from "react";

import { Model, type Scene } from "@carma-cesium";
import type { ModelConfig } from "@carma-mapping/engines/cesium/core";

import { findModelPrimitiveBySelectionId } from "../utils/modelManager";
import { modelShader, type ModelShaderEdgeMode } from "../utils/modelShader";
import { useCesiumModelPrimitives } from "./useCesiumModelPrimitives";
import {
  useCesiumModelShader,
  type ModelShaderSelection,
} from "./useCesiumModelShader";
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
    shader?: Omit<
      ModelShaderSelection,
      "enabled" | "getPrimitiveBySelectionId" | "selected"
    >;
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
  const modelShaderController = useCesiumModelShader({
    enabled: selectionEnabled,
    requestRender,
    selection: {
      ...selection?.shader,
      getPrimitiveBySelectionId: readPrimitiveBySelectionId,
      selected: {
        flashKey: selection?.selectedFlashKey,
        flashVersion: selection?.selectedFlashVersion,
        id: selection?.selectedId,
      },
    },
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
    modelShader: modelShaderController,
    stylePresentationFadeDurationMs: selection?.shader?.fade?.durationMs,
    stylePresentationFadeEasing: selection?.shader?.fade?.easing,
  });

  useCesiumModelSelectionInteraction({
    deselectOnEmptyClick: selection?.deselectOnEmptyClick,
    enabled: selectionEnabled,
    getScene,
    hoverHighlightEnabled: selection?.shader?.hover?.enabled,
    silhouettePickRadiusPx:
      selection?.silhouettePickRadiusPx ??
      selection?.shader?.style?.edge?.widthPx ??
      modelShader.defaults.selection.edge.widthPx,
    onClearSelection: selection?.onClearSelection,
    onSelect: selection?.onSelect,
    modelShader: modelShaderController,
  });
};
