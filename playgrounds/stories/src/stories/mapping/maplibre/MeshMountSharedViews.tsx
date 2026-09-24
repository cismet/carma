import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import {
  MOUSE,
  OrthographicCamera,
  Raycaster,
  Vector2,
  Vector3,
  type Object3D,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { degToRadNumeric } from "@carma-units";
import { WUPP_MESH_2024 } from "@carma-commons/resources";
import {
  acquireSharedThreeScene,
  buildThreeTilesRuntime,
  createSharedThreeSceneCameraPreview,
  notifySharedThreeSceneContentChanged,
  notifySharedThreeSceneRequestStateChanged,
  registerSharedThreeSceneRuntime,
  TILE_CAMERA_PRIORITY,
  TILE_CAMERA_ROLE,
} from "@carma-mapping/engines/maplibre";
import type { MeshMountDemoOptions } from "./MeshMountDemo";
import { MESH_MOUNT_PRESETS, MESH_MOUNT_VIEW } from "./mesh-mount-presets";
import { createWuppertalStoryStyle } from "./maplibre-story-style";
import meshParityStyle from "./data/mesh2024-cesium-parity.style.json";
import "maplibre-gl/dist/maplibre-gl.css";
import { meshOverlapEye, meshOverlapFlight } from "./mesh-overlap-flight";

export type MeshMountSharedViewsOptions = MeshMountDemoOptions & {
  animateOverlap?: boolean;
  meshOnlyFlight?: boolean;
};

/** One local world and resident pool; the second canvas is an asynchronous image. */
export const MeshMountSharedViews = (options: MeshMountSharedViewsOptions) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const updateRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState("Waiting for the shared scene");
  const secondary =
    MESH_MOUNT_PRESETS[
      options.view === MESH_MOUNT_VIEW.ROOT
        ? MESH_MOUNT_VIEW.NORTH
        : options.view
    ];

  useEffect(() => {
    if (!hostRef.current || !previewRef.current) return;
    const canvas = previewRef.current;
    const root = MESH_MOUNT_PRESETS[MESH_MOUNT_VIEW.ROOT];
    const map = new maplibregl.Map({
      container: hostRef.current,
      style: optionsRef.current.meshOnlyFlight
        ? {
            version: 8,
            sources: {},
            layers: [
              {
                id: "background",
                type: "background",
                paint: { "background-color": "#18212b" },
              },
            ],
          }
        : createWuppertalStoryStyle("stadtplan"),
      center: root.lngLat,
      zoom: optionsRef.current.zoom,
      pitch: optionsRef.current.pitch,
      maxPitch: 75,
      maxZoom: 24,
      attributionControl: {},
    });
    let cleanupScene = () => {};
    let disposed = false;
    const onLoad = () => {
      const lease = acquireSharedThreeScene(map);
      const preview = createSharedThreeSceneCameraPreview(lease.layer);
      const camera = new OrthographicCamera(-200, 200, 200, -200, 1, 20000);
      const controls = new OrbitControls(camera, canvas.parentElement!);
      controls.enableDamping = false;
      controls.screenSpacePanning = true;
      controls.mouseButtons.LEFT = MOUSE.PAN;
      controls.mouseButtons.RIGHT = MOUSE.ROTATE;
      controls.minPolarAngle = 0.001;
      controls.maxPolarAngle = Math.PI / 2 - 0.001;
      camera.up.set(0, 1, 0);
      const cameraId = "mesh-mount-secondary";
      let dirty = true;
      let configured = false;
      let busy = false;
      let frame = 0;
      let completed = 0;
      let cameraPreset = "";
      let mainPreset = "";
      let flightFrame = 0;
      let flightElapsed = 16;
      let flightLastTime = 0;
      let applyingFlight = false;
      let secondaryFlightZoom: number | null = null;
      let lastPreviewStart = 0;
      let previewTimer = 0;
      let interacting = false;
      const probe = new Raycaster();
      const centerNdc = new Vector2();
      const probeCenter = () => {
        const started = performance.now();
        // Probe the visible mesh once per gesture, never every pointer move.
        camera.updateMatrixWorld(true);
        probe.setFromCamera(centerNdc, camera);
        probe.near = camera.near;
        probe.far = camera.far;
        const candidates: Object3D[] = [];
        lease.layer.getScene().traverseVisible((object) => {
          if ((object as Object3D & { isMesh?: boolean }).isMesh)
            candidates.push(object);
        });
        const hit = probe.intersectObjects(candidates, false)[0];
        if (hit) controls.target.copy(hit.point);
        record(timings.probe, started);
      };
      canvas.parentElement!.addEventListener("pointerdown", probeCenter, true);
      const timings = {
        configure: [] as number[],
        readbackWall: [] as number[],
        blit: [] as number[],
        probe: [] as number[],
      };
      const record = (values: number[], start: number) => {
        values.push(performance.now() - start);
        if (values.length > 256) values.shift();
      };
      // Diagnostic access for repeatable stage profiling, scoped to this story canvas.
      Object.assign(canvas, {
        previewTimings: timings,
        previewPose: () => ({
          position: camera.position.toArray(),
          target: controls.target.toArray(),
          zoom: camera.zoom,
        }),
      });
      const invalidate = () => {
        dirty = true;
        map.triggerRepaint();
      };
      const runtime = buildThreeTilesRuntime(
        "mesh-mount-shared",
        WUPP_MESH_2024.url,
        root.lngLat,
        {
          providesTerrain: false,
          mapStyleDrape: "none",
          outline: false,
          colorCorrection: WUPP_MESH_2024.colorCorrection,
          entry: meshParityStyle.metadata.carmaConf["3d"].entry,
          diagnostics: optionsRef.current.animateOverlap === true,
          tileTelemetry: false,
          cacheBudgetBytes: 6 * 1024 ** 3,
          onContentChanged: (bounds, roots) => {
            if (disposed) return;
            notifySharedThreeSceneContentChanged(map, { bounds, roots });
            invalidate();
          },
          onRequestStateChange: () => {
            if (!disposed) notifySharedThreeSceneRequestStateChanged(map);
          },
        }
      );
      lease.layer.addRuntime(runtime.scene);
      Object.assign(canvas, {
        sharedPoolDiagnostics: () => ({
          requestedErrorTarget: optionsRef.current.pixelError,
          memoryErrorTarget: runtime.loading.getMemoryErrorTarget(),
          requestDemand: runtime.loading.getRequestDemand(),
          coverage: runtime.loading.getCoverageStatus(),
          mainViewReady: runtime.scene.isMainViewReady(),
        }),
      });
      const unregister = registerSharedThreeSceneRuntime(map, runtime.scene);
      const configure = () => {
        if (disposed) return;
        const started = performance.now();
        const current = optionsRef.current;
        const site =
          MESH_MOUNT_PRESETS[
            current.view === MESH_MOUNT_VIEW.ROOT
              ? MESH_MOUNT_VIEW.NORTH
              : current.view
          ];
        const target = lease.layer.projectLngLatToScene(
          site.lngLat,
          site.wgs84HeightMeters
        );
        if (!target) return;
        const width = Math.max(1, Math.round(canvas.clientWidth));
        const height = Math.max(1, Math.round(canvas.clientHeight));
        const nextPreset = `${current.view}:${current.zoom}:${current.pitch}`;
        if (nextPreset !== cameraPreset) secondaryFlightZoom = null;
        // Match the main map's ground-plane scale, using public projection APIs.
        const coordinate = maplibregl.MercatorCoordinate.fromLngLat(
          site.lngLat
        );
        const pixelsPerMeter =
          coordinate.meterInMercatorCoordinateUnits() *
          512 *
          2 ** (secondaryFlightZoom ?? current.zoom);
        const span = width / Math.max(0.001, pixelsPerMeter);
        camera.left = -span / 2;
        camera.right = span / 2;
        camera.top = (span * height) / width / 2;
        camera.bottom = -camera.top;
        if (nextPreset !== cameraPreset) {
          cameraPreset = nextPreset;
          camera.zoom = 1;
          camera.position
            .copy(target)
            .add(
              new Vector3(0, 5000, 0).applyAxisAngle(
                new Vector3(1, 0, 0),
                Math.max(0.001, degToRadNumeric(current.pitch))
              )
            );
          camera.lookAt(target);
          controls.target.copy(target);
          controls.update();
        }
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(true);
        lease.layer.setTileCameraView({
          id: cameraId,
          camera,
          viewport: [width, height],
          errorTargetPixels: current.pixelError,
          role: TILE_CAMERA_ROLE.RECEIVER,
          priority: TILE_CAMERA_PRIORITY.SECONDARY,
        });
        configured = true;
        invalidate();
        record(timings.configure, started);
      };
      const onControlsChange = () => {
        if (!applyingFlight) configure();
      };
      controls.addEventListener("change", onControlsChange);
      const startInteraction = () => {
        interacting = true;
      };
      const endInteraction = () => {
        interacting = false;
        invalidate();
      };
      controls.addEventListener("start", startInteraction);
      controls.addEventListener("end", endInteraction);
      const onRender = () => {
        if (document.hidden) return;
        if (!configured) configure();
        if (!configured || !dirty || busy || frame || disposed) return;
        const wait = 100 - (performance.now() - lastPreviewStart);
        if (wait > 0) {
          if (!previewTimer)
            previewTimer = window.setTimeout(() => {
              previewTimer = 0;
              if (!disposed && dirty) map.triggerRepaint();
            }, wait);
          return;
        }
        // Leave MapLibre's render callback before asking the shared idle renderer.
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (disposed) return;
          dirty = false;
          busy = true;
          const started = performance.now();
          lastPreviewStart = started;
          // Bound readback + CPU publication independently of CSS/device size.
          // Latest dirty pose wins; never queue multiple preview renders.
          const resolution = Math.min(
            interacting ? 0.5 : 1,
            Math.sqrt(
              (512 * 512) /
                Math.max(1, canvas.clientWidth * canvas.clientHeight)
            )
          );
          void preview
            .renderAsync(
              camera,
              Math.max(1, Math.round(canvas.clientWidth * resolution)),
              Math.max(1, Math.round(canvas.clientHeight * resolution)),
              (pixels, width, height) => {
                if (disposed) return;
                record(timings.readbackWall, started);
                const blitStarted = performance.now();
                // Publish completed camera frames while moving; dropping every
                // superseded frame starves visual feedback during a drag.
                if (canvas.width !== width) canvas.width = width;
                if (canvas.height !== height) canvas.height = height;
                canvas
                  .getContext("2d")
                  ?.putImageData(
                    new ImageData(
                      new Uint8ClampedArray(
                        pixels.buffer,
                        pixels.byteOffset,
                        pixels.byteLength
                      ),
                      width,
                      height
                    ),
                    0,
                    0
                  );
                record(timings.blit, blitStarted);
                completed += 1;
                setStatus(
                  `One runtime · one 6 GiB pool · ${completed} preview updates`
                );
              }
            )
            .catch((error: unknown) => {
              if (!disposed) setStatus(String(error));
            })
            .finally(() => {
              busy = false;
              if (!disposed && dirty) map.triggerRepaint();
            });
        });
      };
      const fly = (now: number) => {
        flightFrame = 0;
        if (disposed || !optionsRef.current.animateOverlap) {
          flightLastTime = 0;
          return;
        }
        if (flightLastTime)
          flightElapsed += Math.min(0.1, (now - flightLastTime) / 1000);
        flightLastTime = now;
        const pose = meshOverlapFlight(flightElapsed);
        const eye = meshOverlapEye(pose.pitch, pose.bearing);
        secondaryFlightZoom = pose.secondaryZoom;
        const metersPerDegree = 111320;
        const longitudeScale =
          metersPerDegree * Math.cos(degToRadNumeric(root.lngLat[1]));
        const lngLat = (
          offset: readonly [number, number]
        ): [number, number] => [
          root.lngLat[0] + offset[0] / longitudeScale,
          root.lngLat[1] + offset[1] / metersPerDegree,
        ];
        let mainZoom = pose.mainZoom;
        let secondaryZoom = pose.secondaryZoom;
        let surfaceElevation = root.wgs84HeightMeters;
        const mainLngLat = lngLat(pose.mainOffset);
        const secondaryLngLat = lngLat(pose.secondaryOffset);
        const surfaceCandidates: Object3D[] = [];
        if (optionsRef.current.meshOnlyFlight)
          lease.layer.getScene().traverseVisible((object) => {
            if ((object as Object3D & { isMesh?: boolean }).isMesh)
              surfaceCandidates.push(object);
          });
        const surfaceAt = (location: [number, number]) => {
          const point = lease.layer.projectLngLatToScene(
            location,
            root.wgs84HeightMeters
          );
          if (!point) return null;
          probe.set(
            point.clone().add(new Vector3(0, 10000, 0)),
            new Vector3(0, -1, 0)
          );
          probe.near = 0;
          probe.far = 20000;
          return (
            probe.intersectObjects(surfaceCandidates, false)[0]?.point ?? null
          );
        };
        let secondarySurface: Vector3 | null = null;
        if (optionsRef.current.meshOnlyFlight) {
          // Probe below the eye, not the pitched look-at point: on slopes
          // these are different elevations. Both eyes remain 20 m above mesh.
          const eyeLocation = (offset: readonly [number, number]) =>
            lngLat([offset[0] + eye.east, offset[1] + eye.north]);
          const mainSurface = surfaceAt(eyeLocation(pose.mainOffset));
          const secondaryEyeSurface = surfaceAt(
            eyeLocation(pose.secondaryOffset)
          );
          secondarySurface = lease.layer.projectLngLatToScene(
            secondaryLngLat,
            root.wgs84HeightMeters
          );
          if (secondarySurface && secondaryEyeSurface)
            secondarySurface.y = secondaryEyeSurface.y;
          // Do not fly blind below unknown geometry while initial coverage loads.
          if (!mainSurface || !secondarySurface || !secondaryEyeSurface) {
            flightLastTime = 0;
            flightFrame = requestAnimationFrame(fly);
            return;
          }
          const origin = lease.layer.projectLngLatToScene(
            mainLngLat,
            root.wgs84HeightMeters
          )!;
          surfaceElevation += mainSurface.y - origin.y;
          const distance = eye.distance;
          const pixelsPerMeter =
            map.getCanvas().clientHeight /
            (2 *
              Math.tan(
                degToRadNumeric(optionsRef.current.verticalFovDegrees) / 2
              ) *
              distance);
          mainZoom = Math.log2(
            pixelsPerMeter /
              (512 *
                maplibregl.MercatorCoordinate.fromLngLat(
                  mainLngLat
                ).meterInMercatorCoordinateUnits())
          );
          secondaryZoom = mainZoom - (pose.mainZoom - pose.secondaryZoom);
          map.setCenterClampedToGround(false);
        }
        secondaryFlightZoom = secondaryZoom;
        map.jumpTo({
          center: mainLngLat,
          zoom: mainZoom,
          elevation: surfaceElevation,
          pitch: pose.pitch,
          bearing: pose.bearing,
        });
        const target =
          secondarySurface ??
          lease.layer.projectLngLatToScene(
            secondaryLngLat,
            root.wgs84HeightMeters
          );
        if (target) {
          const width = Math.max(1, Math.round(canvas.clientWidth));
          const height = Math.max(1, Math.round(canvas.clientHeight));
          const scale =
            maplibregl.MercatorCoordinate.fromLngLat(
              secondaryLngLat
            ).meterInMercatorCoordinateUnits() *
            512 *
            2 ** secondaryZoom;
          const span = width / scale;
          camera.left = -span / 2;
          camera.right = span / 2;
          camera.top = (span * height) / width / 2;
          camera.bottom = -camera.top;
          camera.zoom = 1;
          controls.target.copy(target);
          camera.position
            .copy(target)
            .add(
              new Vector3(
                0,
                optionsRef.current.meshOnlyFlight
                  ? 20 / Math.cos(degToRadNumeric(pose.pitch))
                  : 5000,
                0
              )
                .applyAxisAngle(
                  new Vector3(1, 0, 0),
                  Math.max(0.001, degToRadNumeric(pose.pitch))
                )
                .applyAxisAngle(
                  new Vector3(0, 1, 0),
                  -degToRadNumeric(pose.bearing)
                )
            );
          camera.lookAt(target);
          applyingFlight = true;
          controls.update();
          applyingFlight = false;
          camera.updateProjectionMatrix();
          camera.updateMatrixWorld(true);
          lease.layer.setTileCameraView({
            id: cameraId,
            camera,
            viewport: [width, height],
            errorTargetPixels: optionsRef.current.pixelError,
            role: TILE_CAMERA_ROLE.RECEIVER,
            priority: TILE_CAMERA_PRIORITY.SECONDARY,
          });
          Object.assign(canvas, {
            overlapFlight: {
              ...pose,
              mainZoom,
              secondaryZoom,
              eyeClearanceMeters: optionsRef.current.meshOnlyFlight ? 20 : null,
            },
          });
          configured = true;
          invalidate();
        }
        flightFrame = requestAnimationFrame(fly);
      };
      const update = () => {
        if (disposed || !map.getStyle()) return;
        const current = optionsRef.current;
        if (map.getVerticalFieldOfView() !== current.verticalFovDegrees)
          map.setVerticalFieldOfView(current.verticalFovDegrees);
        const nextMainPreset = `${current.zoom}:${current.pitch}`;
        if (nextMainPreset !== mainPreset) {
          mainPreset = nextMainPreset;
          map.jumpTo({ zoom: current.zoom, pitch: current.pitch });
        }
        runtime.scene.root.updateMatrixWorld(true);
        runtime.loading.setErrorTarget(current.pixelError);
        runtime.appearance.setOpacity(1);
        for (const layer of map.getStyle().layers)
          if (layer.type === "raster")
            map.setPaintProperty(
              layer.id,
              "raster-opacity",
              current.basemapOpacity
            );
        configure();
        if (current.animateOverlap && !flightFrame)
          flightFrame = requestAnimationFrame(fly);
        if (!current.animateOverlap) {
          if (flightFrame) cancelAnimationFrame(flightFrame);
          flightFrame = 0;
          flightLastTime = 0;
        }
      };
      updateRef.current = update;
      const observer = new ResizeObserver(() => {
        map.resize();
        configure();
      });
      observer.observe(canvas);
      map.on("render", onRender);
      update();
      cleanupScene = () => {
        updateRef.current = null;
        observer.disconnect();
        controls.removeEventListener("change", onControlsChange);
        controls.removeEventListener("start", startInteraction);
        controls.removeEventListener("end", endInteraction);
        canvas.parentElement!.removeEventListener(
          "pointerdown",
          probeCenter,
          true
        );
        controls.dispose();
        map.off("render", onRender);
        if (frame) cancelAnimationFrame(frame);
        if (previewTimer) window.clearTimeout(previewTimer);
        if (flightFrame) cancelAnimationFrame(flightFrame);
        lease.layer.removeTileCameraView(cameraId);
        preview.dispose();
        unregister();
        lease.layer.removeRuntime(runtime.scene.id);
        lease.release();
      };
    };
    map.once("load", onLoad);
    return () => {
      disposed = true;
      updateRef.current = null;
      map.off("load", onLoad);
      cleanupScene();
      map.remove();
    };
  }, []);

  useEffect(
    () => updateRef.current?.(),
    [
      options.view,
      options.zoom,
      options.pitch,
      options.verticalFovDegrees,
      options.pixelError,
      options.basemapOpacity,
      options.animateOverlap,
    ]
  );

  return (
    <section
      style={{
        height: "100vh",
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        font: "12px system-ui",
      }}
    >
      <header style={{ padding: "4px 6px" }}>
        Shared local-tangent world, fixed root mount — Mercator · secondary
        preview ≤10 Hz, ≤262144 pixels — not a global-extent proof. Main camera
        has priority; secondary demand reuses the same mesh residency.
      </header>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          minHeight: 0,
        }}
      >
        <div style={{ position: "relative", minWidth: 0 }}>
          <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />
          <span
            style={{
              position: "absolute",
              top: 4,
              left: 4,
              background: "white",
            }}
          >
            Root · interactive main map
          </span>
        </div>
        <div style={{ position: "relative", minWidth: 0 }}>
          <canvas
            ref={previewRef}
            style={{
              width: "100%",
              height: "100%",
              display: "block",
              transform: "scaleY(-1)",
              background: "#ddd",
            }}
          />
          <span
            style={{
              position: "absolute",
              top: 4,
              left: 4,
              background: "white",
            }}
          >
            {options.meshOnlyFlight
              ? "Secondary orbit · 20 m above mesh"
              : secondary.label}{" "}
            · drag to pan · right-drag up to tilt · wheel to zoom ·
            center-surface pivot
          </span>
        </div>
      </div>
      <footer style={{ padding: "4px 6px" }}>
        {status} · Readbacks stop when camera, size and content stay unchanged.
      </footer>
    </section>
  );
};
