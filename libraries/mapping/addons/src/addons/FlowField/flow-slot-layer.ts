import type { CustomLayerInterface, Map as MapLibreMap } from "maplibre-gl";

/**
 * The flow-field particles as a layer of the map rather than a canvas over it.
 *
 * cage draws the particles on a 2D canvas it lays over the map, which puts them
 * above everything, labels included. This takes that canvas off the screen and
 * draws its content as a MapLibre custom layer instead, so the particles have a
 * place in the layer order like any other layer: a style can put them between
 * its depth raster and its labels (see `style-slot.ts`), and the layers above
 * them in the stack are drawn over them.
 *
 * cage keeps doing everything it did: it sizes the canvas to the map, runs the
 * simulation, fades the trails and warps them on camera moves. Only the last
 * step changes, from the browser compositing the canvas to this layer copying
 * it into the map's frame. The canvas is found by the class name carma hands
 * cage as `id`, and hidden with `visibility`, which leaves cage's own
 * `display` switch (its `setVisible`) alone.
 *
 * A layer of the map is drawn when the map is, so every particle frame has to
 * redraw the whole map. A clock of its own asks for that while the particles
 * move, and `maxFps` caps it.
 */

export type FlowSlotLayerOptions = {
  map: MapLibreMap;
  /** cage's particle canvas */
  canvas: HTMLCanvasElement;
  /** the custom layer's id on the map */
  id?: string;
  /** redraws per second at most; left out, the display's rate */
  maxFps?: number;
  /**
   * Whether the particles are running, i.e. the map is past the zoom gate.
   * Below it cage draws nothing, and the map is not redrawn for it.
   */
  isActive: () => boolean;
};

export type FlowSlotLayerHandle = {
  id: string;
  /** 0..1, the product of the row's and the style's opacity */
  setOpacity: (opacity: number) => void;
  setVisible: (visible: boolean) => void;
  setMaxFps: (maxFps: number | undefined) => void;
  destroy: () => void;
};

const DEFAULT_ID = "flow-field-particles-layer";

/**
 * One triangle over the whole viewport. GLSL 100, so it runs on either WebGL
 * the map was given.
 */
const VERTEX_SHADER = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

/**
 * The canvas pixel under each fragment. The canvas is sized to the map
 * container and the drawing buffer may not be (the map can cap it), so the
 * lookup goes through the fraction of the viewport rather than through pixels.
 * The canvas is stored top-down, hence the flip. Its pixels are uploaded
 * premultiplied, which is what the map's blending expects.
 */
const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_canvas;
uniform vec2 u_size;
uniform float u_opacity;
void main() {
  vec2 uv = gl_FragCoord.xy / u_size;
  uv.y = 1.0 - uv.y;
  gl_FragColor = texture2D(u_canvas, uv) * u_opacity;
}`;

const FULLSCREEN_TRIANGLE = new Float32Array([-1, -1, 3, -1, -1, 3]);

type GL = WebGLRenderingContext | WebGL2RenderingContext;

type Program = {
  program: WebGLProgram;
  buffer: WebGLBuffer;
  texture: WebGLTexture;
  aPos: number;
  uCanvas: WebGLUniformLocation | null;
  uSize: WebGLUniformLocation | null;
  uOpacity: WebGLUniformLocation | null;
};

const compile = (gl: GL, type: number, source: string): WebGLShader => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("[FLOW FIELD] no shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`[FLOW FIELD] shader: ${log ?? "unknown error"}`);
  }
  return shader;
};

const createProgram = (gl: GL): Program => {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  if (!program || !buffer || !texture) {
    throw new Error("[FLOW FIELD] no GL resources");
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(
      `[FLOW FIELD] program: ${gl.getProgramInfoLog(program) ?? "unknown"}`
    );
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, FULLSCREEN_TRIANGLE, gl.STATIC_DRAW);

  // any size, no mipmaps: what WebGL 1 allows for a texture that is not a
  // power of two
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return {
    program,
    buffer,
    texture,
    aPos: gl.getAttribLocation(program, "a_pos"),
    uCanvas: gl.getUniformLocation(program, "u_canvas"),
    uSize: gl.getUniformLocation(program, "u_size"),
    uOpacity: gl.getUniformLocation(program, "u_opacity"),
  };
};

export const createFlowSlotLayer = ({
  map,
  canvas,
  id = DEFAULT_ID,
  maxFps: initialMaxFps,
  isActive,
}: FlowSlotLayerOptions): FlowSlotLayerHandle => {
  let opacity = 1;
  let visible = true;
  let maxFps = initialMaxFps;
  let destroyed = false;
  let program: Program | null = null;

  const previousVisibility = canvas.style.visibility;
  canvas.style.visibility = "hidden";

  const layer: CustomLayerInterface = {
    id,
    type: "custom",
    // drawn flat, and counted as such by cage's occlusion mask, which snapshots
    // the depth in front of the first layer that is not
    renderingMode: "2d",
    onAdd: (_map, gl) => {
      try {
        program = createProgram(gl);
      } catch (error) {
        console.error(error);
        program = null;
      }
    },
    onRemove: (_map, gl) => {
      if (!program) return;
      gl.deleteProgram(program.program);
      gl.deleteBuffer(program.buffer);
      gl.deleteTexture(program.texture);
      program = null;
    },
    render: (gl) => {
      if (!program || !visible || opacity <= 0 || canvas.width === 0) return;
      gl.useProgram(program.program);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, program.texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        canvas
      );
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

      gl.uniform1i(program.uCanvas, 0);
      gl.uniform2f(program.uSize, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(program.uOpacity, opacity);

      gl.bindBuffer(gl.ARRAY_BUFFER, program.buffer);
      gl.enableVertexAttribArray(program.aPos);
      gl.vertexAttribPointer(program.aPos, 2, gl.FLOAT, false, 0, 0);

      // over the map, not in it: no depth, premultiplied blending
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(program.aPos);
    },
  };

  /**
   * Put the layer on the map if it is not there. A style swap the diff cannot
   * follow drops every layer, custom ones included; this brings it back on
   * top, and the host places it again from there.
   */
  const attach = () => {
    if (destroyed || !map.getStyle() || map.getLayer(id)) return;
    map.addLayer(layer);
  };
  attach();
  map.on("styledata", attach);

  // The clock: one redraw per particle frame while the particles move, and
  // one more after they stop, so their last frame does not stay on the map.
  let rafId: number | null = null;
  let lastRepaint = 0;
  let wasRunning = false;
  const tick = (ts: number) => {
    rafId = requestAnimationFrame(tick);
    const running = visible && isActive();
    if (!running && !wasRunning) return;
    wasRunning = running;
    if (maxFps && maxFps > 0 && ts - lastRepaint < 1000 / maxFps - 1) return;
    lastRepaint = ts;
    map.triggerRepaint();
  };
  rafId = requestAnimationFrame(tick);

  return {
    id,
    setOpacity: (next) => {
      opacity = Math.max(0, Math.min(1, next));
      map.triggerRepaint();
    },
    setVisible: (next) => {
      visible = next;
      map.triggerRepaint();
    },
    setMaxFps: (next) => {
      maxFps = next;
    },
    destroy: () => {
      destroyed = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      map.off("styledata", attach);
      if (map.getStyle() && map.getLayer(id)) map.removeLayer(id);
      canvas.style.visibility = previousVisibility;
    },
  };
};
