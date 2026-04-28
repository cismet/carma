import { useMemo } from "react";
import { useSelector } from "react-redux";
import { ResponsiveInfoBox } from "@carma-appframeworks/portals";
import {
  AnnotationInfoBoxContainer,
  AnnotationInfoBoxTextContent,
  type AnnotationInfoBoxLayoutProps,
  type AnnotationInfoBoxSlots,
  resolveAnnotationInfoBoxVisualOptions,
} from "@carma-mapping/annotations/ui";
import {
  type AnnotationToolId,
  resolveAnnotationToolFallbackPlugin,
  RuntimeAnnotationInfoBox,
  type RuntimeAnnotationInfoBoxContext,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { getLayers } from "../../store/slices/mapping";
import { getUIMode } from "../../store/slices/ui";
import { shouldShowCesiumMeasurementInfoBox } from "../../helper/cesium-measurement-info-box";
import { CESIUM_ANNOTATION_CONFIG } from "../../config/app.config";

const GEOPORTAL_LEGACY_INFO_BOX_HELP_TOOL_IDS = new Set<AnnotationToolId>([
  "select",
  "point",
  "distance",
]);

const GEOPORTAL_LEGACY_INFO_BOX_MEASUREMENT_TOOL_IDS = new Set<
  RuntimeAnnotationInfoBoxContext["annotation"]["toolType"]
>(["point", "distance"]);

const GeoportalLegacyAnnotationInfoBox = ({
  pixelWidth,
  slots,
  visualOptions,
}: Pick<AnnotationInfoBoxLayoutProps, "pixelWidth" | "visualOptions"> & {
  slots: AnnotationInfoBoxSlots;
}) => {
  const resolvedVisualOptions =
    resolveAnnotationInfoBoxVisualOptions(visualOptions);
  const headingTitle = slots.headingTitle.trim();

  return (
    <div data-test-id="annotation-info-box">
      <ResponsiveInfoBox
        pixelwidth={pixelWidth ?? resolvedVisualOptions.defaultPixelWidth}
        panelClick={(event) => event.stopPropagation()}
        header={
          <div
            className="w-full"
            style={{
              backgroundColor:
                slots.headingColor ?? resolvedVisualOptions.headingColor,
            }}
          >
            Messungen
          </div>
        }
        alwaysVisibleDiv={
          <div className="mt-2 mb-2 w-[96%]">
            {slots.subtitle ?? (
              <span className="text-base font-semibold">{headingTitle}</span>
            )}
          </div>
        }
        collapsibleDiv={
          <div>
            {slots.content}
            {slots.footer}
          </div>
        }
        isCollapsible={slots.collapsible ?? true}
        fixedRow={true}
      />
    </div>
  );
};

const GeoportalLegacyAnnotationInstructionInfoBox = ({
  helpText,
}: {
  helpText: readonly string[];
}) => {
  const instructionText = helpText.join(" ");

  return (
    <div data-test-id="annotation-info-box">
      <ResponsiveInfoBox
        pixelwidth={350}
        panelClick={(event) => event.stopPropagation()}
        header=""
        isCollapsible={false}
        alwaysVisibleDiv={
          <div
            className="mt-2 w-[90%] p-2"
            data-test-id="empty-measurement-info"
          >
            <p className="text-[#212529] font-normal text-xs leading-normal">
              {instructionText}
            </p>
          </div>
        }
        collapsibleDiv={<div />}
        fixedRow={false}
      />
    </div>
  );
};

const CesiumMeasurementInfoBox = () => {
  const { isCesium } = useMapFrameworkSwitcherContext();
  const uiMode = useSelector(getUIMode);
  const layers = useSelector(getLayers);
  const {
    registry,
    activeToolType,
    annotationEntries,
    formatOptions,
    nodes,
    selectedAnnotationId,
    setSelectedAnnotationId,
    focusAnnotationId,
    flyToAllAnnotations,
    removeAnnotationById,
    exportAnnotationGeoJson,
    toggleAnnotationVisibility,
    toggleAnnotationLocked,
    elevationReferenceAnnotationId,
    setElevationReferenceAnnotationId,
    updateAnnotationDisplayName,
    updateAnnotationShortLabel,
  } = useAnnotationsRuntime();
  const annotationsVisible = shouldShowCesiumMeasurementInfoBox({
    isCesium,
    layers,
    uiMode,
  });
  const resolvedVisualOptions = useMemo(
    () => resolveAnnotationInfoBoxVisualOptions(),
    []
  );

  const fallbackPlugin = useMemo(() => {
    return resolveAnnotationToolFallbackPlugin({
      activeToolType,
      registry,
    });
  }, [activeToolType, registry]);

  const selectedAnnotation = useMemo(() => {
    if (!selectedAnnotationId) {
      return null;
    }

    return (
      annotationEntries.find(
        (annotationEntry) => annotationEntry.id === selectedAnnotationId
      ) ?? null
    );
  }, [annotationEntries, selectedAnnotationId]);

  const selectedAnnotationSlots = useMemo(() => {
    if (
      !selectedAnnotation ||
      !GEOPORTAL_LEGACY_INFO_BOX_MEASUREMENT_TOOL_IDS.has(
        selectedAnnotation.toolType
      )
    ) {
      return null;
    }

    const plugin = registry
      .getPluginsByAnnotationType(selectedAnnotation.toolType)
      .find((candidatePlugin) => candidatePlugin.infoBox?.getSlots);

    if (!plugin?.infoBox?.getSlots) {
      return null;
    }

    return plugin.infoBox.getSlots({
      annotation: selectedAnnotation,
      annotationEntries,
      nodes,
      selectedAnnotationId: selectedAnnotation.id,
      setSelectedAnnotationId,
      focusAnnotationId,
      flyToAllAnnotations,
      removeAnnotationById,
      exportAnnotationGeoJson,
      toggleAnnotationVisibility,
      toggleAnnotationLocked,
      elevationReferenceAnnotationId,
      setElevationReferenceAnnotationId,
      updateAnnotationDisplayName,
      updateAnnotationShortLabel,
      formatOptions,
      infoBoxVisualOptions: resolvedVisualOptions,
    });
  }, [
    annotationEntries,
    elevationReferenceAnnotationId,
    exportAnnotationGeoJson,
    flyToAllAnnotations,
    focusAnnotationId,
    formatOptions,
    nodes,
    registry,
    removeAnnotationById,
    resolvedVisualOptions,
    selectedAnnotation,
    setElevationReferenceAnnotationId,
    setSelectedAnnotationId,
    toggleAnnotationLocked,
    toggleAnnotationVisibility,
    updateAnnotationDisplayName,
    updateAnnotationShortLabel,
  ]);

  if (!annotationsVisible) {
    return null;
  }

  if (!selectedAnnotationId && fallbackPlugin?.helpText?.length) {
    const fallbackSlots = {
      headingTitle: fallbackPlugin.descriptor.label,
      content: (
        <AnnotationInfoBoxTextContent visualOptions={resolvedVisualOptions}>
          <div className="space-y-2 pt-2">
            {fallbackPlugin.helpText.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </AnnotationInfoBoxTextContent>
      ),
      collapsible: true,
    } satisfies AnnotationInfoBoxSlots;

    if (
      GEOPORTAL_LEGACY_INFO_BOX_HELP_TOOL_IDS.has(fallbackPlugin.descriptor.id)
    ) {
      return (
        <GeoportalLegacyAnnotationInstructionInfoBox
          helpText={fallbackPlugin.helpText}
        />
      );
    }

    return (
      <AnnotationInfoBoxContainer
        {...CESIUM_ANNOTATION_CONFIG.infoBox}
        visualOptions={resolvedVisualOptions}
        slots={fallbackSlots}
      />
    );
  }

  if (!selectedAnnotationId) {
    return null;
  }

  if (selectedAnnotationSlots) {
    return (
      <GeoportalLegacyAnnotationInfoBox
        {...CESIUM_ANNOTATION_CONFIG.infoBox}
        visualOptions={resolvedVisualOptions}
        slots={selectedAnnotationSlots}
      />
    );
  }

  return <RuntimeAnnotationInfoBox {...CESIUM_ANNOTATION_CONFIG.infoBox} />;
};

export default CesiumMeasurementInfoBox;
