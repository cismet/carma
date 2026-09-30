import { useEffect, useRef, useState, type CSSProperties } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import {
  createMeshMercatorLut,
  MESH_PROJECTION_ACCURACY,
  MESH_REPROJECTION_METHODS,
  MESH_REPROJECTION_MODE,
  type MeshMercatorLut,
} from "@carma-geo/proj";
import {
  createWuppertalStoryStyle,
  WUPPERTAL_TERRAIN_SOURCE_ID,
} from "./maplibre-story-style";
import {
  MESH_MOUNT_ANCHOR,
  MESH_MOUNT_BOUNDS,
  MESH_MOUNT_MODEL_PROBES,
  MESH_MOUNT_MODEL_RESIDUALS,
  MESH_MOUNT_PRESETS,
  MESH_MOUNT_VIEW,
  getMeshMountProjectionDiagnostics,
} from "./mesh-mount-presets";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MeshMountDemoOptions } from "./mesh-mount-demo-types";
import { useMeshMountRuntime } from "./use-mesh-mount-runtime";

type ViewportSnapshot = {
  width: number;
  height: number;
  left: number;
  top: number;
};
const textStyle: CSSProperties = {
  padding: "3px 6px",
  font: "12px/1.45 system-ui, sans-serif",
  background: "#fff",
};

/** One production mesh pool; resize and placement never reconstruct the map. */
export const MeshMountDemo = (options: MeshMountDemoOptions) => {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const stageRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<(() => void) | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  // Fast Refresh can retain the retired map in state until its successor loads.
  const liveMapRef = useRef<MapLibreMap | null>(null);
  const [meshStatus, setMeshStatus] = useState("waiting for map");
  const [projectionLut, setProjectionLut] = useState<MeshMercatorLut | null>(
    null
  );
  const [viewport, setViewport] = useState<ViewportSnapshot | null>(null);
  const [camera, setCamera] = useState<{
    longitude: number;
    latitude: number;
    zoom: number;
    pitch: number;
    verticalFovDegrees: number;
    groundMetersPerPixel: number;
  } | null>(null);
  const preset = MESH_MOUNT_PRESETS[options.view];
  const origin = MESH_MOUNT_PRESETS[MESH_MOUNT_VIEW.ROOT];
  // One fixed root for every comparison: moving the root would confound the
  // projection error with another mount transform.
  const mode = options.reprojectionMode ?? MESH_REPROJECTION_MODE.OFF;
  const method = MESH_REPROJECTION_METHODS[mode];
  const accuracy =
    options.projectionAccuracy && options.projectionAccuracy !== "custom"
      ? MESH_PROJECTION_ACCURACY[options.projectionAccuracy]
      : null;
  const projectionGridStepMeters =
    accuracy?.gridStepMeters ?? options.projectionGridStepMeters ?? 250;
  const mount = origin;
  const mountLongitude = mount.lngLat[0];
  const mountLatitude = mount.lngLat[1];
  const dataset = options.dataset ?? "mesh2024";
  const projectBasemap = options.projectBasemap !== false;
  const activeProjectionLut =
    method.method &&
    projectionLut?.options.method === method.method &&
    projectionLut.options.sampling === method.sampling &&
    projectionLut.options.gridStepMeters === projectionGridStepMeters
      ? projectionLut
      : null;
  useEffect(() => {
    let disposed = false;
    setProjectionLut(null);
    if (method.method) {
      setMeshStatus("preparing local projection LUT");
      void createMeshMercatorLut(
        {
          longitudeDegrees: mountLongitude,
          latitudeDegrees: mountLatitude,
          method: method.method,
          sampling: method.sampling,
          gridStepMeters: projectionGridStepMeters,
        },
        async () => {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
          if (disposed) throw new Error("Projection preparation cancelled");
        }
      )
        .then((lut) => {
          if (!disposed) setProjectionLut(lut);
        })
        .catch((error: unknown) => {
          if (!disposed) setMeshStatus(String(error));
        });
    }
    return () => {
      disposed = true;
    };
  }, [
    method.method,
    method.sampling,
    projectionGridStepMeters,
    mountLongitude,
    mountLatitude,
  ]);
  useEffect(() => {
    const container = containerRef.current;
    const viewportElement = viewportRef.current;
    const stage = stageRef.current;
    if (!container || !viewportElement || !stage) return;
    const initial = optionsRef.current;
    const nextMap = new maplibregl.Map({
      container,
      style: {
        ...createWuppertalStoryStyle("stadtplan"),
        ...(initial.maplibreTerrain
          ? {
              terrain: { source: WUPPERTAL_TERRAIN_SOURCE_ID, exaggeration: 1 },
            }
          : {}),
      },
      center: MESH_MOUNT_PRESETS[initial.view].lngLat,
      zoom: initial.zoom,
      pitch: initial.pitch,
      bearing: 0,
      maxPitch: 75,
      dragRotate: true,
      pitchWithRotate: true,
      touchPitch: true,
      maxZoom: 22,
      attributionControl: {},
    });
    liveMapRef.current = nextMap;
    nextMap.setVerticalFieldOfView(initial.verticalFovDegrees);
    nextMap.touchZoomRotate.disableRotation();
    nextMap.addControl(
      new maplibregl.NavigationControl({ showCompass: false })
    );
    let resizeFrame = 0;
    const resize = () => {
      if (resizeFrame !== 0) return;
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = 0;
        nextMap.resize();
        const rect = viewportElement.getBoundingClientRect();
        const stageRect = stage.getBoundingClientRect();
        const snapshot = {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          left: Math.round(rect.left - stageRect.left),
          top: Math.round(rect.top - stageRect.top),
        };
        setViewport((current) =>
          current &&
          current.width === snapshot.width &&
          current.height === snapshot.height &&
          current.left === snapshot.left &&
          current.top === snapshot.top
            ? current
            : snapshot
        );
      });
    };
    const reportCamera = () => {
      const center = nextMap.getCenter();
      const coordinate = maplibregl.MercatorCoordinate.fromLngLat(center, 0);
      const oneMeterEast = new maplibregl.MercatorCoordinate(
        coordinate.x + coordinate.meterInMercatorCoordinateUnits(),
        coordinate.y,
        0
      ).toLngLat();
      setCamera({
        longitude: center.lng,
        latitude: center.lat,
        zoom: nextMap.getZoom(),
        pitch: nextMap.getPitch(),
        verticalFovDegrees: nextMap.getVerticalFieldOfView(),
        // Public z=0 projection measures the actual map scale; no assumed
        // tile size, device-pixel ratio or private transform field is needed.
        groundMetersPerPixel:
          1 / nextMap.project(center).dist(nextMap.project(oneMeterEast)),
      });
    };
    resizeRef.current = resize;
    const observer = new ResizeObserver(resize);
    observer.observe(viewportElement);
    const onLoad = () => {
      setMap(nextMap);
      reportCamera();
      resize();
    };
    nextMap.once("load", onLoad);
    nextMap.on("moveend", reportCamera);
    return () => {
      observer.disconnect();
      resizeRef.current = null;
      if (resizeFrame !== 0) window.cancelAnimationFrame(resizeFrame);
      nextMap.off("load", onLoad);
      nextMap.off("moveend", reportCamera);
      if (liveMapRef.current === nextMap) liveMapRef.current = null;
      nextMap.remove();
    };
  }, []);

  useEffect(() => {
    if (map && map === liveMapRef.current) return options.onMapReady?.(map);
  }, [map, options.onMapReady]);

  useEffect(() => {
    if (
      !map ||
      map !== liveMapRef.current ||
      options.maplibreTerrain === undefined
    )
      return;
    const enabled = Boolean(map.getTerrain());
    if (enabled !== options.maplibreTerrain)
      map.setTerrain(
        options.maplibreTerrain
          ? { source: WUPPERTAL_TERRAIN_SOURCE_ID, exaggeration: 1 }
          : null
      );
  }, [map, options.maplibreTerrain]);

  useEffect(() => {
    if (!map || map !== liveMapRef.current) return;
    map.jumpTo({
      center: preset.lngLat,
      zoom: options.zoom,
      pitch: options.pitch,
      bearing: 0,
    });
  }, [map, preset, options.zoom, options.pitch]);

  useEffect(() => {
    // At pitch 0, fixed zoom and center retain the z=0 footprint when FOV
    // changes: MapLibre moves the perspective camera farther from the plane.
    if (map === liveMapRef.current)
      map?.setVerticalFieldOfView(options.verticalFovDegrees);
  }, [map, options.verticalFovDegrees]);

  useEffect(() => {
    resizeRef.current?.();
  }, [
    options.viewportWidth,
    options.viewportHeight,
    options.viewportPosition,
    options.animateViewport,
  ]);

  const runtimeGeneration = useMeshMountRuntime({
    map,
    liveMapRef,
    options,
    optionsRef,
    activeProjectionLut,
    mountLongitude,
    mountLatitude,
    setMeshStatus,
  });

  useEffect(() => {
    if (!map || map !== liveMapRef.current) return;
    for (const layer of map.getStyle().layers)
      if (layer.type === "raster")
        map.setPaintProperty(
          layer.id,
          "raster-opacity",
          options.basemapOpacity
        );
  }, [map, options.basemapOpacity]);

  const positionFactor =
    options.viewportPosition === "top-left"
      ? 0
      : options.viewportPosition === "bottom-right"
      ? 1
      : 0.5;
  const projection =
    viewport && camera
      ? getMeshMountProjectionDiagnostics({
          width: viewport.width,
          height: viewport.height,
          verticalFovDegrees: camera.verticalFovDegrees,
          groundMetersPerPixel: camera.groundMetersPerPixel,
        })
      : null;
  const modelResidual = MESH_MOUNT_MODEL_RESIDUALS[options.view];
  const modelProbe = MESH_MOUNT_MODEL_PROBES[options.view];
  const status = {
    mapProjection: "mercator",
    dataset,
    background: "stadtplan",
    maplibreTerrain: options.maplibreTerrain ?? false,
    projectBasemap,
    view: options.view,
    anchor: MESH_MOUNT_ANCHOR.ROOT,
    reprojectionMode: mode,
    projectionAccuracy: options.projectionAccuracy ?? "custom",
    projectionTargetMeters: accuracy?.targetMeters ?? null,
    flattenMesh: Boolean(method.method),
    cameraLocalFit: method.cameraFit,
    projectionGridStepMeters: projectionLut?.stepMeters,
    meshOpacity: 1,
    mountOrigin: [mountLongitude, mountLatitude],
    rootOrigin: origin.lngLat,
    rootWgs84HeightMeters: origin.wgs84HeightMeters,
    rootBounds: MESH_MOUNT_BOUNDS,
    viewNorthOfRootMeters: preset.northOfRootMeters,
    viewHorizontalDistanceFromRootMeters:
      preset.horizontalDistanceFromRootMeters,
    comparison: "selected comparison; coverage and residual require inspection",
    viewMercatorScaleFromRoot: preset.mercatorScaleFromRoot,
    viewLocationSource: preset.locationSource,
    modelProbeLngLat: modelProbe.lngLat,
    modelResidual: {
      ...modelResidual,
      meaning:
        "planar minus fixed-root rigid model at OBB probe; not measured mesh error",
    },
    viewport,
    camera,
    projection,
    runtimeGeneration,
    mesh: meshStatus,
    datum: "not certified by root metadata",
  };

  return (
    <div
      style={{
        height: options.compact ? "100%" : "100vh",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: "#dce1e6",
      }}
    >
      <style>{`
        @keyframes mesh-mount-viewport {
          0%, 100% { width: 100%; height: 100%; left: 0%; top: 0%; }
          50% { width: 58%; height: 68%; left: 38%; top: 28%; }
        }
      `}</style>
      <header style={{ ...textStyle, borderBottom: "1px solid #bfc8d0" }}>
        <strong>Mesh mount · {preset.label}</strong>
        <div hidden={options.compact}>
          {method.label}
          {accuracy && method.method
            ? ` · target ${options.projectionAccuracy} · ${projectionGridStepMeters} m lookup grid`
            : ""}
          {" · "}
          {mountLongitude.toFixed(8)}°, {mountLatitude.toFixed(8)}°{" · "}mesh{" "}
          100% / basemap {(options.basemapOpacity * 100).toFixed(0)}%
        </div>
        <div hidden={options.compact}>
          Narrow perspective, not orthographic · vertical FOV{" "}
          {options.verticalFovDegrees.toFixed(2)}° · constant z=0 ground scale
        </div>
      </header>
      <div
        ref={stageRef}
        style={{ position: "relative", flex: 1, minHeight: 0, margin: 1 }}
      >
        <div
          ref={viewportRef}
          data-test-id="mesh-mount-viewport"
          style={{
            position: "absolute",
            width: `${options.viewportWidth}%`,
            height: `${options.viewportHeight}%`,
            left: `${(100 - options.viewportWidth) * positionFactor}%`,
            top: `${(100 - options.viewportHeight) * positionFactor}%`,
            animation: options.animateViewport
              ? "mesh-mount-viewport 8s ease-in-out infinite"
              : "none",
            outline: "1px solid #647486",
            background: "#edf0f3",
          }}
        >
          <div
            ref={containerRef}
            data-test-id="mesh-mount-map"
            style={{ width: "100%", height: "100%" }}
          />
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
              color: "#fff",
              textShadow: "0 0 2px #000",
              font: "24px monospace",
            }}
          >
            +
          </span>
        </div>
      </div>
      <output
        data-test-id="mesh-mount-status"
        data-status={JSON.stringify(status)}
        style={{ ...textStyle, borderTop: "1px solid #bfc8d0" }}
      >
        <div hidden={options.compact}>
          {camera && camera.pitch > 0.01 ? (
            <>
              Tilt {camera.pitch.toFixed(1)}° · top-down parallax bound not
              applicable.
            </>
          ) : projection ? (
            <>
              Ground scale {projection.groundMetersPerPixel.toFixed(3)} m/CSS px
              {" · "}camera {(projection.cameraHeightMeters / 1000).toFixed(2)}{" "}
              km above z=0 · if |mesh z| ≤ {projection.reliefEnvelopeMeters} m,
              corner relief parallax{" "}
              {projection.reliefParallaxBoundMeters === null ? (
                "has no finite bound here (camera intersects height envelope)"
              ) : (
                <>
                  ≤ {projection.reliefParallaxBoundMeters.toFixed(2)} m /{" "}
                  {projection.reliefParallaxBoundPixels?.toFixed(2)} CSS px
                </>
              )}
            </>
          ) : (
            "Measuring camera and residual perspective"
          )}
        </div>
        <div>
          {meshStatus} · viewport{" "}
          {viewport
            ? `${viewport.width}×${viewport.height} at ${viewport.left},${viewport.top}`
            : "measuring"}{" "}
          · mesh instance {runtimeGeneration}
        </div>
        <div hidden={options.compact}>
          Root interpreted on WGS84: {origin.lngLat[0].toFixed(8)}°,{" "}
          {origin.lngLat[1].toFixed(8)}°, h=
          {origin.wgs84HeightMeters.toFixed(2)} m. Source horizontal/vertical
          datum remains unverified.
        </div>
        <div hidden={options.compact}>
          {dataset === "lod2" ? "LoD2" : "Mesh 2024"} / RVR city map · EPSG:3857
          raster source rendered by MapLibre.{" "}
          {method.method
            ? "Bounded nonlinear tile reprojection; not global."
            : method.cameraFit
            ? "Camera-local affine fit; not a globally flat scene."
            : "Rigid tangent mount baseline."}{" "}
          Root bounds do not certify coverage. Named comparison locations are
          not certified data-edge maxima.
        </div>
        <div>
          Selected comparison; not proven coverage extremum · horizontal
          distance from root{" "}
          {(preset.horizontalDistanceFromRootMeters / 1000).toFixed(3)} km
          {!options.compact &&
            " · separate OBB model probes remain in diagnostic data, not image error measurements."}
        </div>
      </output>
    </div>
  );
};
