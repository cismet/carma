import { useRef, useState } from "react";

import { Tooltip } from "antd";
import { type Scene } from "@carma/cesium";
import { CarmaResponsiveInfoBox } from "@carma-commons/ui/components";
import { ResponsiveStatusBar } from "@carma-commons/ui/components";
import { SELECT_TOOL_TYPE } from "@carma-mapping/annotations/core";

import {
  AnnotationsProvider,
  RuntimeAnnotationInfoBox,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime-v2";
import {
  CesiumSceneStateProvider,
  type CesiumSceneLike,
  useCesiumSceneStateOptional,
} from "@carma-mapping/engines/cesium/react/scene-state";
import {
  AnnotationsToolbar,
  AnnotationsToolbarButton,
  AnnotationsToolbarIcon,
  AnnotationsToolbarItem,
  AnnotationsToolbarSeparator,
} from "@carma-mapping/components";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import { useCesiumCameraHashPlugin } from "@carma-providers/hash-state";
import { LabelOverlayProvider } from "@carma-providers/label-overlay";

import { CesiumWidgetContainer } from "./CesiumWidgetContainer";

const TERRAIN_SCENE_STATE_OPTIONS = {
  orbitPointMode: "screen-center",
  screenCenterSamplingStrategy: "terrain-only",
  throwOnMissingScreenCenterIntersection: true,
  fallbackHeightM: 200,
} as const;

const formatCoordinate = (value: number, digits: number) =>
  Number.isFinite(value) ? value.toFixed(digits) : "0";

const RuntimeCameraHashSync = ({ enabled }: { enabled: boolean }) => {
  const sceneState = useCesiumSceneStateOptional();
  useCesiumCameraHashPlugin({
    sceneState,
    enabled,
    encodeScheme: "maplibre-camera-centric",
    anchorMode: "camera-position",
    fallbackHeightM: 200,
    replace: true,
    includeIsCesiumFlag: false,
    label: "annotations-playground:camera3d",
  });
  return null;
};

const RuntimeToolbar = () => {
  const { registry, activeToolType, requestModeChange } =
    useAnnotationsRuntime();

  return (
    <Control position="topcenter" order={20}>
      <div className="w-full h-9 z-[999] pointer-events-auto">
        <div className="relative w-[calc(100%-40px)] mx-auto h-full">
          <div className="w-full flex justify-center items-center h-full gap-2">
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
      </div>
    </Control>
  );
};

const RuntimeStatusBar = () => {
  const { registry, activeToolType, annotationEntries } =
    useAnnotationsRuntime();
  const activePlugin = registry.getPlugin(activeToolType);
  const primaryHint = activePlugin?.helpText?.[0] ?? "Werkzeug bereit.";
  const secondaryHint = `${annotationEntries.length} Annotation(en) gespeichert`;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1800,
        pointerEvents: "none",
      }}
    >
      <ResponsiveStatusBar
        label="annotations runtime"
        values={[
          activePlugin?.descriptor.label ?? "Werkzeug",
          primaryHint,
          secondaryHint,
        ]}
      />
    </div>
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
    <div data-test-id="annotation-info-box">
      <CarmaResponsiveInfoBox
        width={350}
        onPanelClick={(event) => event.stopPropagation()}
        collapsible={true}
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

export const AnnotationsRuntimeV2Page = () => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);

  return (
    <CesiumWidgetContainer rootRef={rootRef} onSceneChange={setScene}>
      <CesiumSceneStateProvider
        scene={scene as unknown as CesiumSceneLike | null}
        options={TERRAIN_SCENE_STATE_OPTIONS}
      >
        <RuntimeCameraHashSync enabled={Boolean(scene)} />
        <LabelOverlayProvider containerRef={rootRef}>
          <AnnotationsProvider scene={scene} initialActiveToolType="polyline">
            <ControlLayout ifStorybook={false}>
              <RuntimeToolbar />
              <RuntimeStatusBar />
              <RuntimeSelectionInfoBox />
            </ControlLayout>
          </AnnotationsProvider>
        </LabelOverlayProvider>
      </CesiumSceneStateProvider>
    </CesiumWidgetContainer>
  );
};
