import { MercatorCoordinate } from "maplibre-gl";
import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
} from "maplibre-gl";

import type { Car } from "./fleet";
import { poseAt, type Track } from "./track";

/**
 * A flashlight on every vehicle: the whole map goes dark, and a soft round
 * spot stays bright around each vehicle that is on the track right now,
 * moving with it.
 *
 * Made for the projection onto the printed city model, where the phone
 * remote already has a pointer that looks exactly like this (the outlet's
 * `PointerSpotlight`): everything dimmed to `dim`, clear inside
 * `radius * (1 - softness)`, fully dimmed outside `radius * (1 + softness)`,
 * a straight ramp in between. Here the spots are the vehicles instead of a
 * finger, so the show can follow the Schwebebahn along the valley without
 * anyone steering.
 *
 * It is one MapLibre custom layer that draws one triangle over the whole
 * screen. The holes are cut in the fragment shader, which gets the spot
 * centres and radii in drawing-buffer pixels as a uniform array: a few dozen
 * distance tests per pixel cost nothing next to redrawing the map, and there
 * is no geometry to rebuild when a vehicle moves. The spots are handed over
 * in lon/lat and projected on every frame with the matrix MapLibre gives the
 * layer, the same one the vehicles are drawn with, so a spot sits on its
 * vehicle while the map pans and zooms, even when the fleet is held.
 *
 * The overlay is black with the dim as its alpha, blended premultiplied
 * (`ONE, ONE_MINUS_SRC_ALPHA`), which darkens whatever is under it and adds
 * nothing. It goes on top of the style, so the Gerüst, the labels and every
 * other layer are dimmed with the rest, and the vehicles show through their
 * holes.
 *
 * Raw WebGL on purpose: the shader is GLSL ES 1.00, which WebGL1 and WebGL2
 * both compile, and three.js would bring a renderer, a scene and a state
 * reset for a single draw call.
 */

/** what a route or a style declares; every field has a default */
export type VehicleSpotlightDefinition = {
  /** radius of the bright spot around each vehicle, in metres. Default: 60 */
  radiusMeters?: number;
  /** how dark the map gets outside the spots, 0..1. Default: 0.75 */
  dim?: number;
  /**
   * The soft edge, as a share of the radius on either side of it: clear
   * inside `radius * (1 - softness)`, fully dimmed outside
   * `radius * (1 + softness)`. Default: 0.2, the pointer's edge.
   */
  softness?: number;
};

/** a spotlight with every default filled in and every value in range */
export type VehicleSpotlight = Required<VehicleSpotlightDefinition>;

export const VEHICLE_SPOTLIGHT_DEFAULT: VehicleSpotlight = {
  radiusMeters: 60,
  dim: 0.75,
  softness: 0.2,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const finiteOr = (value: number | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/**
 * The definition with its defaults, or null for none. A style is hand-written
 * JSON, so a value out of range is pulled back into it rather than trusted:
 * a softness of 1 or more would light the spot's centre only halfway.
 */
export const resolveSpotlight = (
  definition: VehicleSpotlightDefinition | null | undefined
): VehicleSpotlight | null => {
  if (!definition) return null;
  const fallback = VEHICLE_SPOTLIGHT_DEFAULT;
  return {
    radiusMeters: Math.max(
      0,
      finiteOr(definition.radiusMeters, fallback.radiusMeters)
    ),
    dim: clamp(finiteOr(definition.dim, fallback.dim), 0, 1),
    softness: clamp(finiteOr(definition.softness, fallback.softness), 0, 0.95),
  };
};

/**
 * How far a spot reaches from its vehicle, in metres, for everything that
 * has to know whether a spot can be in view while its vehicle is not.
 */
export const spotlightReach = (spotlight: VehicleSpotlight): number =>
  spotlight.radiusMeters * (1 + spotlight.softness);

/**
 * The most spots the shader takes. The fleet is capped at 60 vehicles, so
 * this is every one of them; a context with fewer uniform slots gets fewer,
 * see `spotCapacity`.
 */
export const MAX_SPOTS = 64;

/** where a lit vehicle is: on the ground under it, or up where it hangs */
export type SpotCentre = {
  lon: number;
  lat: number;
  /**
   * Metres above the map's zero: the terrain under the vehicle on the flat
   * map with terrain on, the height it hangs at in 3D, else 0.
   */
  altitude: number;
};

/** a spot as the shader takes it, in drawing-buffer pixels, origin bottom left */
export type ScreenSpot = { x: number; y: number; radius: number };

/**
 * The middle of the vehicle at `distance` along the track.
 *
 * A vehicle's `distance` is its middle already: `carStrips` lays the body
 * out from half a length behind it to half a length ahead. On a closed track
 * the distance is folded back onto the ring first, since `poseAt` clamps
 * rather than wraps.
 */
export const carCentre = (
  track: Track,
  distance: number
): { lon: number; lat: number } => {
  const along = track.closed
    ? ((distance % track.length) + track.length) % track.length
    : distance;
  const { lon, lat } = poseAt(track, along);
  return { lon, lat };
};

/**
 * One spot per vehicle that is on the track, at its middle, in fleet order
 * and at most `limit` of them.
 *
 * "On the track" is `visible`: a timetable fleet takes a vehicle off exactly
 * where the modelled stretch ends, which is the edge of the model, so a
 * vehicle that leaves the model loses its spot with no bounds check here.
 */
export const spotCentres = (
  track: Track,
  cars: readonly Pick<Car, "distance" | "visible">[],
  altitudeAt: (distance: number) => number = () => 0,
  limit: number = MAX_SPOTS
): SpotCentre[] => {
  const spots: SpotCentre[] = [];
  for (const car of cars) {
    if (spots.length >= limit) break;
    if (!car.visible) continue;
    const { lon, lat } = carCentre(track, car.distance);
    spots.push({ lon, lat, altitude: altitudeAt(car.distance) });
  }
  return spots;
};

/**
 * A point in MapLibre's mercator units (0..1 across the world, z in the same
 * units) through a column-major 4x4 matrix into drawing-buffer pixels, origin
 * bottom left like `gl_FragCoord`. Null when the point is behind the camera.
 */
export const projectToBuffer = (
  matrix: ArrayLike<number>,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number
): [number, number] | null => {
  const clipX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
  const clipY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
  const clipW = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  if (!(clipW > 0)) return null;
  return [
    (clipX / clipW + 1) * 0.5 * width,
    (clipY / clipW + 1) * 0.5 * height,
  ];
};

/**
 * A spot in drawing-buffer pixels: its centre, and its radius measured by
 * projecting a point `radiusMeters` east of it at the same height.
 *
 * From straight above, which is how the model is projected, that is the
 * exact radius at every latitude and zoom. On a tilted map a circle on the
 * ground is an ellipse on screen and this stays a circle, as wide as the
 * ellipse is across; near enough for a flashlight.
 */
export const spotInBuffer = (
  matrix: ArrayLike<number>,
  spot: SpotCentre,
  radiusMeters: number,
  width: number,
  height: number
): ScreenSpot | null => {
  const coordinate = MercatorCoordinate.fromLngLat(
    [spot.lon, spot.lat],
    spot.altitude
  );
  const centre = projectToBuffer(
    matrix,
    coordinate.x,
    coordinate.y,
    coordinate.z,
    width,
    height
  );
  if (!centre) return null;
  const east = projectToBuffer(
    matrix,
    coordinate.x + radiusMeters * coordinate.meterInMercatorCoordinateUnits(),
    coordinate.y,
    coordinate.z,
    width,
    height
  );
  if (!east) return null;
  return {
    x: centre[0],
    y: centre[1],
    radius: Math.hypot(east[0] - centre[0], east[1] - centre[1]),
  };
};

/** whether any of a spot's soft edge reaches into a `width` by `height` buffer */
export const spotTouchesBuffer = (
  spot: ScreenSpot,
  softness: number,
  width: number,
  height: number
): boolean => {
  const outer = spot.radius * (1 + softness);
  return (
    spot.x + outer >= 0 &&
    spot.x - outer <= width &&
    spot.y + outer >= 0 &&
    spot.y - outer <= height
  );
};

/**
 * How many spots a context's fragment shader can hold. Each spot takes one
 * uniform slot, and a few are kept for the other uniforms. Every desktop GPU
 * has hundreds, WebGL2 guarantees 224; only an old WebGL1 phone may have
 * fewer than `MAX_SPOTS`, and it lights the first vehicles in view.
 */
export const spotCapacity = (maxFragmentUniformVectors: number): number =>
  clamp(Math.floor(maxFragmentUniformVectors) - 4, 1, MAX_SPOTS);

const VERTEX_SHADER = /* glsl */ `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/**
 * `uSpots` holds x, y and radius in drawing-buffer pixels, `uCount` how many
 * of them are in use. The darkness is the smallest one any spot leaves, so
 * two overlapping spots make one bright patch rather than a darker seam.
 * Highp where the device has it: a squared distance across a 4K buffer is
 * past what mediump holds on a phone.
 */
const fragmentShader = (capacity: number): string => /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#define MAX_SPOTS ${capacity}
uniform vec3 uSpots[MAX_SPOTS];
uniform int uCount;
uniform float uDim;
uniform float uSoftness;
void main() {
  float shade = 1.0;
  for (int i = 0; i < MAX_SPOTS; i++) {
    if (i >= uCount) break;
    vec3 spot = uSpots[i];
    float inner = spot.z * (1.0 - uSoftness);
    float outer = spot.z * (1.0 + uSoftness);
    float along = distance(gl_FragCoord.xy, spot.xy);
    shade = min(shade, clamp((along - inner) / max(outer - inner, 0.001), 0.0, 1.0));
  }
  gl_FragColor = vec4(0.0, 0.0, 0.0, uDim * shade);
}
`;

/** one triangle that covers the whole clip square */
const FULLSCREEN_TRIANGLE = new Float32Array([-1, -1, 3, -1, -1, 3]);

type Gl = WebGLRenderingContext | WebGL2RenderingContext;

type GlResources = {
  gl: Gl;
  program: WebGLProgram;
  buffer: WebGLBuffer;
  capacity: number;
  position: number;
  spots: WebGLUniformLocation | null;
  count: WebGLUniformLocation | null;
  dim: WebGLUniformLocation | null;
  softness: WebGLUniformLocation | null;
  /** the uniform array's backing store, filled on every frame */
  spotData: Float32Array;
};

const compile = (gl: Gl, type: number, source: string): WebGLShader | null => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(
      "[VEHICLE ANIMATION] spotlight shader failed to compile",
      gl.getShaderInfoLog(shader)
    );
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

const createResources = (gl: Gl): GlResources | null => {
  const capacity = spotCapacity(
    gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) as number
  );
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentShader(capacity));
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  if (!vertex || !fragment || !program || !buffer) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    if (program) gl.deleteProgram(program);
    if (buffer) gl.deleteBuffer(buffer);
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  // the program keeps what it linked; the shaders themselves are done
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(
      "[VEHICLE ANIMATION] spotlight program failed to link",
      gl.getProgramInfoLog(program)
    );
    gl.deleteProgram(program);
    gl.deleteBuffer(buffer);
    return null;
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, FULLSCREEN_TRIANGLE, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  return {
    gl,
    program,
    buffer,
    capacity,
    position: gl.getAttribLocation(program, "aPosition"),
    // the location of the array's first element addresses the whole array
    spots: gl.getUniformLocation(program, "uSpots[0]"),
    count: gl.getUniformLocation(program, "uCount"),
    dim: gl.getUniformLocation(program, "uDim"),
    softness: gl.getUniformLocation(program, "uSoftness"),
    spotData: new Float32Array(capacity * 3),
  };
};

const deleteResources = (resources: GlResources): void => {
  resources.gl.deleteProgram(resources.program);
  resources.gl.deleteBuffer(resources.buffer);
};

export type SpotlightLayerOptions = {
  id: string;
  spotlight: VehicleSpotlight;
  /** the fleet's opacity, which the darkness fades with. Default: 1 */
  opacity?: number;
};

export type SpotlightLayer = {
  /** goes on top of the style, after every layer of the fleet */
  layer: CustomLayerInterface;
  /** where the spots are now; the map still has to be asked for a frame */
  setSpots: (spots: readonly SpotCentre[]) => void;
  /**
   * The fleet's opacity. The darkness is part of the animation's look, so a
   * fleet faded out takes its darkness with it rather than leaving the map
   * dimmed around vehicles that are no longer there to see.
   */
  setOpacity: (opacity: number) => void;
  dispose: () => void;
};

export const createSpotlightLayer = ({
  id,
  spotlight,
  opacity: initialOpacity = 1,
}: SpotlightLayerOptions): SpotlightLayer => {
  let spots: readonly SpotCentre[] = [];
  let opacity = clamp(initialOpacity, 0, 1);
  let resources: GlResources | null = null;

  const release = (): void => {
    if (resources) deleteResources(resources);
    resources = null;
  };

  const layer: CustomLayerInterface = {
    id,
    type: "custom",
    renderingMode: "2d",
    onAdd(_map, gl) {
      // a basemap swap removes the layer and adds it again, so the program
      // is built on every add and deleted on every remove
      if (resources?.gl !== gl) {
        release();
        resources = createResources(gl);
      }
    },
    onRemove() {
      release();
    },
    render(gl: Gl, args: CustomRenderMethodInput) {
      const own = resources;
      if (!own || own.gl !== gl) return;
      const dim = spotlight.dim * opacity;
      if (dim <= 0) return;

      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const matrix = args.defaultProjectionData.mainMatrix;
      let count = 0;
      for (const spot of spots) {
        if (count >= own.capacity) break;
        const screen = spotInBuffer(
          matrix,
          spot,
          spotlight.radiusMeters,
          width,
          height
        );
        if (
          !screen ||
          !spotTouchesBuffer(screen, spotlight.softness, width, height)
        ) {
          continue;
        }
        own.spotData[count * 3] = screen.x;
        own.spotData[count * 3 + 1] = screen.y;
        own.spotData[count * 3 + 2] = screen.radius;
        count++;
      }

      gl.useProgram(own.program);
      if (count > 0) {
        gl.uniform3fv(own.spots, own.spotData.subarray(0, count * 3));
      }
      gl.uniform1i(own.count, count);
      gl.uniform1f(own.dim, dim);
      gl.uniform1f(own.softness, spotlight.softness);

      // A plain overlay: no depth, no stencil, every pixel of the buffer.
      // MapLibre unbinds its vertex array before a custom layer and marks
      // all of its cached state dirty afterwards, so what is changed here is
      // set again before its next draw; the attribute array is still switched
      // off again, since that one lives on the default vertex array, outside
      // anything MapLibre tracks.
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.CULL_FACE);
      gl.colorMask(true, true, true, true);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.bindBuffer(gl.ARRAY_BUFFER, own.buffer);
      gl.enableVertexAttribArray(own.position);
      gl.vertexAttribPointer(own.position, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(own.position);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    },
  };

  return {
    layer,
    setSpots: (next) => {
      spots = next;
    },
    setOpacity: (next) => {
      opacity = clamp(next, 0, 1);
    },
    dispose: () => {
      spots = [];
      release();
    },
  };
};
