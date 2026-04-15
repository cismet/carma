import { useRef, useState } from "react";

import type { AnnotationEntry } from "@carma-mapping/annotations/core";
import {
  AnnotationInfoBox,
  AnnotationsProvider,
  AnnotationToolbar3D,
  useLocalAnnotationPersistence,
} from "@carma-mapping/annotations/runtime-prototype";
import {
  CESIUM_LABEL_OVERLAY_FRAME_PHASES,
  clearCesiumScenePointerTracker,
  useCesiumLabelOverlayHost,
} from "@carma-mapping/engines/cesium/react/interactions";
import { LabelOverlayProvider } from "@carma-providers/label-overlay";
import { type Scene } from "@carma-cesium";

import type { PlaygroundRuntimePageProps } from "../playground.types";
import {
  ANNOTATIONS_PROTOTYPE_STORAGE_KEY,
  INFOBOX_WIDTH_PX,
  PLAYGROUND_FLOATING_OVERLAY_WINDOW_MARGIN_PX,
  readInitialToolType,
} from "../playgroundConfig";
import { CesiumNavigationOverlay } from "./CesiumNavigationOverlay";
import { CesiumWidgetContainer } from "./CesiumWidgetContainer";
import { PersistActiveToolMode } from "./PersistActiveToolMode";

const clearPlaygroundPointerQueryPreview = (scene: Scene | null) => {
  if (!scene || scene.isDestroyed()) {
    return;
  }

  clearCesiumScenePointerTracker(scene);
  scene.requestRender();
};

const RuntimeToolbar = ({ scene }: { scene: Scene | null }) => (
  <div
    onPointerEnter={() => clearPlaygroundPointerQueryPreview(scene)}
    onPointerMove={() => clearPlaygroundPointerQueryPreview(scene)}
    onPointerDown={() => clearPlaygroundPointerQueryPreview(scene)}
    style={{
      position: "absolute",
      top: 12,
      left: 72,
      right: 12,
      zIndex: 1600,
      display: "flex",
      justifyContent: "center",
      pointerEvents: "none",
    }}
  >
    <div
      style={{
        width: "max-content",
        maxWidth: "calc(100vw - 120px)",
        pointerEvents: "auto",
      }}
    >
      <AnnotationToolbar3D
        secondaryToolbarCollapsedByDefault={true}
        enableMultiDeleteHotkey={false}
      />
    </div>
  </div>
);

const RuntimeInfoBox = ({ scene }: { scene: Scene | null }) => (
  <div
    onPointerEnter={() => clearPlaygroundPointerQueryPreview(scene)}
    onPointerMove={() => clearPlaygroundPointerQueryPreview(scene)}
    onPointerDown={() => clearPlaygroundPointerQueryPreview(scene)}
    style={{
      position: "absolute",
      bottom: PLAYGROUND_FLOATING_OVERLAY_WINDOW_MARGIN_PX,
      right: PLAYGROUND_FLOATING_OVERLAY_WINDOW_MARGIN_PX,
      zIndex: 1600,
      pointerEvents: "auto",
    }}
  >
    <AnnotationInfoBox pixelWidth={INFOBOX_WIDTH_PX} useControlLayout={false} />
  </div>
);

export const AnnotationsRuntimePrototypePage = ({
  homeCameraState,
}: PlaygroundRuntimePageProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const overlayHost = useCesiumLabelOverlayHost({
    scene,
    containerRef: rootRef,
    forceLayoutOnPortalRender: false,
    framePhase: CESIUM_LABEL_OVERLAY_FRAME_PHASES.PRE_RENDER,
  });
  const [initialToolType] = useState(() => readInitialToolType());
  const { initialPersistenceState, onPersistenceStateChange } =
    useLocalAnnotationPersistence<AnnotationEntry>({
      enabled: true,
      storageKey: ANNOTATIONS_PROTOTYPE_STORAGE_KEY,
    });

  return (
    <CesiumWidgetContainer
      rootRef={rootRef}
      onSceneChange={setScene}
      initialCameraState={homeCameraState}
    >
      <LabelOverlayProvider host={overlayHost}>
        {scene ? (
          <AnnotationsProvider
            enabled={true}
            cesiumScene={scene}
            options={{
              initialToolType,
              initialPersistenceState,
              onPersistenceStateChange,
            }}
          >
            <PersistActiveToolMode />
            <CesiumNavigationOverlay
              scene={scene}
              initialHomeCameraState={homeCameraState}
            />
            <RuntimeToolbar scene={scene} />
            <RuntimeInfoBox scene={scene} />
          </AnnotationsProvider>
        ) : null}
      </LabelOverlayProvider>
    </CesiumWidgetContainer>
  );
};
