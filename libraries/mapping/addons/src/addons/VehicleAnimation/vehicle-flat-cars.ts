import { MercatorCoordinate } from "maplibre-gl";
import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as MapLibreMap,
} from "maplibre-gl";
import * as THREE from "three";

import type { CarStrip } from "./track";

/**
 * The vehicles of the flat renderer, drawn by the GPU straight from a vertex
 * buffer in one MapLibre custom layer.
 *
 * They used to be a GeoJSON source rewritten on every frame. `setData` hands
 * the collection to a worker, which rebuilds the source's tile index, and the
 * map then reloads every tile of the source: all of it for a few dozen small
 * rings, sixty times a second. Here the rings are laid out as triangles in a
 * buffer instead, uploaded once per drawn frame. The custom layer takes the
 * place of the old fill and line layers in the style, so whatever was drawn
 * over the vehicles still is: the Gerüst, the station labels, `beforeId`.
 *
 * Positions are Mercator relative to `origin`, scaled to metres there, so the
 * buffer's float32 keeps millimetres. They are converted from lon/lat vertex
 * by vertex: a single metre scale for the whole scene would bend the vehicles
 * off a track that runs for kilometres north and south of the origin.
 *
 * The rim is one continuous band around each section, pushed out in screen
 * space by the vertex shader, so it keeps its width in pixels at every zoom
 * like the line layer it replaces, with the same soft edge. Every point of
 * the band takes its direction from both neighbours, so the band turns its
 * corners without two pieces of it ever covering the same pixel: where they
 * did, the soft edge was drawn twice and the rim came out dotted.
 */

export type FlatCarColors = {
  body: string;
  joint: string;
  outline: string;
  /** the body of the selected vehicle */
  highlight: string;
  /** the rim of the selected vehicle */
  highlightOutline: string;
};

/** one vehicle as the layer draws it */
export type FlatCar = {
  /** the vehicle's index in the fleet, which is what a pick answers with */
  index: number;
  strips: CarStrip[];
  selected: boolean;
  /** metres above sea level to draw it at: the ground with terrain on, else 0 */
  elevation: number;
};

export type FlatCarLayerOptions = {
  id: string;
  map: MapLibreMap;
  /** lon/lat near the vehicles, e.g. the track's first point */
  origin: [number, number];
  colors: FlatCarColors;
  opacity: number;
};

export type FlatCarLayer = {
  /** goes into the style where the vehicles belong */
  layer: CustomLayerInterface;
  /** replace what is drawn; the map still has to be asked for a frame */
  setCars: (cars: FlatCar[]) => void;
  setOpacity: (opacity: number) => void;
  /** the vehicle covering (lon, lat) in the last cars set, as its fleet index, or null */
  pick: (lon: number, lat: number) => number | null;
  dispose: () => void;
};

/** rim widths in CSS pixels, as the line layer had them */
const OUTLINE_WIDTH = 1.2;
const SELECTED_OUTLINE_WIDTH = 2;
/** an articulation's long sides get a hairline in its own colour, for the soft edge a MapLibre fill has */
const JOINT_EDGE_WIDTH = 1;

const FILL_VERTEX_SHADER = /* glsl */ `
attribute vec3 rgb;
varying vec3 vColor;
void main() {
  vColor = rgb;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FILL_FRAGMENT_SHADER = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, uOpacity);
}
`;

/**
 * Every point of a rim comes as two vertices, one per side, and knows its
 * neighbours along the rim. Both are projected, and the vertex is pushed out
 * along the corner's bisector far enough to keep the band's width on either
 * leg. At the open end of a chain the missing neighbour is the point itself.
 */
const OUTLINE_VERTEX_SHADER = /* glsl */ `
uniform vec2 uViewport;
uniform float uPixelRatio;
attribute vec3 previous;
attribute vec3 next;
attribute float side;
attribute float width;
attribute vec3 rgb;
varying vec3 vColor;
varying float vAcross;
varying float vHalfWidth;

vec2 toScreen(vec4 clip) {
  return clip.xy / clip.w * uViewport * 0.5;
}

void main() {
  mat4 transform = projectionMatrix * modelViewMatrix;
  vec4 here = transform * vec4(position, 1.0);
  vec2 point = toScreen(here);
  vec2 incoming = point - toScreen(transform * vec4(previous, 1.0));
  vec2 outgoing = toScreen(transform * vec4(next, 1.0)) - point;
  float incomingLength = length(incoming);
  float outgoingLength = length(outgoing);
  vec2 dirIn = incomingLength > 1e-6 ? incoming / incomingLength : vec2(0.0);
  vec2 dirOut = outgoingLength > 1e-6 ? outgoing / outgoingLength : vec2(0.0);
  if (incomingLength <= 1e-6) dirIn = dirOut;
  if (outgoingLength <= 1e-6) dirOut = dirIn;
  vec2 normalIn = vec2(-dirIn.y, dirIn.x);
  vec2 normalOut = vec2(-dirOut.y, dirOut.x);
  vec2 miter = normalIn + normalOut;
  float miterLength = length(miter);
  miter = miterLength > 1e-6 ? miter / miterLength : normalIn;
  // a sharp corner would push the miter out without bound; past twice the
  // width it is cut off
  float stretch = 1.0 / max(dot(miter, normalIn), 0.5);
  float halfWidth = width * 0.5 * uPixelRatio;
  // half a pixel more for the soft edge
  float reach = halfWidth + 0.5;
  vec2 offset = miter * side * reach * stretch;
  gl_Position = vec4((point + offset) / (uViewport * 0.5) * here.w, here.z, here.w);
  vColor = rgb;
  vAcross = side * reach;
  vHalfWidth = halfWidth;
}
`;

const OUTLINE_FRAGMENT_SHADER = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;
varying float vAcross;
varying float vHalfWidth;
void main() {
  float coverage = clamp(vHalfWidth + 0.5 - abs(vAcross), 0.0, 1.0);
  gl_FragColor = vec4(vColor, coverage * uOpacity);
}
`;

/** a CSS colour as the sRGB triple the shaders write out unchanged */
const rgbOf = (css: string): [number, number, number] => {
  const target = { r: 0, g: 0, b: 0 };
  new THREE.Color(css).getRGB(target, THREE.SRGBColorSpace);
  return [target.r, target.g, target.b];
};

const mercatorY = (lat: number): number =>
  (180 -
    (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) /
  360;

/**
 * An indexed mesh whose buffers are rewritten in place: they grow when a
 * frame needs more room and are otherwise reused, and only the part in use
 * is uploaded.
 */
const dynamicMesh = (
  attributes: readonly (readonly [name: string, size: number])[],
  material: THREE.Material
) => {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.frustumCulled = false;
  const arrays = new Map<string, Float32Array>();
  let indices = new Uint32Array(0);
  let vertexCapacity = 0;
  let indexCapacity = 0;

  return {
    mesh,
    /** room for this many vertices and indices; arrays handed out before may be replaced */
    reserve: (vertexCount: number, indexCount: number): void => {
      if (vertexCount <= vertexCapacity && indexCount <= indexCapacity) return;
      vertexCapacity = Math.max(vertexCount, vertexCapacity * 2, 1024);
      indexCapacity = Math.max(indexCount, indexCapacity * 2, 1536);
      mesh.geometry.dispose();
      const geometry = new THREE.BufferGeometry();
      for (const [name, size] of attributes) {
        const array = new Float32Array(vertexCapacity * size);
        arrays.set(name, array);
        geometry.setAttribute(
          name,
          new THREE.BufferAttribute(array, size).setUsage(
            THREE.DynamicDrawUsage
          )
        );
      }
      indices = new Uint32Array(indexCapacity);
      geometry.setIndex(
        new THREE.BufferAttribute(indices, 1).setUsage(THREE.DynamicDrawUsage)
      );
      mesh.geometry = geometry;
    },
    array: (name: string): Float32Array => {
      const array = arrays.get(name);
      if (!array) throw new Error(`[VEHICLE ANIMATION] no buffer ${name}`);
      return array;
    },
    indices: (): Uint32Array => indices,
    /** draw the first `indexCount` indices and upload just what is in use */
    commit: (vertexCount: number, indexCount: number): void => {
      const { geometry } = mesh;
      const upload = (
        attribute: THREE.BufferAttribute | null | undefined,
        count: number
      ): void => {
        if (!attribute) return;
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, count);
        attribute.needsUpdate = true;
      };
      for (const [name, size] of attributes) {
        upload(
          geometry.getAttribute(name) as THREE.BufferAttribute | undefined,
          vertexCount * size
        );
      }
      upload(geometry.getIndex(), indexCount);
      geometry.setDrawRange(0, indexCount);
    },
    dispose: (): void => {
      mesh.geometry.dispose();
    },
  };
};

/** even-odd test of (x, y) against a ring given as x, y pairs */
const insideRing = (ring: Float64Array, x: number, y: number): boolean => {
  let inside = false;
  const count = ring.length / 2;
  for (let i = 0, j = count - 1; i < count; j = i++) {
    const xi = ring[2 * i];
    const yi = ring[2 * i + 1];
    const xj = ring[2 * j];
    const yj = ring[2 * j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
};

export const createFlatCarLayer = ({
  id,
  map,
  origin,
  colors,
  opacity: initialOpacity,
}: FlatCarLayerOptions): FlatCarLayer => {
  const originMercator = MercatorCoordinate.fromLngLat(
    { lng: origin[0], lat: origin[1] },
    0
  );
  const meterScale = originMercator.meterInMercatorCoordinateUnits();
  const model = new THREE.Matrix4()
    .makeTranslation(originMercator.x, originMercator.y, 0)
    .scale(new THREE.Vector3(meterScale, -meterScale, meterScale));

  /** lon/lat to the scene's metres east and north of the origin, in Mercator */
  const sceneX = (lon: number): number =>
    ((lon + 180) / 360 - originMercator.x) / meterScale;
  const sceneY = (lat: number): number =>
    (originMercator.y - mercatorY(lat)) / meterScale;

  const bodyRgb = rgbOf(colors.body);
  const jointRgb = rgbOf(colors.joint);
  const outlineRgb = rgbOf(colors.outline);
  const highlightRgb = rgbOf(colors.highlight);
  const highlightOutlineRgb = rgbOf(colors.highlightOutline);

  const opacityUniform = { value: initialOpacity };
  const viewportUniform = { value: new THREE.Vector2(1, 1) };
  const pixelRatioUniform = { value: 1 };

  const fillMaterial = new THREE.ShaderMaterial({
    vertexShader: FILL_VERTEX_SHADER,
    fragmentShader: FILL_FRAGMENT_SHADER,
    uniforms: { uOpacity: opacityUniform },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const outlineMaterial = new THREE.ShaderMaterial({
    vertexShader: OUTLINE_VERTEX_SHADER,
    fragmentShader: OUTLINE_FRAGMENT_SHADER,
    uniforms: {
      uOpacity: opacityUniform,
      uViewport: viewportUniform,
      uPixelRatio: pixelRatioUniform,
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const fills = dynamicMesh(
    [
      ["position", 3],
      ["rgb", 3],
    ],
    fillMaterial
  );
  const outlines = dynamicMesh(
    [
      ["position", 3],
      ["previous", 3],
      ["next", 3],
      ["side", 1],
      ["width", 1],
      ["rgb", 3],
    ],
    outlineMaterial
  );
  // the rims go over the bodies, as the line layer went over the fills
  fills.mesh.renderOrder = 0;
  outlines.mesh.renderOrder = 1;

  const scene = new THREE.Scene();
  scene.add(fills.mesh, outlines.mesh);
  const camera = new THREE.Camera();
  let renderer: THREE.WebGLRenderer | null = null;

  /** the last cars set, as rings in scene metres, for picking */
  let pickable: { index: number; rings: Float64Array[] }[] = [];

  const setCars = (cars: FlatCar[]): void => {
    let fillVertexCount = 0;
    let fillIndexCount = 0;
    let outlineVertexCount = 0;
    let outlineIndexCount = 0;
    for (const car of cars) {
      for (const strip of car.strips) {
        const n = strip.left.length;
        fillVertexCount += 2 * n;
        fillIndexCount += (n - 1) * 6;
        // two vertices per rim point: a section's whole ring, an
        // articulation's two long sides as open chains
        outlineVertexCount += 4 * n;
        outlineIndexCount +=
          (strip.kind === "section" ? 2 * n : 2 * (n - 1)) * 6;
      }
    }
    fills.reserve(fillVertexCount, fillIndexCount);
    outlines.reserve(outlineVertexCount, outlineIndexCount);

    const fillPosition = fills.array("position");
    const fillColors = fills.array("rgb");
    const fillIndices = fills.indices();
    const outlinePosition = outlines.array("position");
    const outlinePrevious = outlines.array("previous");
    const outlineNext = outlines.array("next");
    const outlineSide = outlines.array("side");
    const outlineWidth = outlines.array("width");
    const outlineColors = outlines.array("rgb");
    const outlineIndices = outlines.indices();

    let fillVertex = 0;
    let fillIndex = 0;
    let outlineVertex = 0;
    let outlineIndex = 0;
    let z = 0;

    const setPoint = (
      target: Float32Array,
      vertex: number,
      ring: Float64Array,
      point: number
    ): void => {
      target[vertex * 3] = ring[2 * point];
      target[vertex * 3 + 1] = ring[2 * point + 1];
      target[vertex * 3 + 2] = z;
    };

    const setColor = (
      target: Float32Array,
      vertex: number,
      rgb: readonly number[]
    ): void => {
      target[vertex * 3] = rgb[0];
      target[vertex * 3 + 1] = rgb[1];
      target[vertex * 3 + 2] = rgb[2];
    };

    /**
     * A run of `count` ring points, `start` onwards in steps of `step`, as a
     * band of two vertices per point. A closed one joins its last point back
     * to its first.
     */
    const rim = (
      ring: Float64Array,
      start: number,
      step: number,
      count: number,
      closed: boolean,
      width: number,
      rgb: readonly number[]
    ): void => {
      const first = outlineVertex;
      const pointAt = (k: number): number => start + step * k;
      for (let k = 0; k < count; k++) {
        const point = pointAt(k);
        const previous =
          k > 0 ? pointAt(k - 1) : closed ? pointAt(count - 1) : point;
        const next =
          k < count - 1 ? pointAt(k + 1) : closed ? pointAt(0) : point;
        for (const side of [1, -1]) {
          setPoint(outlinePosition, outlineVertex, ring, point);
          setPoint(outlinePrevious, outlineVertex, ring, previous);
          setPoint(outlineNext, outlineVertex, ring, next);
          outlineSide[outlineVertex] = side;
          outlineWidth[outlineVertex] = width;
          setColor(outlineColors, outlineVertex, rgb);
          outlineVertex++;
        }
      }
      const segments = closed ? count : count - 1;
      for (let k = 0; k < segments; k++) {
        const a = first + 2 * k;
        const b = first + 2 * ((k + 1) % count);
        outlineIndices[outlineIndex++] = a;
        outlineIndices[outlineIndex++] = a + 1;
        outlineIndices[outlineIndex++] = b;
        outlineIndices[outlineIndex++] = a + 1;
        outlineIndices[outlineIndex++] = b + 1;
        outlineIndices[outlineIndex++] = b;
      }
    };

    pickable = cars.map((car) => {
      z = car.elevation;
      const rings = car.strips.map((strip) => {
        const n = strip.left.length;
        // the ring runs up the left edge and back down the right one, so
        // point i faces point 2n - 1 - i
        const ring = new Float64Array(4 * n);
        for (let i = 0; i < n; i++) {
          const [leftLon, leftLat] = strip.left[i];
          const [rightLon, rightLat] = strip.right[i];
          ring[2 * i] = sceneX(leftLon);
          ring[2 * i + 1] = sceneY(leftLat);
          ring[2 * (2 * n - 1 - i)] = sceneX(rightLon);
          ring[2 * (2 * n - 1 - i) + 1] = sceneY(rightLat);
        }

        const isSection = strip.kind === "section";
        const fillRgb = !isSection
          ? jointRgb
          : car.selected
          ? highlightRgb
          : bodyRgb;
        const base = fillVertex;
        for (let point = 0; point < 2 * n; point++) {
          setPoint(fillPosition, fillVertex, ring, point);
          setColor(fillColors, fillVertex, fillRgb);
          fillVertex++;
        }
        for (let i = 0; i + 1 < n; i++) {
          const left = base + i;
          const right = base + 2 * n - 1 - i;
          fillIndices[fillIndex++] = left;
          fillIndices[fillIndex++] = right;
          fillIndices[fillIndex++] = left + 1;
          fillIndices[fillIndex++] = right;
          fillIndices[fillIndex++] = right - 1;
          fillIndices[fillIndex++] = left + 1;
        }

        if (isSection) {
          rim(
            ring,
            0,
            1,
            2 * n,
            true,
            car.selected ? SELECTED_OUTLINE_WIDTH : OUTLINE_WIDTH,
            car.selected ? highlightOutlineRgb : outlineRgb
          );
        } else {
          rim(ring, 0, 1, n, false, JOINT_EDGE_WIDTH, jointRgb);
          rim(ring, 2 * n - 1, -1, n, false, JOINT_EDGE_WIDTH, jointRgb);
        }
        return ring;
      });
      return { index: car.index, rings };
    });

    fills.commit(fillVertex, fillIndex);
    outlines.commit(outlineVertex, outlineIndex);
  };

  const layer: CustomLayerInterface = {
    id,
    type: "custom",
    renderingMode: "2d",
    onAdd(_map, gl) {
      renderer?.dispose();
      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
      });
      renderer.autoClear = false;
    },
    render(
      gl: WebGLRenderingContext | WebGL2RenderingContext,
      args: CustomRenderMethodInput
    ) {
      if (!renderer) return;
      camera.projectionMatrix
        .fromArray(args.defaultProjectionData.mainMatrix as unknown as number[])
        .multiply(model);
      viewportUniform.value.set(gl.drawingBufferWidth, gl.drawingBufferHeight);
      pixelRatioUniform.value = map.getPixelRatio();

      // MapLibre's depth range must survive three's state reset, or the
      // symbol layers after this one test against the wrong depth space
      const savedDepthRange = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;
      renderer.resetState();
      renderer.render(scene, camera);
      gl.depthRange(savedDepthRange[0], savedDepthRange[1]);
    },
  };

  return {
    layer,
    setCars,
    setOpacity: (opacity) => {
      opacityUniform.value = opacity;
    },
    pick: (lon, lat) => {
      const x = sceneX(lon);
      const y = sceneY(lat);
      for (const { index, rings } of pickable) {
        if (rings.some((ring) => insideRing(ring, x, y))) return index;
      }
      return null;
    },
    dispose: () => {
      fills.dispose();
      outlines.dispose();
      fillMaterial.dispose();
      outlineMaterial.dispose();
      renderer?.dispose();
      renderer = null;
    },
  };
};
