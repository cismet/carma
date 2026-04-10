import { useEffect, useRef, useState } from "react";

import { Tooltip } from "antd";

import { CarmaResponsiveInfoBox } from "@carma-commons/ui/components";
import {
  ANNOTATION_TYPE_POINT,
  SELECT_TOOL_TYPE,
  isManagedAnnotationKeyboardEvent,
  listAnnotationToolShortcuts,
  renderAnnotationShortcutGlyph,
  resolveAnnotationToolShortcutTarget,
} from "@carma-mapping/annotations/core";
import {
  AnnotationsProvider,
  RuntimeAnnotationInfoBox,
  resolveRuntimeAnnotationInfoBoxVisualOptions,
  distanceToolPlugin,
  pointToolPlugin,
  selectToolPlugin,
  useLocalAnnotationsRuntimePersistence,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime-v2";
import {
  AnnotationsToolbar,
  AnnotationsToolbarButton,
  AnnotationsToolbarIcon,
  AnnotationsToolbarItem,
  AnnotationsToolbarSeparator,
} from "@carma-mapping/components";
import { useCesiumLabelOverlayHost } from "@carma-mapping/engines/cesium/react/interactions";
import { ControlLayout } from "@carma-mapping/map-controls-layout";
import { LabelOverlayProvider } from "@carma-providers/label-overlay";
import { type Scene } from "@carma-cesium";
import { formatLatLonDegrees, formatLengthMeters } from "@carma-units";
import type { Degrees } from "@carma-units";

import type { PlaygroundRuntimePageProps } from "../playground.types";
import {
  ANNOTATIONS_RUNTIME_V2_STORAGE_KEY,
  INFOBOX_WIDTH_PX,
  PLAYGROUND_FLOATING_OVERLAY_WINDOW_MARGIN_PX,
  PLAYGROUND_PREVIEW_LINE_LABEL_VISUAL_OPTIONS,
  PLAYGROUND_RUNTIME_INFO_BOX_VISUAL_OPTIONS,
  PLAYGROUND_RUNTIME_FORMAT_OPTIONS,
} from "../playgroundConfig";
import { CesiumNavigationOverlay } from "./CesiumNavigationOverlay";
import { CesiumWidgetContainer } from "./CesiumWidgetContainer";

const renderShortcutBadges = (shortcuts: readonly string[]) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
    {shortcuts.map((shortcut) => (
      <span
        key={shortcut}
        className="inline-flex items-center justify-center text-[14px] font-bold leading-none text-white"
      >
        {renderAnnotationShortcutGlyph(shortcut)}
      </span>
    ))}
  </span>
);

const PLAYGROUND_ACTIVE_TOOL_PLUGINS = [
  selectToolPlugin,
  pointToolPlugin,
  distanceToolPlugin,
] as const;

const selectionInfoBoxFloatingStyle = {
  position: "absolute",
  bottom: PLAYGROUND_FLOATING_OVERLAY_WINDOW_MARGIN_PX,
  right: PLAYGROUND_FLOATING_OVERLAY_WINDOW_MARGIN_PX,
  zIndex: 1600,
  pointerEvents: "auto",
} as const;

const RuntimeToolbar = () => {
  const { registry, activeToolType, requestModeChange } =
    useAnnotationsRuntime();
  const visibleDescriptors = registry.orderedDescriptors;
  const orderedToolTypes = visibleDescriptors.map(
    (descriptor) => descriptor.id
  );

  useEffect(() => {
    const handleToolShortcutKeyDown = (event: KeyboardEvent) => {
      if (!isManagedAnnotationKeyboardEvent(event)) return;

      const targetToolType = resolveAnnotationToolShortcutTarget(
        event.key,
        orderedToolTypes
      );
      if (!targetToolType || targetToolType === activeToolType) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      requestModeChange(targetToolType);
    };

    window.addEventListener("keydown", handleToolShortcutKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleToolShortcutKeyDown, true);
    };
  }, [activeToolType, orderedToolTypes, requestModeChange]);

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
          {visibleDescriptors.map((descriptor) => {
            const isActive = descriptor.id === activeToolType;
            const showSeparator = descriptor.id === SELECT_TOOL_TYPE;
            const shortcuts = listAnnotationToolShortcuts(
              descriptor.id,
              orderedToolTypes
            );

            return (
              <AnnotationsToolbarItem key={descriptor.id}>
                <Tooltip
                  title={
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <span>{descriptor.tooltip}</span>
                      {renderShortcutBadges(shortcuts)}
                    </span>
                  }
                  placement="bottom"
                >
                  <span className="inline-block">
                    <AnnotationsToolbarButton
                      active={isActive}
                      onClick={() => requestModeChange(descriptor.id)}
                      aria-pressed={isActive}
                      aria-label={`${descriptor.tooltip} (${shortcuts.join(
                        ", "
                      )})`}
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

const resolvePlaygroundEmptyInfoBoxBodyText = ({
  activeToolLabel,
  activeToolType,
  activeToolHelpText,
  hasAnyAnnotations,
  activeToolAnnotationCount,
}: {
  activeToolLabel: string;
  activeToolType: string;
  activeToolHelpText: readonly string[];
  hasAnyAnnotations: boolean;
  activeToolAnnotationCount: number;
}): readonly string[] => {
  if (activeToolType === SELECT_TOOL_TYPE) {
    if (!hasAnyAnnotations) {
      return [
        "Aktuell sind keine Messungen vorhanden.",
        "Wählen Sie oben einen Messmodus und klicken Sie in die Karte, um eine neue Messung anzulegen.",
      ];
    }

    return activeToolHelpText;
  }

  return activeToolAnnotationCount === 0 && hasAnyAnnotations
    ? [`Noch keine ${activeToolLabel} vorhanden.`, ...activeToolHelpText]
    : activeToolHelpText;
};

const RuntimeSelectionInfoBoxEmptyState = ({
  activeToolLabel,
  bodyTextLines,
}: {
  activeToolLabel: string;
  bodyTextLines: readonly string[];
}) => {
  const resolvedInfoBoxVisualOptions =
    resolveRuntimeAnnotationInfoBoxVisualOptions(
      PLAYGROUND_RUNTIME_INFO_BOX_VISUAL_OPTIONS
    );

  return (
    <div
      data-test-id="annotation-info-box"
      style={{ ...selectionInfoBoxFloatingStyle, pointerEvents: "none" }}
    >
      <CarmaResponsiveInfoBox
        width={INFOBOX_WIDTH_PX}
        onPanelClick={(event) => event.stopPropagation()}
        collapsible={false}
        useControlLayout={false}
        header={undefined}
        headingColor={resolvedInfoBoxVisualOptions.headingColor}
        style={{ pointerEvents: "none" }}
        heading={
          <div className="flex w-full items-center gap-2 px-1">
            <span
              className={`${resolvedInfoBoxVisualOptions.headerForegroundClassName} ${resolvedInfoBoxVisualOptions.headerTitleClassName}`}
              title={activeToolLabel}
            >
              {activeToolLabel}
            </span>
          </div>
        }
        content={
          <div className="px-3 pb-2 pt-2">
            <div
              className={`${resolvedInfoBoxVisualOptions.bodyTextClassName} space-y-2`}
            >
              {bodyTextLines.map((line, index) => (
                <p
                  key={`${activeToolLabel}-empty-state-line-${index}`}
                  className={
                    index > 0
                      ? resolvedInfoBoxVisualOptions.mutedTextClassName
                      : undefined
                  }
                >
                  {line}
                </p>
              ))}
            </div>
          </div>
        }
      />
    </div>
  );
};

const RuntimeSelectionInfoBox = () => {
  const {
    annotationEntries,
    activeToolType,
    formatOptions,
    nodes,
    registry,
    selectedAnnotationId,
  } = useAnnotationsRuntime();
  const hasAnnotations = annotationEntries.length > 0;
  const activePlugin = registry.getPlugin(activeToolType) ?? null;
  const activeToolLabel = activePlugin?.descriptor.label ?? "Messungen";
  const activeToolHelpText = activePlugin?.helpText?.length
    ? activePlugin.helpText
    : activeToolType === SELECT_TOOL_TYPE
    ? [
        "Messungen oder Anmerkungen anklicken, um sie auszuwählen.",
        "Langes Drücken auf einen Punkt öffnet den Editiermodus.",
      ]
    : ["Klicken Sie in die Karte, um eine neue Messung anzulegen."];
  const activeToolAnnotationCount = annotationEntries.filter(
    (annotationEntry) => annotationEntry.toolType === activeToolType
  ).length;
  const emptyStateBodyText = resolvePlaygroundEmptyInfoBoxBodyText({
    activeToolLabel,
    activeToolType,
    activeToolHelpText,
    hasAnyAnnotations: hasAnnotations,
    activeToolAnnotationCount,
  });

  if (!selectedAnnotationId) {
    return (
      <RuntimeSelectionInfoBoxEmptyState
        activeToolLabel={activeToolLabel}
        bodyTextLines={emptyStateBodyText}
      />
    );
  }

  const selectedAnnotation =
    annotationEntries.find(
      (annotation) => annotation.id === selectedAnnotationId
    ) ?? null;
  if (!selectedAnnotation) {
    return (
      <RuntimeSelectionInfoBoxEmptyState
        activeToolLabel={activeToolLabel}
        bodyTextLines={emptyStateBodyText}
      />
    );
  }

  const selectedPlugin =
    registry.getPlugin(selectedAnnotation.toolType) ?? null;
  if (selectedPlugin?.infoBox?.getSlots) {
    return (
      <RuntimeAnnotationInfoBox
        pixelWidth={INFOBOX_WIDTH_PX}
        useControlLayout={false}
        style={selectionInfoBoxFloatingStyle}
        visualOptions={PLAYGROUND_RUNTIME_INFO_BOX_VISUAL_OPTIONS}
      />
    );
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
        ...selectionInfoBoxFloatingStyle,
      }}
    >
      <CarmaResponsiveInfoBox
        width={INFOBOX_WIDTH_PX}
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
                    formatOptions.geographicCoordinate
                  );

                  return `${
                    index + 1
                  }: ${latitude} ${longitude} / NHN ${formatLengthMeters(
                    coordinate.altitude,
                    formatOptions.lengthMeters
                  )}`;
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
  homeCameraState,
}: PlaygroundRuntimePageProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [initialToolType] = useState(() => ANNOTATION_TYPE_POINT);
  const overlayHost = useCesiumLabelOverlayHost({
    scene,
    containerRef: rootRef,
  });
  const { initialPersistenceState, onPersistenceStateChange } =
    useLocalAnnotationsRuntimePersistence({
      enabled: true,
      storageKey: ANNOTATIONS_RUNTIME_V2_STORAGE_KEY,
    });

  return (
    <CesiumWidgetContainer
      rootRef={rootRef}
      onSceneChange={setScene}
      initialCameraState={homeCameraState}
    >
      <LabelOverlayProvider host={overlayHost}>
        <ControlLayout>
          <AnnotationsProvider
            scene={scene}
            initialActiveToolType={initialToolType}
            plugins={PLAYGROUND_ACTIVE_TOOL_PLUGINS}
            formatOptions={PLAYGROUND_RUNTIME_FORMAT_OPTIONS}
            previewLineLabelVisualOptions={
              PLAYGROUND_PREVIEW_LINE_LABEL_VISUAL_OPTIONS
            }
            initialPersistenceState={initialPersistenceState}
            onPersistenceStateChange={onPersistenceStateChange}
          >
            <CesiumNavigationOverlay
              scene={scene}
              initialHomeCameraState={homeCameraState}
            />
            <RuntimeToolbar />
            <RuntimeSelectionInfoBox />
          </AnnotationsProvider>
        </ControlLayout>
      </LabelOverlayProvider>
    </CesiumWidgetContainer>
  );
};
