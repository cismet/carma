import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  acquireSharedThreeScene,
  type SharedThreeSceneFrame,
  type SharedThreeSceneRuntime,
  type SharedThreeSceneTileVolume,
  type TileCameraSnapshot,
  type TileDiagnosticModel as OverlayModel,
  type TileDiagnostics,
} from "@carma-mapping/engines/maplibre";
import { createTileDiagnosticOverlayComponent } from "./TileDiagnosticOverlay";
import { snapshotShadowCorridorCameras } from "./shadow-corridor-camera";

const RUNTIME_ID = "volume-tile-diagnostics";
const WIDTH = 360;
const HEIGHT = 300;
/** The model is geometry work; the camera is a matrix copy and stays live. */
const REBUILD_INTERVAL_MS = 250;

export type VolumeTileDiagnosticsProps = {
  map: MapLibreMap;
  onClose?: () => void;
};

/**
 * The tile overview for sources that have no 3D Tiles tree to frame it, so a
 * session with terrain alone can still be inspected: the runtimes hand over
 * their tile boxes, the main camera and the shadow corridor cut them.
 */
export const createVolumeTileDiagnostics = (diagnostics: TileDiagnostics) => {
  const Overlay = createTileDiagnosticOverlayComponent(diagnostics);

  const VolumeTileDiagnostics = ({
    map,
    onClose,
  }: VolumeTileDiagnosticsProps) => {
    const modelListeners = useRef(new Set<(model: OverlayModel) => void>());
    const cameraListeners = useRef(
      new Set<
        (camera: THREE.Camera, cameras: readonly TileCameraSnapshot[]) => void
      >()
    );
    const latestModel = useRef<OverlayModel | null>(null);
    const liveCamera = useRef<THREE.Camera | null>(null);
    const liveCameras = useRef<readonly TileCameraSnapshot[]>([]);
    const [tileCount, setTileCount] = useState<number | null>(null);

    const subscribeModel = useCallback(
      (listener: (model: OverlayModel) => void) => {
        modelListeners.current.add(listener);
        if (latestModel.current) listener(latestModel.current);
        return () => {
          modelListeners.current.delete(listener);
        };
      },
      []
    );
    const subscribeCamera = useCallback(
      (
        listener: (
          camera: THREE.Camera,
          cameras: readonly TileCameraSnapshot[]
        ) => void
      ) => {
        cameraListeners.current.add(listener);
        if (liveCamera.current)
          listener(liveCamera.current, liveCameras.current);
        return () => {
          cameraListeners.current.delete(listener);
        };
      },
      []
    );

    useEffect(() => {
      const lease = acquireSharedThreeScene(map);
      let disposed = false;
      let renderCamera: THREE.Camera | null = null;
      let corridor: readonly TileCameraSnapshot[] = [];
      let work: (() => void) | null = null;
      let rebuiltAt = 0;
      const collect = (): readonly SharedThreeSceneTileVolume[] =>
        lease.layer
          .getRuntimes()
          .filter(
            (runtime) =>
              runtime.id !== RUNTIME_ID && runtime.getActiveTileVolumes
          )
          .flatMap((runtime) => runtime.getActiveTileVolumes?.() ?? []);
      const publish = () => {
        work = null;
        if (disposed || !renderCamera) return;
        renderCamera.updateWorldMatrix(true, false);
        liveCamera.current = renderCamera;
        liveCameras.current = corridor;
        for (const listener of cameraListeners.current)
          listener(renderCamera, corridor);
        const now = performance.now();
        if (now - rebuiltAt < REBUILD_INTERVAL_MS) return;
        rebuiltAt = now;
        const volumes = collect();
        setTileCount(volumes.length);
        const model = diagnostics.buildVolumeOverlayModel({
          volumes,
          camera: {
            id: "overview-live",
            projectionMatrix: renderCamera.projectionMatrix.toArray(),
            matrixWorld: renderCamera.matrixWorld.toArray(),
            coordinateSystem: renderCamera.coordinateSystem,
            reversedDepth: renderCamera.reversedDepth,
            viewport: [WIDTH, HEIGHT],
            errorTargetPixels: 1,
            role: "receiver",
          },
          shadowCamera: corridor[0] ?? null,
          width: WIDTH,
          height: HEIGHT,
        });
        if (!model) return;
        latestModel.current = model;
        for (const listener of modelListeners.current) listener(model);
      };
      const schedule = () => {
        if (!work) work = diagnostics.scheduleTileDiagnosticTask(publish, true);
      };
      const runtime: SharedThreeSceneRuntime = {
        id: RUNTIME_ID,
        originLngLat: [map.getCenter().lng, map.getCenter().lat],
        root: new THREE.Group(),
        update(frame: SharedThreeSceneFrame) {
          renderCamera = frame.renderCamera;
          schedule();
        },
        setShadowView(view) {
          corridor = snapshotShadowCorridorCameras(view);
          rebuiltAt = 0;
          schedule();
        },
        dispose() {
          modelListeners.current.clear();
          cameraListeners.current.clear();
        },
      };
      lease.layer.addRuntime(runtime);
      map.triggerRepaint();
      return () => {
        disposed = true;
        work = null;
        lease.layer.removeRuntime(RUNTIME_ID);
        lease.release();
      };
    }, [map]);

    return (
      <div
        data-test-id="volume-tile-diagnostics"
        style={{
          position: "fixed",
          left: 64,
          top: 96,
          zIndex: 6000,
          background: "rgba(12, 18, 32, 0.86)",
          color: "#f4fbff",
          borderRadius: 4,
          font: "12px/1.4 system-ui, sans-serif",
          boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "4px 8px",
          }}
        >
          <span>
            Kacheln ohne Tileset
            {tileCount === null ? "" : ` (${tileCount})`}
          </span>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Schliessen"
              style={{
                background: "none",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              &times;
            </button>
          ) : null}
        </div>
        <div style={{ position: "relative", width: WIDTH, height: HEIGHT }}>
          <Overlay
            subscribeModel={subscribeModel}
            subscribeCamera={subscribeCamera}
            freeView={null}
            up="tileset"
            interactive={false}
            onViewChange={() => undefined}
            onHover={() => undefined}
            opacity={1}
            popout={true}
            labels="none"
            hover={null}
            showFrustum={true}
            updateOnRender={true}
            followCamera={false}
          />
          {tileCount === 0 ? (
            <div
              data-test-id="volume-tile-diagnostics-empty"
              style={{ padding: "8px" }}
            >
              keine Kacheln geladen
            </div>
          ) : null}
        </div>
      </div>
    );
  };
  return VolumeTileDiagnostics;
};
