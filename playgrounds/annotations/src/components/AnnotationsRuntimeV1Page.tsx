import { useRef, useState } from "react";

import { type Scene } from "@carma/cesium";

import type { AnnotationEntry } from "@carma-mapping/annotations/core";
import {
  AnnotationInfoBox,
  AnnotationsProvider,
  AnnotationToolbar3D,
  useLocalAnnotationPersistence,
} from "@carma-mapping/annotations/runtime";
import {
  CesiumSceneStateHashSync,
  CesiumSceneStateProvider,
  type SceneLike,
  useInitialSceneViewState,
} from "@carma-mapping/engines/cesium/react/scene-state";
import { LabelOverlayProvider } from "@carma-providers/label-overlay";

import { ANNOTATIONS_DEMO_HOME_VIEW_STATE } from "../config";
import { INFOBOX_WIDTH_PX, readInitialToolType } from "../playgroundConfig";
import type { PlaygroundRuntimePageProps } from "../playground.types";
import { CesiumNavigationOverlay } from "./CesiumNavigationOverlay";
import { CesiumWidgetContainer } from "./CesiumWidgetContainer";
import { PersistActiveToolMode } from "./PersistActiveToolMode";
import { PlaygroundStatusBar } from "./PlaygroundStatusBar";
import { SceneStateErrorModal } from "./SceneStateErrorModal";

const TERRAIN_SCENE_STATE_OPTIONS = {
  orbitPointMode: "screen-center",
  screenCenterSamplingStrategy: "terrain-only",
  throwOnMissingScreenCenterIntersection: true,
  fallbackHeightM: 200,
} as const;

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
      top: 56,
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
  const { initialViewState: hashViewState, isResolved } =
    useInitialSceneViewState();
  const initialViewState = hashViewState ?? ANNOTATIONS_DEMO_HOME_VIEW_STATE;
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
      initialViewState={initialViewState}
      startPoseResolved={isResolved}
    >
      <CesiumSceneStateProvider
        scene={scene as unknown as SceneLike | null}
        options={TERRAIN_SCENE_STATE_OPTIONS}
      >
        <SceneStateErrorModal
          fallbackHeightM={TERRAIN_SCENE_STATE_OPTIONS.fallbackHeightM}
        />
        <CesiumSceneStateHashSync
          enabled={Boolean(scene)}
          fallbackHeightM={TERRAIN_SCENE_STATE_OPTIONS.fallbackHeightM}
          replace={true}
          label="annotations-playground:camera3d"
        />
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
                initialHomeViewState={ANNOTATIONS_DEMO_HOME_VIEW_STATE}
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
      </CesiumSceneStateProvider>
    </CesiumWidgetContainer>
  );
};
