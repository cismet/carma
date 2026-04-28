import { useEffect, useMemo, useRef, useState } from "react";
import {
  isManagedAnnotationKeyboardEvent,
  renderAnnotationShortcutGlyph,
} from "@carma-mapping/annotations/core";
import {
  AnnotationInfoBoxContainer,
  AnnotationInfoBoxSubtitleText,
  AnnotationInfoBoxTextContent,
  AnnotationsToolbar,
  resolveAnnotationInfoBoxVisualOptions,
} from "@carma-mapping/annotations/ui";
import {
  ANNOTATION_TOOL_PLUGIN_KINDS,
  AnnotationsProvider,
  RuntimeAnnotationInfoBox,
  listAnnotationToolShortcuts,
  typographyDefaults,
  resolveAnnotationToolShortcutTarget,
  useLocalAnnotationsRuntimePersistence,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";
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
  PLAYGROUND_ALL_RUNTIME_TOOL_PLUGINS,
  PLAYGROUND_PREVIEW_LINE_LABEL_VISUAL_OPTIONS,
  PLAYGROUND_RUNTIME_INFO_BOX_VISUAL_OPTIONS,
  PLAYGROUND_RUNTIME_FORMAT_OPTIONS,
  PLAYGROUND_STABLE_RUNTIME_TOOL_PLUGINS,
  PLAYGROUND_TOOLSETS,
  readInitialToolset,
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

const PLAYGROUND_INFO_BOX_VISUAL_OPTIONS = {
  ...PLAYGROUND_RUNTIME_INFO_BOX_VISUAL_OPTIONS,
  resolveActionTooltipPopupContainer:
    resolvePlaygroundFloatingOverlayTooltipContainer,
} as const;

const PLAYGROUND_TOOLBAR_CLASS_NAMES = {
  wrapper:
    "inline-flex min-h-8 items-center gap-0 overflow-hidden rounded-full bg-neutral-100 px-2 shadow-md",
  toolGroup: "relative flex min-w-0 items-center overflow-visible",
  toolButtonBase:
    "relative inline-flex h-8 w-11 min-w-11 items-center justify-center rounded-none border-0 bg-transparent px-0 text-gray-700 hover:text-gray-900",
  toolButtonActive:
    "bg-white/90 text-gray-900 shadow-[inset_0_0_0_1px_#cbd5e1]",
  toolButtonIcon:
    "inline-flex items-center justify-center text-[18px] leading-none",
} as const;

const RuntimeToolbar = ({ scene }: { scene: Scene | null }) => {
  const { registry, activeToolType, requestModeChange } =
    useAnnotationsRuntime();
  const visibleDescriptors = registry.orderedDescriptors;
  const primaryInteractionToolId =
    registry.plugins.find(
      (plugin) => plugin.kind === ANNOTATION_TOOL_PLUGIN_KINDS.INTERACTION
    )?.id ?? null;
  const toolbarTools = useMemo(
    () =>
      visibleDescriptors.map((descriptor) => {
        const shortcuts = listAnnotationToolShortcuts(
          descriptor.id,
          visibleDescriptors,
          primaryInteractionToolId
        );

        return {
          id: descriptor.id,
          label: descriptor.label,
          tooltip: descriptor.tooltip,
          tooltipContent: (
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <span>{descriptor.tooltip}</span>
              {renderShortcutBadges(shortcuts)}
            </span>
          ),
          ariaLabel: `${descriptor.tooltip} (${shortcuts.join(", ")})`,
          icon: descriptor.icon,
          separatorAfter: descriptor.id === primaryInteractionToolId,
        };
      }),
    [primaryInteractionToolId, visibleDescriptors]
  );

  useEffect(() => {
    const handleToolShortcutKeyDown = (event: KeyboardEvent) => {
      if (!isManagedAnnotationKeyboardEvent(event)) return;

      const targetToolType = resolveAnnotationToolShortcutTarget(
        event.key,
        visibleDescriptors,
        primaryInteractionToolId
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
  }, [
    activeToolType,
    primaryInteractionToolId,
    requestModeChange,
    visibleDescriptors,
  ]);

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
        <AnnotationsToolbar
          activeToolId={activeToolType}
          tools={toolbarTools}
          onToolSelect={(toolId) => requestModeChange(toolId)}
          classNames={PLAYGROUND_TOOLBAR_CLASS_NAMES}
          tooltipPlacement="bottom"
          getTooltipPopupContainer={
            resolvePlaygroundFloatingOverlayTooltipContainer
          }
        />
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
      window.localStorage.setItem(ACTIVE_TOOL_STORAGE_KEY, activeToolType);
    } catch {
      // ignore storage write errors
    }
  }, [activeToolType]);

  return null;
};

const resolvePlaygroundEmptyInfoBoxBodyText = ({
  activeToolLabel,
  activeToolKind,
  activeToolHelpText,
  hasAnyAnnotations,
  activeToolAnnotationCount,
}: {
  activeToolLabel: string;
  activeToolKind: string | null;
  activeToolHelpText: readonly string[];
  hasAnyAnnotations: boolean;
  activeToolAnnotationCount: number;
}): readonly string[] => {
  if (activeToolKind === ANNOTATION_TOOL_PLUGIN_KINDS.INTERACTION) {
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
    : activePlugin?.kind === ANNOTATION_TOOL_PLUGIN_KINDS.INTERACTION
    ? [
        "Messungen oder Anmerkungen anklicken, um sie auszuwählen.",
        "Langes Drücken auf einen Punkt öffnet den Editiermodus.",
      ]
    : ["Klicken Sie in die Karte, um eine neue Messung anzulegen."];
  const activeToolAnnotationCount = activePlugin?.annotationType
    ? annotationEntries.filter(
        (annotationEntry) =>
          annotationEntry.toolType === activePlugin.annotationType
      ).length
    : 0;
  const emptyStateBodyText = resolvePlaygroundEmptyInfoBoxBodyText({
    activeToolLabel,
    activeToolKind: activePlugin?.kind ?? null,
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
    registry
      .getPluginsByAnnotationType(selectedAnnotation.toolType)
      .find((plugin) => plugin.infoBox?.getSlots) ?? null;
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
  const [toolset] = useState(() => readInitialToolset());
  const overlayHost = useCesiumLabelOverlayHost({
    scene,
    containerRef: rootRef,
  });
  const toolPlugins =
    toolset === PLAYGROUND_TOOLSETS.ALL
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
