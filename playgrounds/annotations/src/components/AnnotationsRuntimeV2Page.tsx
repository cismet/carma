import { useRef, useState } from "react";

import { Tooltip } from "antd";
import { type Scene } from "@carma/cesium";
import { CarmaResponsiveInfoBox } from "@carma-commons/ui/components";
import { SELECT_TOOL_TYPE } from "@carma-mapping/annotations/core";

import {
  AnnotationsProvider,
  RuntimeAnnotationInfoBox,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime-v2";
import {
  CesiumSceneStateHashSync,
  CesiumSceneStateProvider,
  type SceneLike,
  useInitialSceneViewState,
} from "@carma-mapping/engines/cesium/react/scene-state";
import {
  AnnotationsToolbar,
  AnnotationsToolbarButton,
  AnnotationsToolbarIcon,
  AnnotationsToolbarItem,
  AnnotationsToolbarSeparator,
} from "@carma-mapping/components";
import { LabelOverlayProvider } from "@carma-providers/label-overlay";

import { ANNOTATIONS_DEMO_HOME_VIEW_STATE } from "../config";
import type { PlaygroundRuntimePageProps } from "../playground.types";
import { CesiumNavigationOverlay } from "./CesiumNavigationOverlay";
import { CesiumWidgetContainer } from "./CesiumWidgetContainer";
import { PlaygroundStatusBar } from "./PlaygroundStatusBar";
import { SceneStateErrorModal } from "./SceneStateErrorModal";

const TERRAIN_SCENE_STATE_OPTIONS = {
  orbitPointMode: "screen-center",
  screenCenterSamplingStrategy: "terrain-only",
  throwOnMissingScreenCenterIntersection: true,
  fallbackHeightM: 200,
} as const;

const formatCoordinate = (value: number, digits: number) =>
  Number.isFinite(value) ? value.toFixed(digits) : "0";

const RuntimeToolbar = () => {
  const { registry, activeToolType, requestModeChange } =
    useAnnotationsRuntime();

  return (
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
        <AnnotationsToolbar>
          {registry.orderedDescriptors.map((descriptor) => {
            const isActive = descriptor.id === activeToolType;
            const showSeparator = descriptor.id === SELECT_TOOL_TYPE;

            return (
              <AnnotationsToolbarItem key={descriptor.id}>
                <Tooltip title={descriptor.tooltip} placement="bottom">
                  <span className="inline-block">
                    <AnnotationsToolbarButton
                      active={isActive}
                      onClick={() => requestModeChange(descriptor.id)}
                      aria-pressed={isActive}
                      aria-label={descriptor.tooltip}
                    >
                      <AnnotationsToolbarIcon>
                        {descriptor.icon}
                      </AnnotationsToolbarIcon>
                    </AnnotationsToolbarButton>
                  </span>
                </Tooltip>
                {showSeparator ? <AnnotationsToolbarSeparator /> : null}
              </AnnotationsToolbarItem>
            );
          })}
        </AnnotationsToolbar>
      </div>
    </div>
  );
};

const RuntimeStatusBar = ({
  runtimeVersion,
  onRuntimeVersionChange,
}: PlaygroundRuntimePageProps) => {
  const { registry, activeToolType, annotationEntries } =
    useAnnotationsRuntime();
  const activePlugin = registry.getPlugin(activeToolType);
  const primaryHint = activePlugin?.helpText?.[0] ?? "Werkzeug bereit.";
  const secondaryHint = `${annotationEntries.length} Annotation(en) gespeichert`;

  return (
    <PlaygroundStatusBar
      runtimeVersion={runtimeVersion}
      onRuntimeVersionChange={onRuntimeVersionChange}
      label="annotations runtime"
      values={[
        activePlugin?.descriptor.label ?? "Werkzeug",
        primaryHint,
        secondaryHint,
      ]}
    />
  );
};

const RuntimeSelectionInfoBox = () => {
  const { registry, selectedAnnotationId, annotationEntries, nodes } =
    useAnnotationsRuntime();

  if (!selectedAnnotationId) {
    return null;
  }

  const selectedAnnotation =
    annotationEntries.find(
      (annotation) => annotation.id === selectedAnnotationId
    ) ?? null;
  if (!selectedAnnotation) {
    return null;
  }

  const selectedPlugin =
    registry.getPlugin(selectedAnnotation.toolType) ?? null;
  if (selectedPlugin?.infoBox?.getSlots) {
    return <RuntimeAnnotationInfoBox pixelWidth={350} />;
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const coordinates = selectedAnnotation.nodeIds
    .map((nodeId) => nodeById.get(nodeId)?.coordinate ?? null)
    .filter((coordinate): coordinate is NonNullable<typeof coordinate> =>
      Boolean(coordinate)
    );

  return (
    <div
      data-test-id="annotation-info-box"
      style={{
        position: "absolute",
        top: 56,
        right: 12,
        zIndex: 1600,
        pointerEvents: "auto",
      }}
    >
      <CarmaResponsiveInfoBox
        width={350}
        onPanelClick={(event) => event.stopPropagation()}
        collapsible={true}
        useControlLayout={false}
        header={undefined}
        headingColor="#4b7ed1"
        heading={
          <div className="w-full px-2 flex items-center justify-between gap-2">
            <span className="truncate" title={selectedPlugin?.descriptor.label}>
              {selectedPlugin?.descriptor.label ?? "Messung"}
            </span>
          </div>
        }
        subtitle={
          <div className="text-[12px] leading-normal text-[#212529]">
            {selectedAnnotation.id}
          </div>
        }
        content={
          <div className="text-[12px] leading-normal text-[#212529] space-y-1">
            <div>{`Knoten: ${coordinates.length}`}</div>
            {coordinates.map((coordinate, index) => (
              <div key={`${selectedAnnotation.id}-node-${index}`}>
                {`${index + 1}: ${formatCoordinate(
                  coordinate.latitude,
                  6
                )}° N ${formatCoordinate(
                  coordinate.longitude,
                  6
                )}° O / NHN ${formatCoordinate(coordinate.altitude, 2)} m`}
              </div>
            ))}
          </div>
        }
      />
    </div>
  );
};

export const AnnotationsRuntimeV2Page = ({
  runtimeVersion,
  onRuntimeVersionChange,
}: PlaygroundRuntimePageProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const { initialViewState, isResolved } = useInitialSceneViewState();

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
          <AnnotationsProvider scene={scene} initialActiveToolType="polyline">
            <CesiumNavigationOverlay
              scene={scene}
              initialHomeViewState={ANNOTATIONS_DEMO_HOME_VIEW_STATE}
            />
            <RuntimeToolbar />
            <RuntimeStatusBar
              runtimeVersion={runtimeVersion}
              onRuntimeVersionChange={onRuntimeVersionChange}
            />
            <RuntimeSelectionInfoBox />
          </AnnotationsProvider>
        </LabelOverlayProvider>
      </CesiumSceneStateProvider>
    </CesiumWidgetContainer>
  );
};
