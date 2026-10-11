import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { WUPP_MESH_2024 } from "@carma-commons/resources";
import {
  acquireSharedThreeScene,
  buildThreeTilesRuntime,
  notifySharedThreeSceneContentChanged,
  notifySharedThreeSceneRequestStateChanged,
  registerSharedThreeSceneRuntime,
} from "@carma-mapping/engines/maplibre";
import {
  ANNOTATION_SELECT_TOOL_ID,
  ANNOTATION_TYPES,
  type AnnotationGeographicCoordinate,
  type AnnotationToolId,
  ecefFromGeographicCoordinate,
} from "@carma-mapping/annotations/core";
import {
  createDefaultAnnotationToolPlugins,
  defaultAnnotationToolTexts,
} from "@carma-mapping/annotations/builtin-tools";
import {
  loadMeasurement3dTestSceneMeasurements,
  useMapLibreAnnotationEngine,
  useMapLibreAnnotationOverlayHost,
} from "@carma-mapping/annotations/maplibre";
import {
  AnnotationsProvider,
  flyToAnnotationPoints,
  RuntimeAnnotationInfoBox,
  RuntimeAnnotationsToolbar,
  useAnnotationsRuntime,
  type AnnotationEngine,
  type AnnotationMeterMarkerMode,
} from "@carma-mapping/annotations/runtime";
import "maplibre-gl/dist/maplibre-gl.css";

import { createWuppertalStoryStyle } from "../maplibre/maplibre-story-style";
import meshParityStyle from "../maplibre/data/mesh2024-cesium-parity.style.json";

/**
 * The Rathaus Barmen courtyard on the Mesh 2024 with the measurement runtime
 * on the MapLibre engine: the ground the measurement scene story and the
 * per-tool stories stand on. A story picks which measurements of the shared
 * fixture are on the map and which state the runtime starts in (selected,
 * one node under the move gizmo, a draft half drawn); the state is set
 * through the runtime's public API, the way a script would.
 */

export const MEASUREMENT_STORY_VIEW = {
  center: [7.2000445, 51.2720981] as [number, number],
  zoom: 19.8,
  bearing: 150.68,
  pitch: 60,
};

/**
 * DGM1 height at the scene centre, sampled the way the geoportal's layer
 * manager probes it (terrarium tile, level 14). The mesh is anchored there
 * before its first traversal, so the measurements land on the roofs.
 */
const SCENE_GROUND_REFERENCE_METERS = 154.9;
const MESH_RUNTIME_ID = "stories-mesh-2024";

export const MEASUREMENT_STORY_STABLE_TOOL_IDS = new Set<string>([
  ANNOTATION_SELECT_TOOL_ID,
  ANNOTATION_TYPES.POINT,
  ANNOTATION_TYPES.DISTANCE,
]);

export type MeasurementStorySurface = "stadtplan" | "luftbild";

export const useMeasurementStoryMap = (
  surfaceTiles: MeasurementStorySurface
) => {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  useEffect(() => {
    if (!container) return;
    const nextMap = new maplibregl.Map({
      container,
      style: createWuppertalStoryStyle(surfaceTiles),
      center: MEASUREMENT_STORY_VIEW.center,
      zoom: MEASUREMENT_STORY_VIEW.zoom,
      bearing: MEASUREMENT_STORY_VIEW.bearing,
      pitch: MEASUREMENT_STORY_VIEW.pitch,
      maxPitch: 85,
      attributionControl: false,
    });
    setMap(nextMap);
    return () => {
      setMap(null);
      nextMap.remove();
    };
  }, [container, surfaceTiles]);
  return { map, setContainer };
};

/** Mesh 2024 through the shared Three scene, the way the geoportal mounts it. */
export const useMeasurementStoryMesh = (map: MapLibreMap | null) => {
  const [status, setStatus] = useState("waiting for map");
  useEffect(() => {
    if (!map) return;
    const lease = acquireSharedThreeScene(map);
    let disposed = false;
    const runtime = buildThreeTilesRuntime(
      MESH_RUNTIME_ID,
      WUPP_MESH_2024.url,
      MEASUREMENT_STORY_VIEW.center,
      {
        cameraLocalMount: true,
        groundReferenceMeters: SCENE_GROUND_REFERENCE_METERS,
        providesTerrain: true,
        mapStyleDrape: "none",
        outline: false,
        colorCorrection: WUPP_MESH_2024.colorCorrection,
        entry: meshParityStyle.metadata.carmaConf["3d"].entry,
        diagnostics: false,
        tileTelemetry: false,
        onContentChanged: (bounds, roots) => {
          if (disposed) return;
          if (roots && roots.length > 0) setStatus("mesh content received");
          notifySharedThreeSceneContentChanged(map, { bounds, roots });
        },
        onRequestStateChange: () => {
          if (disposed) return;
          notifySharedThreeSceneRequestStateChanged(map);
        },
      }
    );
    runtime.loading.setErrorTarget(2);
    runtime.appearance.setOpacity(1);
    lease.layer.addRuntime(runtime.scene);
    const unregister = registerSharedThreeSceneRuntime(map, runtime.scene);
    setStatus("loading mesh");
    map.triggerRepaint();
    return () => {
      disposed = true;
      unregister();
      lease.layer.removeRuntime(MESH_RUNTIME_ID);
      lease.release();
    };
  }, [map]);
  return status;
};

/** A feature of the shared fixture, as far as the stories read it. */
type FixtureFeature = {
  id: string;
  properties: {
    annotation: { toolType: string };
    nodes: { coordinate: AnnotationGeographicCoordinate }[];
  };
};
type FixtureCollection = { type: string; features: FixtureFeature[] };

/** The coordinates of a fixture measurement, in node order. */
export const fixtureCoordinates = (
  fixture: FixtureCollection,
  annotationId: string
): AnnotationGeographicCoordinate[] =>
  fixture.features
    .find((feature) => feature.id === annotationId)
    ?.properties.nodes.map((node) => node.coordinate) ?? [];

/** The state a story starts the runtime in. */
export type MeasurementStoryState =
  /** On the map, nothing selected. */
  | { kind: "committed" }
  /** Selected: highlight, handles and info box. */
  | { kind: "selected" }
  /**
   * Selected, with the move gizmo on one node. The gizmo opens on a long
   * press on the node marker, so the story's play function presses it
   * (see `pressNodeMarker`); the state only prepares the selection.
   */
  | { kind: "editing" }
  /**
   * The tool active with a draft of the first `nodes` corners of the
   * fixture measurement; the measurement itself is left off the map.
   */
  | { kind: "drafting"; toolId: AnnotationToolId; nodes: number };

/**
 * Where a draft story points: the fixture node after the drafted ones, so
 * the draft's rubber band runs to where the measurement goes on. Kept per
 * map canvas for the story's play function.
 */
const DRAFT_POINTER_INSET = 0.12;

const draftPointerTargets = new WeakMap<
  HTMLCanvasElement,
  {
    engine: AnnotationEngine;
    positionECEF: ReturnType<typeof ecefFromGeographicCoordinate>;
  }
>();

/** Camera direction a framed story looks at its measurement from. */
export type MeasurementStoryView = { pitch?: number; bearing?: number };

const MeasurementStoryScenario = ({
  map,
  annotationId,
  state,
  fixture,
  frame,
  view,
}: {
  map: MapLibreMap;
  annotationId: string | null;
  state: MeasurementStoryState;
  fixture: FixtureCollection;
  frame: boolean;
  view: MeasurementStoryView | undefined;
}) => {
  const runtime = useAnnotationsRuntime();
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current || !runtime.engine) return;
    applied.current = true;
    if (state.kind === "drafting" && annotationId) {
      runtime.setSelectedAnnotationIds([]);
      runtime.setActiveToolType(state.toolId);
      runtime.annotationToolDraftStore.set(state.toolId, {
        coordinates: fixtureCoordinates(fixture, annotationId).slice(
          0,
          state.nodes
        ),
        linkedNodeGroupIds: Array.from({ length: state.nodes }, () => null),
      });
      const positions = fixtureCoordinates(fixture, annotationId).map(
        (coordinate) => ecefFromGeographicCoordinate(coordinate)
      );
      const next = positions[state.nodes] ?? positions.at(-1);
      if (next) {
        // A little inside the measurement: a node on an edge, like the
        // light well rim, lets the pick slip past it.
        const centroid = positions
          .reduce(
            (sum, position) => sum.add(position),
            next.clone().setScalar(0)
          )
          .divideScalar(positions.length);
        draftPointerTargets.set(runtime.engine.canvas, {
          engine: runtime.engine,
          positionECEF: next.clone().lerp(centroid, DRAFT_POINTER_INSET),
        });
      }
    } else {
      runtime.setActiveToolType(ANNOTATION_SELECT_TOOL_ID);
      runtime.setSelectedAnnotationIds(
        annotationId && state.kind !== "committed" ? [annotationId] : []
      );
    }
    // Framed from the fixture, so a draft story frames the measurement
    // it leaves off the map just the same. The fly keeps the direction,
    // so the story's view sets it first: the courtyard floor needs a
    // steep look past the roofs.
    if (frame && annotationId) {
      map.jumpTo({
        pitch: view?.pitch ?? map.getPitch(),
        bearing: view?.bearing ?? map.getBearing(),
      });
      flyToAnnotationPoints({
        engine: runtime.engine,
        points: fixtureCoordinates(fixture, annotationId).map((coordinate) =>
          ecefFromGeographicCoordinate(coordinate)
        ),
      });
    }
  }, [annotationId, fixture, frame, map, runtime, state, view]);
  return null;
};

export type MeasurementStoryProps = {
  surfaceTiles: MeasurementStorySurface;
  showAllTools: boolean;
  meterMarkers: AnnotationMeterMarkerMode;
  /** Fixture measurements on the map; all when omitted. */
  annotationIds?: readonly string[];
  /** The measurement the state applies to and the camera frames. */
  focusAnnotationId?: string | null;
  state?: MeasurementStoryState;
  /** Fly to the focused measurement once the runtime is up. */
  frame?: boolean;
  /** Direction the framed measurement is seen from; the current one when omitted. */
  view?: MeasurementStoryView;
  storageKey: string;
};

const MeasurementStoryRuntime = ({
  map,
  props,
  fixture,
}: {
  map: MapLibreMap;
  props: MeasurementStoryProps;
  fixture: FixtureCollection;
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
        },
        areaOcclusionStyle: {
          fill: { overlay: false },
          line: { overlayDashed: true },
        },
        texts: defaultAnnotationToolTexts,
      }),
    [props.meterMarkers]
  );
  const visiblePlugins = useMemo(
    () =>
      props.showAllTools
        ? plugins
        : plugins.filter((plugin) =>
            MEASUREMENT_STORY_STABLE_TOOL_IDS.has(plugin.id)
          ),
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
      localPersistence={{ storageKey: props.storageKey }}
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
          plugins={visiblePlugins}
          disableSelectWithoutAnnotations
          tooltipPlacement="bottom"
        />
      </div>
      {active ? (
        <>
          <MeasurementStoryScenario
            map={map}
            annotationId={props.focusAnnotationId ?? null}
            state={props.state ?? { kind: "committed" }}
            fixture={fixture}
            frame={props.frame ?? false}
            view={props.view}
          />
          {/* No control layout in a story: the box sits in the corner itself. */}
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

/**
 * The scene: the fixture (or the chosen part of it) goes into the runtime's
 * own storage before the provider mounts, and the runtime loads it like any
 * persisted session. A draft story leaves its measurement out, the draft
 * stands in for it.
 */
export const MeasurementStory = (props: MeasurementStoryProps) => {
  const [fixture, setFixture] = useState<FixtureCollection | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadMeasurement3dTestSceneMeasurements().then((loaded) => {
      if (cancelled) return;
      const all = loaded as FixtureCollection;
      const drafted =
        props.state?.kind === "drafting" ? props.focusAnnotationId : null;
      const kept = all.features.filter(
        (feature) =>
          feature.id !== drafted &&
          (!props.annotationIds || props.annotationIds.includes(feature.id))
      );
      window.localStorage.setItem(
        props.storageKey,
        JSON.stringify({ ...all, features: kept })
      );
      setFixture(all);
    });
    return () => {
      cancelled = true;
    };
  }, [
    props.annotationIds,
    props.focusAnnotationId,
    props.state,
    props.storageKey,
  ]);
  const { map, setContainer } = useMeasurementStoryMap(props.surfaceTiles);
  const meshStatus = useMeasurementStoryMesh(map);
  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <div ref={setContainer} style={{ position: "absolute", inset: 0 }} />
      {map && fixture ? (
        <MeasurementStoryRuntime map={map} props={props} fixture={fixture} />
      ) : null}
      <div
        data-measurement-story-status={meshStatus}
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

/**
 * Where a node of a committed measurement takes its long press: the marker
 * circle of a line or area node, or the label of a point or label
 * annotation, which has the one node.
 */
export const nodeMarkerSelectors = (
  annotationId: string,
  nodeIndex: number
) => {
  const label = `[data-label-overlay-id="committed-runtime-point-label-${annotationId}-label"]`;
  return [
    `[data-label-overlay-id="committed-runtime-point-marker-${annotationId}-node-${nodeIndex}"] [data-runtime-point-marker-circle]`,
    ...(nodeIndex === 0
      ? [
          `${label} [data-pillbutton-root]`,
          `${label} [data-point-label-content-root]`,
        ]
      : []),
  ];
};

/**
 * Opens the move gizmo on a node the way a user does: a long press on its
 * marker. Waits for the marker to be placed on screen first.
 */
export const pressNodeMarker = async (
  root: HTMLElement,
  annotationId: string,
  nodeIndex: number,
  { timeoutMs = 60_000, holdMs = 450 } = {}
): Promise<boolean> => {
  const selector = nodeMarkerSelectors(annotationId, nodeIndex).join(", ");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const marker = root.ownerDocument.querySelector<HTMLElement>(selector);
    const box = marker?.getBoundingClientRect();
    if (marker && box && (box.left > 0 || box.top > 0)) {
      const init = {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2,
      };
      marker.dispatchEvent(new MouseEvent("mousedown", init));
      await new Promise((resolve) => setTimeout(resolve, holdMs));
      marker.dispatchEvent(new MouseEvent("mouseup", init));
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
};

/**
 * Puts the pointer of a draft story on the next fixture node once the
 * camera has settled there, so the draft shows the way it does under the
 * user's pointer.
 */
export const pointDraftAtNextNode = async (
  root: HTMLElement,
  { timeoutMs = 60_000, settleMs = 600 } = {}
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  let previous: { x: number; y: number } | null = null;
  let stableSince = 0;
  while (Date.now() < deadline) {
    const canvas = root.ownerDocument.querySelector<HTMLCanvasElement>(
      "canvas.maplibregl-canvas"
    );
    const target = canvas ? draftPointerTargets.get(canvas) : undefined;
    const screen = target?.engine.worldToScreen(target.positionECEF) ?? null;
    if (canvas && screen) {
      const moved =
        !previous ||
        Math.hypot(screen.x - previous.x, screen.y - previous.y) > 0.5;
      previous = { x: screen.x, y: screen.y };
      if (moved) {
        stableSince = Date.now();
      } else if (Date.now() - stableSince >= settleMs) {
        const box = canvas.getBoundingClientRect();
        canvas.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            cancelable: true,
            pointerType: "mouse",
            clientX: box.left + screen.x,
            clientY: box.top + screen.y,
          })
        );
        return true;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
};

/** Shared Storybook arg setup of the measurement stories. */
export const measurementStoryArgTypes = {
  surfaceTiles: { control: "radio", options: ["stadtplan", "luftbild"] },
  showAllTools: {
    control: "boolean",
    description:
      "Experimental tools too, like the alltools feature flag of the geoportal.",
  },
  meterMarkers: {
    control: "radio",
    options: ["always", "selected", "off"],
    description: "When distance and polyline lines carry their meter markers.",
  },
} as const;

export const measurementStoryDefaultArgs = {
  surfaceTiles: "luftbild" as const,
  showAllTools: true,
  meterMarkers: "always" as const,
};
