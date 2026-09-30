import { useEffect, useRef, useState } from "react";
import { type Map as MapLibreMap } from "maplibre-gl";
import * as THREE from "three";
import { PI } from "@carma-units";
import {
  getMeshReprojectionCameraFit,
  MESH_REPROJECTION_METHODS,
  MESH_REPROJECTION_MODE,
  type MeshMercatorLut,
} from "@carma-geo/proj";
import { WUPP_MESH_2024, WUPP_LOD2_TILESET } from "@carma-commons/resources";
import {
  acquireSharedThreeScene,
  buildThreeTilesRuntime,
  notifySharedThreeSceneContentChanged,
  notifySharedThreeSceneRequestStateChanged,
  registerSharedThreeSceneRuntime,
  type ThreeTilesRuntime,
} from "@carma-mapping/engines/maplibre";
import meshParityStyle from "./data/mesh2024-cesium-parity.style.json";
import type { MutableRefObject } from "react";
import type { MeshMountDemoOptions } from "./mesh-mount-demo-types";

const MESH_RUNTIME_ID = "mesh-mount-diagnostic";

export const useMeshMountRuntime = ({
  map,
  liveMapRef,
  options,
  optionsRef,
  activeProjectionLut,
  mountLongitude,
  mountLatitude,
  setMeshStatus,
}: {
  map: MapLibreMap | null;
  liveMapRef: MutableRefObject<MapLibreMap | null>;
  options: MeshMountDemoOptions;
  optionsRef: MutableRefObject<MeshMountDemoOptions>;
  activeProjectionLut: MeshMercatorLut | null;
  mountLongitude: number;
  mountLatitude: number;
  setMeshStatus: (status: string) => void;
}) => {
  const mode = options.reprojectionMode ?? MESH_REPROJECTION_MODE.OFF;
  const method = MESH_REPROJECTION_METHODS[mode];
  const dataset = options.dataset ?? "mesh2024";
  const runtimeRef = useRef<ThreeTilesRuntime | null>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const drapeRef = useRef<(() => void) | null>(null);
  const runtimeSequence = useRef(0);
  const [runtimeGeneration, setRuntimeGeneration] = useState(0);
  useEffect(() => {
    if (
      !map ||
      map !== liveMapRef.current ||
      (method.method && !activeProjectionLut)
    )
      return;
    const lease = acquireSharedThreeScene(map);
    let disposed = false;
    let runtime: ThreeTilesRuntime | null = null;
    let contentReceived = false;
    let lastStatus = "loading mesh overlay";
    const reportReady = () => {
      if (disposed || !runtime) return;
      const pending = runtime.loading.getRequestDemand();
      const status = contentReceived
        ? pending > 0
          ? "mesh content received · requests pending"
          : "mesh content received · requests idle"
        : "loading mesh overlay";
      if (status === lastStatus) return;
      lastStatus = status;
      setMeshStatus(status);
    };
    setMeshStatus(lastStatus);
    runtime = buildThreeTilesRuntime(
      MESH_RUNTIME_ID,
      dataset === "lod2" ? WUPP_LOD2_TILESET.url : WUPP_MESH_2024.url,
      [mountLongitude, mountLatitude],
      {
        // Decision: opaque receivers with the addon style projection, not
        // translucent imagery overlays. See MESH_REFERENCE_DECISIONS.md#current-comparison-stories
        // in MESH_REFERENCE_DECISIONS.md.
        providesTerrain: false,
        mapStyleDrape: "none",
        outline: false,
        colorCorrection:
          dataset === "mesh2024" ? WUPP_MESH_2024.colorCorrection : undefined,
        entry:
          dataset === "mesh2024"
            ? meshParityStyle.metadata.carmaConf["3d"].entry
            : undefined,
        diagnostics: optionsRef.current.projectionBenchmarkProbe ?? false,
        tileTelemetry: false,
        cacheBudgetBytes: 1024 ** 3,
        mercatorProjection: activeProjectionLut ?? undefined,
        onContentChanged: (bounds, roots) => {
          if (disposed) return;
          if (roots && roots.length > 0) contentReceived = true;
          notifySharedThreeSceneContentChanged(map, { bounds, roots });
          reportReady();
        },
        onRequestStateChange: () => {
          if (disposed) return;
          notifySharedThreeSceneRequestStateChanged(map);
          reportReady();
        },
      }
    );
    runtime.loading.setErrorTarget(optionsRef.current.pixelError);
    runtime.appearance.setOpacity(1);
    runtimeRef.current = runtime;
    // Keep the loader, geometry and textures. A parent matrix changes render
    // AND native tile bounds together; no shader-only culling mismatch.
    const fitGroup = new THREE.Group();
    fitGroup.matrixAutoUpdate = false;
    for (const child of [...runtime.scene.root.children]) fitGroup.add(child);
    runtime.scene.root.add(fitGroup);
    const axisFlip = new THREE.Matrix4().makeRotationY(PI);
    const updateFit = () => {
      if (!runtime) return;
      const center = map.getCenter();
      const currentMode =
        optionsRef.current.reprojectionMode ?? MESH_REPROJECTION_MODE.OFF;
      try {
        fitGroup.matrix.copy(
          getMeshReprojectionCameraFit(
            currentMode,
            {
              longitudeDegrees: mountLongitude,
              latitudeDegrees: mountLatitude,
            },
            [center.lng, center.lat]
          )
        );
      } catch (error) {
        // Retain the last valid fit instead of submitting NaNs or identity when
        // the diagnostic camera leaves this explicitly local projection domain.
        setMeshStatus(String(error));
        return;
      }
      // Runtime's persistent parent flips plugin west/north to east/south.
      fitGroup.matrix.premultiply(axisFlip).multiply(axisFlip);
      runtime.scene.root.updateMatrixWorld(true);
      map.triggerRepaint();
    };
    fitRef.current = updateFit;
    const updateCameraFit = () => {
      const currentMode =
        optionsRef.current.reprojectionMode ?? MESH_REPROJECTION_MODE.OFF;
      if (MESH_REPROJECTION_METHODS[currentMode].cameraFit) updateFit();
    };
    map.on("move", updateCameraFit);
    updateFit();
    lease.layer.addRuntime(runtime.scene);
    const updateDrape = () => {
      if (!runtime) return;
      const enabled = optionsRef.current.projectBasemap !== false;
      // Reuse the addon receiver/material/capture path, not image blending.
      // Buildings receive the style but must not erase the bare-earth ground.
      runtime.scene.receivesMapStyleTexture = enabled;
      runtime.scene.mapStyleProjectionBlend = "replace";
      runtime.scene.providesTerrain = enabled && dataset === "mesh2024";
      lease.layer.setMapStyleProjectionVisible?.(enabled);
      map.triggerRepaint();
    };
    updateDrape();
    drapeRef.current = updateDrape;
    const unregister = registerSharedThreeSceneRuntime(map, runtime.scene);
    runtimeSequence.current += 1;
    setRuntimeGeneration(runtimeSequence.current);
    map.on("idle", reportReady);
    return () => {
      disposed = true;
      map.off("idle", reportReady);
      map.off("move", updateCameraFit);
      fitRef.current = null;
      drapeRef.current = null;
      runtimeRef.current = null;
      unregister();
      lease.layer.removeRuntime(MESH_RUNTIME_ID);
      lease.release();
    };
  }, [
    map,
    mountLongitude,
    mountLatitude,
    method.method,
    activeProjectionLut,
    dataset,
  ]);

  useEffect(() => {
    drapeRef.current?.();
  }, [options.projectBasemap]);

  useEffect(() => {
    fitRef.current?.();
  }, [mode]);

  useEffect(() => {
    runtimeRef.current?.loading.setErrorTarget(options.pixelError);
    if (map === liveMapRef.current) map?.triggerRepaint();
  }, [map, options.pixelError]);

  useEffect(() => {
    runtimeRef.current?.debug.setDiagnosticsEnabled(
      options.projectionBenchmarkProbe ?? false
    );
  }, [options.projectionBenchmarkProbe, runtimeGeneration]);
  return runtimeGeneration;
};
