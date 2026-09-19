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
import { Button } from "antd";
import { createTileDiagnosticOverlayComponent } from "./TileDiagnosticOverlay";
import { DiagnosticPanel } from "./DiagnosticPanel";
import { snapshotShadowCorridorCameras } from "./shadow-corridor-camera";

const RUNTIME_ID = "volume-tile-diagnostics";
/** Volumes carry no LOD error, so the error label has nothing to show. */
const LABEL_MODES = ["none", "id", "id and stats"] as const;
const LABEL_TITLES = {
  none: "ohne Beschriftung",
  id: "Kachel-ID",
  "id and stats": "ID, Grosse, Zeit, Perzentil",
} as const;
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
    const [labels, setLabels] = useState<(typeof LABEL_MODES)[number]>("none");
    const [followFrustums, setFollowFrustums] = useState(true);

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
      <DiagnosticPanel
        testId="volume-tile-diagnostics"
        title={`Kacheln ohne Tileset${
          tileCount === null ? "" : ` (${tileCount})`
        }`}
        actions={
          <>
            <Button
              size="small"
              type="text"
              className="tile-debug-header-toggle"
              data-test-id="volume-tile-diagnostics-follow"
              aria-pressed={followFrustums}
              title="Auf die Vereinigung aller Kamerastumpfe zoomen"
              onClick={() => setFollowFrustums((current) => !current)}
            >
              Sicht
            </Button>
            <Button
              size="small"
              type="text"
              className="tile-debug-header-toggle"
              data-test-id="volume-tile-diagnostics-labels"
              aria-pressed={labels !== "none"}
              title={LABEL_TITLES[labels]}
              onClick={() =>
                setLabels(
                  LABEL_MODES[
                    (LABEL_MODES.indexOf(labels) + 1) % LABEL_MODES.length
                  ]
                )
              }
            >
              {labels === "none" ? "ID aus" : labels === "id" ? "ID" : "ID+"}
            </Button>
            {onClose ? (
              <Button
                size="small"
                type="text"
                aria-label="Schliessen"
                onClick={onClose}
              >
                &times;
              </Button>
            ) : null}
          </>
        }
      >
        <div
          style={{
            position: "relative",
            width: WIDTH,
            height: HEIGHT,
            background: "rgb(12 18 32 / 86%)",
          }}
        >
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
            labels={labels}
            hover={null}
            showFrustum={true}
            updateOnRender={true}
            // On, the crop follows the union of every frustum, the main one and
            // the shadow corridor, as the story's overview does. Off, the model
            // frames the tiles the camera sees.
            followCamera={followFrustums}
            cameraFocus="all"
            followPaddingPercent={180}
          />
          {tileCount === 0 ? (
            <div
              data-test-id="volume-tile-diagnostics-empty"
              style={{ padding: "8px", color: "#f4fbff" }}
            >
              keine Kacheln geladen
            </div>
          ) : null}
        </div>
      </DiagnosticPanel>
    );
  };
  return VolumeTileDiagnostics;
};
