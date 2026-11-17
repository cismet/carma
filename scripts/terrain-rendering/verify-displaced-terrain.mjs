#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

// Offline GPU parity probe, not a terrain network/LOD benchmark.
const sharedRuntime = process.argv.includes("--shared-runtime");
const output = resolve(
  process.argv.slice(2).find((argument) => !argument.startsWith("--")) ??
    "output/playwright/terrain-displacement"
);
await mkdir(output, { recursive: true });
const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    sourcefile: "terrain-displacement-probe.ts",
    contents: `
import * as T from 'three';
import {createDisplacedTerrainFixture} from './libraries/mapping/engines/three/primitives/src/lib/common/displaced-terrain/displaced-terrain-fixture';
import {createDisplacedTerrainPresentation} from './libraries/mapping/engines/three/primitives/src/lib/common/displaced-terrain/displaced-terrain-presentation';
import {createTerrainInstancedPresentation} from './libraries/mapping/engines/maplibre/src/lib/runtime/integrations/terrain-instanced-presentation';
import {configureMapStyleProjectedMaterial} from './libraries/mapping/engines/maplibre/src/lib/runtime/integrations/shared-three-map-style-material';
import {ShadowController} from './libraries/mapping/shadow-simulation/src/lib/runtime/shadow-controller';
const renderer = new T.WebGLRenderer({antialias:false, preserveDrawingBuffer:true});
renderer.setSize(1024,512); renderer.shadowMap.enabled=true;renderer.info.autoReset=false;
document.body.append(renderer.domElement);
const gl=renderer.getContext();
const scenes=[new T.Scene(),new T.Scene()];
const fixture=createDisplacedTerrainFixture(64,2); scenes[0].add(fixture.root);
let displaced, presentation, sourceMaterial, nativeMaterial, checker, styleUniforms;
if (${sharedRuntime}) {
 nativeMaterial=new T.MeshLambertMaterial({color:fixture.material.color});
 fixture.root.traverse(o=>{if(o.isMesh){o.material=nativeMaterial;o.userData.isShadowTerrainSurface=true;}});
 const source=fixture.root.clone(true);sourceMaterial=nativeMaterial.clone();
 source.traverse(o=>{if(o.isMesh)o.material=sourceMaterial;});scenes[1].add(source);
 presentation=createTerrainInstancedPresentation(source,{admitRetainedBytes:()=>true,onChanged:()=>{},onError:e=>{throw e;}});
 displaced={update:()=>presentation.update(renderer),dispose:()=>presentation.dispose()};
 const checkerData=new Uint8Array(8*8*4);
 for(let y=0;y<8;y++)for(let x=0;x<8;x++)checkerData.set((x+y)%2?[220,140,80,255]:[60,130,210,255],4*(y*8+x));
 checker=new T.DataTexture(checkerData,8,8);checker.needsUpdate=true;
 styleUniforms={texture:{value:checker},sceneToClip:{value:new T.Matrix4()},enabled:{value:1},depthTexture:{value:null},depthEnabled:{value:0},depthNearFar:{value:new T.Vector2(1,100000)},texelSize:{value:new T.Vector2(1/8,1/8)}};
 configureMapStyleProjectedMaterial(nativeMaterial,styleUniforms);
} else {
 displaced=createDisplacedTerrainPresentation(scenes[0],scenes[1],{
  maxTextureSize:renderer.capabilities.maxTextureSize,maxArrayLayers:gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS)});
}
const bounds=new T.Box3().setFromPoints(fixture.receivers), center=bounds.getCenter(new T.Vector3());
const radius=bounds.getSize(new T.Vector3()).length()/2;
const camera=new T.PerspectiveCamera(45,1,1,100000);
camera.position.copy(center).addScaledVector(new T.Vector3(0,1,1.5).normalize(),radius*3);
camera.lookAt(center); camera.updateMatrixWorld();
const pointLights=scenes.map(scene=>{const light=new T.PointLight(0xffe6ba,80000000,0,2);light.position.copy(center).add(new T.Vector3(-2500,3500,1000));light.shadow.mapSize.set(512,512);light.shadow.camera.near=10;light.shadow.camera.far=20000;light.shadow.bias=-0.0001;light.visible=false;scene.add(light);return light;});
const controllers=scenes.map(scene=>{
 scene.background=new T.Color(0x17212b); scene.add(new T.HemisphereLight(0xd7ecff,0x182312,1.2));
 const controller=new ShadowController(scene); controller.setMaxShadowMapSize(1024);return controller;});
const target=new T.WebGLRenderTarget(512,512);
const result=[];
const difference=(a,b)=>{
 let sum=0,max=0,changed=0,above1=0;
 for(let i=0;i<a.length;i+=4){let pixel=0;
 for(let c=0;c<3;c++){const d=Math.abs(a[i+c]-b[i+c]);sum+=d;max=Math.max(max,d);pixel=Math.max(pixel,d);}
 if(pixel)changed++;if(pixel>1)above1++;}
 return {meanChannelDifference:sum/(a.length/4*3),maximumChannelDifference:max,changedPixels:changed,pixelsAbove1:above1,totalPixels:a.length/4};};
window.run=()=>{
 let metrics;
 for(const lighting of ["unshadowed","directional","point"])for(const pitch of [0.7,1.4]){
  const shadows=lighting!=="unshadowed";
  camera.position.copy(center).addScaledVector(new T.Vector3(0,pitch,1.5).normalize(),radius*3);
  camera.lookAt(center);camera.updateMatrixWorld();
  metrics=displaced.update();
  if(styleUniforms){
   styleUniforms.sceneToClip.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
   presentation.root().traverse(o=>{if(o.isMesh && presentation.usesMaterial(o.material,sourceMaterial))configureMapStyleProjectedMaterial(o.material,styleUniforms);});
  }
  const images=[],drawCalls=[],triangles=[];
  for(let i=0;i<2;i++){
   controllers[i].update({receiverWorldPoints:fixture.receivers,receiverAnchorWorldPosition:center,
    minimumElevationMeters:bounds.min.y,maximumElevationMeters:bounds.max.y,
    directionToSun:new T.Vector3(-0.98,0.2,0).normalize(),color:0xffe6ba,intensity:3,shadowIntensity:shadows?1:0,quality:4});
   controllers[i].lights.forEach(l=>{l.castShadow=lighting==="directional";l.visible=lighting!=="point";});
   pointLights[i].visible=pointLights[i].castShadow=lighting==="point";
   renderer.setRenderTarget(target);renderer.setViewport(0,0,512,512);renderer.info.reset();renderer.render(scenes[i],camera);drawCalls.push(renderer.info.render.calls);triangles.push(renderer.info.render.triangles);
   const pixels=new Uint8Array(512*512*4);renderer.readRenderTargetPixels(target,0,0,512,512,pixels);images.push(pixels);
  }
  result.push({lighting,shadows,pitch,drawCalls,triangles,...difference(images[0],images[1])});
 }
 renderer.setRenderTarget(null);renderer.setScissorTest(true);
 for(let i=0;i<2;i++){renderer.setViewport(i*512,0,512,512);renderer.setScissor(i*512,0,512,512);renderer.render(scenes[i],camera);}
 renderer.setScissorTest(false);
 const unchanged=displaced.update();
 const extension=gl.getExtension('WEBGL_debug_renderer_info');
 const gpu=extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):'unavailable';
 return {cases:result,metrics,unchangedUploadedBytes:unchanged.uploadedBytes,gpu,
  capabilities:{maxTextureSize:renderer.capabilities.maxTextureSize,maxArrayLayers:gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS)}};
};
window.dispose=()=>{displaced.dispose();fixture.dispose();controllers.forEach(c=>c.dispose());target.dispose();sourceMaterial?.dispose();nativeMaterial?.dispose();checker?.dispose();renderer.dispose();};
`,
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  tsconfig: resolve("tsconfig.base.json"),
  loader: { ".wasm": "binary" },
  logLevel: "silent",
});
const html = resolve(output, "comparison.html");
await writeFile(
  html,
  `<html><body style="margin:0;background:#17212b"><script>${bundle.outputFiles[0].text.replaceAll(
    "</script",
    "<\\/script"
  )}</script></body></html>`
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 512 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route(/^https?:/, (route) => route.abort());
  await page.goto(pathToFileURL(html).href);
  const results = await page.evaluate(() => window.run());
  await page.screenshot({ path: resolve(output, "comparison.png") });
  await page.evaluate(() => window.dispose());
  await writeFile(
    resolve(output, "results.json"),
    JSON.stringify({ ...results, errors }, null, 2)
  );
  console.log(JSON.stringify({ ...results, errors, output }));
  if (
    errors.length ||
    results.unchangedUploadedBytes ||
    results.cases.some((test) => test.pixelsAbove1 / test.totalPixels > 0.001)
  )
    process.exitCode = 1;
} finally {
  await browser.close();
}
