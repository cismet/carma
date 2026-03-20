import { useRef, useState } from "react";

import { type Scene } from "@carma/cesium";

import type { AnnotationEntry } from "@carma-mapping/annotations/core";
import {
  AnnotationInfoBox,
  AnnotationsProvider,
  AnnotationToolbar3D,
  useLocalAnnotationPersistence,
} from "@carma-mapping/annotations/runtime";
import { LabelOverlayProvider } from "@carma-providers/label-overlay";

import { ANNOTATIONS_DEMO_HOME_CAMERA_STATE } from "../config";
import { INFOBOX_WIDTH_PX, readInitialToolType } from "../playgroundConfig";
import type { PlaygroundRuntimePageProps } from "../playground.types";
import { CesiumNavigationOverlay } from "./CesiumNavigationOverlay";
import { CesiumWidgetContainer } from "./CesiumWidgetContainer";
import { PersistActiveToolMode } from "./PersistActiveToolMode";
import { PlaygroundStatusBar } from "./PlaygroundStatusBar";

const RuntimeToolbar = () => (
  <div
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

const RuntimeInfoBox = () => (
  <div
    style={{
      position: "absolute",
      bottom: 40,
      right: 12,
      zIndex: 1600,
      pointerEvents: "auto",
    }}
  >
    <AnnotationInfoBox pixelWidth={INFOBOX_WIDTH_PX} useControlLayout={false} />
  </div>
);

const RuntimeStatusBar = ({
  runtimeVersion,
  onRuntimeVersionChange,
}: PlaygroundRuntimePageProps) => (
  <PlaygroundStatusBar
    runtimeVersion={runtimeVersion}
    onRuntimeVersionChange={onRuntimeVersionChange}
    label="annotations runtime"
    values={["runtime-v1", "legacy prototype", "annotations stored locally"]}
  />
);

export const AnnotationsRuntimeV1Page = ({
  runtimeVersion,
  onRuntimeVersionChange,
}: PlaygroundRuntimePageProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [initialToolType] = useState(() => readInitialToolType());
  const { initialPersistenceState, onPersistenceStateChange } =
    useLocalAnnotationPersistence<AnnotationEntry>({
      enabled: true,
      storageKey: "annotations-playground-annotations",
    });

  return (
    <CesiumWidgetContainer
      rootRef={rootRef}
      onSceneChange={setScene}
      initialCameraState={ANNOTATIONS_DEMO_HOME_CAMERA_STATE}
    >
      <LabelOverlayProvider containerRef={rootRef}>
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
              initialHomeCameraState={ANNOTATIONS_DEMO_HOME_CAMERA_STATE}
            />
            <RuntimeToolbar />
            <RuntimeInfoBox />
            <RuntimeStatusBar
              runtimeVersion={runtimeVersion}
              onRuntimeVersionChange={onRuntimeVersionChange}
            />
          </AnnotationsProvider>
        ) : null}
      </LabelOverlayProvider>
    </CesiumWidgetContainer>
  );
};
