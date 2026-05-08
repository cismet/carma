import { useEffect, useRef } from "react";

import {
  Model,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Cartesian2,
  type Scene,
} from "@carma-cesium";

import { isModelPick } from "../utils/modelManager";

export type PickedCesiumModel = {
  primitive: Model;
  id?: {
    id?: string;
    properties?: Record<string, unknown>;
  };
};

type UseCesiumModelSelectionInputHandlerOptions = {
  enabled: boolean;
  getScene: () => Scene | null | undefined;
  hoverHighlightEnabled?: boolean;
  silhouettePickRadiusPx?: number;
  deselectOnEmptyClick?: boolean;
  onModelClick: (picked: PickedCesiumModel) => void;
  onEmptyClick: () => void;
  onModelHover: (primitive: Model | null) => void;
};

const SILHOUETTE_PICK_LIMIT = 8;

const normalizeSilhouettePickDiameter = (
  silhouettePickRadiusPx: number | undefined
) => {
  if (
    typeof silhouettePickRadiusPx !== "number" ||
    !Number.isFinite(silhouettePickRadiusPx) ||
    silhouettePickRadiusPx <= 0
  ) {
    return 1;
  }
  return Math.ceil(silhouettePickRadiusPx) * 2 + 1;
};

const isVisibleModelSilhouettePick = (
  picked: unknown
): picked is PickedCesiumModel =>
  isModelPick(picked) &&
  picked.primitive.silhouetteSize > 0 &&
  picked.primitive.silhouetteColor.alpha > 0;

export const useCesiumModelSelectionInputHandler = ({
  deselectOnEmptyClick = true,
  enabled,
  getScene,
  hoverHighlightEnabled = true,
  silhouettePickRadiusPx,
  onEmptyClick,
  onModelClick,
  onModelHover,
}: UseCesiumModelSelectionInputHandlerOptions) => {
  const onEmptyClickRef = useRef(onEmptyClick);
  const onModelClickRef = useRef(onModelClick);
  const onModelHoverRef = useRef(onModelHover);

  useEffect(() => {
    onEmptyClickRef.current = onEmptyClick;
  }, [onEmptyClick]);

  useEffect(() => {
    onModelClickRef.current = onModelClick;
  }, [onModelClick]);

  useEffect(() => {
    onModelHoverRef.current = onModelHover;
  }, [onModelHover]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let disposed = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let handler: ScreenSpaceEventHandler | null = null;

    const attachSelectionHandler = () => {
      if (disposed) {
        return;
      }

      const scene = getScene();
      if (!scene || scene.isDestroyed() || !scene.canvas) {
        retryTimeout = setTimeout(attachSelectionHandler, 100);
        return;
      }

      handler = new ScreenSpaceEventHandler(scene.canvas);

      const silhouettePickDiameter = normalizeSilhouettePickDiameter(
        silhouettePickRadiusPx
      );

      const findPickedModel = (
        position: Cartesian2 | undefined,
        includeSilhouetteFallback: boolean
      ) => {
        if (!position) {
          return null;
        }
        const picked = scene.pick(position, 1, 1);
        if (isModelPick(picked)) {
          return picked as PickedCesiumModel;
        }
        if (!includeSilhouetteFallback || silhouettePickDiameter <= 1) {
          return null;
        }

        const pickedObjects = scene.drillPick(
          position,
          SILHOUETTE_PICK_LIMIT,
          silhouettePickDiameter,
          silhouettePickDiameter
        );
        return (
          (pickedObjects.find(isVisibleModelSilhouettePick) as
            | PickedCesiumModel
            | undefined) ?? null
        );
      };

      const handleLeftClick = ({
        position,
      }: ScreenSpaceEventHandler.PositionedEvent) => {
        const picked = findPickedModel(position, true);
        if (picked) {
          onModelClickRef.current(picked);
          return;
        }
        if (deselectOnEmptyClick) {
          onEmptyClickRef.current();
        }
      };

      const handleMouseMove = (event: { endPosition?: Cartesian2 }) => {
        const picked = findPickedModel(event.endPosition, false);
        onModelHoverRef.current(picked?.primitive ?? null);
      };

      handler.setInputAction(handleLeftClick, ScreenSpaceEventType.LEFT_CLICK);
      if (hoverHighlightEnabled) {
        handler.setInputAction(
          handleMouseMove,
          ScreenSpaceEventType.MOUSE_MOVE
        );
      }
    };

    attachSelectionHandler();

    return () => {
      disposed = true;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      try {
        handler?.removeInputAction(ScreenSpaceEventType.LEFT_CLICK);
        handler?.removeInputAction(ScreenSpaceEventType.MOUSE_MOVE);
        handler?.destroy();
      } catch (error) {
        console.warn("[Cesium|Models] Selection cleanup failed:", error);
      }
    };
  }, [
    deselectOnEmptyClick,
    enabled,
    getScene,
    hoverHighlightEnabled,
    silhouettePickRadiusPx,
  ]);
};
