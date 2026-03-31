import { useRef, useState } from "react";

import { Tooltip } from "antd";
import { type Scene } from "@carma/cesium";
import { CarmaResponsiveInfoBox } from "@carma-commons/ui/components";
import { SELECT_TOOL_TYPE } from "@carma-mapping/annotations/core";
import { formatLatLonDegrees } from "@carma/units/helpers";
import type { Degrees } from "@carma/units/types";

import {
  AnnotationsProvider,
  RuntimeAnnotationInfoBox,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime-v2";
import {
  AnnotationsToolbar,
  AnnotationsToolbarButton,
  AnnotationsToolbarIcon,
  AnnotationsToolbarItem,
  AnnotationsToolbarSeparator,
} from "@carma-mapping/components";
import { ControlLayout } from "@carma-mapping/map-controls-layout";
import { useCesiumLabelOverlayHost } from "@carma-mapping/engines/cesium/react/interactions";
import { LabelOverlayProvider } from "@carma-providers/label-overlay";

import type { PlaygroundRuntimePageProps } from "../playground.types";
import { CesiumNavigationOverlay } from "./CesiumNavigationOverlay";
import { CesiumWidgetContainer } from "./CesiumWidgetContainer";
import { PlaygroundStatusBar } from "./PlaygroundStatusBar";

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
}: Pick<
  PlaygroundRuntimePageProps,
  "runtimeVersion" | "onRuntimeVersionChange"
>) => {
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
        bottom: 40,
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
                {(() => {
                  const [latitude, longitude] = formatLatLonDegrees(
                    coordinate.latitude as Degrees,
                    coordinate.longitude as Degrees,
                    {
                      fractionDigits: 6,
                      locale: "de-DE",
                    }
                  );

                  return `${
                    index + 1
                  }: ${latitude} ${longitude} / NHN ${formatCoordinate(
                    coordinate.altitude,
                    2
                  )} m`;
                })()}
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
  homeCameraState,
}: PlaygroundRuntimePageProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const overlayHost = useCesiumLabelOverlayHost({
    scene,
    containerRef: rootRef,
  });

  return (
    <CesiumWidgetContainer
      rootRef={rootRef}
      onSceneChange={setScene}
      initialCameraState={homeCameraState}
    >
      <LabelOverlayProvider host={overlayHost}>
        <ControlLayout>
          <AnnotationsProvider scene={scene} initialActiveToolType="polyline">
            <CesiumNavigationOverlay
              scene={scene}
              initialHomeCameraState={homeCameraState}
            />
            <RuntimeToolbar />
            <RuntimeStatusBar
              runtimeVersion={runtimeVersion}
              onRuntimeVersionChange={onRuntimeVersionChange}
            />
            <RuntimeSelectionInfoBox />
          </AnnotationsProvider>
        </ControlLayout>
      </LabelOverlayProvider>
    </CesiumWidgetContainer>
  );
};
