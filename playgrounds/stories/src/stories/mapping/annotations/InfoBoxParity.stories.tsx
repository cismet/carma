import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import type { Meta, StoryObj } from "@storybook/react";
// @ts-expect-error react-cismap does not ship TS declarations for this path.
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
// @ts-expect-error react-cismap does not ship TS declarations for this path.
import { UIContext } from "react-cismap/contexts/UIContextProvider";
// @ts-expect-error react-cismap does not ship TS declarations for this path.
import { ResponsiveTopicMapDispatchContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";

import {
  CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS,
  CismapAnnotationInfoBox,
} from "@carma-appframeworks/portals";
import {
  InfoBoxMeasurement,
  MapMeasurementsProvider,
  MEASUREMENT_MODE,
  useMapMeasurementsContext,
} from "@carma-commons/measurements";
import {
  readDevelopmentOnlyUiBackdropStyle,
  type DevelopmentOnlyUiBackdropStyleOptions,
} from "@carma-commons/ui/components";
import { ControlLayout } from "@carma-mapping/map-controls-layout";
import {
  ANNOTATION_INFO_BOX_ACTION_IDS,
  AnnotationInfoBoxMetricGrid,
  buildAnnotationInfoBoxSlots,
  type AnnotationInfoBoxVisualOptions,
} from "@carma-mapping/annotations/ui";

import aerial2dBackdropUrl from "./assets/infobox-parity-2d-luftbild.png";
import topographic2dBackdropUrl from "./assets/infobox-parity-2d-topographic.png";
import mesh3dBackdropUrl from "./assets/infobox-parity-3d-mesh.png";
import topographic3dBackdropUrl from "./assets/infobox-parity-3d-topographic.png";

const INFO_BOX_PARITY_GEO_BACKDROP_PRESETS = {
  TOPOGRAPHIC: "topographic",
  AERIAL_MESH: "aerial-mesh",
} as const;

type InfoBoxParityGeoBackdropPreset =
  (typeof INFO_BOX_PARITY_GEO_BACKDROP_PRESETS)[keyof typeof INFO_BOX_PARITY_GEO_BACKDROP_PRESETS];

const INFO_BOX_PARITY_STORY_BACKDROPS = {
  TOPOGRAPHIC: INFO_BOX_PARITY_GEO_BACKDROP_PRESETS.TOPOGRAPHIC,
  AERIAL_MESH: INFO_BOX_PARITY_GEO_BACKDROP_PRESETS.AERIAL_MESH,
  SOLID: "solid",
  CHECKERBOARD: "checkerboard",
} as const;

type InfoBoxParityStoryBackdrop =
  (typeof INFO_BOX_PARITY_STORY_BACKDROPS)[keyof typeof INFO_BOX_PARITY_STORY_BACKDROPS];

type InfoBoxParityStoryArgs = {
  backdrop: InfoBoxParityStoryBackdrop;
  markAllToolsAsDevelopmentPreview: boolean;
  includeAllTools: boolean;
  preCollapsed: boolean;
  solidBackdropColor: string;
};

type InfoBoxParityColumnKind = "2d" | "3d";

const INFO_BOX_PARITY_GEO_BACKDROP_PRESET_OPTIONS = [
  {
    id: INFO_BOX_PARITY_GEO_BACKDROP_PRESETS.TOPOGRAPHIC,
    label: "Topographic",
  },
  {
    id: INFO_BOX_PARITY_GEO_BACKDROP_PRESETS.AERIAL_MESH,
    label: "Luftbild / Mesh",
  },
] as const;

const meta = {
  title: "Geoportal/InfoBox Parity",
  parameters: {
    layout: "fullscreen",
    controls: {
      expanded: false,
    },
  },
  args: {
    backdrop: INFO_BOX_PARITY_STORY_BACKDROPS.TOPOGRAPHIC,
    includeAllTools: true,
    markAllToolsAsDevelopmentPreview: true,
    preCollapsed: false,
    solidBackdropColor: "#f3f4f6",
  },
  argTypes: {
    backdrop: {
      control: "select",
      options: Object.values(INFO_BOX_PARITY_STORY_BACKDROPS),
      labels: {
        [INFO_BOX_PARITY_STORY_BACKDROPS.TOPOGRAPHIC]: "Topographic",
        [INFO_BOX_PARITY_STORY_BACKDROPS.AERIAL_MESH]: "Luftbild / Mesh",
        [INFO_BOX_PARITY_STORY_BACKDROPS.SOLID]: "Solid color",
        [INFO_BOX_PARITY_STORY_BACKDROPS.CHECKERBOARD]: "Checkerboard",
      },
    },
    includeAllTools: {
      control: "boolean",
      name: "Alltools content",
    },
    markAllToolsAsDevelopmentPreview: {
      control: "boolean",
      name: "Alltools dev preview headers",
    },
    preCollapsed: {
      control: "boolean",
      name: "Precollapsed",
    },
    solidBackdropColor: {
      control: "color",
      name: "Solid backdrop color",
    },
  },
} satisfies Meta<InfoBoxParityStoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

const BLUE_HEADER = "#3b82f6";
const PIXEL_WIDTH = 350;
const PREVIEW_BACKDROP_PADDING = 12;
const PREVIEW_CELL_WIDTH = PIXEL_WIDTH + PREVIEW_BACKDROP_PADDING * 2;
const PREVIEW_MAP_CLASS_NAME = "infobox-parity-preview-map";
const previewMapControlRendererResetCss = `
  .${PREVIEW_MAP_CLASS_NAME} > div[style*="position: absolute"] {
    display: block !important;
    height: auto !important;
    max-height: none !important;
    pointer-events: auto !important;
    position: static !important;
  }

  .${PREVIEW_MAP_CLASS_NAME} > div[style*="position: absolute"] > div {
    align-items: flex-start !important;
    height: auto !important;
    pointer-events: auto !important;
  }

  .${PREVIEW_MAP_CLASS_NAME} [data-test-id="info-box"] {
    margin-bottom: 0 !important;
  }
`;
const noop = () => {};
const stopEvent = (event: React.MouseEvent<HTMLElement, MouseEvent>) => {
  event.stopPropagation();
};
const responsiveDispatchContextValue = {
  setInfoBoxPixelWidth: noop,
};
const topicMapContextValue = {
  routedMapRef: {
    leafletMap: {
      leafletElement: {
        fire: noop,
      },
    },
  },
};
const getUiContextValue = (collapsedInfoBox: boolean) => ({
  collapsedInfoBox,
});
const SAMPLE_MEASUREMENTS = [
  {
    shapeId: 1,
    distance: "0.42 km",
    shapeType: "line",
  },
  {
    shapeId: 2,
    distance: "0.86 km",
    shapeType: "line",
  },
  {
    shapeId: 3,
    customTitle: "Linienzug",
    distance: "1.38 km",
    shapeType: "line",
  },
];

type PreviewFrameProps = {
  children: ReactNode;
  collapsed?: boolean;
  columnKind: InfoBoxParityColumnKind;
  cropId: string;
  geoBackdrop: InfoBoxParityGeoBackdropPreset;
  rowId: string;
  storyBackdrop: InfoBoxParityStoryBackdrop;
};

const PreviewFrame = ({
  children,
  collapsed = false,
  columnKind,
  cropId,
  geoBackdrop,
  rowId,
  storyBackdrop,
}: PreviewFrameProps) => {
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!collapsed) {
      return;
    }

    let cancelled = false;
    let attempts = 0;

    const collapseInfoBox = () => {
      if (cancelled) {
        return;
      }

      const collapseTrigger =
        rootRef.current?.querySelector<HTMLElement>(
          '[data-test-id="info-box"] th[rowspan]'
        ) ?? null;

      if (collapseTrigger) {
        collapseTrigger.dataset.infoboxParitySyntheticCollapse = "true";
        collapseTrigger.click();
        delete collapseTrigger.dataset.infoboxParitySyntheticCollapse;
        return;
      }

      attempts += 1;
      if (attempts < 30) {
        window.setTimeout(collapseInfoBox, 50);
      }
    };

    window.setTimeout(collapseInfoBox, 0);

    return () => {
      cancelled = true;
    };
  }, [collapsed]);

  return (
    <section
      ref={rootRef}
      style={previewPanelStyle}
      data-crop-cell={cropId}
      data-crop-id={`${resolveCropBackdropId({
        geoBackdrop,
        storyBackdrop,
      })}-${cropId}`}
      data-crop-row={`${resolveCropBackdropId({
        geoBackdrop,
        storyBackdrop,
      })}-${rowId}`}
    >
      <div
        key={collapsed ? "collapsed" : "expanded"}
        className={PREVIEW_MAP_CLASS_NAME}
        style={buildPreviewMapStyle({
          columnKind,
          geoBackdrop,
          storyBackdrop,
        })}
        data-backdrop={resolvePreviewBackdropId({
          columnKind,
          geoBackdrop,
          storyBackdrop,
        })}
      >
        <ResponsiveTopicMapDispatchContext.Provider
          value={responsiveDispatchContextValue}
        >
          <ControlLayout>{children}</ControlLayout>
        </ResponsiveTopicMapDispatchContext.Provider>
      </div>
    </section>
  );
};

const MeasurementSeed = () => {
  const { setActiveShape, setShapes, setVisibleShapes, shapes, visibleShapes } =
    useMapMeasurementsContext();

  useEffect(() => {
    if (
      shapes.length === SAMPLE_MEASUREMENTS.length &&
      visibleShapes.length === SAMPLE_MEASUREMENTS.length
    ) {
      return;
    }

    setShapes(SAMPLE_MEASUREMENTS);
    setVisibleShapes(SAMPLE_MEASUREMENTS);
    setActiveShape(3);
  }, [
    setActiveShape,
    setShapes,
    setVisibleShapes,
    shapes.length,
    visibleShapes.length,
  ]);

  return null;
};

const TwoDimensionalDistanceReference = ({
  collapsed = false,
}: {
  collapsed?: boolean;
}) => (
  <TopicMapContext.Provider value={topicMapContextValue}>
    <UIContext.Provider value={getUiContextValue(collapsed)}>
      <MapMeasurementsProvider
        externalMode={MEASUREMENT_MODE.MEASUREMENT}
        setModeExternal={noop}
        config={{
          editableTitle: true,
          infoBoxHeaderColor: BLUE_HEADER,
          localStorageKey: "storybook-infobox-parity-measurements",
        }}
      >
        <MeasurementSeed />
        <InfoBoxMeasurement pixelWidth={PIXEL_WIDTH} />
      </MapMeasurementsProvider>
    </UIContext.Provider>
  </TopicMapContext.Provider>
);

const actions = {
  hidden: false,
  locked: false,
  onFlyTo: stopEvent,
  onExport: stopEvent,
  onToggleVisibility: stopEvent,
  onToggleLock: stopEvent,
  onDelete: stopEvent,
};

const metricGridStyle: CSSProperties = {
  color: "#212529",
  fontSize: "12px",
  fontWeight: 400,
  lineHeight: "normal",
};

const buildDistanceSlots = (
  visualOptions: Partial<AnnotationInfoBoxVisualOptions>
) =>
  buildAnnotationInfoBoxSlots({
    actions: {
      ...actions,
      dataTestIdPrefix: "storybook-distance",
    },
    content: (
      <AnnotationInfoBoxMetricGrid
        items={[
          { id: "direct", label: "Direkt", value: "1.383,40 m" },
          { id: "horizontal", label: "Horizontal", value: "1.383,39 m" },
          { id: "vertical", label: "Vertikal", value: "4,81 m" },
        ]}
        visualOptions={visualOptions}
      />
    ),
    contentStyle: metricGridStyle,
    contentVariant: "raw",
    headingColor: readInfoBoxHeadingColor(visualOptions),
    headingTitle: "Distanzmessung",
    navigation: {
      currentIndex: 5,
      totalEntries: 6,
      onFlyToAll: noop,
      onNext: noop,
      onPrevious: noop,
    },
    titleInput: {
      onCommit: noop,
      onShortLabelCommit: noop,
      placeholder: "Distanzmessung",
      shortLabelPlaceholder: "D",
      shortLabelValue: "D",
      value: "Distanzmessung",
    },
    visualOptions,
  });

const buildPointSlots = (
  visualOptions: Partial<AnnotationInfoBoxVisualOptions>
) =>
  buildAnnotationInfoBoxSlots({
    actions: {
      ...actions,
      dataTestIdPrefix: "storybook-point",
    },
    content: <div className="text-[12px]">NHN-Höhe: 183,74 m</div>,
    contentStyle: metricGridStyle,
    contentVariant: "raw",
    headingColor: readInfoBoxHeadingColor(visualOptions),
    headingTitle: "Punktmessung",
    navigation: {
      currentIndex: 0,
      totalEntries: 3,
      onFlyToAll: noop,
      onNext: noop,
      onPrevious: noop,
    },
    titleInput: {
      onCommit: noop,
      onShortLabelCommit: noop,
      placeholder: "Punktmessung",
      shortLabelPlaceholder: "P",
      shortLabelValue: "P",
      value: "Punktmessung",
    },
    visualOptions,
  });

type InfoBoxParitySlots = ReturnType<typeof buildAnnotationInfoBoxSlots>;
type LabelStyleModalPlacement = "top" | "bottom";

type InfoBoxParityActionHandler = (
  event: ReactMouseEvent<HTMLElement, MouseEvent>
) => void;

type InfoBoxParitySlotsBuilderContext = {
  onOpenLabelStyleModal?: InfoBoxParityActionHandler;
};

type InfoBoxParitySlotsBuilder = (
  visualOptions: Partial<AnnotationInfoBoxVisualOptions>,
  context?: InfoBoxParitySlotsBuilderContext
) => InfoBoxParitySlots;

type AllToolsContentDefinition = {
  id: string;
  rowLabel: string;
  buildSlots: InfoBoxParitySlotsBuilder;
};

const buildMetricToolSlots = ({
  dataTestIdPrefix,
  headingTitle,
  items,
  metaText,
  navigationCurrentIndex,
  navigationTotalEntries,
  shortLabelValue,
  titleValue = headingTitle,
}: {
  dataTestIdPrefix: string;
  headingTitle: string;
  items: readonly { id: string; label: string; value: string }[];
  metaText?: string;
  navigationCurrentIndex: number;
  navigationTotalEntries: number;
  shortLabelValue: string;
  titleValue?: string;
}): InfoBoxParitySlotsBuilder => {
  return (visualOptions) =>
    buildAnnotationInfoBoxSlots({
      actions: {
        ...actions,
        dataTestIdPrefix,
      },
      content: (
        <AnnotationInfoBoxMetricGrid
          items={items}
          visualOptions={visualOptions}
        />
      ),
      contentStyle: metricGridStyle,
      contentVariant: "raw",
      headingColor: readInfoBoxHeadingColor(visualOptions),
      headingTitle,
      metaText,
      navigation: {
        currentIndex: navigationCurrentIndex,
        totalEntries: navigationTotalEntries,
        onFlyToAll: noop,
        onNext: noop,
        onPrevious: noop,
      },
      titleInput: {
        onCommit: noop,
        onShortLabelCommit: noop,
        placeholder: headingTitle,
        shortLabelPlaceholder: shortLabelValue,
        shortLabelValue,
        value: titleValue,
      },
      visualOptions,
    });
};

const inlineMetricContentStyle: CSSProperties = {
  ...metricGridStyle,
  display: "flex",
  columnGap: 24,
  alignItems: "baseline",
  flexWrap: "wrap",
};

const hiddenLabelContentStyle: CSSProperties = {
  display: "none",
};

const readInfoBoxHeadingColor = (
  visualOptions: Partial<AnnotationInfoBoxVisualOptions>
) => visualOptions.headingColor ?? BLUE_HEADER;

const buildVerticalAreaSlots: InfoBoxParitySlotsBuilder = (visualOptions) =>
  buildAnnotationInfoBoxSlots({
    actions: {
      ...actions,
      dataTestIdPrefix: "storybook-vertical-area",
    },
    content: (
      <div style={inlineMetricContentStyle}>
        <span>Fläche: 42,6 m²</span>
        <span>Ausrichtung: E</span>
      </div>
    ),
    contentStyle: metricGridStyle,
    contentVariant: "raw",
    headingColor: readInfoBoxHeadingColor(visualOptions),
    headingTitle: "Vertikale Fläche",
    navigation: {
      currentIndex: 0,
      totalEntries: 2,
      onFlyToAll: noop,
      onNext: noop,
      onPrevious: noop,
    },
    titleInput: {
      onCommit: noop,
      onShortLabelCommit: noop,
      placeholder: "Vertikale Fläche",
      shortLabelPlaceholder: "V",
      shortLabelValue: "V",
      value: "Vertikale Fläche",
    },
    visualOptions,
  });

const buildLabelSlots: InfoBoxParitySlotsBuilder = (visualOptions, context) => {
  const onEditStyle = visualOptions.readOnly
    ? undefined
    : context?.onOpenLabelStyleModal;

  return buildAnnotationInfoBoxSlots({
    actions: {
      ...actions,
      dataTestIdPrefix: "storybook-label",
      labels: {
        editStyle: "Darstellung bearbeiten",
      },
      onEditStyle,
    },
    content: <span aria-hidden="true" />,
    contentStyle: hiddenLabelContentStyle,
    contentVariant: "raw",
    headingColor: readInfoBoxHeadingColor(visualOptions),
    headingTitle: "Beschriftung",
    navigation: {
      currentIndex: 1,
      totalEntries: 2,
      onFlyToAll: noop,
      onNext: noop,
      onPrevious: noop,
    },
    titleInput: {
      onCommit: noop,
      placeholder: "Beschriftung",
      value: "Baustellenhinweis",
    },
    visualOptions,
  });
};

const ALLTOOLS_CONTENT_DEFINITIONS: readonly AllToolsContentDefinition[] = [
  {
    id: "polyline",
    rowLabel: "Polygonzug",
    buildSlots: buildMetricToolSlots({
      dataTestIdPrefix: "storybook-polyline",
      headingTitle: "Polygonzug",
      items: [
        { id: "total-length", label: "Gesamtlänge", value: "418,32 m" },
        { id: "segment-count", label: "Segmente", value: "5" },
        { id: "ascent", label: "Aufstieg", value: "11,40 m" },
      ],
      metaText: "418,32 m",
      navigationCurrentIndex: 2,
      navigationTotalEntries: 4,
      shortLabelValue: "L",
    }),
  },
  {
    id: "area-ground",
    rowLabel: "Grundriss",
    buildSlots: buildMetricToolSlots({
      dataTestIdPrefix: "storybook-area-ground",
      headingTitle: "Grundriss",
      items: [
        { id: "perimeter", label: "Umfang", value: "96,14 m" },
        { id: "verticality", label: "Vertikalität", value: "2,1°" },
        { id: "bearing", label: "Ausrichtung", value: "NE" },
      ],
      metaText: "412,8 m²",
      navigationCurrentIndex: 0,
      navigationTotalEntries: 3,
      shortLabelValue: "G",
    }),
  },
  {
    id: "area-planar",
    rowLabel: "Dachfläche",
    buildSlots: buildMetricToolSlots({
      dataTestIdPrefix: "storybook-area-planar",
      headingTitle: "Plane Fläche (Dachfläche)",
      items: [
        { id: "perimeter", label: "Umfang", value: "58,72 m" },
        { id: "verticality", label: "Vertikalität", value: "34,6°" },
        { id: "bearing", label: "Ausrichtung", value: "SW" },
      ],
      metaText: "186,3 m²",
      navigationCurrentIndex: 1,
      navigationTotalEntries: 2,
      shortLabelValue: "D",
    }),
  },
  {
    id: "vertical-area",
    rowLabel: "Vertikal",
    buildSlots: buildVerticalAreaSlots,
  },
  {
    id: "label",
    rowLabel: "Beschriftung",
    buildSlots: buildLabelSlots,
  },
];

const buildReadOnlyInfoBoxVisualOptions = (
  visualOptions: Partial<AnnotationInfoBoxVisualOptions>
): Partial<AnnotationInfoBoxVisualOptions> => ({
  ...visualOptions,
  hiddenActionIds: Array.from(
    new Set([
      ...(visualOptions.hiddenActionIds ?? []),
      ANNOTATION_INFO_BOX_ACTION_IDS.STYLE,
      ANNOTATION_INFO_BOX_ACTION_IDS.DELETE,
    ])
  ),
  readOnly: true,
});

const ThreeDimensionalBox = ({
  headerTitle = "Messungen",
  slots,
  visualOptions = CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS,
}: {
  headerTitle?: ReactNode;
  slots: InfoBoxParitySlots;
  visualOptions?: Partial<AnnotationInfoBoxVisualOptions>;
}) => (
  <CismapAnnotationInfoBox
    headerTitle={headerTitle}
    pixelWidth={PIXEL_WIDTH}
    slots={slots}
    visualOptions={visualOptions}
  />
);

const EmptyComparisonCell = () => <div aria-hidden="true" />;

const StoryLabel = ({
  children,
  contrastStyle,
  style,
}: {
  children: ReactNode;
  contrastStyle?: CSSProperties;
  style: CSSProperties;
}) => <div style={buildStoryLabelStyle(style, contrastStyle)}>{children}</div>;

const LabelStyleModal = ({
  markDevelopmentPreview,
  onClose,
  placement,
}: {
  markDevelopmentPreview: boolean;
  onClose: () => void;
  placement: LabelStyleModalPlacement;
}) => (
  <div
    role="presentation"
    style={buildModalBackdropStyle(placement)}
    onClick={onClose}
    data-test-id="infobox-parity-label-style-modal"
  >
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="infobox-parity-label-style-title"
      style={modalPanelStyle}
      onClick={(event) => event.stopPropagation()}
    >
      {markDevelopmentPreview ? (
        <div style={modalDevelopmentMarkerStyle}>
          <span style={modalDevelopmentMarkerTextStyle}>
            Entwicklungsversion
          </span>
        </div>
      ) : null}
      <div style={modalContentStyle}>
        <div style={modalHeaderStyle}>
          <h2 id="infobox-parity-label-style-title" style={modalTitleStyle}>
            Darstellung
          </h2>
          <button
            type="button"
            aria-label="Schließen"
            style={modalCloseButtonStyle}
            onClick={onClose}
          >
            x
          </button>
        </div>
        <dl style={modalDefinitionListStyle}>
          <div style={modalDefinitionRowStyle}>
            <dt style={modalDefinitionTermStyle}>Schriftgröße</dt>
            <dd style={modalDefinitionDescriptionStyle}>14 px</dd>
          </div>
          <div style={modalDefinitionRowStyle}>
            <dt style={modalDefinitionTermStyle}>Hintergrund</dt>
            <dd style={modalDefinitionDescriptionStyle}>#ffffff</dd>
          </div>
        </dl>
      </div>
    </section>
  </div>
);

type ToolComparisonRowProps = {
  buildSlots: InfoBoxParitySlotsBuilder;
  collapsed: boolean;
  contentId: string;
  geoBackdrop: InfoBoxParityGeoBackdropPreset;
  labelContrastStyle?: CSSProperties;
  rowLabel: string;
  slotsBuilderContext?: InfoBoxParitySlotsBuilderContext;
  storyBackdrop: InfoBoxParityStoryBackdrop;
  twoDimensionalReference?: ReactNode;
  visualOptions?: Partial<AnnotationInfoBoxVisualOptions>;
};

const ToolComparisonRow = ({
  buildSlots,
  collapsed,
  contentId,
  geoBackdrop,
  labelContrastStyle,
  rowLabel,
  slotsBuilderContext,
  storyBackdrop,
  twoDimensionalReference,
  visualOptions = CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS,
}: ToolComparisonRowProps) => {
  const stateId = collapsed ? "collapsed" : "expanded";
  const rowId = `${contentId}-${stateId}`;
  const readOnlyVisualOptions =
    buildReadOnlyInfoBoxVisualOptions(visualOptions);

  return (
    <>
      <StoryLabel contrastStyle={labelContrastStyle} style={rowHeaderStyle}>
        {rowLabel}
      </StoryLabel>
      {twoDimensionalReference ? (
        <PreviewFrame
          columnKind="2d"
          cropId={`${contentId}-2d-${stateId}`}
          geoBackdrop={geoBackdrop}
          rowId={rowId}
          storyBackdrop={storyBackdrop}
          collapsed={collapsed}
        >
          {twoDimensionalReference}
        </PreviewFrame>
      ) : (
        <EmptyComparisonCell />
      )}
      <PreviewFrame
        columnKind="3d"
        cropId={`${contentId}-3d-measurement-${stateId}`}
        geoBackdrop={geoBackdrop}
        rowId={rowId}
        storyBackdrop={storyBackdrop}
        collapsed={collapsed}
      >
        <ThreeDimensionalBox
          slots={buildSlots(visualOptions, slotsBuilderContext)}
          visualOptions={visualOptions}
        />
      </PreviewFrame>
      <PreviewFrame
        columnKind="3d"
        cropId={`${contentId}-3d-info-${stateId}`}
        geoBackdrop={geoBackdrop}
        rowId={rowId}
        storyBackdrop={storyBackdrop}
        collapsed={collapsed}
      >
        <ThreeDimensionalBox
          headerTitle="Informationen"
          slots={buildSlots(readOnlyVisualOptions, slotsBuilderContext)}
          visualOptions={readOnlyVisualOptions}
        />
      </PreviewFrame>
    </>
  );
};

const InfoBoxParityMatrix = ({
  collapsed,
  geoBackdrop,
  includeAllTools,
  labelContrastStyle,
  markAllToolsAsDevelopmentPreview,
  slotsBuilderContext,
  storyBackdrop,
}: {
  collapsed: boolean;
  geoBackdrop: InfoBoxParityGeoBackdropPreset;
  includeAllTools: boolean;
  labelContrastStyle?: CSSProperties;
  markAllToolsAsDevelopmentPreview: boolean;
  slotsBuilderContext?: InfoBoxParitySlotsBuilderContext;
  storyBackdrop: InfoBoxParityStoryBackdrop;
}) => {
  const allToolsVisualOptions = resolveAllToolsVisualOptions(
    markAllToolsAsDevelopmentPreview
  );

  return (
    <div style={contactSheetStyle} data-backdrop-preset={geoBackdrop}>
      <div style={cornerHeaderStyle} />
      <StoryLabel contrastStyle={labelContrastStyle} style={columnHeaderStyle}>
        2D
      </StoryLabel>
      <StoryLabel contrastStyle={labelContrastStyle} style={columnHeaderStyle}>
        3D Messung
      </StoryLabel>
      <StoryLabel contrastStyle={labelContrastStyle} style={columnHeaderStyle}>
        3D Info
      </StoryLabel>

      <ToolComparisonRow
        buildSlots={buildDistanceSlots}
        collapsed={collapsed}
        contentId="distance"
        geoBackdrop={geoBackdrop}
        labelContrastStyle={labelContrastStyle}
        rowLabel="Distanz"
        slotsBuilderContext={slotsBuilderContext}
        storyBackdrop={storyBackdrop}
        twoDimensionalReference={
          <TwoDimensionalDistanceReference collapsed={collapsed} />
        }
      />
      <ToolComparisonRow
        buildSlots={buildPointSlots}
        collapsed={collapsed}
        contentId="point"
        geoBackdrop={geoBackdrop}
        labelContrastStyle={labelContrastStyle}
        rowLabel="Punkt"
        slotsBuilderContext={slotsBuilderContext}
        storyBackdrop={storyBackdrop}
      />

      {includeAllTools
        ? ALLTOOLS_CONTENT_DEFINITIONS.map((definition) => (
            <ToolComparisonRow
              key={definition.id}
              buildSlots={definition.buildSlots}
              collapsed={collapsed}
              contentId={definition.id}
              geoBackdrop={geoBackdrop}
              labelContrastStyle={labelContrastStyle}
              rowLabel={definition.rowLabel}
              slotsBuilderContext={slotsBuilderContext}
              storyBackdrop={storyBackdrop}
              visualOptions={allToolsVisualOptions}
            />
          ))
        : null}
    </div>
  );
};

const InfoBoxParityStory = ({
  backdrop,
  includeAllTools,
  markAllToolsAsDevelopmentPreview,
  preCollapsed,
  solidBackdropColor,
}: InfoBoxParityStoryArgs) => {
  const rootRef = useRef<HTMLElement | null>(null);
  const labelStyleModalOpenTimeoutRef = useRef<number | null>(null);
  const [collapsed, setCollapsed] = useState(preCollapsed);
  const [labelStyleModalOpen, setLabelStyleModalOpen] = useState(false);
  const [labelStyleModalPlacement, setLabelStyleModalPlacement] =
    useState<LabelStyleModalPlacement>("top");

  useEffect(() => {
    setCollapsed(preCollapsed);
  }, [preCollapsed]);

  useEffect(() => {
    return () => {
      if (labelStyleModalOpenTimeoutRef.current !== null) {
        window.clearTimeout(labelStyleModalOpenTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const syncCollapsedState = (event: MouseEvent) => {
      const root = rootRef.current;

      if (!root || !(event.target instanceof Element)) {
        return;
      }

      const collapseTrigger = event.target.closest(
        '[data-test-id="info-box"] th[rowspan]'
      ) as HTMLElement | null;

      if (
        collapseTrigger &&
        root.contains(collapseTrigger) &&
        collapseTrigger.dataset.infoboxParitySyntheticCollapse !== "true"
      ) {
        setCollapsed((currentCollapsed) => !currentCollapsed);
      }
    };

    document.addEventListener("click", syncCollapsedState, true);

    return () => {
      document.removeEventListener("click", syncCollapsedState, true);
    };
  }, []);

  const labelContrastStyle = isStoryWideBackdrop(backdrop)
    ? buildLabelContrastStyle({ backdrop, solidBackdropColor })
    : undefined;
  const slotsBuilderContext: InfoBoxParitySlotsBuilderContext = {
    onOpenLabelStyleModal: (event) => {
      event.stopPropagation();

      const trigger = event.currentTarget;
      const focusTarget =
        trigger.closest<HTMLElement>("[data-crop-cell]") ??
        trigger.closest<HTMLElement>('[data-test-id="info-box"]') ??
        trigger;
      const focusRect = focusTarget.getBoundingClientRect();
      const isVisible = isViewportRectVisible(focusRect);

      setLabelStyleModalPlacement(
        isVisible ? readModalPlacementForRect(focusRect) : "top"
      );

      if (labelStyleModalOpenTimeoutRef.current !== null) {
        window.clearTimeout(labelStyleModalOpenTimeoutRef.current);
      }

      if (!isVisible) {
        setLabelStyleModalOpen(false);
        focusTarget.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });

        labelStyleModalOpenTimeoutRef.current = window.setTimeout(() => {
          labelStyleModalOpenTimeoutRef.current = null;
          setLabelStyleModalOpen(true);
        }, 220);
        return;
      }

      setLabelStyleModalOpen(true);
    },
  };

  return (
    <main
      ref={rootRef}
      style={buildStoryRootStyle({ backdrop, solidBackdropColor })}
      data-test-id="infobox-parity-contact-sheet"
    >
      <style>{previewMapControlRendererResetCss}</style>
      {resolveRenderedBackdropSections(backdrop).map((preset) => (
        <section key={preset.label} style={backdropSectionStyle}>
          <StoryLabel
            contrastStyle={labelContrastStyle}
            style={backdropSectionHeaderStyle}
          >
            {preset.label}
          </StoryLabel>
          <InfoBoxParityMatrix
            collapsed={collapsed}
            geoBackdrop={preset.id}
            includeAllTools={includeAllTools}
            labelContrastStyle={labelContrastStyle}
            markAllToolsAsDevelopmentPreview={markAllToolsAsDevelopmentPreview}
            slotsBuilderContext={slotsBuilderContext}
            storyBackdrop={backdrop}
          />
        </section>
      ))}
      {labelStyleModalOpen ? (
        <LabelStyleModal
          markDevelopmentPreview={markAllToolsAsDevelopmentPreview}
          onClose={() => setLabelStyleModalOpen(false)}
          placement={labelStyleModalPlacement}
        />
      ) : null}
    </main>
  );
};

export const ContactSheet: Story = {
  name: "Contact Sheet",
  render: (args) => <InfoBoxParityStory {...args} />,
};

const baseStoryRootStyle: CSSProperties = {
  background: "#f3f4f6",
  boxSizing: "border-box",
  color: "#111827",
  display: "flex",
  flexDirection: "column",
  fontFamily:
    'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  gap: 32,
  minHeight: "100vh",
  minWidth: "100vw",
  padding: 24,
  width: "fit-content",
};

const resolveRenderedBackdropSections = (
  backdrop: InfoBoxParityStoryBackdrop
) => {
  const geoPreset = INFO_BOX_PARITY_GEO_BACKDROP_PRESET_OPTIONS.find(
    (preset) => preset.id === backdrop
  );

  if (geoPreset) {
    return [geoPreset];
  }

  return [
    {
      id: INFO_BOX_PARITY_GEO_BACKDROP_PRESETS.TOPOGRAPHIC,
      label:
        backdrop === INFO_BOX_PARITY_STORY_BACKDROPS.SOLID
          ? "Solid color"
          : "Checkerboard",
    },
  ];
};

const isStoryWideBackdrop = (backdrop: InfoBoxParityStoryBackdrop) =>
  backdrop === INFO_BOX_PARITY_STORY_BACKDROPS.SOLID ||
  backdrop === INFO_BOX_PARITY_STORY_BACKDROPS.CHECKERBOARD;

const buildStoryBackdropPaintStyle = ({
  backdrop,
  solidBackdropColor,
}: {
  backdrop: InfoBoxParityStoryBackdrop;
  solidBackdropColor: string;
}): CSSProperties => {
  if (backdrop === INFO_BOX_PARITY_STORY_BACKDROPS.SOLID) {
    return {
      background: solidBackdropColor,
    };
  }

  if (backdrop === INFO_BOX_PARITY_STORY_BACKDROPS.CHECKERBOARD) {
    return {
      backgroundColor: "#f8fafc",
      backgroundImage:
        "linear-gradient(45deg, rgba(15, 23, 42, 0.18) 25%, transparent 25%), linear-gradient(-45deg, rgba(15, 23, 42, 0.18) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(15, 23, 42, 0.18) 75%), linear-gradient(-45deg, transparent 75%, rgba(15, 23, 42, 0.18) 75%)",
      backgroundPosition: "0 0, 0 12px, 12px -12px, -12px 0",
      backgroundSize: "24px 24px",
    };
  }

  return {};
};

const buildStoryRootStyle = ({
  backdrop,
  solidBackdropColor,
}: {
  backdrop: InfoBoxParityStoryBackdrop;
  solidBackdropColor: string;
}): CSSProperties => ({
  ...baseStoryRootStyle,
  ...buildStoryBackdropPaintStyle({ backdrop, solidBackdropColor }),
});

const parseHexColor = (color: string) => {
  const normalized = color.trim().replace(/^#/, "");
  const hex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : normalized;

  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    return null;
  }

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
};

const isDarkHexColor = (color: string) => {
  const rgb = parseHexColor(color);
  if (!rgb) {
    return false;
  }

  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance < 0.5;
};

const buildLabelContrastStyle = ({
  backdrop,
  solidBackdropColor,
}: {
  backdrop: InfoBoxParityStoryBackdrop;
  solidBackdropColor: string;
}): CSSProperties => {
  const useLightBox =
    backdrop === INFO_BOX_PARITY_STORY_BACKDROPS.SOLID &&
    isDarkHexColor(solidBackdropColor);

  return {
    backgroundColor: useLightBox
      ? "rgba(255, 255, 255, 0.88)"
      : "rgba(17, 24, 39, 0.86)",
    border: useLightBox
      ? "1px solid rgba(17, 24, 39, 0.16)"
      : "1px solid rgba(255, 255, 255, 0.24)",
    borderRadius: 4,
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.18)",
    color: useLightBox ? "#111827" : "#ffffff",
    padding: "2px 6px",
    width: "fit-content",
  };
};

const buildStoryLabelStyle = (
  baseStyle: CSSProperties,
  contrastStyle?: CSSProperties
): CSSProperties =>
  contrastStyle ? { ...baseStyle, ...contrastStyle } : baseStyle;

const backdropSectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const backdropSectionHeaderStyle: CSSProperties = {
  color: "#111827",
  fontSize: 13,
  fontWeight: 700,
};

const contactSheetStyle: CSSProperties = {
  alignItems: "start",
  display: "grid",
  gap: 12,
  gridTemplateColumns: `80px repeat(3, ${PREVIEW_CELL_WIDTH}px)`,
};

const cornerHeaderStyle: CSSProperties = {
  minHeight: 24,
};

const columnHeaderStyle: CSSProperties = {
  alignSelf: "end",
  color: "#111827",
  fontSize: 12,
  fontWeight: 700,
};

const rowHeaderStyle: CSSProperties = {
  alignSelf: "start",
  color: "#111827",
  fontSize: 12,
  fontWeight: 700,
  paddingTop: 4,
};

const geoportalAnnotationDevelopmentPreviewPatternOptions = {
  backgroundColor: "transparent",
  primaryColor: "rgba(0, 0, 0, 0.1)",
  rotationDeg: 45,
  secondaryColor: "transparent",
  stripeGapPx: 5,
  stripeWidthPx: 5,
  textVisible: false,
} satisfies DevelopmentOnlyUiBackdropStyleOptions;

const allToolsDevelopmentPreviewHeaderStyle =
  readDevelopmentOnlyUiBackdropStyle({
    ...geoportalAnnotationDevelopmentPreviewPatternOptions,
    backgroundColor: "rgba(255, 255, 255, 0.88)",
  });

const allToolsDevelopmentPreviewVisualOptions = {
  ...CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS,
  headerForegroundClassName: "text-[#374151]",
  headerStyle: allToolsDevelopmentPreviewHeaderStyle,
  headingColor: "rgba(255, 255, 255, 0.88)",
} satisfies Partial<AnnotationInfoBoxVisualOptions>;

const resolveAllToolsVisualOptions = (
  markAllToolsAsDevelopmentPreview: boolean
): Partial<AnnotationInfoBoxVisualOptions> =>
  markAllToolsAsDevelopmentPreview
    ? allToolsDevelopmentPreviewVisualOptions
    : CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS;

const modalBackdropStyle: CSSProperties = {
  backgroundColor: "rgba(15, 23, 42, 0.28)",
  display: "flex",
  inset: 0,
  justifyContent: "center",
  padding: "12vh 24px",
  pointerEvents: "auto",
  position: "fixed",
  zIndex: 2000,
};

const buildModalBackdropStyle = (
  placement: LabelStyleModalPlacement
): CSSProperties => ({
  ...modalBackdropStyle,
  alignItems: placement === "top" ? "flex-start" : "flex-end",
});

const modalPanelStyle: CSSProperties = {
  backgroundColor: "#ffffff",
  border: "1px solid rgba(17, 24, 39, 0.16)",
  borderRadius: 4,
  boxShadow: "0 16px 40px rgba(15, 23, 42, 0.24)",
  color: "#212529",
  fontFamily: '"Helvetica Neue", Arial, Helvetica, sans-serif',
  fontSize: 12,
  minWidth: 240,
  overflow: "hidden",
};

const modalDevelopmentMarkerStyle: CSSProperties = {
  ...readDevelopmentOnlyUiBackdropStyle({
    ...geoportalAnnotationDevelopmentPreviewPatternOptions,
    backgroundColor: "rgba(255, 255, 255, 0.88)",
  }),
  alignItems: "center",
  borderBottom: "1px solid rgba(17, 24, 39, 0.12)",
  display: "flex",
  minHeight: 18,
  padding: "2px 12px",
};

const modalDevelopmentMarkerTextStyle: CSSProperties = {
  color: "#4b5563",
  fontSize: 10,
  fontWeight: 600,
  lineHeight: 1.2,
};

const modalContentStyle: CSSProperties = {
  padding: 12,
};

const modalHeaderStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  justifyContent: "space-between",
  marginBottom: 8,
};

const modalTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1.4,
  margin: 0,
};

const modalCloseButtonStyle: CSSProperties = {
  alignItems: "center",
  background: "transparent",
  border: 0,
  color: "#808080",
  display: "inline-flex",
  fontSize: 16,
  height: 20,
  justifyContent: "center",
  lineHeight: 1,
  padding: 0,
  width: 20,
};

const modalDefinitionListStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  margin: 0,
};

const modalDefinitionRowStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "1fr auto",
};

const modalDefinitionTermStyle: CSSProperties = {
  color: "#808080",
  fontWeight: 400,
};

const modalDefinitionDescriptionStyle: CSSProperties = {
  color: "#212529",
  fontWeight: 400,
  margin: 0,
};

const isViewportRectVisible = (rect: DOMRect): boolean =>
  rect.top >= 0 &&
  rect.left >= 0 &&
  rect.bottom <= window.innerHeight &&
  rect.right <= window.innerWidth;

const readModalPlacementForRect = (rect: DOMRect): LabelStyleModalPlacement =>
  rect.top + rect.height / 2 < window.innerHeight / 2 ? "bottom" : "top";

const previewPanelStyle: CSSProperties = {
  alignSelf: "start",
  minWidth: 0,
};

const previewMapBaseStyle: CSSProperties = {
  backgroundColor: "transparent",
  border: 0,
  boxSizing: "border-box",
  color: "#212529",
  overflow: "hidden",
  padding: PREVIEW_BACKDROP_PADDING,
  position: "relative",
  width: PREVIEW_CELL_WIDTH,
};

const resolvePreviewBackdropId = ({
  columnKind,
  geoBackdrop,
  storyBackdrop,
}: {
  columnKind: InfoBoxParityColumnKind;
  geoBackdrop: InfoBoxParityGeoBackdropPreset;
  storyBackdrop: InfoBoxParityStoryBackdrop;
}) =>
  isStoryWideBackdrop(storyBackdrop)
    ? storyBackdrop
    : geoBackdrop === INFO_BOX_PARITY_GEO_BACKDROP_PRESETS.AERIAL_MESH
    ? columnKind === "2d"
      ? "2d-luftbild"
      : "3d-mesh"
    : columnKind === "2d"
    ? "2d-topographic"
    : "3d-topographic";

const resolveCropBackdropId = ({
  geoBackdrop,
  storyBackdrop,
}: {
  geoBackdrop: InfoBoxParityGeoBackdropPreset;
  storyBackdrop: InfoBoxParityStoryBackdrop;
}) => (isStoryWideBackdrop(storyBackdrop) ? storyBackdrop : geoBackdrop);

const readPreviewBackdropUrl = ({
  columnKind,
  geoBackdrop,
}: {
  geoBackdrop: InfoBoxParityGeoBackdropPreset;
  columnKind: InfoBoxParityColumnKind;
}) => {
  const backdropId = resolvePreviewBackdropId({
    columnKind,
    geoBackdrop,
    storyBackdrop: geoBackdrop,
  });

  if (backdropId === "2d-luftbild") {
    return aerial2dBackdropUrl;
  }

  if (backdropId === "3d-mesh") {
    return mesh3dBackdropUrl;
  }

  if (backdropId === "3d-topographic") {
    return topographic3dBackdropUrl;
  }

  return topographic2dBackdropUrl;
};

const buildBackdropStyle = ({
  columnKind,
  geoBackdrop,
  storyBackdrop,
}: {
  columnKind: InfoBoxParityColumnKind;
  geoBackdrop: InfoBoxParityGeoBackdropPreset;
  storyBackdrop: InfoBoxParityStoryBackdrop;
}): CSSProperties => {
  if (isStoryWideBackdrop(storyBackdrop)) {
    return {
      background: "transparent",
      backgroundImage: "none",
    };
  }

  return {
    backgroundImage: `url(${readPreviewBackdropUrl({
      geoBackdrop,
      columnKind,
    })})`,
    backgroundPosition: "center center",
    backgroundRepeat: "no-repeat",
    backgroundSize: "cover",
  };
};

const buildPreviewMapStyle = ({
  columnKind,
  geoBackdrop,
  storyBackdrop,
}: {
  columnKind: InfoBoxParityColumnKind;
  geoBackdrop: InfoBoxParityGeoBackdropPreset;
  storyBackdrop: InfoBoxParityStoryBackdrop;
}): CSSProperties => ({
  ...previewMapBaseStyle,
  ...buildBackdropStyle({
    columnKind,
    geoBackdrop,
    storyBackdrop,
  }),
});
