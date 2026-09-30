/// <reference types="@webgpu/types" />
import { d, tgpu } from "typegpu";
import {
  PRIMITIVE_FLOATS,
  diagnosticProjection,
  type DiagnosticFrame,
} from "../../core/diagnostics/tile-diagnostic-scene";
import {
  DiagnosticPlane,
  DiagnosticPrimitive,
  DiagnosticUniforms,
  diagnosticResolveShader,
  diagnosticShader,
} from "./tile-diagnostic-shader";

const PLANE_FLOATS = 12;
const COLOR_FORMAT: GPUTextureFormat = "rgba16float";
const REVEAL_FORMAT: GPUTextureFormat = "r16float";
const DEPTH_FORMAT: GPUTextureFormat = "depth24plus";

type RenderTargets = {
  width: number;
  height: number;
  opaque: GPUTexture;
  accumulation: GPUTexture;
  revealage: GPUTexture;
  depth: GPUTexture;
  resolve: GPUBindGroup;
};

const flatPlanes = (count: number) => {
  const planes = new Float32Array(count * PLANE_FLOATS);
  for (let index = 0; index < count; index++) {
    const offset = index * PLANE_FLOATS;
    planes[offset + 3] = 1;
    planes[offset + 4] = 1;
    planes[offset + 9] = 1;
  }
  return planes;
};

const readPlanes = (data: Float32Array, planes?: Float32Array) => {
  const count = data.length / PRIMITIVE_FLOATS;
  if (
    !Number.isInteger(count) ||
    (planes && planes.length !== count * PLANE_FLOATS)
  )
    throw new Error("Diagnostic primitive/plane layout mismatch.");
  return planes ?? flatPlanes(count);
};

const destroyTargets = (targets: RenderTargets | undefined) => {
  if (!targets) return;
  targets.opaque.destroy();
  targets.accumulation.destroy();
  targets.revealage.destroy();
  targets.depth.destroy();
};

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
  const targets: (RenderTargets | undefined)[] = [];
  try {
    for (const canvas of canvases) {
      const context = canvas.getContext("webgpu");
      if (!context)
        throw new Error("Cannot create the diagnostic WebGPU canvas.");
      context.configure({ device, format, alphaMode: "premultiplied" });
      contexts.push(context);
    }
    const shader = device.createShaderModule({ code: diagnosticShader });
    const resolveShader = device.createShaderModule({
      code: diagnosticResolveShader,
    });
    for (const module of [shader, resolveShader]) {
      const compilation = await module.getCompilationInfo();
      const errors = compilation.messages.filter(
        (message) => message.type === "error"
      );
      if (errors.length)
        throw new Error(errors.map((message) => message.message).join("\n"));
    }
    const geometryLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "read-only-storage" },
        },
      ],
    });
    const layout = device.createPipelineLayout({
      bindGroupLayouts: [geometryLayout],
    });
    const vertex = { module: shader, entryPoint: "vertexMain" };
    const primitive: GPUPrimitiveState = { topology: "triangle-list" };
    const additive: GPUBlendState = {
      color: { srcFactor: "one", dstFactor: "one" },
      alpha: { srcFactor: "one", dstFactor: "one" },
    };
    const [opaquePipeline, transparentPipeline, resolvePipeline] =
      await Promise.all([
        device.createRenderPipelineAsync({
          layout,
          vertex,
          primitive,
          fragment: {
            module: shader,
            entryPoint: "opaqueMain",
            targets: [{ format: COLOR_FORMAT }],
          },
          depthStencil: {
            format: DEPTH_FORMAT,
            depthWriteEnabled: true,
            depthCompare: "less-equal",
          },
        }),
        device.createRenderPipelineAsync({
          layout,
          vertex,
          primitive,
          fragment: {
            module: shader,
            entryPoint: "fragmentMain",
            targets: [
              { format: COLOR_FORMAT, blend: additive },
              {
                format: REVEAL_FORMAT,
                blend: {
                  color: { srcFactor: "zero", dstFactor: "one-minus-src" },
                  alpha: {
                    srcFactor: "zero",
                    dstFactor: "one-minus-src-alpha",
                  },
                },
              },
            ],
          },
          depthStencil: {
            format: DEPTH_FORMAT,
            depthWriteEnabled: false,
            depthCompare: "less-equal",
          },
        }),
        device.createRenderPipelineAsync({
          layout: "auto",
          primitive,
          vertex: { module: resolveShader, entryPoint: "vertexMain" },
          fragment: {
            module: resolveShader,
            entryPoint: "fragmentMain",
            targets: [{ format }],
          },
        }),
      ]);
    const createTargets = (width: number, height: number): RenderTargets => {
      const texture = (textureFormat: GPUTextureFormat) =>
        device.createTexture({
          size: [width, height],
          format: textureFormat,
          usage:
            GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
      const opaque = texture(COLOR_FORMAT);
      const accumulation = texture(COLOR_FORMAT);
      const revealage = texture(REVEAL_FORMAT);
      const depth = texture(DEPTH_FORMAT);
      const resolve = device.createBindGroup({
        layout: resolvePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: accumulation.createView() },
          { binding: 1, resource: revealage.createView() },
          { binding: 2, resource: opaque.createView() },
        ],
      });
      return { width, height, opaque, accumulation, revealage, depth, resolve };
    };
    const uniforms = contexts.map(() =>
      root.createBuffer(DiagnosticUniforms).$usage("uniform")
    );
    let capacity = 1;
    let instanceBuffer = root
      .createBuffer(d.arrayOf(DiagnosticPrimitive, capacity))
      .$usage("storage");
    let planeBuffer = root
      .createBuffer(d.arrayOf(DiagnosticPlane, capacity))
      .$usage("storage");
    let groups: GPUBindGroup[] = [];
    let opaqueBundles: GPURenderBundle[] = [];
    let transparentBundles: GPURenderBundle[] = [];
    let base = new Float32Array();
    let basePlanes = new Float32Array();
    let previousSelection = new Float32Array();
    let previousPlanes = new Float32Array();
    let lastCount = -1;
    let uploads = 0;
    const byteStride = d.sizeOf(DiagnosticPrimitive);
    const planeStride = d.sizeOf(DiagnosticPlane);
    if (byteStride !== PRIMITIVE_FLOATS * 4 || planeStride !== PLANE_FLOATS * 4)
      throw new Error("Diagnostic instance layout mismatch.");
    const uniformValues = new Float32Array(d.sizeOf(DiagnosticUniforms) / 4);
    return {
      setScene(data: Float32Array, planes?: Float32Array) {
        basePlanes = readPlanes(data, planes);
        base = data;
        lastCount = -1;
      },
      async render(
        frame: DiagnosticFrame,
        selection: Float32Array,
        selectionPlanes?: Float32Array
      ) {
        if (disposed || lost)
          throw new Error(lost || "Diagnostic renderer disposed");
        const count = (base.length + selection.length) / PRIMITIVE_FLOATS;
        const planes = readPlanes(selection, selectionPlanes);
        const grew = count > capacity;
        if (grew) {
          capacity = 2 ** Math.ceil(Math.log2(count));
          if (
            capacity * Math.max(byteStride, planeStride) >
            device.limits.maxStorageBufferBindingSize
          )
            throw new Error(
              "Diagnostic instance buffer exceeds the device limit."
            );
          instanceBuffer.destroy();
          planeBuffer.destroy();
          instanceBuffer = root
            .createBuffer(d.arrayOf(DiagnosticPrimitive, capacity))
            .$usage("storage");
          planeBuffer = root
            .createBuffer(d.arrayOf(DiagnosticPlane, capacity))
            .$usage("storage");
        }
        const changed = lastCount < 0 || grew;
        const buffer = root.unwrap(instanceBuffer);
        const poses = root.unwrap(planeBuffer);
        if (changed && base.byteLength) {
          device.queue.writeBuffer(buffer, 0, base);
          device.queue.writeBuffer(poses, 0, basePlanes);
          uploads += 2;
        }
        const selectionChanged =
          changed ||
          selection.length !== previousSelection.length ||
          selection.some((value, index) => value !== previousSelection[index]);
        const planesChanged =
          changed ||
          planes.length !== previousPlanes.length ||
          planes.some((value, index) => value !== previousPlanes[index]);
        if (selectionChanged && selection.byteLength) {
          device.queue.writeBuffer(buffer, base.byteLength, selection);
          uploads++;
        }
        if (planesChanged && planes.byteLength) {
          device.queue.writeBuffer(poses, basePlanes.byteLength, planes);
          uploads++;
        }
        previousSelection = selection;
        previousPlanes = planes;
        if (grew || !groups.length)
          groups = uniforms.map((uniform) =>
            device.createBindGroup({
              layout: geometryLayout,
              entries: [
                { binding: 0, resource: { buffer: root.unwrap(uniform) } },
                { binding: 1, resource: { buffer } },
                { binding: 2, resource: { buffer: poses } },
              ],
            })
          );
        if (changed || lastCount !== count || !opaqueBundles.length) {
          const bundle = (group: GPUBindGroup, transparent: boolean) => {
            const encoder = device.createRenderBundleEncoder({
              colorFormats: transparent
                ? [COLOR_FORMAT, REVEAL_FORMAT]
                : [COLOR_FORMAT],
              depthStencilFormat: DEPTH_FORMAT,
              depthReadOnly: transparent,
            });
            encoder.setPipeline(
              transparent ? transparentPipeline : opaquePipeline
            );
            encoder.setBindGroup(0, group);
            encoder.draw(6, count);
            return encoder.finish();
          };
          opaqueBundles = groups.map((group) => bundle(group, false));
          transparentBundles = groups.map((group) => bundle(group, true));
        }
        lastCount = count;
        const { scale, matrix } = diagnosticProjection(
          frame.view,
          frame.width,
          frame.height
        );
        uniformValues.set(matrix);
        uniformValues.set([scale, frame.pixelRatio, 0, frame.opacity], 16);
        // A common weight scale cancels in the resolve and keeps FP16 sums finite.
        uniformValues.set(
          [
            frame.width,
            frame.height,
            Number(frame.popout),
            Math.min(1, 4096 / Math.max(1, count)),
          ],
          20
        );
        uniformValues.set([...(frame.depthRange ?? [-1, 1]), 0, 0], 24);
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
          const canvas = canvases[index];
          if (
            canvas.width !== width ||
            canvas.height !== height ||
            !canvas.width
          ) {
            canvas.width = width;
            canvas.height = height;
          }
          if (
            targets[index]?.width !== width ||
            targets[index]?.height !== height
          ) {
            destroyTargets(targets[index]);
            targets[index] = createTargets(width, height);
          }
          const target = targets[index]!;
          uniformValues[18] = index;
          device.queue.writeBuffer(
            root.unwrap(uniforms[index]),
            0,
            uniformValues
          );
          const encoder = device.createCommandEncoder();
          const opaquePass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: target.opaque.createView(),
                clearValue: [0, 0, 0, 0],
                loadOp: "clear",
                storeOp: "store",
              },
            ],
            depthStencilAttachment: {
              view: target.depth.createView(),
              depthClearValue: 1,
              depthLoadOp: "clear",
              depthStoreOp: "store",
            },
          });
          opaquePass.executeBundles([opaqueBundles[index]]);
          opaquePass.end();
          const transparentPass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: target.accumulation.createView(),
                clearValue: [0, 0, 0, 0],
                loadOp: "clear",
                storeOp: "store",
              },
              {
                view: target.revealage.createView(),
                clearValue: [1, 1, 1, 1],
                loadOp: "clear",
                storeOp: "store",
              },
            ],
            depthStencilAttachment: {
              view: target.depth.createView(),
              depthReadOnly: true,
            },
          });
          transparentPass.executeBundles([transparentBundles[index]]);
          transparentPass.end();
          const resolvePass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: contexts[index].getCurrentTexture().createView(),
                clearValue: [0, 0, 0, 0],
                loadOp: "clear",
                storeOp: "store",
              },
            ],
          });
          resolvePass.setPipeline(resolvePipeline);
          resolvePass.setBindGroup(0, target.resolve);
          resolvePass.draw(3);
          resolvePass.end();
          device.queue.submit([encoder.finish()]);
        }
        await device.queue.onSubmittedWorkDone();
        if (lost) throw new Error(lost);
        return {
          instances: count,
          bufferBytes: capacity * (byteStride + planeStride),
          uploads,
        };
      },
      dispose() {
        disposed = true;
        device.removeEventListener("uncapturederror", onError);
        for (const target of targets) destroyTargets(target);
        for (const context of contexts) context.unconfigure();
        root.destroy();
      },
    };
  } catch (error) {
    device.removeEventListener("uncapturederror", onError);
    for (const target of targets) destroyTargets(target);
    for (const context of contexts) context.unconfigure();
    root.destroy();
    throw error;
  }
};
