import { d, tgpu } from "typegpu";

export const DiagnosticPrimitive = d.struct({
  position: d.vec4f,
  parameters: d.vec4f,
  stroke: d.vec4f,
  fill: d.vec4f,
});
export const DiagnosticPlane = d.struct({
  origin: d.vec4f,
  axisU: d.vec4f,
  axisV: d.vec4f,
});
export const DiagnosticUniforms = d.struct({
  matrix: d.mat4x4f,
  display: d.vec4f,
  viewport: d.vec4f,
  depthRange: d.vec4f,
});

export const diagnosticShader = tgpu.resolve({
  externals: { DiagnosticPrimitive, DiagnosticPlane, DiagnosticUniforms },
  template: `
@group(0) @binding(0) var<uniform> u: DiagnosticUniforms;
@group(0) @binding(1) var<storage, read> instances: array<DiagnosticPrimitive>;
@group(0) @binding(2) var<storage, read> planes: array<DiagnosticPlane>;
struct Vertex {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) halfSize: vec2f,
  @location(2) @interpolate(flat) parameters: vec4f,
  @location(3) @interpolate(flat) stroke: vec4f,
  @location(4) @interpolate(flat) fill: vec4f,
};
@vertex fn vertexMain(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> Vertex {
  let corners = array<vec2f, 6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(-1,1),vec2f(1,-1),vec2f(1,1));
  let item = instances[instance];
  let kind = item.parameters.x;
  let scale = max(u.display.x, .000001);
  var padding = 3.0 / scale;
  // A tapered line is as wide as its widest end, so its quad has to hold it.
  if (kind == 5.0) { padding = (3.0 + max(item.parameters.z, item.parameters.w)) / scale; }
  var center = item.position.xy;
  var halfSize = item.position.zw;
  var axis = vec2f(1,0);
  if (kind == 4.0 || kind == 7.0) { halfSize = halfSize / scale; }

  if (kind == 3.0 || kind == 5.0) {
    let delta = item.position.zw - item.position.xy;
    let length = length(delta);
    axis = delta / max(length, .000001);
    center = (item.position.xy + item.position.zw) * .5;
    halfSize = vec2f(length * .5, 0);
  }
  if (kind == 1.0 || kind == 2.0) {
    halfSize = max(vec2f(0), halfSize - max(vec2f(.5 / scale), halfSize * .16));
  }
  var out: Vertex;
  // Surface cuts end at their box/frustum intersections. Extending their
  // depth along rounded caps can clip almost vertical projected segments.
  let cut = kind == 5.0 || (kind == 3.0 && item.parameters.z == 1.0);
  let quadPadding = select(vec2f(padding), vec2f(0.0, padding), cut);
  out.local = corners[vertex] * (halfSize + quadPadding);
  let world = center + axis * out.local.x + vec2f(-axis.y, axis.x) * out.local.y;
  let plane = planes[instance];
  let homogeneous = plane.origin + plane.axisU * world.x + plane.axisV * world.y;
  out.position = u.matrix * homogeneous;
  out.position.z = (homogeneous.z - u.depthRange.x * homogeneous.w) / max(u.depthRange.y - u.depthRange.x, .000001);
  out.halfSize = halfSize;
  out.parameters = item.parameters;
  out.stroke = item.stroke;
  if ((kind == 1.0 || kind == 2.0) && min(item.position.z, item.position.w) * 2.0 * scale < 4.0) {
    out.stroke.a = 0.0;
  }
  out.fill = item.fill;
  return out;
}
fn primitiveColor(input: Vertex) -> vec4f {
  let p = input.local;
  let kind = input.parameters.x;
  let q = abs(p) - input.halfSize;
  var outer = length(max(q, vec2f(0))) + min(max(q.x,q.y),0.0);
  var distance = abs(outer);
  if (kind == 1.0 || kind == 2.0) {
    var radial = max(abs(p.x), abs(p.y));
    if (kind == 1.0) { radial = length(p); }
    let radius = max(input.halfSize.x, .000001);
    outer = radial - radius;
    let count = max(input.parameters.z,1.0);
    let step = radius / count;
    let nearest = clamp(round(radial / step),1.0,count) * step;
    distance = abs(radial - nearest);
  }
  if (kind == 3.0 || kind == 5.0) {
    distance = length(vec2f(max(abs(p.x) - input.halfSize.x,0.0),p.y));
  }
  if (kind == 4.0) {
    distance = length(p) - input.halfSize.x;
  }
  // Derivatives stay outside non-uniform control flow. Widths are CSS pixels.
  // Decision: full gradients keep vertical edges visible; selecting only the
  // diagonal derivatives collapses at 90 degrees. See TILE_DIAGNOSTICS.md#frustum-markers.
  let worldPixel = max(max(length(dpdx(p)), length(dpdy(p))), .000001);
  let cssPixel = worldPixel * u.display.y;
  let contrast = u.display.z > .5;
  var width = select(input.parameters.y, 2.5, contrast);
  // Perspective cue: the near end of a frustum edge is drawn wider than the
  // far one, interpolated along the segment instead of per sub-segment.
  if (kind == 5.0 && !contrast) {
    let along = clamp(p.x / max(input.halfSize.x, .000001) * .5 + .5, 0.0, 1.0);
    width = mix(input.parameters.z, input.parameters.w, along);
  }
  let strokeCoverage = clamp((width * cssPixel * .5 - distance) / worldPixel + .5,0.0,1.0);
  var stroke = input.stroke;
  var fillAlpha = 0.0;
  let inside = clamp(.5 - outer / worldPixel,0.0,1.0);
  if (kind == 0.0 && u.viewport.z > .5) { fillAlpha = inside * input.fill.a; }
  // One wedge of a tile's processing pie: the slice between two angles,
  // swept clockwise from twelve o'clock, in the step's own colour.
  if (kind == 7.0) {
    let direction = input.parameters.zw;
    let along = dot(p, direction);
    let across = abs(dot(p, vec2f(-direction.y, direction.x)));
    let radius = input.halfSize.x;
    let edge = max(-radius * .5 - along, (along + 2.0 * across - radius) / sqrt(5.0));
    let alpha = clamp(.5 - edge / worldPixel, 0.0, 1.0) * input.stroke.a;
    return vec4f(input.stroke.rgb * alpha, alpha) * u.display.w;
  }
  if (kind == 6.0) {
    let radius = max(input.halfSize.x, .000001);
    let radial = length(p);
    let angle = fract(atan2(p.x, -p.y) / 6.28318530718 + 1.0);
    let inside = clamp((radius - radial) / worldPixel, 0.0, 1.0);
    let within = select(0.0, 1.0, angle >= input.parameters.z && angle < input.parameters.w);
    let wedgeAlpha = inside * within * input.stroke.a;
    return vec4f(input.stroke.rgb * wedgeAlpha, wedgeAlpha) * u.display.w;
  }
  if (contrast) { stroke = vec4f(vec3f(64.0 / 255.0),input.stroke.a); fillAlpha = 0.0; }
  let strokeAlpha = select(strokeCoverage * stroke.a, 0.0, kind == 0.0 && input.parameters.y <= 0.0);
  let alpha = strokeAlpha + fillAlpha * (1.0 - strokeAlpha);
  let rgb = stroke.rgb * strokeAlpha + input.fill.rgb * fillAlpha * (1.0 - strokeAlpha);
  return vec4f(rgb,alpha) * u.display.w;
}
struct OpaqueFragment {
  @location(0) color: vec4f,
  @builtin(frag_depth) depth: f32,
};
@fragment fn opaqueMain(input: Vertex) -> OpaqueFragment {
  let color = primitiveColor(input);
  if (color.a < .98) { discard; }
  var out: OpaqueFragment;
  out.color = color;
  // Opaque marks win over a translucent fill on the same face.
  out.depth = max(0.0, input.position.z - .0000001);
  return out;
}
struct TransparentFragment {
  @location(0) accumulation: vec4f,
  @location(1) revealage: vec4f,
};
@fragment fn fragmentMain(input: Vertex) -> TransparentFragment {
  let color = primitiveColor(input);
  if (color.a <= .000001 || color.a >= .98) { discard; }
  let depth = clamp(input.position.z, 0.0, 1.0);
  let weight = clamp((color.a * 8.0 + .01) * pow(1.0 - depth * .95, 3.0), .01, 8.0) * u.viewport.w;
  var out: TransparentFragment;
  out.accumulation = color * weight;
  out.revealage = vec4f(color.a);
  return out;
}
`,
});

// Decision: weighted-blended OIT keeps overlapping diagnostic boxes stable
// without a fragment-layer cap. RGB approximates sorted OVER; revealage retains
// the product of all transmittances. McGuire/Bavoil (2013):
// https://jcgt.org/published/0002/02/09/paper-lowres.pdf
export const diagnosticResolveShader = `
@group(0) @binding(0) var accumulation: texture_2d<f32>;
@group(0) @binding(1) var revealage: texture_2d<f32>;
@group(0) @binding(2) var opaque: texture_2d<f32>;
@vertex fn vertexMain(@builtin(vertex_index) vertex: u32) -> @builtin(position) vec4f {
  let positions = array<vec2f, 3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  return vec4f(positions[vertex], 0.0, 1.0);
}
@fragment fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let pixel = vec2i(position.xy);
  let sum = textureLoad(accumulation, pixel, 0);
  let transmission = clamp(textureLoad(revealage, pixel, 0).r, 0.0, 1.0);
  let background = textureLoad(opaque, pixel, 0);
  let alpha = 1.0 - transmission;
  let color = sum.rgb / max(sum.a, .000001) * alpha;
  return vec4f(color + background.rgb * transmission, alpha + background.a * transmission);
}
`;
