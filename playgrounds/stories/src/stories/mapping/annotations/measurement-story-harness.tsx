import { ecefFromGeographicCoordinate } from "@carma-geo/proj";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { carma } from "@carma-api";
import {
  ANNOTATION_SELECT_TOOL_ID,
  type AnnotationToolId,
} from "@carma-mapping/annotations/core";
import {
  createDefaultAnnotationToolPlugins,
  defaultAnnotationToolTexts,
} from "@carma-mapping/annotations/builtin-tools";
import {
  useMapLibreAnnotationEngine,
  useMapLibreAnnotationOverlayHost,
} from "@carma-mapping/annotations/maplibre";
import {
  AnnotationsProvider,
  flyToAnnotationPoints,
  RuntimeAnnotationInfoBox,
  RuntimeAnnotationsToolbar,
  useAnnotationsRuntime,
  type AnnotationComponentDisplayMode,
  type AnnotationMeterMarkerMode,
} from "@carma-mapping/annotations/runtime";
import { STABLE_ANNOTATION_TOOL_IDS } from "@carma-mapping/annotations/ui";

import {
  aimDraftPointer,
  fixtureCoordinates,
  fixtureSubset,
  loadMeasurementStoryFixture,
  type FixtureCollection,
} from "./measurement-story-play";
import {
  useMeasurementStoryMap,
  useMeasurementStoryMesh,
  type MeasurementStorySurface,
} from "./measurement-story-scene";

/**
 * The measurement runtime on the courtyard scene, started in a state: the
 * fixture measurements go in through carma.annotations, the state is set
 * through the runtime as a script would.
 */

export type MeasurementStoryState =
  | { kind: "committed" }
  | { kind: "selected" }
  /** selected; the play function opens the gizmo with a long press */
  | { kind: "editing" }
  /** the tool with its first `nodes` fixture nodes as draft, the measurement left out */
  | { kind: "drafting"; toolId: AnnotationToolId; nodes: number }
  /** the measurement left out, for a play function to make or add it */
  | { kind: "empty" };

/** Camera direction a framed story looks at its measurement from. */
export type MeasurementStoryView = { pitch?: number; bearing?: number };

export type MeasurementStoryProps = {
  surfaceTiles: MeasurementStorySurface;
  showAllTools: boolean;
  meterMarkers: AnnotationMeterMarkerMode;
  components: AnnotationComponentDisplayMode;
  /** fixture measurements on the map; all when omitted */
  annotationIds?: readonly string[];
  /** the measurement the state applies to and the camera frames */
  focusAnnotationId?: string | null;
  state?: MeasurementStoryState;
  frame?: boolean;
  view?: MeasurementStoryView;
};

const STABLE_TOOL_ID_SET = new Set<string>(STABLE_ANNOTATION_TOOL_IDS);

const seededIds = (
  fixture: FixtureCollection,
  { annotationIds, focusAnnotationId, state }: MeasurementStoryProps
) => {
  const leftOut =
    state?.kind === "drafting" || state?.kind === "empty"
      ? focusAnnotationId
      : null;
  return fixture.features
    .map((feature) => feature.id)
    .filter(
      (id) => id !== leftOut && (!annotationIds || annotationIds.includes(id))
    );
};

const MeasurementStoryScenario = ({
  map,
  fixture,
  props,
}: {
  map: MapLibreMap;
  fixture: FixtureCollection;
  props: MeasurementStoryProps;
}) => {
  const runtime = useAnnotationsRuntime();
  const applied = useRef(false);
  useEffect(() => {
    const { engine } = runtime;
    if (applied.current || !engine) return;
    applied.current = true;
    const state = props.state ?? { kind: "committed" };
    const focus = props.focusAnnotationId ?? null;
    const coordinates = focus ? fixtureCoordinates(fixture, focus) : [];
    carma.annotations.addMeasurements(
      fixtureSubset(fixture, seededIds(fixture, props)),
      { replace: true }
    );
    if (state.kind === "drafting") {
      runtime.setActiveToolType(state.toolId);
      runtime.annotationToolDraftStore.set(state.toolId, {
        coordinates: coordinates.slice(0, state.nodes),
        linkedNodeGroupIds: Array.from({ length: state.nodes }, () => null),
      });
      aimDraftPointer(engine, coordinates, state.nodes);
    } else {
      runtime.setActiveToolType(ANNOTATION_SELECT_TOOL_ID);
      runtime.setSelectedAnnotationIds(
        focus && (state.kind === "selected" || state.kind === "editing")
          ? [focus]
          : []
      );
    }
    // framed from the fixture, so a left-out measurement frames the same;
    // the fly keeps the direction, so the story's view sets it first
    if (props.frame && coordinates.length > 0) {
      map.jumpTo({
        pitch: props.view?.pitch ?? map.getPitch(),
        bearing: props.view?.bearing ?? map.getBearing(),
      });
      flyToAnnotationPoints({
        engine,
        points: coordinates.map((coordinate) =>
          ecefFromGeographicCoordinate(coordinate)
        ),
      });
    }
  }, [fixture, map, props, runtime]);
  return null;
};

const MeasurementStoryRuntime = ({
  map,
  fixture,
  props,
}: {
  map: MapLibreMap;
  fixture: FixtureCollection;
  props: MeasurementStoryProps;
}) => {
  const engine = useMapLibreAnnotationEngine(map);
  const { overlayContainer, overlayHost, ready } =
    useMapLibreAnnotationOverlayHost(map);
  const plugins = useMemo(
    () =>
      createDefaultAnnotationToolPlugins({
        annotationLineStyle: {
          strokeWidthPx: 1.5,
          overlayDashPattern: "8 8",
          meterMarkers: props.meterMarkers,
          components: props.components,
        },
        areaOcclusionStyle: {
          fill: { overlay: false },
          line: { overlayDashed: true },
        },
        texts: defaultAnnotationToolTexts,
      }),
    [props.meterMarkers, props.components]
  );
  const toolbarPlugins = useMemo(
    () =>
      props.showAllTools
        ? plugins
        : plugins.filter((plugin) => STABLE_TOOL_ID_SET.has(plugin.id)),
    [plugins, props.showAllTools]
  );
  const active = engine !== null && ready;
  return (
    <AnnotationsProvider
      engine={engine}
      plugins={plugins}
      annotationOverlayContainer={overlayContainer}
      labelOverlayHost={overlayHost}
      initialActiveToolType={ANNOTATION_SELECT_TOOL_ID}
      renderEnabled={active}
      visualRenderEnabled={active}
      visualInteractionEnabled={active}
    >
      <div
        style={{
          position: "absolute",
          top: 12,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
        }}
      >
        <RuntimeAnnotationsToolbar
          plugins={toolbarPlugins}
          disableSelectWithoutAnnotations
          tooltipPlacement="bottom"
        />
      </div>
      {active ? (
        <>
          <MeasurementStoryScenario map={map} fixture={fixture} props={props} />
          <div
            style={{ position: "absolute", right: 12, bottom: 12, zIndex: 10 }}
          >
            <RuntimeAnnotationInfoBox
              useControlLayout={false}
              pixelWidth={350}
            />
          </div>
        </>
      ) : null}
    </AnnotationsProvider>
  );
};

export const MeasurementStory = (props: MeasurementStoryProps) => {
  const [fixture, setFixture] = useState<FixtureCollection | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadMeasurementStoryFixture().then((loaded) => {
      if (!cancelled) setFixture(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const { map, setContainer } = useMeasurementStoryMap(props.surfaceTiles);
  const meshStatus = useMeasurementStoryMesh(map);
  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <div ref={setContainer} style={{ position: "absolute", inset: 0 }} />
      {map && fixture ? (
        <MeasurementStoryRuntime map={map} fixture={fixture} props={props} />
      ) : null}
      <div
        data-test-id="measurement-story-status"
        style={{
          position: "absolute",
          left: 12,
          bottom: 12,
          padding: "3px 6px",
          font: "12px/1.45 system-ui, sans-serif",
          background: "#fff",
        }}
      >
        {meshStatus}
      </div>
    </div>
  );
};

export const measurementStoryArgTypes = {
  surfaceTiles: { control: "radio", options: ["stadtplan", "luftbild"] },
  showAllTools: {
    control: "boolean",
    description: "Experimental tools too, like the geoportal alltools flag.",
  },
  meterMarkers: {
    control: "radio",
    options: ["always", "selected", "off"],
    description: "When distance and polyline carry meter markers.",
  },
  components: {
    control: "radio",
    options: ["always", "selected"],
    description:
      "When distance and polyline carry their legs and segment labels.",
  },
} as const;

/** The MapLibre measurement addon defaults for meter markers and components. */
export const measurementStoryDefaultArgs = {
  surfaceTiles: "luftbild" as const,
  showAllTools: true,
  meterMarkers: "selected" as const,
  components: "selected" as const,
};
