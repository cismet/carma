/// <reference types="@webgpu/types" />
import { d, tgpu } from "typegpu";
import {
  PRIMITIVE_FLOATS,
  diagnosticProjection,
  type DiagnosticFrame,
} from "../../core/diagnostics/tile-diagnostic-scene";

// Decision TILE-DIAGNOSTICS-WEBGPU-20260916: see the library's TILE_DIAGNOSTICS.md.
// TypeGPU is worker-only. Its schemas are the single CPU/WGSL layout definition.
export const DiagnosticPrimitive = d.struct({
  position: d.vec4f,
  parameters: d.vec4f,
  stroke: d.vec4f,
  fill: d.vec4f,
});
const Uniforms = d.struct({
  matrix: d.mat4x4f,
  display: d.vec4f,
  viewport: d.vec4f,
});

export const diagnosticShader = tgpu.resolve({
  externals: { DiagnosticPrimitive, Uniforms },
  template: `
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> instances: array<DiagnosticPrimitive>;
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
  if (kind == 4.0) { halfSize = halfSize / scale; }

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
  out.local = corners[vertex] * (halfSize + padding);
  let world = center + axis * out.local.x + vec2f(-axis.y, axis.x) * out.local.y;
  out.position = u.matrix * vec4f(world,0,1);
  out.halfSize = halfSize;
  out.parameters = item.parameters;
  out.stroke = item.stroke;
  if ((kind == 1.0 || kind == 2.0) && min(item.position.z, item.position.w) * 2.0 * scale < 4.0) {
    out.stroke.a = 0.0;
  }
  out.fill = item.fill;
  return out;
}
@fragment fn fragmentMain(input: Vertex) -> @location(0) vec4f {
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
  let worldPixel = max(length(vec2f(dpdx(p.x),dpdy(p.y))), .000001) / 1.41421356237;
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
  if ((kind == 1.0 || kind == 2.0) && input.parameters.w > 0.0) {
    let edge = (input.parameters.w * 2.0 - 1.0) * input.halfSize.x;
    fillAlpha = inside * clamp(.5 + (edge - p.x) / worldPixel,0.0,1.0) * .3;
    if (input.stroke.a == 0.0) { fillAlpha = 0.0; }
  }
  // One wedge of a tile's processing pie: the slice between two angles,
  // swept clockwise from twelve o'clock, in the step's own colour.
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
  let strokeAlpha = strokeCoverage * stroke.a;
  let alpha = strokeAlpha + fillAlpha * (1.0 - strokeAlpha);
  let rgb = stroke.rgb * strokeAlpha + input.fill.rgb * fillAlpha * (1.0 - strokeAlpha);
  return vec4f(rgb,alpha) * u.display.w;
}
`,
});

export const createTileDiagnosticRenderer = async (
  canvases: readonly [OffscreenCanvas, OffscreenCanvas]
) => {
  if (!navigator.gpu)
    throw new Error("WebGPU is unavailable; tile diagnostics are disabled.");
  const root = await tgpu.init();
  const device = root.device;
  const format = navigator.gpu.getPreferredCanvasFormat();
  let disposed = false;
  let lost = "";
  void device.lost.then((info) => {
    if (!disposed) lost = info.message || "GPU device lost";
  });
  const onError = (event: GPUUncapturedErrorEvent) => {
    lost = event.error.message;
  };
  device.addEventListener("uncapturederror", onError);
  const contexts: GPUCanvasContext[] = [];
  try {
    for (const canvas of canvases) {
      const context = canvas.getContext("webgpu");
      if (!context)
        throw new Error("Cannot create the diagnostic WebGPU canvas.");
      context.configure({ device, format, alphaMode: "premultiplied" });
      contexts.push(context);
    }
    const shader = device.createShaderModule({ code: diagnosticShader });
    const compilation = await shader.getCompilationInfo();
    const errors = compilation.messages.filter(
      (message) => message.type === "error"
    );
    if (errors.length)
      throw new Error(errors.map((message) => message.message).join("\n"));
    const pipeline = await device.createRenderPipelineAsync({
      layout: "auto",
      vertex: { module: shader, entryPoint: "vertexMain" },
      fragment: {
        module: shader,
        entryPoint: "fragmentMain",
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
              alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });
    const uniforms = contexts.map(() =>
      root.createBuffer(Uniforms).$usage("uniform")
    );
    let capacity = 1;
    let instanceBuffer = root
      .createBuffer(d.arrayOf(DiagnosticPrimitive, capacity))
      .$usage("storage");
    let groups: GPUBindGroup[] = [];
    let bundles: GPURenderBundle[] = [];
    let base = new Float32Array();
    let previousSelection = new Float32Array();
    let lastCount = -1;
    let uploads = 0;
    const byteStride = d.sizeOf(DiagnosticPrimitive);
    if (byteStride !== PRIMITIVE_FLOATS * 4)
      throw new Error("Diagnostic instance layout mismatch.");
    const uniformValues = new Float32Array(d.sizeOf(Uniforms) / 4);
    return {
      setScene(data: Float32Array) {
        base = data;
        lastCount = -1;
      },
      async render(frame: DiagnosticFrame, selection: Float32Array) {
        if (disposed || lost)
          throw new Error(lost || "Diagnostic renderer disposed");
        const count = (base.length + selection.length) / PRIMITIVE_FLOATS;
        const grew = count > capacity;
        if (grew) {
          capacity = 2 ** Math.ceil(Math.log2(count));
          if (capacity * byteStride > device.limits.maxStorageBufferBindingSize)
            throw new Error(
              "Diagnostic instance buffer exceeds the device limit."
            );
          instanceBuffer.destroy();
          instanceBuffer = root
            .createBuffer(d.arrayOf(DiagnosticPrimitive, capacity))
            .$usage("storage");
        }
        const changed = lastCount < 0 || grew;
        const buffer = root.unwrap(instanceBuffer);
        if (changed && base.byteLength) {
          device.queue.writeBuffer(buffer, 0, base);
          uploads++;
        }
        const selectionChanged =
          changed ||
          selection.length !== previousSelection.length ||
          selection.some((value, index) => value !== previousSelection[index]);
        if (selectionChanged && selection.byteLength) {
          device.queue.writeBuffer(buffer, base.byteLength, selection);
          uploads++;
        }
        previousSelection = selection;
        if (grew || !groups.length)
          groups = uniforms.map((uniform) =>
            device.createBindGroup({
              layout: pipeline.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: { buffer: root.unwrap(uniform) } },
                { binding: 1, resource: { buffer } },
              ],
            })
          );
        if (changed || lastCount !== count || !bundles.length)
          bundles = groups.map((group) => {
            const bundle = device.createRenderBundleEncoder({
              colorFormats: [format],
            });
            bundle.setPipeline(pipeline);
            bundle.setBindGroup(0, group);
            bundle.draw(6, count);
            return bundle.finish();
          });
        lastCount = count;
        const { scale, matrix } = diagnosticProjection(
          frame.view,
          frame.width,
          frame.height
        );
        uniformValues.set(matrix);
        uniformValues.set([scale, frame.pixelRatio, 0, frame.opacity], 16);
        uniformValues.set(
          [frame.width, frame.height, Number(frame.popout), 0],
          20
        );
        for (let index = 0; index < contexts.length; index++) {
          if (index === 1 && frame.popout) continue;
          const width = Math.max(1, Math.round(frame.width * frame.pixelRatio));
          const height = Math.max(
            1,
            Math.round(frame.height * frame.pixelRatio)
          );
          if (
            width > device.limits.maxTextureDimension2D ||
            height > device.limits.maxTextureDimension2D
          )
            throw new Error(
              "Diagnostic canvas exceeds the device texture limit."
            );
          const canvas = canvases[index],
            context = contexts[index];
          if (
            canvas.width !== width ||
            canvas.height !== height ||
            !canvas.width
          ) {
            canvas.width = width;
            canvas.height = height;
          }
          uniformValues[18] = index;
          device.queue.writeBuffer(
            root.unwrap(uniforms[index]),
            0,
            uniformValues
          );
          const encoder = device.createCommandEncoder();
          const pass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: context.getCurrentTexture().createView(),
                clearValue: [0, 0, 0, 0],
                loadOp: "clear",
                storeOp: "store",
              },
            ],
          });
          pass.executeBundles([bundles[index]]);
          pass.end();
          device.queue.submit([encoder.finish()]);
        }
        // One in-flight diagnostic frame. CPU caller never waits synchronously.
        await device.queue.onSubmittedWorkDone();
        if (lost) throw new Error(lost);
        return {
          instances: count,
          bufferBytes: capacity * byteStride,
          uploads,
        };
      },
      dispose() {
        disposed = true;
        device.removeEventListener("uncapturederror", onError);
        for (const context of contexts) context.unconfigure();
        root.destroy();
      },
    };
  } catch (error) {
    for (const context of contexts) context.unconfigure();
    root.destroy();
    throw error;
  }
};
