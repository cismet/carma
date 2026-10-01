import { useEffect, useRef, useState } from "react";
import { MercatorCoordinate } from "maplibre-gl";
import {
  Box3,
  Color,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createLocalEcefFrame, getGeodeticPatchBounds } from "@carma-geo/proj";
import { degToRad, type Degrees } from "@carma-units";
import { intersectUnwrappedGeographicBounds } from "@carma-geo/helpers";
import { ShadowController } from "@carma-mapping/shadow-simulation/three";
import { getTileBounds } from "@carma-mapping/engines/maplibre/terrain";
import { createTerrainComparisonRuntime } from "./terrain-comparison-runtime";
import { createTerrainEncodingPresentation } from "./terrain-encoding-presentation";
import type { MeshPositionBits } from "../../../../../../libraries/mapping/engines/three/primitives/src/lib/common/quantize-mesh-positions";
import {
  TERRAIN_COMPARISON_SOURCES,
  type TerrainComparisonSource,
} from "./terrain-comparison-sources";

type Props = {
  source: TerrainComparisonSource;
  longitude: number;
  latitude: number;
  level: number;
  segments: number;
  boxes: boolean;
  wireframe: boolean;
  shadows: boolean;
  sunHeading: number;
  sunElevation: number;
  encodingBits?: MeshPositionBits;
};

/** Two ordinary Three.js scenes share the same Terrarium data and camera.
 * No MapLibre map, story-specific ECEF formula or experimental shader is used. */
export const TerrainGeometryComparison = (props: Props) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const settings = useRef(props);
  settings.current = props;
  const redraw = useRef(() => {});
  const [status, setStatus] = useState("Loading raster tiles…");
  const [encodingStatus, setEncodingStatus] = useState("");
  const compareEncoding = props.encodingBits !== undefined;
  useEffect(() => redraw.current(), [props]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const abort = new AbortController();
    const renderer = new WebGLRenderer({
      canvas: element,
      antialias: true,
      logarithmicDepthBuffer: true,
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    const camera = new PerspectiveCamera(45, 1, 1, 500_000);
    const controls = new OrbitControls(camera, element);
    const scenes = [new Scene(), new Scene()];
    const renderScenes = compareEncoding ? [new Scene(), new Scene()] : scenes;
    const encoding = compareEncoding
      ? createTerrainEncodingPresentation(scenes[1], renderScenes)
      : null;
    let terrain: Awaited<
      ReturnType<typeof createTerrainComparisonRuntime>
    > | null = null;
    const shadows = renderScenes.map((scene) => {
      scene.background = new Color(0x17212b);
      scene.add(new HemisphereLight(0xd7ecff, 0x182312, 1.2));
      const controller = new ShadowController(scene);
      controller.setMaxShadowMapSize(2048);
      return controller;
    });
    let queuedFrame = 0;
    const draw = () => {
      queuedFrame = 0;
      if (abort.signal.aborted) return;
      const {
        boxes: showBoxes,
        wireframe,
        sunHeading,
        sunElevation,
        shadows: showShadows,
      } = settings.current;
      const azimuth = degToRad(sunHeading as Degrees);
      const elevation = degToRad(sunElevation as Degrees);
      const direction = new Vector3(
        Math.sin(azimuth) * Math.cos(elevation),
        Math.sin(elevation),
        -Math.cos(azimuth) * Math.cos(elevation)
      );
      const width = element.clientWidth,
        height = element.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / (2 * height);
      // Preserve precision from the source's largest tiles down to close-up
      // terrain inspection; a fixed one-metre near plane wastes depth at orbit.
      camera.near = Math.max(
        0.01,
        camera.position.distanceTo(controls.target) / 10_000
      );
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      const receivers = terrain?.update(
        camera,
        new Vector2(width / 2, height),
        controls.target,
        showBoxes,
        wireframe
      );
      if (encoding && settings.current.encodingBits) {
        const metrics = encoding.update(settings.current.encodingBits);
        const referenceMiB = metrics.referenceBytes / 2 ** 20;
        const encodedMiB = metrics.encodedBytes / 2 ** 20;
        const saved = metrics.referenceBytes
          ? 100 * (1 - metrics.encodedBytes / metrics.referenceBytes)
          : 0;
        const label = `Buffers ${referenceMiB.toFixed(
          2
        )} → ${encodedMiB.toFixed(2)} MiB · ${saved.toFixed(
          1
        )}% saved · max position error ${metrics.maximumError.toPrecision(
          3
        )} m · bound ${metrics.errorBound.toPrecision(3)} m`;
        setEncodingStatus((previous) =>
          previous === label ? previous : label
        );
      }
      renderer.setScissorTest(true);
      renderScenes.forEach((scene, index) => {
        const points = receivers?.[encoding ? 1 : index] ?? [];
        // Use the production shadow fit and raster-footprint bias. Fitting a
        // fixed multi-million-metre light box made nearby terrain self-shadow.
        const bounds = new Box3().setFromPoints(points);
        shadows[index].update({
          receiverWorldPoints: points,
          receiverAnchorWorldPosition: points.length
            ? bounds.getCenter(new Vector3())
            : controls.target,
          minimumElevationMeters: points.length ? bounds.min.y : 0,
          maximumElevationMeters: points.length ? bounds.max.y : 0,
          directionToSun: direction,
          color: 0xffe6ba,
          intensity: 3,
          shadowIntensity: showShadows ? 1 : 0,
          quality: 4,
        });
        for (const light of shadows[index].lights)
          light.castShadow = showShadows;
        const left = (index * width) / 2;
        renderer.setViewport(left, 0, width / 2, height);
        renderer.setScissor(left, 0, width / 2, height);
        renderer.render(scene, camera);
      });
      renderer.setScissorTest(false);
    };
    const requestDraw = () => {
      if (!queuedFrame && !abort.signal.aborted)
        queuedFrame = requestAnimationFrame(draw);
    };
    redraw.current = requestDraw;
    controls.addEventListener("change", requestDraw);
    const observer = new ResizeObserver(requestDraw);
    observer.observe(element);
    const start = async () => {
      const { longitude, latitude } = props;
      const resource = TERRAIN_COMPARISON_SOURCES[props.source];
      const level = Math.max(resource.minzoom, props.level);
      const origin = MercatorCoordinate.fromLngLat([longitude, latitude], 0);
      const scale = origin.meterInMercatorCoordinateUnits();
      const frame = createLocalEcefFrame(longitude, latitude);
      const tile = getTileBounds({
        level,
        x: Math.floor(origin.x * 2 ** level),
        y: Math.floor(origin.y * 2 ** level),
      });
      const [west, south, east, north] = resource.bounds;
      const tileBounds = intersectUnwrappedGeographicBounds(tile, {
        west,
        south,
        east,
        north,
      });
      if (!tileBounds)
        throw new RangeError("Origin tile lies outside the terrain source");
      const bounds = getGeodeticPatchBounds(
        tileBounds,
        [-100, 1000],
        frame.localFromEcef
      );
      for (const lng of [tileBounds.west, tileBounds.east])
        for (const lat of [tileBounds.south, tileBounds.north]) {
          const point = MercatorCoordinate.fromLngLat([lng, lat], 0);
          bounds.expandByPoint(
            new Vector3(
              (point.x - origin.x) / scale,
              0,
              (point.y - origin.y) / scale
            )
          );
        }
      const radius = bounds.getSize(new Vector3()).length() / 2;
      controls.target.set(0, 0, 0);
      const verticalAngle = degToRad(camera.fov as Degrees) / 2;
      const aspect = element.clientWidth / (2 * element.clientHeight);
      const limitingAngle = Math.min(
        verticalAngle,
        Math.atan(Math.tan(verticalAngle) * aspect)
      );
      camera.position
        .copy(controls.target)
        .addScaledVector(
          new Vector3(0, 1.2, 1.5).normalize(),
          (radius / Math.sin(limitingAngle) +
            bounds.getCenter(new Vector3()).length()) *
            1.05
        );
      camera.far = Math.max(10_000, radius * 12);
      controls.update();
      const runtime = await createTerrainComparisonRuntime({
        origin: [longitude, latitude],
        source: props.source,
        minimumLevel: level,
        segments: props.segments,
        scenes,
        requestDraw,
        setStatus,
        signal: abort.signal,
      });
      if (abort.signal.aborted) {
        runtime.dispose();
        return;
      }
      terrain = runtime;
      requestDraw();
    };
    void start().catch((error) => {
      if (!abort.signal.aborted) setStatus(String(error));
    });
    return () => {
      abort.abort();
      encoding?.dispose();
      terrain?.dispose();
      observer.disconnect();
      controls.dispose();
      if (queuedFrame) cancelAnimationFrame(queuedFrame);
      redraw.current = () => {};
      for (const controller of shadows) controller.dispose();
      renderer.dispose();
    };
  }, [
    props.source,
    props.longitude,
    props.latitude,
    props.level,
    props.segments,
    compareEncoding,
  ]);
  return (
    <div
      style={{ height: "100vh", position: "relative", background: "#17212b" }}
    >
      <canvas
        ref={canvas}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          color: "white",
          pointerEvents: "none",
        }}
      >
        {compareEncoding ? "ECEF · Float32 positions" : "Native flat Mercator"}
      </div>
      <div
        style={{
          position: "absolute",
          top: 12,
          left: "calc(50% + 12px)",
          color: "white",
          pointerEvents: "none",
        }}
      >
        {compareEncoding
          ? `ECEF · UInt${props.encodingBits === 8 ? 8 : 16} positions${
              props.encodingBits === 12 ? " · 12 effective bits" : ""
            }`
          : "ECEF · same terrain-manager cut"}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          color: "white",
        }}
      >
        <a
          href={TERRAIN_COMPARISON_SOURCES[props.source].sourceUrl}
          style={{ color: "inherit" }}
        >
          {props.source === "global"
            ? "Mapzen / Tilezen · source heights"
            : "Geobasis NRW · DHHN2016"}
        </a>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 12,
          right: 12,
          color: "white",
          pointerEvents: "none",
        }}
      >
        {compareEncoding && <div>{encodingStatus}</div>}
        {status}
      </div>
    </div>
  );
};
