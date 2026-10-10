import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useMemo, useState } from "react";
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
  RuntimeAnnotationInfoBox,
  RuntimeAnnotationsToolbar,
} from "@carma-mapping/annotations/runtime";
import "maplibre-gl/dist/maplibre-gl.css";

import { createWuppertalStoryStyle } from "../maplibre/maplibre-story-style";
import meshParityStyle from "../maplibre/data/mesh2024-cesium-parity.style.json";
import rathausBarmenMeasurements from "./data/rathaus-barmen-measurements.json";

/**
 * The 3D measurement scene the measurement3d addon ships with: the Mesh
 * 2024 at the Rathaus Barmen courtyard with one measurement of every type,
 * each partly hidden by the pavilion or the dormer. The same scene as the
 * geoportal test link, without the geoportal: the MapLibre engine, the
 * runtime and the built-in tools alone.
 */

const STORAGE_KEY = "carma::stories::maplibre-measurement-scene";
const MESH_RUNTIME_ID = "stories-mesh-2024";

const SCENE_VIEW = {
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

type MeasurementSceneOptions = {
  surfaceTiles: "stadtplan" | "luftbild";
  /** Start from the fixture, replacing whatever the story stored before. */
  seedScene: boolean;
  showAllTools: boolean;
};

const STABLE_TOOL_IDS = new Set<string>([
  ANNOTATION_SELECT_TOOL_ID,
  ANNOTATION_TYPES.POINT,
  ANNOTATION_TYPES.DISTANCE,
]);

const useStoryMap = (surfaceTiles: MeasurementSceneOptions["surfaceTiles"]) => {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  useEffect(() => {
    if (!container) return;
    const nextMap = new maplibregl.Map({
      container,
      style: createWuppertalStoryStyle(surfaceTiles),
      center: SCENE_VIEW.center,
      zoom: SCENE_VIEW.zoom,
      bearing: SCENE_VIEW.bearing,
      pitch: SCENE_VIEW.pitch,
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
const useStoryMesh = (map: MapLibreMap | null) => {
  const [status, setStatus] = useState("waiting for map");
  useEffect(() => {
    if (!map) return;
    const lease = acquireSharedThreeScene(map);
    let disposed = false;
    const runtime = buildThreeTilesRuntime(
      MESH_RUNTIME_ID,
      WUPP_MESH_2024.url,
      SCENE_VIEW.center,
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

const MeasurementRuntime = ({
  map,
  showAllTools,
}: {
  map: MapLibreMap;
  showAllTools: boolean;
}) => {
  const engine = useMapLibreAnnotationEngine(map);
  const { overlayContainer, overlayHost, ready } =
    useMapLibreAnnotationOverlayHost(map);
  const plugins = useMemo(
    () =>
      createDefaultAnnotationToolPlugins({
        annotationLineStyle: { strokeWidthPx: 1.5, overlayDashPattern: "8 8" },
        areaOcclusionStyle: {
          fill: { overlay: false },
          line: { overlayDashed: true },
        },
        texts: defaultAnnotationToolTexts,
      }),
    []
  );
  const visiblePlugins = useMemo(
    () =>
      showAllTools
        ? plugins
        : plugins.filter((plugin) => STABLE_TOOL_IDS.has(plugin.id)),
    [plugins, showAllTools]
  );
  const active = engine !== null && ready;
  return (
    <AnnotationsProvider
      engine={engine}
      plugins={plugins}
      annotationOverlayContainer={overlayContainer}
      labelOverlayHost={overlayHost}
      initialActiveToolType={ANNOTATION_SELECT_TOOL_ID}
      localPersistence={{ storageKey: STORAGE_KEY }}
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
        <RuntimeAnnotationInfoBox
          useControlLayout
          controlPosition="bottomright"
          controlOrder={12}
          pixelWidth={350}
        />
      ) : null}
    </AnnotationsProvider>
  );
};

export const MapLibreMeasurementScene = (options: MeasurementSceneOptions) => {
  // The fixture goes into the runtime's own storage before the provider
  // mounts; the runtime then loads it like any persisted session.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (options.seedScene) {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(rathausBarmenMeasurements)
      );
    }
    setSeeded(true);
  }, [options.seedScene]);
  const { map, setContainer } = useStoryMap(options.surfaceTiles);
  const meshStatus = useStoryMesh(map);
  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <div ref={setContainer} style={{ position: "absolute", inset: 0 }} />
      {map && seeded ? (
        <MeasurementRuntime map={map} showAllTools={options.showAllTools} />
      ) : null}
      <div
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

const meta = {
  title: "Mapping/Annotations/MapLibre Measurement Scene",
  id: "mapping-annotations-maplibre-measurement-scene",
  component: MapLibreMeasurementScene,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Mesh 2024 at the Rathaus Barmen courtyard with one measurement of every type, each partly hidden by the pavilion or the dormer: point, distance, polyline, ground area, three planar roof areas and two vertical areas. Lines draw in the shared Three scene with a dashed depth-fail pass for the hidden parts, area fills carry a metric dot screen that foreshortens with the surface. The fixture is the same scene as the geoportal test link.",
      },
    },
  },
  args: {
    surfaceTiles: "luftbild",
    seedScene: true,
    showAllTools: true,
  },
  argTypes: {
    surfaceTiles: { control: "radio", options: ["stadtplan", "luftbild"] },
    seedScene: {
      control: "boolean",
      description:
        "Replace the stored session with the fixture on mount; off keeps what was drawn in this browser.",
    },
    showAllTools: {
      control: "boolean",
      description:
        "Experimental tools too, like the alltools feature flag of the geoportal.",
    },
  },
} satisfies Meta<typeof MapLibreMeasurementScene>;

export default meta;

type Story = StoryObj<typeof meta>;

export const RathausBarmenCourtyard: Story = {};

export const StableToolsOnly: Story = {
  args: { showAllTools: false },
};
