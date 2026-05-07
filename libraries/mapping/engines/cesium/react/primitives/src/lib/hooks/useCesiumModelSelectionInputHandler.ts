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
  deselectOnEmptyClick?: boolean;
  onModelClick: (picked: PickedCesiumModel) => void;
  onEmptyClick: () => void;
  onModelHover: (primitive: Model | null) => void;
};

export const useCesiumModelSelectionInputHandler = ({
  deselectOnEmptyClick = true,
  enabled,
  getScene,
  hoverHighlightEnabled = true,
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

      const findPickedModel = (position: Cartesian2 | undefined) => {
        if (!position) {
          return null;
        }
        const picked = scene.pick(position, 1, 1);
        return isModelPick(picked) ? (picked as PickedCesiumModel) : null;
      };

      const handleLeftClick = ({
        position,
      }: ScreenSpaceEventHandler.PositionedEvent) => {
        const picked = findPickedModel(position);
        if (picked) {
          onModelClickRef.current(picked);
          return;
        }
        if (deselectOnEmptyClick) {
          onEmptyClickRef.current();
        }
      };

      const handleMouseMove = (event: { endPosition?: Cartesian2 }) => {
        const picked = findPickedModel(event.endPosition);
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
  }, [deselectOnEmptyClick, enabled, getScene, hoverHighlightEnabled]);
};
