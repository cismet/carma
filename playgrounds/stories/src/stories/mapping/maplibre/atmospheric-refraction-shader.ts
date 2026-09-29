/// <reference types="@webgpu/types" />
import { EARTH_RADIUS } from "@carma-geo/proj";

// WGSL needs a float literal, so the shared radius is written with a decimal.
const EARTH_RADIUS_WGSL = EARTH_RADIUS.toFixed(1);

export const shader = /* wgsl */ `
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
    let height=y+previousZ*previousZ/(2*${EARTH_RADIUS_WGSL});
    let bend=select(0.0,curvature(height),right);
    y+=slopeY*step+0.5*bend*step*step;slopeY+=bend*step;
    if(settings.charts>0.5){
      chartSlope=-0.03418;
      for(var c=1u;c<=8u;c++){
        let d=f32(c)*5000.0;let angularWidth=100.0/d;
        let center=chartSlope+angularWidth*0.5;
        if(previousZ<d && z>=d && abs(slope.x-center)<angularWidth*0.5){
          let ground=heightAt(center*d,d);
          let centerHeight=max(settings.eye+100.0,ground+80.0)-d*d/(2*${EARTH_RADIUS_WGSL});
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
      let base=settings.towerBase-d*d/(2*${EARTH_RADIUS_WGSL});
      let radius=4.2;
      let peak=settings.towerHeight;
      if(abs(slope.x*d)<radius && rayY>=base && rayY<=base+peak){return filtered(vec3f(0.65,0.68,0.72),d,sky);}
    }
    let h=heightAt(slope.x*z,z);
    if(h > -1000 && y<h-z*z/(2*${EARTH_RADIUS_WGSL})){
      return filtered(mix(vec3f(0.12,0.22,0.13),vec3f(0.65,0.61,0.42),clamp(h/900,0.0,1.0)),z,sky);
    }
    previousZ=z;
  }
  return vec4f(sky,1);
}
`;
