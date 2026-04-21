import { useEffect, useRef, useState } from "react";
import { Tooltip } from "antd";
import {
  isManagedAnnotationKeyboardEvent,
  listAnnotationToolShortcuts,
  renderAnnotationShortcutGlyph,
  resolveAnnotationToolShortcutTarget,
  ANNOTATION_TOOL_TYPES,
} from "@carma-mapping/annotations/core";
import {
  AnnotationInfoBoxContainer,
  AnnotationInfoBoxSubtitleText,
  AnnotationInfoBoxTextContent,
  resolveAnnotationInfoBoxVisualOptions,
} from "@carma-mapping/annotations/ui";
import {
  AnnotationsProvider,
  RuntimeAnnotationInfoBox,
  defaultAnnotationToolPlugins,
  distanceToolPlugin,
  pointToolPlugin,
  selectToolPlugin,
  typographyDefaults,
  useLocalAnnotationsRuntimePersistence,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";
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
  ACTIVE_TOOL_STORAGE_KEY,
  ANNOTATIONS_RUNTIME_STORAGE_KEY,
  INFOBOX_WIDTH_PX,
  PLAYGROUND_PREVIEW_LINE_LABEL_VISUAL_OPTIONS,
  PLAYGROUND_RUNTIME_INFO_BOX_VISUAL_OPTIONS,
  PLAYGROUND_RUNTIME_FORMAT_OPTIONS,
  PLAYGROUND_RUNTIME_TOOLSETS,
  readInitialRuntimeToolset,
  readInitialToolType,
} from "../playgroundConfig";
import { CesiumNavigationOverlay } from "./CesiumNavigationOverlay";
import { CesiumWidgetContainer } from "./CesiumWidgetContainer";
import {
  PLAYGROUND_SELECTION_INFO_BOX_FLOATING_STYLE,
  PLAYGROUND_TOOLBAR_FLOATING_STYLE,
  createPlaygroundFloatingOverlayInteractionProps,
  resolvePlaygroundFloatingOverlayTooltipContainer,
} from "./playgroundFloatingOverlay.shared";
const { SELECT: SELECT_TOOL_TYPE } = ANNOTATION_TOOL_TYPES;

const PLAYGROUND_SHORTCUT_BADGE_TYPOGRAPHY_CLASSNAME = `text-[${typographyDefaults.rootFontSizeRem}] font-bold leading-none text-white`;
const PLAYGROUND_BODY_TEXT_CLASSNAME = `text-[${typographyDefaults.rootFontSizeRem}] leading-[1.4] text-[#212529]`;

const renderShortcutBadges = (shortcuts: readonly string[]) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
    {shortcuts.map((shortcut) => (
      <span
        key={shortcut}
        className={`inline-flex items-center justify-center ${PLAYGROUND_SHORTCUT_BADGE_TYPOGRAPHY_CLASSNAME}`}
      >
        {renderAnnotationShortcutGlyph(shortcut)}
      </span>
    ))}
  </span>
);

const PLAYGROUND_STABLE_RUNTIME_TOOL_PLUGINS = [
  selectToolPlugin,
  pointToolPlugin,
  distanceToolPlugin,
] as const;
const PLAYGROUND_ALL_RUNTIME_TOOL_PLUGINS = defaultAnnotationToolPlugins;
const PLAYGROUND_INFO_BOX_VISUAL_OPTIONS = {
  ...PLAYGROUND_RUNTIME_INFO_BOX_VISUAL_OPTIONS,
  resolveActionTooltipPopupContainer:
    resolvePlaygroundFloatingOverlayTooltipContainer,
} as const;

const RuntimeToolbar = ({ scene }: { scene: Scene | null }) => {
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
      {...createPlaygroundFloatingOverlayInteractionProps(scene)}
      style={PLAYGROUND_TOOLBAR_FLOATING_STYLE}
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
                  getPopupContainer={
                    resolvePlaygroundFloatingOverlayTooltipContainer
                  }
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

const PersistActiveRuntimeToolMode = () => {
  const { activeToolType } = useAnnotationsRuntime();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        ACTIVE_TOOL_STORAGE_KEY,
        activeToolType
      );
    } catch {
      // ignore storage write errors
    }
  }, [activeToolType]);

  return null;
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
  scene,
}: {
  activeToolLabel: string;
  bodyTextLines: readonly string[];
  scene: Scene | null;
}) => {
  const resolvedInfoBoxVisualOptions = resolveAnnotationInfoBoxVisualOptions(
    PLAYGROUND_INFO_BOX_VISUAL_OPTIONS
  );

  return (
    <div
      data-test-id="annotation-info-box"
      {...createPlaygroundFloatingOverlayInteractionProps(scene)}
      style={{
        ...PLAYGROUND_SELECTION_INFO_BOX_FLOATING_STYLE,
        pointerEvents: "none",
      }}
    >
      <AnnotationInfoBoxContainer
        pixelWidth={INFOBOX_WIDTH_PX}
        useControlLayout={false}
        style={{ pointerEvents: "none" }}
        visualOptions={PLAYGROUND_INFO_BOX_VISUAL_OPTIONS}
        slots={{
          headingTitle: activeToolLabel,
          content: (
            <div className="px-3 pb-2 pt-2">
              <AnnotationInfoBoxTextContent
                className={`${PLAYGROUND_BODY_TEXT_CLASSNAME} space-y-2`}
                visualOptions={resolvedInfoBoxVisualOptions}
              >
                {bodyTextLines.map((line, index) => (
                  <p key={`${activeToolLabel}-empty-state-line-${index}`}>
                    {line}
                  </p>
                ))}
              </AnnotationInfoBoxTextContent>
            </div>
          ),
          collapsible: false,
        }}
      />
    </div>
  );
};

const RuntimeSelectionInfoBox = ({ scene }: { scene: Scene | null }) => {
  const {
    annotationEntries,
    activeToolType,
    formatOptions,
    nodes,
    registry,
    selectedAnnotationId,
  } = useAnnotationsRuntime();
  const resolvedInfoBoxVisualOptions = resolveAnnotationInfoBoxVisualOptions(
    PLAYGROUND_INFO_BOX_VISUAL_OPTIONS
  );
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
        scene={scene}
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
        scene={scene}
      />
    );
  }

  const selectedPlugin =
    registry.getPlugin(selectedAnnotation.toolType) ?? null;
  if (selectedPlugin?.infoBox?.getSlots) {
    return (
      <div
        data-test-id="annotation-info-box"
        {...createPlaygroundFloatingOverlayInteractionProps(scene)}
        style={PLAYGROUND_SELECTION_INFO_BOX_FLOATING_STYLE}
      >
        <RuntimeAnnotationInfoBox
          pixelWidth={INFOBOX_WIDTH_PX}
          useControlLayout={false}
          visualOptions={PLAYGROUND_INFO_BOX_VISUAL_OPTIONS}
        />
      </div>
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
      {...createPlaygroundFloatingOverlayInteractionProps(scene)}
      style={PLAYGROUND_SELECTION_INFO_BOX_FLOATING_STYLE}
    >
      <AnnotationInfoBoxContainer
        pixelWidth={INFOBOX_WIDTH_PX}
        useControlLayout={false}
        visualOptions={PLAYGROUND_INFO_BOX_VISUAL_OPTIONS}
        slots={{
          headingTitle: selectedPlugin?.descriptor.label ?? "Messung",
          subtitle: (
            <AnnotationInfoBoxSubtitleText
              visualOptions={resolvedInfoBoxVisualOptions}
            >
              {selectedAnnotation.id}
            </AnnotationInfoBoxSubtitleText>
          ),
          content: (
            <AnnotationInfoBoxTextContent
              className="space-y-1"
              visualOptions={resolvedInfoBoxVisualOptions}
            >
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
            </AnnotationInfoBoxTextContent>
          ),
          collapsible: true,
        }}
      />
    </div>
  );
};

export const AnnotationsRuntimePage = ({
  homeCameraState,
}: PlaygroundRuntimePageProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [initialToolType] = useState(() => readInitialToolType());
  const [runtimeToolset] = useState(() => readInitialRuntimeToolset());
  const overlayHost = useCesiumLabelOverlayHost({
    scene,
    containerRef: rootRef,
  });
  const toolPlugins =
    runtimeToolset === PLAYGROUND_RUNTIME_TOOLSETS.ALL
      ? PLAYGROUND_ALL_RUNTIME_TOOL_PLUGINS
      : PLAYGROUND_STABLE_RUNTIME_TOOL_PLUGINS;
  const { initialPersistenceState, onPersistenceStateChange } =
    useLocalAnnotationsRuntimePersistence({
      enabled: true,
      storageKey: ANNOTATIONS_RUNTIME_STORAGE_KEY,
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
            plugins={toolPlugins}
            formatOptions={PLAYGROUND_RUNTIME_FORMAT_OPTIONS}
            previewLineLabelVisualOptions={
              PLAYGROUND_PREVIEW_LINE_LABEL_VISUAL_OPTIONS
            }
            initialPersistenceState={initialPersistenceState}
            onPersistenceStateChange={onPersistenceStateChange}
          >
            <PersistActiveRuntimeToolMode />
            <CesiumNavigationOverlay
              scene={scene}
              initialHomeCameraState={homeCameraState}
            />
            <RuntimeToolbar scene={scene} />
            <RuntimeSelectionInfoBox scene={scene} />
          </AnnotationsProvider>
        </ControlLayout>
      </LabelOverlayProvider>
    </CesiumWidgetContainer>
  );
};
