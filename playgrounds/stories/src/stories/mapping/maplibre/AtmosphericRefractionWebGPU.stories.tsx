/// <reference types="@webgpu/types" />
import type { Meta, StoryObj } from "@storybook/react";
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
  TERRAIN_GEOMETRY_MODE,
} from "./maplibre-three-reference-surfaces";

const shader = /* wgsl */ `
struct Settings { size: vec2f, range: f32, halfWidth: f32, eye: f32, k: f32, fov: f32, towerDistance: f32, towerHeight: f32, towerBase: f32, steps: f32, spare: f32, temperature:f32, pressure:f32, lapse:f32, inversion:f32, layer:f32, depth:f32, visibility:f32, charts:f32 }
@group(0) @binding(0) var terrain: texture_2d<f32>;
@group(0) @binding(1) var<uniform> settings: Settings;
@group(0) @binding(2) var skyTexture: texture_2d<f32>;
@group(0) @binding(3) var skySampler: sampler;
@vertex fn vertex(@builtin(vertex_index) index:u32)->@builtin(position) vec4f {
  let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(p[index],0,1);
}
fn heightAt(x:f32,z:f32)->f32 {
  let uv=vec2f(x/settings.halfWidth*0.5+0.5,z/settings.range);
  if(any(uv<vec2f(0)) || any(uv>vec2f(1))){return -10000;}
  let dimensions=vec2i(textureDimensions(terrain));
  let p=uv*vec2f(dimensions-vec2i(1));let a=vec2i(floor(p));let b=min(a+vec2i(1),dimensions-vec2i(1));let t=fract(p);
  let h00=textureLoad(terrain,a,0).r;let h10=textureLoad(terrain,vec2i(b.x,a.y),0).r;
  let h01=textureLoad(terrain,vec2i(a.x,b.y),0).r;let h11=textureLoad(terrain,b,0).r;
  if(min(min(h00,h10),min(h01,h11)) < -1000){return -10000;}
  return mix(mix(h00,h10,t.x),mix(h01,h11,t.x),t.y);
}
fn curvature(height:f32)->f32 {
  let dz=height-settings.eye;
  let u=(height-settings.layer)/max(10.0,settings.depth);
  let temperature=max(220.0,settings.temperature+273.15+settings.lapse*dz/1000.0+0.5*settings.inversion*(tanh(u)-tanh((settings.eye-settings.layer)/max(10.0,settings.depth))));
  let gradient=settings.lapse/1000.0+0.5*settings.inversion/max(10.0,settings.depth)*(1.0-tanh(u)*tanh(u));
  let pressure=settings.pressure*exp(-9.80665*dz/(287.05*0.5*(temperature+settings.temperature+273.15)));
  // Dry-air optical density approximation at 550 nm, not full Ciddor.
  let refractivity=0.0002778*(pressure/1013.25)*(288.15/temperature);
  return refractivity*(-9.80665/(287.05*temperature)-gradient/temperature);
}
fn filtered(color:vec3f,distance:f32,sky:vec3f)->vec4f {
  let transmission=exp(-vec3f(0.8,1.0,1.35)*3.912*distance/max(100.0,settings.visibility));
  let linearSky=pow(sky,vec3f(2.2));
  return vec4f(pow(max(vec3f(0),color*transmission+linearSky*(vec3f(1)-transmission)),vec3f(1.0/2.2)),1);
}
fn chartColor(uv:vec2f,km:u32)->vec3f {
  if(uv.y<0.22){
    let glyphs=array<u32,12>(31599u,11415u,29671u,29647u,23497u,31183u,31215u,29257u,31727u,31695u,23861u,4077u);
    let cell=vec2u(clamp(uv/vec2f(1,0.22),vec2f(0),vec2f(0.999))*vec2f(17,7));
    let column=cell.x/4u;let x=cell.x%4u;
    let codes=array<u32,4>(km/10u,km%10u,10u,11u);
    if(column<4u && x<3u && cell.y>=1u && cell.y<=5u && !(column==0u && km<10u)){
      let bit=14u-((cell.y-1u)*3u+x);
      if(((glyphs[codes[column]]>>bit)&1u)==1u){return vec3f(0);}
    }
    return vec3f(1);
  }
  let colors=array<vec3f,8>(vec3f(1),vec3f(0),vec3f(1,0,0),vec3f(0,1,0),vec3f(0,0,1),vec3f(0,1,1),vec3f(1,0,1),vec3f(1,1,0));
  let cell=vec2u(clamp(vec2f(uv.x,(uv.y-0.22)/0.78),vec2f(0),vec2f(0.999))*vec2f(4,2));
  return colors[cell.y*4+cell.x];
}
@fragment fn fragment(@builtin(position) frag:vec4f)->@location(0) vec4f {
  let right=frag.x>=settings.size.x*0.5;
  let uv=vec2f(fract(frag.x/(settings.size.x*0.5)),frag.y/settings.size.y);
  let aspect=settings.size.x*0.5/settings.size.y;
  let slope=vec2f((uv.x*2-1)*aspect,1-uv.y*2)*tan(settings.fov*0.5)+vec2f(0,-0.00174533);
  let sky=textureSampleLevel(skyTexture,skySampler,uv,0).rgb;
  var y=settings.eye;var slopeY=slope.y;var previousZ=0.0;
  let step=settings.range/settings.steps;
  var chartSlope=-0.03418; // Eight disjoint 100m / distance angular intervals.
  for(var i=1u;i<=1024u;i++){
    if(f32(i)>settings.steps){break;}
    let z=f32(i)*step;
    let oldY=y;
    let height=y+previousZ*previousZ/(2*6371000.0);
    let bend=select(0.0,curvature(height),right);
    y+=slopeY*step+0.5*bend*step*step;slopeY+=bend*step;
    if(settings.charts>0.5){
      chartSlope=-0.03418;
      for(var c=1u;c<=8u;c++){
        let d=f32(c)*5000.0;let angularWidth=100.0/d;
        let center=chartSlope+angularWidth*0.5;
        if(previousZ<d && z>=d && abs(slope.x-center)<angularWidth*0.5){
          let ground=heightAt(center*d,d);
          let centerHeight=max(settings.eye+100.0,ground+80.0)-d*d/(2*6371000.0);
          let rayY=mix(oldY,y,(d-previousZ)/step);
          if(abs(rayY-centerHeight)<50.0){
            return filtered(chartColor(vec2f((slope.x-center)/angularWidth+0.5,0.5-(rayY-centerHeight)/100.0),c*5u),d,sky);
          }
        }
        chartSlope+=angularWidth+0.002;
      }
    }
    if(previousZ<settings.towerDistance && z>=settings.towerDistance){
      let d=settings.towerDistance;
      let rayY=mix(oldY,y,(d-previousZ)/step);
      let base=settings.towerBase-d*d/(2*6371000.0);
      let radius=4.2;
      let peak=settings.towerHeight;
      if(abs(slope.x*d)<radius && rayY>=base && rayY<=base+peak){return filtered(vec3f(0.65,0.68,0.72),d,sky);}
    }
    let h=heightAt(slope.x*z,z);
    if(h > -1000 && y<h-z*z/(2*6371000.0)){
      return filtered(mix(vec3f(0.12,0.22,0.13),vec3f(0.65,0.61,0.42),clamp(h/900,0.0,1.0)),z,sky);
    }
    previousZ=z;
  }
  return vec4f(sky,1);
}
`;

const presets = {
  ideal: {
    temperature: 15,
    pressure: 970,
    lapse: -6.5,
    inversion: 0,
    layer: 450,
    depth: 100,
    visibility: 1e12,
  },
  mixed: {
    temperature: 15,
    pressure: 970,
    lapse: -6.5,
    inversion: 0,
    layer: 450,
    depth: 100,
    visibility: 80000,
  },
  inversion: {
    temperature: 5,
    pressure: 990,
    lapse: -6.5,
    inversion: 5,
    layer: 450,
    depth: 100,
    visibility: 25000,
  },
  haze: {
    temperature: 24,
    pressure: 975,
    lapse: -6.5,
    inversion: 2,
    layer: 600,
    depth: 150,
    visibility: 12000,
  },
  custom: {
    temperature: 15,
    pressure: 970,
    lapse: -6.5,
    inversion: 0,
    layer: 450,
    depth: 100,
    visibility: 80000,
  },
};
type Args = {
  preset: keyof typeof presets;
  temperature: number;
  pressure: number;
  lapse: number;
  inversion: number;
  layer: number;
  depth: number;
  visibility: number;
  charts: boolean;
  sunHour: number;
  verticalFov: number;
  steps: number;
};
const RefractionExperiment = (args: Args) => {
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
const meta = {
  title: "Terrain and Atmosphere/Terrain Horizon",
  id: "terrain-and-atmosphere-refraction-webgpu",
  component: RefractionExperiment,
  parameters: { layout: "fullscreen" },
  args: {
    preset: "mixed",
    ...presets.mixed,
    charts: true,
    sunHour: 12,
    verticalFov: 4,
    steps: 512,
  },
  argTypes: {
    preset: {
      control: "select",
      options: ["ideal", "mixed", "inversion", "haze", "custom"],
    },
    temperature: {
      control: { type: "range", min: -10, max: 35, step: 1 },
      if: { arg: "preset", eq: "custom" },
    },
    pressure: {
      control: { type: "range", min: 930, max: 1030, step: 1 },
      if: { arg: "preset", eq: "custom" },
    },
    lapse: {
      control: { type: "range", min: -15, max: 5, step: 0.5 },
      if: { arg: "preset", eq: "custom" },
    },
    inversion: {
      control: { type: "range", min: -5, max: 10, step: 0.5 },
      if: { arg: "preset", eq: "custom" },
    },
    layer: {
      control: { type: "range", min: 200, max: 1500, step: 10 },
      if: { arg: "preset", eq: "custom" },
    },
    depth: {
      control: { type: "range", min: 20, max: 400, step: 10 },
      if: { arg: "preset", eq: "custom" },
    },
    visibility: {
      control: { type: "range", min: 1000, max: 150000, step: 1000 },
      if: { arg: "preset", eq: "custom" },
    },
    charts: { control: "boolean" },
    sunHour: { control: { type: "range", min: 4, max: 20, step: 0.25 } },
    verticalFov: { control: { type: "range", min: 1, max: 4, step: 0.1 } },
    steps: { control: "inline-radio", options: [128, 256, 512, 1024] },
  },
} satisfies Meta<typeof RefractionExperiment>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Refraction: Story = { name: "Refraction · WebGPU experiment" };
