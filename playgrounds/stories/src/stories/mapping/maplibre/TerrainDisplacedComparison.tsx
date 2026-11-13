import { useEffect, useRef, useState } from "react";
import {
  Box3,
  Color,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ShadowController } from "@carma-mapping/shadow-simulation/three";
import { createDisplacedTerrainFixture } from "../../../../../../libraries/mapping/engines/three/primitives/src/lib/common/displaced-terrain/displaced-terrain-fixture";
import { createDisplacedTerrainPresentation } from "../../../../../../libraries/mapping/engines/three/primitives/src/lib/common/displaced-terrain/displaced-terrain-presentation";

export type TerrainDisplacedComparisonProps = {
  segments: number;
  tilesPerEdge: number;
  shadows: boolean;
  wireframe: boolean;
  sunHeading: number;
  sunElevation: number;
};

/** Offline representation comparison. Both panels use one prepared ECEF surface. */
export function TerrainDisplacedComparison(
  props: TerrainDisplacedComparisonProps
) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const settings = useRef(props);
  settings.current = props;
  const redraw = useRef(() => {});
  const [status, setStatus] = useState("Preparing identical terrain…");
  useEffect(() => redraw.current(), [props]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const renderer = new WebGLRenderer({ canvas: element, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.info.autoReset = false;
    const camera = new PerspectiveCamera(45, 1, 1, 100_000);
    const controls = new OrbitControls(camera, element);
    const scenes = [new Scene(), new Scene()];
    const fixture = createDisplacedTerrainFixture(
      props.segments,
      props.tilesPerEdge
    );
    scenes[0].add(fixture.root);
    const displaced = createDisplacedTerrainPresentation(scenes[0], scenes[1], {
      maxTextureSize: renderer.capabilities.maxTextureSize,
      maxArrayLayers: renderer
        .getContext()
        .getParameter(renderer.getContext().MAX_ARRAY_TEXTURE_LAYERS),
    });
    const bounds = new Box3().setFromPoints(fixture.receivers);
    const center = bounds.getCenter(new Vector3());
    const radius = bounds.getSize(new Vector3()).length() / 2;
    controls.target.copy(center);
    camera.position
      .copy(center)
      .addScaledVector(new Vector3(0, 1, 1.5).normalize(), radius * 3.7);
    controls.update();
    const controllers = scenes.map((scene) => {
      scene.background = new Color(0x17212b);
      scene.add(new HemisphereLight(0xd7ecff, 0x182312, 1.2));
      const controller = new ShadowController(scene);
      controller.setMaxShadowMapSize(2048);
      return controller;
    });
    let queuedFrame = 0,
      disposed = false;
    const draw = () => {
      queuedFrame = 0;
      if (disposed) return;
      const { shadows, wireframe, sunHeading, sunElevation } = settings.current;
      const width = element.clientWidth,
        height = element.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / (2 * height);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      fixture.material.wireframe = wireframe;
      const metrics = displaced.update();
      const azimuth = (sunHeading * Math.PI) / 180,
        elevation = (sunElevation * Math.PI) / 180;
      const direction = new Vector3(
        Math.sin(azimuth) * Math.cos(elevation),
        Math.sin(elevation),
        -Math.cos(azimuth) * Math.cos(elevation)
      );
      const drawCalls: number[] = [],
        submitMs: number[] = [];
      renderer.setScissorTest(true);
      scenes.forEach((scene, index) => {
        controllers[index].update({
          receiverWorldPoints: fixture.receivers,
          receiverAnchorWorldPosition: center,
          minimumElevationMeters: bounds.min.y,
          maximumElevationMeters: bounds.max.y,
          directionToSun: direction,
          color: 0xffe6ba,
          intensity: 3,
          shadowIntensity: shadows ? 1 : 0,
          quality: 4,
        });
        for (const light of controllers[index].lights)
          light.castShadow = shadows;
        renderer.setViewport((index * width) / 2, 0, width / 2, height);
        renderer.setScissor((index * width) / 2, 0, width / 2, height);
        renderer.info.reset();
        const start = performance.now();
        renderer.render(scene, camera);
        submitMs.push(performance.now() - start);
        drawCalls.push(renderer.info.render.calls);
      });
      renderer.setScissorTest(false);
      const sourceMiB = metrics.sourceBytes / 2 ** 20,
        displacedMiB = metrics.displacedBytes / 2 ** 20;
      setStatus(
        `Render buffers ${sourceMiB.toFixed(2)} → ${displacedMiB.toFixed(
          2
        )} MiB · ${metrics.instancedTiles} instanced / ${
          metrics.fallbackTiles
        } fallback · ${metrics.batches} batches · draw calls ${drawCalls.join(
          " / "
        )} · CPU submit ${submitMs
          .map((ms) => ms.toFixed(1))
          .join(" / ")} ms · vertex/matrix update ${(
          metrics.uploadedBytes / 1024
        ).toFixed(0)} KiB`
      );
    };
    const requestDraw = () => {
      if (!queuedFrame && !disposed) queuedFrame = requestAnimationFrame(draw);
    };
    redraw.current = requestDraw;
    controls.addEventListener("change", requestDraw);
    const observer = new ResizeObserver(requestDraw);
    observer.observe(element);
    requestDraw();
    return () => {
      disposed = true;
      if (queuedFrame) cancelAnimationFrame(queuedFrame);
      redraw.current = () => {};
      observer.disconnect();
      controls.dispose();
      displaced.dispose();
      fixture.dispose();
      controllers.forEach((controller) => controller.dispose());
      renderer.dispose();
    };
  }, [props.segments, props.tilesPerEdge]);
  return (
    <div
      style={{
        height: "100vh",
        position: "relative",
        background: "#17212b",
        color: "white",
      }}
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
          pointerEvents: "none",
        }}
      >
        ECEF · prepared CPU meshes
      </div>
      <div
        style={{
          position: "absolute",
          top: 12,
          left: "calc(50% + 12px)",
          pointerEvents: "none",
        }}
      >
        ECEF · lossless GPU displacement / instancing
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          right: 12,
          pointerEvents: "none",
        }}
      >
        <div>{status}</div>
        <div>
          Identical synthetic input · no network · CPU source buffers remain for
          picking / comparison · allocated render buffers, not driver memory ·
          CPU submit excludes GPU execution
        </div>
      </div>
    </div>
  );
}
