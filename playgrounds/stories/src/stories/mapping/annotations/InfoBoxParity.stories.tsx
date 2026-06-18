import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
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
  AnnotationInfoBoxMetricGrid,
  buildAnnotationInfoBoxSlots,
  type AnnotationInfoBoxVisualOptions,
} from "@carma-mapping/annotations/ui";

import aerial2dBackdropUrl from "./assets/infobox-parity-2d-luftbild.png";
import topographic2dBackdropUrl from "./assets/infobox-parity-2d-topographic.png";
import mesh3dBackdropUrl from "./assets/infobox-parity-3d-mesh.png";
import topographic3dBackdropUrl from "./assets/infobox-parity-3d-topographic.png";

const INFO_BOX_PARITY_BACKDROP_MODES = {
  TOPOGRAPHIC: "topographic",
  AERIAL_MESH: "aerial-mesh",
} as const;

type InfoBoxParityBackdropMode =
  (typeof INFO_BOX_PARITY_BACKDROP_MODES)[keyof typeof INFO_BOX_PARITY_BACKDROP_MODES];

type InfoBoxParityColumnKind = "2d" | "3d";

const INFO_BOX_PARITY_BACKDROP_PRESETS = [
  {
    id: INFO_BOX_PARITY_BACKDROP_MODES.TOPOGRAPHIC,
    label: "Topographic",
  },
  {
    id: INFO_BOX_PARITY_BACKDROP_MODES.AERIAL_MESH,
    label: "Luftbild / Mesh",
  },
] as const;

const meta = {
  title: "Mapping/Annotations/InfoBox Parity",
  parameters: {
    layout: "fullscreen",
    controls: {
      expanded: false,
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const BLUE_HEADER = "#3b82f6";
const PIXEL_WIDTH = 350;
const PREVIEW_BACKDROP_PADDING = 12;
const PREVIEW_BACKDROP_BORDER_WIDTH = 1;
const PREVIEW_CELL_WIDTH =
  PIXEL_WIDTH +
  PREVIEW_BACKDROP_PADDING * 2 +
  PREVIEW_BACKDROP_BORDER_WIDTH * 2;
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
  backdrop: InfoBoxParityBackdropMode;
  children: ReactNode;
  collapsed?: boolean;
  columnKind: InfoBoxParityColumnKind;
  cropId: string;
  rowId: string;
};

const PreviewFrame = ({
  backdrop,
  children,
  collapsed = false,
  columnKind,
  cropId,
  rowId,
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
        collapseTrigger.click();
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
      data-crop-id={`${backdrop}-${cropId}`}
      data-crop-row={`${backdrop}-${rowId}`}
    >
      <div
        className={PREVIEW_MAP_CLASS_NAME}
        style={buildPreviewMapStyle({ backdrop, columnKind })}
        data-backdrop={resolvePreviewBackdropId({ backdrop, columnKind })}
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

const buildInformationSlots = (
  visualOptions: Partial<AnnotationInfoBoxVisualOptions>,
  variant: "distance" | "point"
) =>
  buildAnnotationInfoBoxSlots({
    actions: {
      ...actions,
      dataTestIdPrefix: `storybook-${variant}-information`,
    },
    content: (
      <div className="text-[12px]">
        {variant === "distance" ? (
          <>
            <div>Direkt: 1.383,40 m</div>
            <div>Vertikal: 4,81 m</div>
          </>
        ) : (
          <>
            <div>Typ: Messpunkt</div>
            <div>Höhe: 183,74 m NHN</div>
          </>
        )}
      </div>
    ),
    contentStyle: metricGridStyle,
    contentVariant: "raw",
    headingColor: BLUE_HEADER,
    headingTitle: variant === "distance" ? "Distanzmessung" : "Punktmessung",
    navigation: {
      currentIndex: 0,
      totalEntries: 1,
      onFlyToAll: noop,
      onNext: noop,
      onPrevious: noop,
    },
    titleInput: {
      onCommit: noop,
      onShortLabelCommit: noop,
      placeholder: variant === "distance" ? "Distanzmessung" : "Punktmessung",
      shortLabelPlaceholder: variant === "distance" ? "D" : "P",
      shortLabelValue: variant === "distance" ? "D" : "P",
      value: variant === "distance" ? "Distanzmessung" : "Punktmessung",
    },
    visualOptions: {
      ...visualOptions,
      readOnly: true,
    },
  });

const ThreeDimensionalBox = ({
  headerTitle = "Messungen",
  slots,
  visualOptions = CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS,
}: {
  headerTitle?: ReactNode;
  slots: ReturnType<typeof buildAnnotationInfoBoxSlots>;
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

const InfoBoxParityMatrix = ({
  backdrop,
}: {
  backdrop: InfoBoxParityBackdropMode;
}) => (
  <div style={contactSheetStyle} data-backdrop-preset={backdrop}>
    <div style={cornerHeaderStyle} />
    <div style={columnHeaderStyle}>2D</div>
    <div style={columnHeaderStyle}>3D Messung</div>
    <div style={columnHeaderStyle}>3D Info</div>

    <div style={rowHeaderStyle}>Distanz offen</div>
    <PreviewFrame
      backdrop={backdrop}
      columnKind="2d"
      cropId="distance-2d-expanded"
      rowId="distance-expanded"
    >
      <TwoDimensionalDistanceReference />
    </PreviewFrame>
    <PreviewFrame
      backdrop={backdrop}
      columnKind="3d"
      cropId="distance-3d-measurement-expanded"
      rowId="distance-expanded"
    >
      <ThreeDimensionalBox
        slots={buildDistanceSlots(CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS)}
      />
    </PreviewFrame>
    <PreviewFrame
      backdrop={backdrop}
      columnKind="3d"
      cropId="distance-3d-info-expanded"
      rowId="distance-expanded"
    >
      <ThreeDimensionalBox
        headerTitle="Informationen"
        slots={buildInformationSlots(
          CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS,
          "distance"
        )}
      />
    </PreviewFrame>

    <div style={rowHeaderStyle}>Distanz kompakt</div>
    <PreviewFrame
      backdrop={backdrop}
      columnKind="2d"
      cropId="distance-2d-collapsed"
      rowId="distance-collapsed"
      collapsed
    >
      <TwoDimensionalDistanceReference collapsed />
    </PreviewFrame>
    <PreviewFrame
      backdrop={backdrop}
      columnKind="3d"
      cropId="distance-3d-measurement-collapsed"
      rowId="distance-collapsed"
      collapsed
    >
      <ThreeDimensionalBox
        slots={buildDistanceSlots(CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS)}
      />
    </PreviewFrame>
    <PreviewFrame
      backdrop={backdrop}
      columnKind="3d"
      cropId="distance-3d-info-collapsed"
      rowId="distance-collapsed"
      collapsed
    >
      <ThreeDimensionalBox
        headerTitle="Informationen"
        slots={buildInformationSlots(
          CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS,
          "distance"
        )}
      />
    </PreviewFrame>

    <div style={rowHeaderStyle}>Punkt offen</div>
    <EmptyComparisonCell />
    <PreviewFrame
      backdrop={backdrop}
      columnKind="3d"
      cropId="point-3d-measurement-expanded"
      rowId="point-expanded"
    >
      <ThreeDimensionalBox
        slots={buildPointSlots(CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS)}
      />
    </PreviewFrame>
    <PreviewFrame
      backdrop={backdrop}
      columnKind="3d"
      cropId="point-3d-info-expanded"
      rowId="point-expanded"
    >
      <ThreeDimensionalBox
        headerTitle="Informationen"
        slots={buildInformationSlots(
          CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS,
          "point"
        )}
      />
    </PreviewFrame>

    <div style={rowHeaderStyle}>Punkt kompakt</div>
    <EmptyComparisonCell />
    <PreviewFrame
      backdrop={backdrop}
      columnKind="3d"
      cropId="point-3d-measurement-collapsed"
      rowId="point-collapsed"
      collapsed
    >
      <ThreeDimensionalBox
        slots={buildPointSlots(CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS)}
      />
    </PreviewFrame>
    <PreviewFrame
      backdrop={backdrop}
      columnKind="3d"
      cropId="point-3d-info-collapsed"
      rowId="point-collapsed"
      collapsed
    >
      <ThreeDimensionalBox
        headerTitle="Informationen"
        slots={buildInformationSlots(
          CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS,
          "point"
        )}
      />
    </PreviewFrame>
  </div>
);

const InfoBoxParityStory = () => (
  <main style={storyRootStyle} data-test-id="infobox-parity-contact-sheet">
    <style>{previewMapControlRendererResetCss}</style>
    {INFO_BOX_PARITY_BACKDROP_PRESETS.map((preset) => (
      <section key={preset.id} style={backdropSectionStyle}>
        <div style={backdropSectionHeaderStyle}>{preset.label}</div>
        <InfoBoxParityMatrix backdrop={preset.id} />
      </section>
    ))}
  </main>
);

export const ContactSheet: Story = {
  name: "Contact Sheet",
  render: () => <InfoBoxParityStory />,
};

const storyRootStyle: CSSProperties = {
  background: "#f3f4f6",
  color: "#111827",
  display: "flex",
  flexDirection: "column",
  fontFamily:
    'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  gap: 32,
  minHeight: "100vh",
  padding: 24,
  width: "fit-content",
};

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
  backgroundColor: "#eef5e3",
  border: "1px solid #d1d5db",
  boxSizing: "border-box",
  color: "#212529",
  overflow: "hidden",
  padding: PREVIEW_BACKDROP_PADDING,
  position: "relative",
  width: PREVIEW_CELL_WIDTH,
};

const resolvePreviewBackdropId = ({
  backdrop,
  columnKind,
}: {
  backdrop: InfoBoxParityBackdropMode;
  columnKind: InfoBoxParityColumnKind;
}) =>
  backdrop === INFO_BOX_PARITY_BACKDROP_MODES.AERIAL_MESH
    ? columnKind === "2d"
      ? "2d-luftbild"
      : "3d-mesh"
    : columnKind === "2d"
    ? "2d-topographic"
    : "3d-topographic";

const readPreviewBackdropUrl = ({
  backdrop,
  columnKind,
}: {
  backdrop: InfoBoxParityBackdropMode;
  columnKind: InfoBoxParityColumnKind;
}) => {
  const backdropId = resolvePreviewBackdropId({ backdrop, columnKind });

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
  backdrop,
  columnKind,
}: {
  backdrop: InfoBoxParityBackdropMode;
  columnKind: InfoBoxParityColumnKind;
}): CSSProperties => ({
  backgroundImage: `url(${readPreviewBackdropUrl({ backdrop, columnKind })})`,
  backgroundPosition: "center center",
  backgroundRepeat: "no-repeat",
  backgroundSize: "cover",
});

const buildPreviewMapStyle = ({
  backdrop,
  columnKind,
}: {
  backdrop: InfoBoxParityBackdropMode;
  columnKind: InfoBoxParityColumnKind;
}): CSSProperties => ({
  ...previewMapBaseStyle,
  ...buildBackdropStyle({ backdrop, columnKind }),
});
