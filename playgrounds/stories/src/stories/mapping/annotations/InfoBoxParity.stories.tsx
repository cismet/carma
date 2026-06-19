import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
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
    includeAllTools: false,
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
    headingColor: BLUE_HEADER,
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
    headingColor: BLUE_HEADER,
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
type InfoBoxParitySlotsBuilder = (
  visualOptions: Partial<AnnotationInfoBoxVisualOptions>
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
      headingColor: BLUE_HEADER,
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

const labelToolContentStyle: CSSProperties = {
  ...metricGridStyle,
  display: "grid",
  gap: 4,
};

const buildLabelSlots: InfoBoxParitySlotsBuilder = (visualOptions) =>
  buildAnnotationInfoBoxSlots({
    actions: {
      ...actions,
      dataTestIdPrefix: "storybook-label",
    },
    content: (
      <div style={labelToolContentStyle}>
        <div>Text: Baustellenhinweis</div>
        <div>Schriftgröße: 14 px</div>
        <div>Hintergrund: #ffffff</div>
      </div>
    ),
    contentStyle: metricGridStyle,
    contentVariant: "raw",
    headingColor: BLUE_HEADER,
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
    buildSlots: buildMetricToolSlots({
      dataTestIdPrefix: "storybook-vertical-area",
      headingTitle: "Vertikale Fläche",
      items: [{ id: "bearing", label: "Ausrichtung", value: "E" }],
      metaText: "42,6 m²",
      navigationCurrentIndex: 0,
      navigationTotalEntries: 2,
      shortLabelValue: "V",
    }),
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

type ToolComparisonRowProps = {
  buildSlots: InfoBoxParitySlotsBuilder;
  collapsed: boolean;
  contentId: string;
  geoBackdrop: InfoBoxParityGeoBackdropPreset;
  labelContrastStyle?: CSSProperties;
  rowLabel: string;
  storyBackdrop: InfoBoxParityStoryBackdrop;
  twoDimensionalReference?: ReactNode;
};

const ToolComparisonRow = ({
  buildSlots,
  collapsed,
  contentId,
  geoBackdrop,
  labelContrastStyle,
  rowLabel,
  storyBackdrop,
  twoDimensionalReference,
}: ToolComparisonRowProps) => {
  const stateId = collapsed ? "collapsed" : "expanded";
  const rowId = `${contentId}-${stateId}`;

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
          slots={buildSlots(CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS)}
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
          slots={buildSlots(
            buildReadOnlyInfoBoxVisualOptions(
              CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS
            )
          )}
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
  storyBackdrop,
}: {
  collapsed: boolean;
  geoBackdrop: InfoBoxParityGeoBackdropPreset;
  includeAllTools: boolean;
  labelContrastStyle?: CSSProperties;
  storyBackdrop: InfoBoxParityStoryBackdrop;
}) => (
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
            storyBackdrop={storyBackdrop}
          />
        ))
      : null}
  </div>
);

const InfoBoxParityStory = ({
  backdrop,
  includeAllTools,
  preCollapsed,
  solidBackdropColor,
}: InfoBoxParityStoryArgs) => {
  const rootRef = useRef<HTMLElement | null>(null);
  const [collapsed, setCollapsed] = useState(preCollapsed);

  useEffect(() => {
    setCollapsed(preCollapsed);
  }, [preCollapsed]);

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
            storyBackdrop={backdrop}
          />
        </section>
      ))}
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
