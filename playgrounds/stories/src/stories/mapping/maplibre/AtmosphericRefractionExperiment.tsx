/// <reference types="@webgpu/types" />
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  NORDHELLE_LANDMARKS,
  NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
} from "@carma-commons/resources";
import { getGcg2016HeightAnomalies } from "@carma-geo/proj";
import type { LngLatArray } from "@carma-geo/data-structures";
import { acquireRasterDemTerrainTileSource } from "../../../../../../libraries/mapping/engines/maplibre/src/lib/runtime/integrations/raster-dem-terrain-tile-source";
import { AtmosphericSunlightEvaluator } from "../../../../../../libraries/mapping/shadow-simulation/src/lib/runtime/atmospheric-sunlight";
import { buildAtmosphericSky } from "../../../../../../libraries/mapping/shadow-simulation/src/lib/runtime/atmospheric-sky";
import {
  createReferenceFrame,
  localGroundLngLat,
  projectGeodeticToScene,
} from "./reference-surface-frame";
import { TERRAIN_GEOMETRY_MODE } from "./reference-surface-types";
import { shader } from "./atmospheric-refraction-shader";
import { presets } from "./atmospheric-refraction-settings";
import type { Args } from "./atmospheric-refraction-settings";

export const RefractionExperiment = (args: Args) => {
  const { verticalFov, steps } = args;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("Initializing WebGPU…");
  const settings = useRef(args);
  settings.current = {
    ...args,
    ...(args.preset === "custom" ? {} : presets[args.preset]),
  };
  const redraw = useRef(() => {});
  useEffect(() => redraw.current(), [args]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const abort = new AbortController();
    let device: GPUDevice | undefined;
    let texture: GPUTexture | undefined;
    let uniforms: GPUBuffer | undefined;
    let observer: ResizeObserver | undefined;
    let release = () => {};
    let skyCleanup = () => {};
    const start = async () => {
      if (!navigator.gpu) {
        setStatus(
          "WebGPU unavailable in this browser. No fallback renderer started."
        );
        return;
      }
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error("No WebGPU adapter available");
      device = await adapter.requestDevice();
      if (abort.signal.aborted) {
        device.destroy();
        return;
      }
      void device.lost.then((info) => {
        if (!abort.signal.aborted)
          setStatus(`WebGPU device lost: ${info.message}`);
      });
      const context = element.getContext("webgpu");
      if (!context) throw new Error("No WebGPU canvas context");
      const format = navigator.gpu.getPreferredCanvasFormat();
      context.configure({ device, format, alphaMode: "opaque" });
      const module = device.createShaderModule({ code: shader });
      const compilation = await module.getCompilationInfo();
      const errors = compilation.messages.filter((m) => m.type === "error");
      if (errors.length)
        throw new Error(errors.map((m) => m.message).join("; "));
      const pipeline = await device.createRenderPipelineAsync({
        layout: "auto",
        vertex: { module, entryPoint: "vertex" },
        fragment: { module, entryPoint: "fragment", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
      });
      if (abort.signal.aborted) return;
      const source = await acquireRasterDemTerrainTileSource(
        NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
        { maxCacheBytes: 32 * 1024 ** 2, meshSegments: 16 }
      );
      release = () => source.release();
      if (abort.signal.aborted) {
        release();
        return;
      }
      const eye = [7.20158, 51.25656] as const,
        tower = NORDHELLE_LANDMARKS[0];
      const observerHeight = 361.3477;
      const zeta = await getGcg2016HeightAnomalies([
        eye,
        [tower.longitudeDegrees, tower.latitudeDegrees],
      ] as LngLatArray.deg[]);
      const frame = createReferenceFrame(eye, 6371000);
      const target = projectGeodeticToScene(
        frame,
        tower.longitudeDegrees,
        tower.latitudeDegrees,
        0,
        TERRAIN_GEOMETRY_MODE.WGS84_ECEF
      );
      const distance = Math.hypot(target.x, target.z),
        forward = new THREE.Vector2(target.x, target.z).normalize(),
        side = new THREE.Vector2(-forward.y, forward.x);
      const width = 128,
        height = 1024,
        range = distance + 4000,
        halfWidth = 2500;
      const heights = new Float32Array(width * height).fill(-10000);
      // One bounded texture, one request at a time. Source NoData stays NoData.
      const coordinates = Array.from({ length: width * height }, (_, i) => {
        const z = (Math.floor(i / width) / (height - 1)) * range,
          x = (((i % width) / (width - 1)) * 2 - 1) * halfWidth;
        return localGroundLngLat(
          frame,
          forward.x * z + side.x * x,
          forward.y * z + side.y * x
        );
      });
      const corners = [
        coordinates[0],
        coordinates[width - 1],
        coordinates[(height - 1) * width],
        coordinates[height * width - 1],
      ];
      const ids = source
        .getTileGridIdsForBounds(
          {
            west: Math.min(...corners.map((p) => p[0])),
            east: Math.max(...corners.map((p) => p[0])),
            south: Math.min(...corners.map((p) => p[1])),
            north: Math.max(...corners.map((p) => p[1])),
          },
          10
        )
        .filter((id) => source.getTileDataAvailable(id));
      const jobs = ids.map((id) => ({
        id,
        bounds: source.getTileBounds(id),
        samples: [] as number[],
      }));
      coordinates.forEach((p, i) => {
        const job = jobs.find(
          (j) =>
            p[0] >= j.bounds.west &&
            p[0] <= j.bounds.east &&
            p[1] >= j.bounds.south &&
            p[1] <= j.bounds.north
        );
        job?.samples.push(i);
      });
      let loaded = 0;
      for (const job of jobs.filter((j) => j.samples.length).slice(0, 32)) {
        if (abort.signal.aborted) return;
        setStatus(
          `Loading terrain corridor ${++loaded}/${Math.min(32, jobs.length)}…`
        );
        await source.requestTile(job.id, abort.signal, 2);
        for (const i of job.samples) {
          const p = coordinates[i];
          const h = source.sampleHeight(p[0], p[1]);
          if (h !== undefined && h > -1000)
            heights[i] =
              h +
              THREE.MathUtils.lerp(
                zeta[0],
                zeta[1],
                Math.min(
                  1,
                  ((Math.floor(i / width) / (height - 1)) * range) / distance
                )
              );
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (abort.signal.aborted) return;
      texture = device.createTexture({
        size: [width, height],
        format: "r32float",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      device.queue.writeTexture(
        { texture },
        heights,
        { bytesPerRow: width * 4 },
        { width, height }
      );
      uniforms = device.createBuffer({
        size: 80,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const skyGpu = device.createTexture({
        size: [512, 256],
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
      const skyRenderer = new THREE.WebGLRenderer({
        alpha: false,
        preserveDrawingBuffer: true,
      });
      skyRenderer.setSize(512, 256);
      skyRenderer.toneMapping = THREE.AgXToneMapping;
      skyRenderer.toneMappingExposure = 2;
      const skyScene = new THREE.Scene();
      skyScene.background = new THREE.Color("#7895b0");
      const skyCamera = new THREE.PerspectiveCamera(4, 2, 1, 100000);
      skyCamera.position.set(0, observerHeight + zeta[0], 0);
      skyCamera.lookAt(
        forward.x * 1000,
        skyCamera.position.y - 1.74533,
        forward.y * 1000
      );
      const sky = buildAtmosphericSky(new THREE.Color("#556044"));
      skyScene.add(sky.mesh);
      const evaluator = new AtmosphericSunlightEvaluator();
      let skyKey = "";
      skyCleanup = () => {
        evaluator.dispose();
        sky.dispose();
        skyRenderer.dispose();
        skyGpu.destroy();
      };
      const group = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: texture.createView() },
          { binding: 1, resource: { buffer: uniforms } },
          { binding: 2, resource: skyGpu.createView() },
          {
            binding: 3,
            resource: device.createSampler({
              magFilter: "linear",
              minFilter: "linear",
            }),
          },
        ],
      });
      const render = () => {
        if (abort.signal.aborted || !device || !uniforms) return;
        // Cap actual workload; the story does not allocate a 4K framebuffer.
        element.width = Math.min(960, Math.max(2, element.clientWidth));
        element.height = Math.min(
          540,
          Math.max(
            2,
            Math.round(
              (element.width * element.clientHeight) /
                Math.max(1, element.clientWidth)
            )
          )
        );
        const s = settings.current;
        const aspect = (element.width * 0.5) / element.height;
        const fov = Math.max(
          s.verticalFov,
          s.charts ? THREE.MathUtils.radToDeg(2 * Math.atan(0.04 / aspect)) : 0
        );
        const nextSkyKey = [fov, aspect, s.sunHour, evaluator.skyReady].join(
          "/"
        );
        if (nextSkyKey !== skyKey) {
          skyKey = nextSkyKey;
          skyCamera.fov = fov;
          skyCamera.aspect = aspect;
          skyCamera.updateProjectionMatrix();
          skyCamera.updateMatrixWorld();
          const instant = new Date(
            Date.UTC(
              2026,
              8,
              14,
              Math.floor(s.sunHour),
              Math.round((s.sunHour % 1) * 60)
            )
          );
          const sample = evaluator.evaluate(
            instant,
            {
              longitude: eye[0],
              latitude: eye[1],
              altitudeMeters: observerHeight + zeta[0],
            },
            undefined,
            {
              observer: {
                longitude: eye[0],
                latitude: eye[1],
                altitudeMeters: 0,
              },
              scenePosition: new THREE.Vector3(),
            }
          );
          sky.update(sample.skyFrame, evaluator.skyTextures);
          sky.updateViewCamera(skyCamera);
          sky.updateObserverScenePosition(skyCamera.position);
          skyRenderer.render(skyScene, skyCamera);
          device.queue.copyExternalImageToTexture(
            { source: skyRenderer.domElement },
            { texture: skyGpu },
            { width: 512, height: 256 }
          );
        }
        device.queue.writeBuffer(
          uniforms,
          0,
          new Float32Array([
            element.width,
            element.height,
            range,
            halfWidth,
            observerHeight + zeta[0],
            0,
            THREE.MathUtils.degToRad(fov),
            distance,
            tower.heightMeters,
            tower.groundNormalHeightMeters + zeta[1],
            settings.current.steps,
            0,
            s.temperature,
            s.pressure,
            s.lapse,
            s.inversion,
            s.layer,
            s.depth,
            s.visibility,
            s.charts ? 1 : 0,
          ])
        );
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: context.getCurrentTexture().createView(),
              loadOp: "clear",
              storeOp: "store",
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
            },
          ],
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, group);
        pass.draw(3);
        pass.end();
        device.queue.submit([encoder.finish()]);
      };
      redraw.current = render;
      evaluator.ensureSky(() => {
        if (!abort.signal.aborted) render();
      });
      observer = new ResizeObserver(render);
      observer.observe(element);
      render();
      setStatus(
        `${loaded} source tiles · 0.5 MiB height texture · ${Math.round(
          range / (height - 1)
        )} × ${Math.round(
          (2 * halfWidth) / (width - 1)
        )} m samples · render-on-change only`
      );
    };
    void start().catch((error) => {
      if (!abort.signal.aborted) setStatus(String(error));
    });
    return () => {
      abort.abort();
      redraw.current = () => {};
      observer?.disconnect();
      release();
      skyCleanup();
      texture?.destroy();
      uniforms?.destroy();
      device?.destroy();
    };
  }, []);
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#15202b",
        color: "white",
        font: "13px system-ui",
      }}
    >
      <header style={{ padding: 8 }}>
        <strong>Experimental WebGPU · Toelleturm → Nordhelle</strong>
        <div>
          Left: straight rays. Right: layered dry-air optical density,
          hydrostatic pressure approximation and temperature gradient. Presets
          are illustrative, not measured Wuppertal weather. Both: addon sky +
          approximate RGB extinction.
        </div>
        <div>{status}</div>
        {args.preset === "ideal" && (
          <div>
            Ideal upper bound: extinction disabled, refraction retained. Not
            attainable weather or a universal maximum viewing distance.
          </div>
        )}
        <div>
          100 m sRGB primary/secondary + black/white charts every 5 km (5–40
          km), disjoint angular slots. Pressure is at observer height; layer
          height is ellipsoidal. Sun hour UTC.
        </div>
        <div>
          Real raster corridor; simplified cylindrical WDR tower.
          Constant-radius Earth, linear datum interpolation. 10 cm vertical
          accuracy NOT established; NoData and unsampled ridges are not
          visibility proof.
        </div>
      </header>
      <canvas
        ref={canvas}
        style={{ flex: 1, minHeight: 0, width: "100%", objectFit: "fill" }}
      />
      <footer style={{ padding: 6 }}>
        Geobasis NRW · GCG2016 · © OpenStreetMap contributors · resource
        landmark provenance. No main-loader modifications.
      </footer>
    </div>
  );
};
