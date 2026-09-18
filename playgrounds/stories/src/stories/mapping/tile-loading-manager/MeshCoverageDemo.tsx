import { useEffect, useRef, useState } from "react";
import maplibregl, {
  type Map as MapLibreMap,
  type StyleSpecification,
} from "maplibre-gl";

import {
  createMetricRecorder,
  type MetricRecorder,
} from "@carma-commons/ui/components";
import {
  acquireSharedThreeScene,
  buildThreeTilesRuntime,
  type ThreeTilesRuntime,
} from "@carma-mapping/engines/maplibre";

import parityStyleRaw from "../maplibre/data/mesh2024-cesium-parity.style.json?raw";
import { createWuppertalStoryStyle } from "../maplibre/maplibre-story-style";
import {
  TileLoadingDebug,
  type TileLoadingDebugOptions,
  type TileLoadingDebugLoadingOptions,
} from "./TileLoadingDebug";

import "maplibre-gl/dist/maplibre-gl.css";
import { ViewportPaddingPanels } from "./ViewportPaddingPanels";
import { MeshCoverageCameraWindows } from "./MeshCoverageCameraWindows";

export { DEBUG_COLOR_MODES } from "./TileLoadingDebug";

export const CAMERA_PRESETS = {
  "parity zoom 18": { zoom: 18, pitch: 0, bearing: 0 },
  "zoomed in 20": { zoom: 20, pitch: 0, bearing: 0 },
  "overview 14": { zoom: 14, pitch: 0, bearing: 0 },
  "oblique 15": { zoom: 15, pitch: 75, bearing: 20 },
  "horizon 16": { zoom: 16, pitch: 85, bearing: -30 },
} as const;
export type CameraPreset = keyof typeof CAMERA_PRESETS;

export type MeshCoverageDemoOptions = TileLoadingDebugOptions &
  TileLoadingDebugLoadingOptions & {
    debug: boolean;
    initialPixelError?: number;
    idlePixelError?: number;
    /** Start view; changing it eases the camera there. */
    camera: CameraPreset;
    /**
     * MapLibre has no orthographic projection; one-degree vertical FOV moves
     * the camera far out and flattens perspective for both map and tiles.
     */
    projection: "perspective" | "near orthographic";
    /** Vertical field of view of the perspective camera in degrees. */
    fovDegrees: number;
    /** MapLibre viewport insets in CSS pixels; coverage still fills the canvas. */
    paddingLeft?: number;
    paddingRight?: number;
    paddingTop?: number;
    paddingBottom?: number;
    showPaddingGuide?: boolean;
    paddingPanels?: boolean;
    /** Zero follows the available width; positive values exercise narrow hosts. */
    viewportWidth?: number;
    cameraWindows?: boolean;
  };

const PARITY_STYLE = JSON.parse(parityStyleRaw) as StyleSpecification;
const MESH_CENTER: [number, number] = [7.1999207, 51.2725716];
const NEAR_ORTHOGRAPHIC_FOV_DEGREES = 1;

type MeshParityConfig = {
  tilesetUrl: string;
  baseErrorTarget: number;
  errorTarget: number;
  tilesetMinResolutionPx: number;
  colorCorrection?: NonNullable<
    Parameters<typeof buildThreeTilesRuntime>[3]
  >["colorCorrection"];
  entry?: NonNullable<Parameters<typeof buildThreeTilesRuntime>[3]>["entry"];
};

const MESH_CONFIG = (
  PARITY_STYLE.metadata as { carmaConf: { "3d": MeshParityConfig } }
).carmaConf["3d"];

export const MeshCoverageScene = ({
  onOptionsChange,
  ...options
}: MeshCoverageDemoOptions & {
  onOptionsChange: (patch: Partial<MeshCoverageDemoOptions>) => void;
}) => {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [paddingGuide, setPaddingGuide] = useState({
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  });
  const [runtimeHandle, setRuntimeHandle] = useState<ThreeTilesRuntime | null>(
    null
  );
  const [recorder] = useState(() =>
    createMetricRecorder({ capacity: 120, logCapacity: 300 })
  );
  // Probes read the series through this handle, next to window.__carmaTiles3d.
  (
    window as unknown as { __meshCoverageRecorder?: MetricRecorder }
  ).__meshCoverageRecorder = recorder;

  useEffect(() => {
    if (!container.current) return;
    const nextMap = new maplibregl.Map({
      container: container.current,
      center: MESH_CENTER,
      zoom: CAMERA_PRESETS[options.camera].zoom - 1,
      pitch: CAMERA_PRESETS[options.camera].pitch,
      bearing: CAMERA_PRESETS[options.camera].bearing,
      maxPitch: 85,
      minZoom: 0,
      maxZoom: 25,
      attributionControl: {},
      style: createWuppertalStoryStyle(null),
    });
    nextMap.addControl(new maplibregl.NavigationControl());
    nextMap.setPadding({
      left: options.paddingLeft ?? 0,
      right: options.paddingRight ?? 0,
      top: options.paddingTop ?? 0,
      bottom: options.paddingBottom ?? 0,
    });
    let lease: ReturnType<typeof acquireSharedThreeScene> | null = null;
    let runtime: ThreeTilesRuntime | null = null;
    const onLoad = () => {
      lease = acquireSharedThreeScene(nextMap);
      runtime = buildThreeTilesRuntime(
        "mesh-2024-coverage",
        MESH_CONFIG.tilesetUrl,
        MESH_CENTER,
        {
          providesTerrain: true,
          mapStyleDrape: "none",
          colorCorrection: MESH_CONFIG.colorCorrection,
          entry: MESH_CONFIG.entry,
          baseErrorTargetPixels:
            optionsRef.current.initialPixelError ?? MESH_CONFIG.baseErrorTarget,
          diagnostics:
            optionsRef.current.debug && optionsRef.current.telemetryEnabled,
          cacheBudgetBytes: 6 * 1024 ** 3,
        }
      );
      runtime.loading.setErrorTarget(
        optionsRef.current.idlePixelError ?? MESH_CONFIG.errorTarget
      );
      runtime.loading.setTilesetMinResolution(
        optionsRef.current.tilesetMinResolutionPx > 0
          ? optionsRef.current.tilesetMinResolutionPx
          : null
      );
      lease.layer.addRuntime(runtime.scene);
      setRuntimeHandle(runtime);
      setMap(nextMap);
    };
    nextMap.once("load", onLoad);
    return () => {
      setMap(null);
      setRuntimeHandle(null);
      if (runtime && lease) lease.layer.removeRuntime(runtime.scene.id);
      lease?.release();
      nextMap.remove();
    };
    // The host and runtime are stable; controls mutate the existing instances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstView = useRef(true);
  useEffect(() => {
    runtimeHandle?.loading.setErrorTarget(
      options.idlePixelError ?? MESH_CONFIG.errorTarget,
      options.initialPixelError ?? MESH_CONFIG.baseErrorTarget
    );
  }, [runtimeHandle, options.idlePixelError, options.initialPixelError]);
  useEffect(() => {
    if (!map) return;
    const preset = CAMERA_PRESETS[options.camera];
    const view = {
      center: MESH_CENTER,
      zoom: preset.zoom - 1,
      pitch: preset.pitch,
      bearing: preset.bearing,
    };
    if (firstView.current) {
      firstView.current = false;
      map.jumpTo(view);
    } else {
      map.easeTo({ ...view, duration: 1200 });
    }
  }, [map, options.camera]);

  useEffect(() => {
    if (!map) return;
    map.setVerticalFieldOfView(
      options.projection === "near orthographic"
        ? NEAR_ORTHOGRAPHIC_FOV_DEGREES
        : options.fovDegrees
    );
  }, [map, options.projection, options.fovDegrees]);

  useEffect(() => {
    if (!map) return;
    if (!options.paddingPanels)
      map.setPadding({
        left: options.paddingLeft ?? 0,
        right: options.paddingRight ?? 0,
        top: options.paddingTop ?? 0,
        bottom: options.paddingBottom ?? 0,
      });
    const updateGuide = () => {
      if (!options.showPaddingGuide) return;
      const canvas = map.getCanvas();
      const focus = map.project(map.getCenter());
      const padding = map.getPadding();
      const next = {
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        // Ignore floating-point projection noise during ordinary map movement.
        x: Math.round(focus.x * 100) / 100,
        y: Math.round(focus.y * 100) / 100,
        left: padding.left ?? 0,
        right: padding.right ?? 0,
        top: padding.top ?? 0,
        bottom: padding.bottom ?? 0,
      };
      setPaddingGuide((previous) =>
        Object.keys(next).every(
          (key) =>
            previous[key as keyof typeof next] ===
            next[key as keyof typeof next]
        )
          ? previous
          : next
      );
    };
    updateGuide();
    map.on("resize", updateGuide);
    map.on("move", updateGuide);
    return () => {
      map.off("resize", updateGuide);
      map.off("move", updateGuide);
    };
  }, [
    map,
    options.paddingLeft,
    options.paddingRight,
    options.paddingTop,
    options.paddingBottom,
    options.showPaddingGuide,
    options.paddingPanels,
  ]);

  useEffect(() => {
    if (!map || !container.current) return;
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(container.current);
    return () => resize.disconnect();
  }, [map]);

  const paddingLabelBeforeFocus = paddingGuide.x + 110 > paddingGuide.width;

  return (
    <div
      className="mesh-coverage-story"
      style={{
        height: "100vh",
        position: "relative",
        width: options.viewportWidth ? `${options.viewportWidth}px` : "100%",
        maxWidth: "100%",
        marginInline: "auto",
      }}
    >
      <div style={{ position: "absolute", inset: 0 }}>
        <div
          ref={container}
          data-test-id="mesh-coverage-map"
          style={{ position: "absolute", inset: 0, background: "#d8dde3" }}
        />
        {options.showPaddingGuide && (
          <svg
            data-test-id="mesh-coverage-padding-guide"
            width="100%"
            height="100%"
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              overflow: "hidden",
            }}
            aria-label="Usable viewport and padded map center"
          >
            <rect
              x={paddingGuide.left}
              y={paddingGuide.top}
              width={Math.max(
                0,
                paddingGuide.width - paddingGuide.left - paddingGuide.right
              )}
              height={Math.max(
                0,
                paddingGuide.height - paddingGuide.top - paddingGuide.bottom
              )}
              fill="none"
              stroke="#00eaff"
              strokeWidth="2"
            />
            <path
              data-test-id="mesh-coverage-padding-focus"
              d={`M${paddingGuide.x - 10},${paddingGuide.y}h20 M${
                paddingGuide.x
              },${paddingGuide.y - 10}v20`}
              fill="none"
              stroke="#00eaff"
              strokeWidth="2"
            />
            <text
              x={paddingGuide.x + (paddingLabelBeforeFocus ? -14 : 14)}
              y={Math.max(
                16,
                Math.min(paddingGuide.height - 6, paddingGuide.y - 8)
              )}
              textAnchor={paddingLabelBeforeFocus ? "end" : "start"}
              fill="#00eaff"
              stroke="#123"
              strokeWidth="3"
              paintOrder="stroke"
              style={{ font: "12px sans-serif" }}
            >
              Padded focus
            </text>
          </svg>
        )}
        {map && options.paddingPanels && <ViewportPaddingPanels map={map} />}
        {map && runtimeHandle && (
          <MeshCoverageCameraWindows
            key={String(!!options.cameraWindows)}
            map={map}
            runtime={runtimeHandle}
            initialCount={options.cameraWindows ? 3 : 0}
          />
        )}
        {map && runtimeHandle && (
          <TileLoadingDebug
            map={map}
            recorder={recorder}
            options={options}
            runtimeHandle={runtimeHandle}
            onOptionsChange={onOptionsChange}
            open={options.debug}
            onOpenChange={(debug) => onOptionsChange({ debug })}
          />
        )}
      </div>
    </div>
  );
};

/** Direct MapLibre host: no portals, topic-map or provider dependency stack. */
export const MeshCoverageDemo = (options: MeshCoverageDemoOptions) => {
  const [controls, setControls] = useState<Partial<MeshCoverageDemoOptions>>(
    {}
  );
  // A changed Storybook arg takes precedence over the launcher's local toggle.
  useEffect(() => {
    setControls((current) => {
      if (current.debug === undefined) return current;
      const next = { ...current };
      delete next.debug;
      return next;
    });
  }, [options.debug]);
  const resolved = { ...options, ...controls };
  return (
    <MeshCoverageScene
      {...resolved}
      onOptionsChange={(patch) =>
        setControls((current) => ({ ...current, ...patch }))
      }
    />
  );
};
