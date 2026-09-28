import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
} from "maplibre-gl";

import {
  edgePoseAt,
  mercatorOf,
  type EdgePose,
  type TrafficEdge,
  type TrafficNetwork,
} from "./traffic-network";
import { hashUnit } from "./traffic-profile";
import {
  VEHICLE_BUS,
  VEHICLE_SIZE,
  VEHICLE_TRUCK,
  type TrafficVehicle,
} from "./traffic-sim";

/**
 * The traffic on the map: one MapLibre custom layer drawing every vehicle as
 * a small oriented rectangle, straight in WebGL (1 or 2, whichever the map
 * has), from one vertex buffer rebuilt whenever the vehicles have moved.
 *
 * Seen from above at the model's scale a car is two pixels long, so the
 * bodies are drawn `sizeScale` times their real size (2.5 by default). Only
 * the bodies: where the vehicles are stays true, and the sim keeps them apart
 * at the drawn size. The lanes are widened as far as the larger cars need to
 * pass each other, no further; trucks and buses are drawn no wider than a car
 * there, so they stay in their lane too.
 *
 * A body is a rounded box with a few marks, enough to tell a car from a truck
 * from a bus when the map is zoomed in: cars a windscreen, a rear window and
 * a lighter roof, trucks a darker cab in front of the box, buses a windscreen
 * and a roof unit. A darker rim keeps white cars apart from a light map.
 * Vehicles on busier roads are drawn last, so at a bridge the motorway's
 * traffic passes over the street's rather than under it.
 *
 * By day the bodies carry everyday colours. At night (`darkness` from the
 * shown time, 0 to 1) the layer first lays a black veil over the whole map
 * below it, `darkness * nightDim` opaque, then draws the bodies nearly black,
 * and over them the lights with additive blending, so they glow on the dark
 * map: two warm white headlights with a soft cone of light ahead, two red tail
 * lights with a small halo. Twilight blends the two looks.
 *
 * The vertex format is one quad (four vertices, six indices) per shape: the
 * body, and at night the headlight pair, the cone and the tail-light pair.
 * Each vertex carries its position in scene metres, a coordinate inside the
 * shape, a colour and which shape it is, and the fragment shader draws the
 * shape from those. The indices are 16-bit, which WebGL 1 guarantees, so a
 * long buffer is drawn in batches of 16384 quads.
 *
 * Positions are scene metres around the network's origin
 * (`traffic-network.ts`); the matrix from there to clip space is worked out on
 * the CPU in double precision, so the vertices keep centimetres in float32.
 * The map is expected to be flat Mercator: the projection mapping route has no
 * terrain and no globe.
 */

export type TrafficLayerOptions = {
  id: string;
  network: TrafficNetwork;
  /** factor on the body sizes. Default 2.5 */
  sizeScale?: number;
  /** how opaque the night veil gets at full darkness, 0..1. Default 0.8 */
  nightDim?: number;
};

export type TrafficLayer = {
  /** goes into the style; on top, unless a caller has other plans */
  layer: CustomLayerInterface;
  /**
   * Lay the vehicles out for the next frame. The map still has to be asked
   * for one.
   */
  setFrame: (
    vehicles: readonly TrafficVehicle[],
    darkness: number,
    opacity: number
  ) => void;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
};

export const DEFAULT_SIZE_SCALE = 2.5;
export const DEFAULT_NIGHT_DIM = 0.8;

/** a real lane, in metres */
const LANE_WIDTH = 3.2;
/** clear space between two enlarged cars side by side, in metres */
const LANE_GAP = 0.6;

/**
 * INVENTED. The colours of the fleet by day, as sRGB. Cars in the colours
 * most cars have, weighted roughly as often as they are seen; trucks light
 * grey; buses in one colour nothing else on the road has.
 */
const CAR_COLORS: readonly (readonly [string, number])[] = [
  ["#ecebe6", 0.24], // white
  ["#b8bcc1", 0.2], // silver
  ["#7b8087", 0.2], // grey
  ["#222428", 0.22], // black
  ["#23324a", 0.08], // dark blue
  ["#62201f", 0.06], // dark red
];
const TRUCK_COLOR = "#d3d6d9";
const BUS_COLOR = "#f5b700";
const HEADLIGHT_COLOR = "#fff1cf";
const TAIL_LIGHT_COLOR = "#ff2a1a";
/** how far towards black a body goes at full darkness */
const NIGHT_BODY_DARKENING = 0.82;

/** shape codes the fragment shader draws */
const SHAPE_CAR = 0;
const SHAPE_LIGHT_PAIR = 1;
const SHAPE_CONE = 2;
const SHAPE_TRUCK = 3;
const SHAPE_BUS = 4;

/**
 * The light pairs: in units of the glow radius, the dots sit this far either
 * side of the middle; the quad reaches one radius beyond them.
 */
const DOT_OFFSET = 0.55;
/** the pair's quad across, in the same units: one radius beyond either dot */
const PAIR_REACH = DOT_OFFSET + 1;

/**
 * bytes per vertex: position 2 × f32, shape coordinate 2 × f32, colour 4 × u8,
 * shape code and the body's length over its width, 2 × f32
 */
const STRIDE = 28;
const VERTICES_PER_QUAD = 4;
const INDICES_PER_QUAD = 6;
/** 65536 vertices, the reach of a 16-bit index */
const QUADS_PER_BATCH = 16384;

const VERTEX_SHADER = `
precision highp float;
uniform mat4 u_matrix;
attribute vec2 a_position;
attribute vec2 a_shape;
attribute vec4 a_color;
attribute vec2 a_kind;
varying vec2 v_shape;
varying vec4 v_color;
varying vec2 v_kind;
void main() {
  v_shape = a_shape;
  v_color = a_color;
  v_kind = a_kind;
  gl_Position = u_matrix * vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
varying vec2 v_shape;
varying vec4 v_color;
varying vec2 v_kind;

const vec3 GLASS = vec3(0.11, 0.14, 0.18);

// distance to a box of half size b with corners rounded by r, negative inside
float roundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// 1 on a mark from a to b along the body (0 rear, 1 front), w of it across
float mark(float t, float x, float a, float b, float w) {
  return step(a, t) * step(t, b) * step(abs(x), w);
}

void main() {
  float kind = v_kind.x;
  vec3 rgb = v_color.rgb;
  float alpha = 1.0;
  if (kind > 1.5 && kind < 2.5) {
    // the cone: x across (-1..1), y ahead (0 at the bumper, 1 at its reach)
    float reach = v_shape.y;
    float halfWidth = mix(0.35, 1.0, reach);
    float across = 1.0 - smoothstep(0.4 * halfWidth, halfWidth, abs(v_shape.x));
    float fall = pow(max(1.0 - reach, 0.0), 1.3) * smoothstep(0.0, 0.06, reach);
    alpha = 0.7 * across * fall;
  } else if (kind > 0.5 && kind < 1.5) {
    // a pair of lamps: bright cores with a soft halo
    float d = min(
      length(v_shape - vec2(${DOT_OFFSET.toFixed(3)}, 0.0)),
      length(v_shape + vec2(${DOT_OFFSET.toFixed(3)}, 0.0))
    );
    float core = 1.0 - smoothstep(0.3, 0.5, d);
    float halo = 0.8 * exp(-d * d * 2.5);
    alpha = max(core, halo);
  } else {
    // a body, in half widths: x across (-1..1), y along (-aspect..aspect)
    float aspect = v_kind.y;
    float x = v_shape.x;
    float t = 0.5 * (v_shape.y + 1.0);
    float corner = kind > 2.5 ? 0.25 : 0.5;
    float d = roundedBox(vec2(x, v_shape.y * aspect), vec2(1.0, aspect), corner);
    alpha = 1.0 - smoothstep(-0.1, 0.0, d);
    if (kind > 3.5) {
      // bus: windscreen, and a roof unit a shade darker
      rgb = mix(rgb, rgb * 0.82, mark(t, x, 0.38, 0.6, 0.5));
      rgb = mix(rgb, GLASS, mark(t, x, 0.935, 0.975, 0.8));
    } else if (kind > 2.5) {
      // truck: a darker cab ahead of the box, a seam between them
      rgb = mix(rgb, rgb * 0.62, step(0.8, t));
      rgb = mix(rgb, rgb * 0.5, mark(t, x, 0.78, 0.8, 1.0));
      rgb = mix(rgb, GLASS, mark(t, x, 0.905, 0.955, 0.8));
    } else {
      // car: a lighter roof between the windscreen and the rear window
      rgb = mix(rgb, min(rgb * 1.12 + 0.03, 1.0), mark(t, x, 0.3, 0.6, 0.74));
      rgb = mix(rgb, GLASS, mark(t, x, 0.6, 0.72, 0.8));
      rgb = mix(rgb, GLASS, mark(t, x, 0.2, 0.3, 0.76));
    }
    rgb *= mix(1.0, 0.72, smoothstep(-0.3, -0.15, d));
  }
  float a = alpha * v_color.a;
  gl_FragColor = vec4(rgb * a, a);
}
`;

const VEIL_VERTEX_SHADER = `
attribute vec2 a_clip;
void main() {
  gl_Position = vec4(a_clip, 0.0, 1.0);
}
`;

const VEIL_FRAGMENT_SHADER = `
precision mediump float;
uniform float u_alpha;
void main() {
  gl_FragColor = vec4(0.0, 0.0, 0.0, u_alpha);
}
`;

type Rgb = readonly [number, number, number];

const rgbOf = (hex: string): Rgb => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

const CAR_RGB = CAR_COLORS.map(([hex]) => rgbOf(hex));
const CAR_WEIGHTS = (() => {
  const total = CAR_COLORS.reduce((sum, [, weight]) => sum + weight, 0);
  let sum = 0;
  return CAR_COLORS.map(([, weight]) => (sum += weight / total));
})();
const TRUCK_RGB = rgbOf(TRUCK_COLOR);
const BUS_RGB = rgbOf(BUS_COLOR);
const HEADLIGHT_RGB = rgbOf(HEADLIGHT_COLOR);
const TAIL_LIGHT_RGB = rgbOf(TAIL_LIGHT_COLOR);

/** a vehicle's day colour: fixed by its id, so it keeps it for its whole trip */
const colorOf = (vehicle: TrafficVehicle): Rgb => {
  if (vehicle.kind === VEHICLE_BUS) return BUS_RGB;
  if (vehicle.kind === VEHICLE_TRUCK) return TRUCK_RGB;
  const roll = hashUnit(vehicle.id, 7);
  const index = CAR_WEIGHTS.findIndex((limit) => roll < limit);
  return CAR_RGB[index < 0 ? CAR_RGB.length - 1 : index];
};

const compile = (
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("[TRAFFIC] no shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`[TRAFFIC] shader: ${log ?? "does not compile"}`);
  }
  return shader;
};

const link = (
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram => {
  const program = gl.createProgram();
  if (!program) throw new Error("[TRAFFIC] no program");
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`[TRAFFIC] program: ${log ?? "does not link"}`);
  }
  return program;
};

/** what the layer holds on the GPU between `onAdd` and `onRemove` */
type GpuState = {
  gl: WebGLRenderingContext | WebGL2RenderingContext;
  program: WebGLProgram;
  veilProgram: WebGLProgram;
  vertexBuffer: WebGLBuffer;
  indexBuffer: WebGLBuffer;
  veilBuffer: WebGLBuffer;
  attributes: {
    position: number;
    shape: number;
    color: number;
    kind: number;
    clip: number;
  };
  uniforms: {
    matrix: WebGLUniformLocation | null;
    veilAlpha: WebGLUniformLocation | null;
  };
};

export const createTrafficLayer = ({
  id,
  network,
  sizeScale = DEFAULT_SIZE_SCALE,
  nightDim = DEFAULT_NIGHT_DIM,
}: TrafficLayerOptions): TrafficLayer => {
  const { edges, origin, unitsPerMeter } = network;
  const [originX, originY] = mercatorOf(origin[0], origin[1]);
  const laneWidth = Math.max(
    LANE_WIDTH,
    VEHICLE_SIZE[0][1] * sizeScale + LANE_GAP
  );
  const widestBody = laneWidth - LANE_GAP;
  /** busier roads last, so their vehicles are drawn over the others */
  const byLoad = (a: TrafficVehicle, b: TrafficVehicle): number =>
    edges[a.edge].bel - edges[b.edge].bel;
  const drawOrder: TrafficVehicle[] = [];

  let bytes = new ArrayBuffer(0);
  let floats = new Float32Array(bytes);
  let colors = new Uint8Array(bytes);
  let bodyQuads = 0;
  let lightQuads = 0;
  let veilAlpha = 0;
  let dirty = false;
  let visible = true;
  let gpu: GpuState | null = null;
  const matrix = new Float32Array(16);
  const pose: EdgePose = { x: 0, y: 0, dx: 1, dy: 0 };

  const reserve = (quads: number): void => {
    const needed = quads * VERTICES_PER_QUAD * STRIDE;
    if (needed <= bytes.byteLength) return;
    bytes = new ArrayBuffer(Math.max(needed, bytes.byteLength * 2, 4096 * STRIDE));
    floats = new Float32Array(bytes);
    colors = new Uint8Array(bytes);
  };

  /**
   * One quad: `center` plus `along` × [alongFrom, alongTo] and `right` ×
   * [-halfWidth, halfWidth], with the shape coordinate running over
   * [shapeX0, shapeX1] across and [shapeY0, shapeY1] along.
   */
  const writeQuad = (
    quad: number,
    cx: number,
    cy: number,
    ax: number,
    ay: number,
    alongFrom: number,
    alongTo: number,
    halfWidth: number,
    shapeX0: number,
    shapeX1: number,
    shapeY0: number,
    shapeY1: number,
    rgb: Rgb,
    alpha: number,
    kind: number,
    aspect = 0
  ): void => {
    // right of the direction of travel, x east and y north
    const rx = ay;
    const ry = -ax;
    const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    for (let corner = 0; corner < 4; corner++) {
      const isFront = corner === 1 || corner === 2;
      const isRight = corner >= 2;
      const along = isFront ? alongTo : alongFrom;
      const across = isRight ? halfWidth : -halfWidth;
      const vertex = quad * VERTICES_PER_QUAD + corner;
      const f = (vertex * STRIDE) / 4;
      floats[f] = cx + ax * along + rx * across;
      floats[f + 1] = cy + ay * along + ry * across;
      floats[f + 2] = isRight ? shapeX1 : shapeX0;
      floats[f + 3] = isFront ? shapeY1 : shapeY0;
      const c = vertex * STRIDE + 16;
      colors[c] = rgb[0];
      colors[c + 1] = rgb[1];
      colors[c + 2] = rgb[2];
      colors[c + 3] = a;
      floats[f + 5] = kind;
      floats[f + 6] = aspect;
    }
  };

  const nightBody = (rgb: Rgb, darkness: number): Rgb => {
    const keep = 1 - NIGHT_BODY_DARKENING * darkness;
    return [rgb[0] * keep, rgb[1] * keep, rgb[2] * keep];
  };

  const setFrame = (
    vehicles: readonly TrafficVehicle[],
    darkness: number,
    opacity: number
  ): void => {
    const lit = darkness > 0.01;
    const count = vehicles.length;
    reserve(count * (lit ? 4 : 1));
    bodyQuads = count;
    lightQuads = lit ? count * 3 : 0;
    veilAlpha = Math.max(0, Math.min(1, darkness * nightDim * opacity));

    drawOrder.length = 0;
    for (const vehicle of vehicles) drawOrder.push(vehicle);
    drawOrder.sort(byLoad);

    for (let index = 0; index < count; index++) {
      const vehicle = drawOrder[index];
      const edge: TrafficEdge = edges[vehicle.edge];
      const along = vehicle.forward
        ? vehicle.travelled
        : edge.length - vehicle.travelled;
      edgePoseAt(edge, along, pose);
      const ax = vehicle.forward ? pose.dx : -pose.dx;
      const ay = vehicle.forward ? pose.dy : -pose.dy;
      const offset = (vehicle.lane + 0.5) * laneWidth;
      // right of travel is (ay, -ax)
      const cx = pose.x + ay * offset;
      const cy = pose.y - ax * offset;
      const [realLength, realWidth] = VEHICLE_SIZE[vehicle.kind];
      const length = realLength * sizeScale;
      const width = Math.min(realWidth * sizeScale, widestBody);
      const alpha = vehicle.fade * opacity;
      const body = colorOf(vehicle);

      writeQuad(
        index,
        cx,
        cy,
        ax,
        ay,
        -length / 2,
        length / 2,
        width / 2,
        -1,
        1,
        -1,
        1,
        lit ? nightBody(body, darkness) : body,
        alpha,
        vehicle.kind === VEHICLE_BUS
          ? SHAPE_BUS
          : vehicle.kind === VEHICLE_TRUCK
          ? SHAPE_TRUCK
          : SHAPE_CAR,
        length / width
      );
      if (!lit) continue;

      const lightAlpha = alpha * darkness;
      const quad = count + index * 3;
      const headRadius = 0.6 * width;
      const tailRadius = 0.5 * width;
      writeQuad(
        quad,
        cx,
        cy,
        ax,
        ay,
        length / 2 - headRadius,
        length / 2 + headRadius,
        PAIR_REACH * headRadius,
        -PAIR_REACH,
        PAIR_REACH,
        -1,
        1,
        HEADLIGHT_RGB,
        lightAlpha,
        SHAPE_LIGHT_PAIR
      );
      writeQuad(
        quad + 1,
        cx,
        cy,
        ax,
        ay,
        length / 2,
        length / 2 + 10 * width,
        1.5 * width,
        -1,
        1,
        0,
        1,
        HEADLIGHT_RGB,
        lightAlpha,
        SHAPE_CONE
      );
      writeQuad(
        quad + 2,
        cx,
        cy,
        ax,
        ay,
        -length / 2 - tailRadius,
        -length / 2 + tailRadius,
        PAIR_REACH * tailRadius,
        -PAIR_REACH,
        PAIR_REACH,
        -1,
        1,
        TAIL_LIGHT_RGB,
        lightAlpha,
        SHAPE_LIGHT_PAIR
      );
    }
    dirty = true;
  };

  /** the static indices of a full batch: two triangles per quad */
  const batchIndices = (): Uint16Array => {
    const indices = new Uint16Array(QUADS_PER_BATCH * INDICES_PER_QUAD);
    for (let quad = 0; quad < QUADS_PER_BATCH; quad++) {
      const vertex = quad * VERTICES_PER_QUAD;
      const at = quad * INDICES_PER_QUAD;
      indices[at] = vertex;
      indices[at + 1] = vertex + 1;
      indices[at + 2] = vertex + 2;
      indices[at + 3] = vertex;
      indices[at + 4] = vertex + 2;
      indices[at + 5] = vertex + 3;
    }
    return indices;
  };

  const release = (): void => {
    if (!gpu) return;
    const { gl } = gpu;
    gl.deleteBuffer(gpu.vertexBuffer);
    gl.deleteBuffer(gpu.indexBuffer);
    gl.deleteBuffer(gpu.veilBuffer);
    gl.deleteProgram(gpu.program);
    gl.deleteProgram(gpu.veilProgram);
    gpu = null;
  };

  /** points the vertex attributes at the batch starting `firstQuad` quads in */
  const bindBatch = (state: GpuState, firstQuad: number): void => {
    const { gl, attributes } = state;
    const base = firstQuad * VERTICES_PER_QUAD * STRIDE;
    gl.vertexAttribPointer(attributes.position, 2, gl.FLOAT, false, STRIDE, base);
    gl.vertexAttribPointer(attributes.shape, 2, gl.FLOAT, false, STRIDE, base + 8);
    gl.vertexAttribPointer(
      attributes.color,
      4,
      gl.UNSIGNED_BYTE,
      true,
      STRIDE,
      base + 16
    );
    gl.vertexAttribPointer(attributes.kind, 2, gl.FLOAT, false, STRIDE, base + 20);
  };

  const drawQuads = (state: GpuState, first: number, count: number): void => {
    const { gl } = state;
    for (let done = 0; done < count; done += QUADS_PER_BATCH) {
      const batch = Math.min(QUADS_PER_BATCH, count - done);
      bindBatch(state, first + done);
      gl.drawElements(
        gl.TRIANGLES,
        batch * INDICES_PER_QUAD,
        gl.UNSIGNED_SHORT,
        0
      );
    }
  };

  /**
   * MapLibre's view matrix times the scene's own: scene metres to Mercator
   * (origin, scale, y flipped to point south), in double precision.
   */
  const updateMatrix = (main: ArrayLike<number>): void => {
    const k = unitsPerMeter;
    for (let row = 0; row < 4; row++) {
      matrix[row] = main[row] * k;
      matrix[4 + row] = -main[4 + row] * k;
      matrix[8 + row] = main[8 + row];
      matrix[12 + row] =
        main[row] * originX + main[4 + row] * originY + main[12 + row];
    }
  };

  const layer: CustomLayerInterface = {
    id,
    type: "custom",
    renderingMode: "2d",
    onAdd(_map, gl) {
      release();
      const program = link(gl, VERTEX_SHADER, FRAGMENT_SHADER);
      const veilProgram = link(gl, VEIL_VERTEX_SHADER, VEIL_FRAGMENT_SHADER);
      const vertexBuffer = gl.createBuffer();
      const indexBuffer = gl.createBuffer();
      const veilBuffer = gl.createBuffer();
      if (!vertexBuffer || !indexBuffer || !veilBuffer) {
        throw new Error("[TRAFFIC] no buffers");
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, batchIndices(), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, veilBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW
      );
      gpu = {
        gl,
        program,
        veilProgram,
        vertexBuffer,
        indexBuffer,
        veilBuffer,
        attributes: {
          position: gl.getAttribLocation(program, "a_position"),
          shape: gl.getAttribLocation(program, "a_shape"),
          color: gl.getAttribLocation(program, "a_color"),
          kind: gl.getAttribLocation(program, "a_kind"),
          clip: gl.getAttribLocation(veilProgram, "a_clip"),
        },
        uniforms: {
          matrix: gl.getUniformLocation(program, "u_matrix"),
          veilAlpha: gl.getUniformLocation(veilProgram, "u_alpha"),
        },
      };
      // the buffer on the GPU is new and empty
      dirty = true;
    },
    onRemove() {
      release();
    },
    render(
      gl: WebGLRenderingContext | WebGL2RenderingContext,
      args: CustomRenderMethodInput
    ) {
      const state = gpu;
      if (!state || !visible) return;
      const totalQuads = bodyQuads + lightQuads;
      if (totalQuads === 0 && veilAlpha <= 0) return;

      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);

      // the veil: black over everything drawn so far, premultiplied
      if (veilAlpha > 0) {
        gl.useProgram(state.veilProgram);
        gl.uniform1f(state.uniforms.veilAlpha, veilAlpha);
        gl.bindBuffer(gl.ARRAY_BUFFER, state.veilBuffer);
        gl.enableVertexAttribArray(state.attributes.clip);
        gl.vertexAttribPointer(state.attributes.clip, 2, gl.FLOAT, false, 0, 0);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.disableVertexAttribArray(state.attributes.clip);
      }
      if (totalQuads === 0) return;

      gl.bindBuffer(gl.ARRAY_BUFFER, state.vertexBuffer);
      if (dirty) {
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Uint8Array(bytes, 0, totalQuads * VERTICES_PER_QUAD * STRIDE),
          gl.DYNAMIC_DRAW
        );
        dirty = false;
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, state.indexBuffer);
      gl.useProgram(state.program);
      updateMatrix(
        args.defaultProjectionData.mainMatrix as unknown as ArrayLike<number>
      );
      gl.uniformMatrix4fv(state.uniforms.matrix, false, matrix);
      const { position, shape, color, kind } = state.attributes;
      gl.enableVertexAttribArray(position);
      gl.enableVertexAttribArray(shape);
      gl.enableVertexAttribArray(color);
      gl.enableVertexAttribArray(kind);

      // bodies over the map, lights added on top of them
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      drawQuads(state, 0, bodyQuads);
      if (lightQuads > 0) {
        // add the colour, leave the canvas's alpha alone
        gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
        drawQuads(state, bodyQuads, lightQuads);
      }

      gl.disableVertexAttribArray(position);
      gl.disableVertexAttribArray(shape);
      gl.disableVertexAttribArray(color);
      gl.disableVertexAttribArray(kind);
    },
  };

  return {
    layer,
    setFrame,
    setVisible: (next) => {
      visible = next;
    },
    dispose: release,
  };
};
