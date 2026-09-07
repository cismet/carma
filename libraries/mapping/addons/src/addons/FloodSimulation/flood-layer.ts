import {
  MercatorCoordinate,
  type CustomLayerInterface,
  type CustomRenderMethodInput,
  type Map as MaplibreMap,
} from "maplibre-gl";
import * as THREE from "three";

import type { FloodLook } from "./flood-actions";
import {
  loadTerrainPatch,
  NO_DATA_BELOW,
  patchCovers,
  sameRect,
  tileRectForView,
  type ResolvedFloodTerrainSource,
  type TerrainPatch,
  type TileRect,
} from "./terrain-patch";

/**
 * The water as a MapLibre custom layer drawn with three.js.
 *
 * One quad, no terrain mesh. The quad spans the loaded DEM patch and its
 * fragment shader looks the ground height up in the patch texture, so a
 * fragment whose ground is above the water level is discarded and the
 * shoreline follows the DEM at texel resolution, about a metre at z16. The
 * ground itself stays whatever the map draws: the flat basemap, or MapLibre's
 * draped terrain when that is on, in which case the quad sits at the water's
 * true height and is depth-tested against the relief.
 *
 * The rest is lighting, not geometry. Colour deepens with the water depth.
 * Three short wave trains and one long swell give the surface an analytic
 * normal, and a fixed sun turns that into glints and a little slope shading.
 * A current drifts the whole pattern, leans the wave fronts across the flow
 * and draws faint streaks along it. The shoreline gets a light, broken band.
 * All of it is tuned by a `FloodLook` and fades out towards overview scale,
 * where a wave would be smaller than a screen pixel. This is a city's map, so
 * the defaults stay well short of a rendering demo.
 */

export const FLOOD_LAYER_ID = "carma-flood-simulation";

export type FloodLayerOptions = {
  map: MaplibreMap;
  id?: string;
  terrain: ResolvedFloodTerrainSource;
  /** water level in the DEM's height frame (DHHN2016 metres for the NRW DGM1) */
  level: number;
  /** 0..1 */
  opacity: number;
  /** how the water looks and moves */
  look: FloodLook;
  /** MapLibre layer the water is inserted before; default: on top */
  beforeId?: string;
  /**
   * Whether the water moves, which keeps the map repainting while it does.
   * Default: true. A look with both speeds at zero repaints nothing either way.
   */
  animate?: boolean;
  /** the bounds of every patch that lands, for the slider's range */
  onPatch?: (stats: {
    minHeight: number;
    maxHeight: number;
    hasData: boolean;
  }) => void;
  onLoadingChange?: (loading: boolean) => void;
  onError?: (error: unknown) => void;
};

export type FloodLayerHandle = {
  setLevel: (level: number) => void;
  setOpacity: (opacity: number) => void;
  setLook: (look: FloodLook) => void;
  destroy: () => void;
};

/** the swatches, muted rather than saturated: shallow water and deep water */
const SHALLOW_COLOR = "#a6d3ee";
const DEEP_COLOR = "#3f83c4";

/** repaints per second while the water moves */
const ANIMATION_FPS = 30;

/** the sun, in scene axes (x east, y up, z south): from the north-west, well up */
const LIGHT_DIRECTION = new THREE.Vector3(-0.45, 0.8, -0.4).normalize();
/** Blinn half vector for a viewer looking straight down */
const HALF_VECTOR = LIGHT_DIRECTION.clone().add(new THREE.Vector3(0, 1, 0)).normalize();
/** how tight the glints are */
const GLINT_EXPONENT = 60;

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vLocal;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vLocal = world.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D uTerrain;
  uniform vec2 uTexSize;
  uniform vec2 uPixelOrigin;
  uniform float uPixelsPerMeter;
  uniform float uEncoding;
  uniform float uLevel;
  uniform float uOpacity;
  uniform float uMetersPerScreenPixel;
  uniform vec3 uShallow;
  uniform vec3 uDeep;

  // the look
  uniform float uWaveHeight;
  uniform float uWaveLength;
  uniform float uShoreWidth;
  uniform float uDepthScale;
  uniform vec2 uFlowDir;   // unit, scene xz
  uniform float uFlowSpeed;
  // the clocks, advanced in JS so a changed speed never jumps the pattern
  uniform float uWaveTime; // seconds of wave travel
  uniform float uFlowTime; // seconds of current
  uniform vec2 uDrift;     // metres the pattern has drifted with the current

  varying vec2 vLocal;

  const float TAU = 6.28318530718;
  const float GRAVITY = 9.81;
  const vec3 LIGHT = vec3(${LIGHT_DIRECTION.toArray().map((v) => v.toFixed(5)).join(", ")});
  const vec3 HALF = vec3(${HALF_VECTOR.toArray().map((v) => v.toFixed(5)).join(", ")});
  const float GLINT_FLAT = ${Math.pow(HALF_VECTOR.y, GLINT_EXPONENT).toFixed(6)};

  // one deep-water wave train: adds its slope to \`grad\`
  void wave(vec2 p, vec2 dir, float waveLen, float steepness, float t, inout vec2 grad) {
    float k = TAU / waveLen;
    float omega = sqrt(GRAVITY * k);
    // a slow bend along the crest, so the fronts curve instead of ruling the
    // surface into a hatch of straight lines
    float bend = 0.9 * sin(0.13 * k * dot(vec2(-dir.y, dir.x), p));
    float phase = k * dot(dir, p) - omega * t + bend;
    // amplitude is steepness * wavelength, so the slope is steepness * TAU
    grad += dir * (steepness * TAU * cos(phase));
  }

  // the channel bytes back out of the normalised sample
  float decode(vec3 c) {
    vec3 b = floor(c * 255.0 + 0.5);
    if (uEncoding > 0.5) {
      return -10000.0 + (b.r * 65536.0 + b.g * 256.0 + b.b) * 0.1;
    }
    return b.r * 256.0 + b.g + b.b / 256.0 - 32768.0;
  }

  float texel(vec2 ij) {
    return decode(texture2D(uTerrain, (ij + 0.5) / uTexSize).rgb);
  }

  void main() {
    vec2 p = uPixelOrigin + vLocal * uPixelsPerMeter;
    if (p.x < 0.5 || p.y < 0.5 || p.x > uTexSize.x - 0.5 || p.y > uTexSize.y - 0.5) {
      discard;
    }

    // bilinear by hand: the texture is NEAREST because filtering encoded
    // bytes would mix a red step of 256 m into the answer
    vec2 pf = p - 0.5;
    vec2 i = floor(pf);
    vec2 f = pf - i;
    float h00 = texel(i);
    float h10 = texel(i + vec2(1.0, 0.0));
    float h01 = texel(i + vec2(0.0, 1.0));
    float h11 = texel(i + vec2(1.0, 1.0));
    if (min(min(h00, h10), min(h01, h11)) < ${NO_DATA_BELOW.toFixed(1)}) {
      discard;
    }
    float ground = mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);

    float depth = uLevel - ground;
    if (depth <= 0.0) {
      discard;
    }

    float deepness = 1.0 - exp(-depth / uDepthScale);
    vec3 color = mix(uShallow, uDeep, deepness);

    // the pattern rides on the current: sample it upstream of here
    vec2 q = vLocal - uDrift;

    // wave trains lean a little into the current, so a flow reads as fronts
    // across it without all three trains collapsing into one set of stripes.
    // The mix stays well under half, so it cannot cancel a train to zero.
    float lean = clamp(uFlowSpeed / 4.0, 0.0, 0.25);
    vec2 d0 = normalize(mix(vec2(0.80, 0.60), uFlowDir, lean));
    vec2 d1 = normalize(mix(vec2(-0.55, 0.83), uFlowDir, lean));
    vec2 d2 = normalize(mix(vec2(0.20, -0.98), uFlowDir, lean));

    // a wave shorter than two screen pixels would alias into noise, so each
    // family fades out before its length gets there
    float fineWeight = 1.0 - smoothstep(uWaveLength / 6.0, uWaveLength / 2.0, uMetersPerScreenPixel);
    float swellLength = uWaveLength * 7.0;
    float swellWeight = 1.0 - smoothstep(swellLength / 6.0, swellLength / 2.0, uMetersPerScreenPixel);

    // amplitude as a share of wavelength: 2 % at full height, a gentle chop
    float steep = uWaveHeight * 0.02;
    vec2 grad = vec2(0.0);
    if (fineWeight > 0.0) {
      vec2 g = vec2(0.0);
      wave(q, d0, uWaveLength, steep, uWaveTime, g);
      wave(q, d1, uWaveLength * 0.62, steep, uWaveTime + 1.7, g);
      wave(q, d2, uWaveLength * 0.41, steep, uWaveTime + 3.1, g);
      grad += g * fineWeight;
    }
    if (swellWeight > 0.0) {
      vec2 g = vec2(0.0);
      wave(q, vec2(0.71, 0.71), swellLength, steep * 0.3, uWaveTime * 0.6, g);
      wave(q, vec2(-0.35, 0.94), swellLength * 0.7, steep * 0.3, uWaveTime * 0.6 + 2.3, g);
      grad += g * swellWeight;
    }
    vec3 normal = normalize(vec3(-grad.x, 1.0, -grad.y));

    // slope shading: the side facing the sun a little brighter, the other a
    // little darker, nothing on a flat surface
    float shade = dot(normal, LIGHT) - LIGHT.y;
    color *= 1.0 + shade * 0.5;

    // glints: the slope that mirrors the sun into the eye; zero when flat
    float glint = max(pow(max(dot(normal, HALF), 0.0), ${GLINT_EXPONENT.toFixed(1)}) - GLINT_FLAT, 0.0);
    color += glint * 0.5;

    // faint streaks along the current, so its direction can be read
    if (uFlowSpeed > 0.0) {
      vec2 across = vec2(-uFlowDir.y, uFlowDir.x);
      float kAcross = TAU / (uWaveLength * 1.6);
      float kAlong = kAcross * 0.12;
      float along = dot(uFlowDir, q);
      float streaks =
        sin(dot(across, q) * kAcross + 2.0 * sin(along * kAlong * 2.3)) *
        sin(along * kAlong + 0.8 * sin(dot(across, q) * kAcross * 0.37));
      color += streaks * clamp(uFlowSpeed / 1.5, 0.0, 1.0) * 0.03 * fineWeight;
    }

    // a light band on the shoreline, broken up so it does not read as a
    // contour line
    float foam = 0.0;
    if (uShoreWidth > 0.0) {
      float band = 1.0 - smoothstep(0.0, uShoreWidth, depth);
      float ft = uWaveTime + uFlowTime;
      float noise = 0.5 + 0.5 *
        sin(dot(vLocal, vec2(2.1, 1.7)) + ft * 1.3) *
        sin(dot(vLocal, vec2(-1.3, 2.9)) - ft * 0.9);
      foam = band * (0.45 + 0.55 * noise);
    }
    color = mix(color, vec3(0.96, 0.98, 1.0), foam * 0.5);

    // the map has to stay legible under the water, so the ceiling is low;
    // the very edge is feathered so the shoreline is not a jagged texel stair
    float edge = smoothstep(0.0, 0.15, depth);
    float alpha = mix(0.32, 0.55, deepness) + glint * 0.3 + foam * 0.15;
    alpha = min(alpha, 0.85) * edge * uOpacity;
    gl_FragColor = vec4(color, alpha);
  }
`;

const ROTATION_X = new THREE.Matrix4().makeRotationAxis(
  new THREE.Vector3(1, 0, 0),
  Math.PI / 2
);

export const createFloodLayer = (options: FloodLayerOptions): FloodLayerHandle => {
  const {
    map,
    terrain,
    beforeId,
    animate = true,
    onPatch,
    onLoadingChange,
    onError,
  } = options;
  const id = options.id ?? FLOOD_LAYER_ID;

  // Scene origin: the map centre at creation, fixed for the layer's life so
  // vertex coordinates stay small and float32 keeps sub-metre precision.
  const originMerc = MercatorCoordinate.fromLngLat(map.getCenter(), 0);
  const mScale = originMerc.meterInMercatorCoordinateUnits();

  let level = options.level;
  let look = options.look;
  /** whether anything on the surface moves; nothing repaints while it does not */
  let moving = look.waveSpeed > 0 || look.flowSpeed > 0;
  let disposed = false;
  let patch: TerrainPatch | null = null;
  let pendingRect: TileRect | null = null;
  let loadToken = 0;
  let renderer: THREE.WebGLRenderer | null = null;
  let rendererContext: WebGLRenderingContext | WebGL2RenderingContext | null =
    null;
  let texture: THREE.CanvasTexture | null = null;
  let rafHandle = 0;
  let lastRepaint = 0;
  /** the last frame rendered, for the clocks below */
  let lastFrame = performance.now();
  /** seconds the waves have travelled; runs at `waveSpeed` */
  let waveTime = 0;
  /** seconds the current has run; runs at `flowSpeed` */
  let flowTime = 0;
  /** metres the pattern has drifted with the current */
  const drift = new THREE.Vector2(0, 0);
  /** where the current points, unit, scene xz */
  const flowDir = new THREE.Vector2(0, -1);

  const camera = new THREE.Camera();
  const scene = new THREE.Scene();

  const uniforms = {
    uTerrain: { value: null as THREE.Texture | null },
    uTexSize: { value: new THREE.Vector2(1, 1) },
    uPixelOrigin: { value: new THREE.Vector2(0, 0) },
    uPixelsPerMeter: { value: 1 },
    uEncoding: { value: terrain.encoding === "mapbox" ? 1 : 0 },
    uLevel: { value: level },
    uOpacity: { value: options.opacity },
    uMetersPerScreenPixel: { value: 1 },
    uShallow: { value: new THREE.Color(SHALLOW_COLOR) },
    uDeep: { value: new THREE.Color(DEEP_COLOR) },
    uWaveHeight: { value: 0 },
    uWaveLength: { value: 1 },
    uShoreWidth: { value: 0 },
    uDepthScale: { value: 1 },
    uFlowDir: { value: flowDir },
    uFlowSpeed: { value: 0 },
    uWaveTime: { value: 0 },
    uFlowTime: { value: 0 },
    uDrift: { value: drift },
  };

  /** the look into its uniforms; the clocks keep running from where they are */
  const applyLook = (next: FloodLook): void => {
    look = next;
    uniforms.uWaveHeight.value = next.waveHeight;
    uniforms.uWaveLength.value = Math.max(0.5, next.waveLength);
    uniforms.uShoreWidth.value = Math.max(0, next.shoreWidth);
    uniforms.uDepthScale.value = Math.max(0.1, next.depthScale);
    // compass degrees, 0 north, clockwise; scene x is east and scene z south
    const radians = (next.flowDirection * Math.PI) / 180;
    flowDir.set(Math.sin(radians), -Math.cos(radians));
    uniforms.uFlowSpeed.value = Math.max(0, next.flowSpeed);
    moving = next.waveSpeed > 0 || next.flowSpeed > 0;
  };
  applyLook(look);

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(12);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);

  const mesh = new THREE.Mesh(geometry, material);
  // the camera's projection is MapLibre's, and three's bounding-sphere test
  // does not understand it
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);

  /**
   * Where the quad sits vertically. With MapLibre terrain on, the basemap is
   * draped at its true height and the water has to be at its own; without it
   * the basemap is flat at zero and so is the water. Either way the shoreline
   * comes from the shader, not from this.
   */
  const updateHeight = (): void => {
    const mapTerrain = map.getTerrain();
    mesh.position.y = mapTerrain ? level * (mapTerrain.exaggeration ?? 1) : 0;
    mesh.updateMatrixWorld();
  };

  const applyPatch = (next: TerrainPatch): void => {
    texture?.dispose();
    texture = new THREE.CanvasTexture(next.canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.colorSpace = THREE.NoColorSpace;
    texture.needsUpdate = true;
    uniforms.uTerrain.value = texture;

    const n = 2 ** next.zoom;
    const pixelsPerMercator = n * next.tileSize;
    uniforms.uTexSize.value.set(
      next.cols * next.tileSize,
      next.rows * next.tileSize
    );
    uniforms.uPixelsPerMeter.value = mScale * pixelsPerMercator;
    uniforms.uPixelOrigin.value.set(
      originMerc.x * pixelsPerMercator - next.x0 * next.tileSize,
      originMerc.y * pixelsPerMercator - next.y0 * next.tileSize
    );

    // the quad covers the patch exactly, in scene-local metres
    const west = (next.x0 / n - originMerc.x) / mScale;
    const east = ((next.x0 + next.cols) / n - originMerc.x) / mScale;
    const north = (next.y0 / n - originMerc.y) / mScale;
    const south = ((next.y0 + next.rows) / n - originMerc.y) / mScale;
    positions.set([
      west, 0, north,
      east, 0, north,
      east, 0, south,
      west, 0, south,
    ]);
    geometry.attributes.position.needsUpdate = true;

    patch = next;
    mesh.visible = next.hasData;
    map.triggerRepaint();
  };

  /**
   * Load the patch for the current view unless the one on screen still covers
   * it. The old patch stays up while the new one loads; a load overtaken by a
   * newer request is dropped when it lands.
   */
  const ensurePatch = (): void => {
    if (disposed) return;
    const rect = tileRectForView(map, terrain);
    if (patch && patchCovers(patch, rect)) return;
    if (pendingRect && sameRect(pendingRect, rect)) return;

    pendingRect = rect;
    const token = ++loadToken;
    onLoadingChange?.(true);
    loadTerrainPatch(terrain, rect, onError)
      .then((next) => {
        if (disposed || token !== loadToken) return;
        applyPatch(next);
        onPatch?.({
          minHeight: next.minHeight,
          maxHeight: next.maxHeight,
          hasData: next.hasData,
        });
      })
      .catch((error: unknown) => {
        if (!disposed) onError?.(error);
      })
      .finally(() => {
        if (token !== loadToken) return;
        pendingRect = null;
        if (!disposed) onLoadingChange?.(false);
      });
  };

  const layer: CustomLayerInterface = {
    id,
    type: "custom",
    renderingMode: "3d",

    onAdd(
      _map: MaplibreMap,
      gl: WebGLRenderingContext | WebGL2RenderingContext
    ) {
      // a style rebuild takes the layer off and puts it back; the renderer is
      // tied to the context, so it is only rebuilt when that changed
      if (!renderer || rendererContext !== gl) {
        renderer?.dispose();
        renderer = new THREE.WebGLRenderer({
          canvas: map.getCanvas(),
          context: gl,
          antialias: true,
        });
        renderer.autoClear = false;
        rendererContext = gl;
      }
    },

    render(
      gl: WebGLRenderingContext | WebGL2RenderingContext,
      renderOptions: CustomRenderMethodInput
    ) {
      if (!renderer || !patch || !mesh.visible) return;

      const m = new THREE.Matrix4().fromArray(
        renderOptions.defaultProjectionData.mainMatrix as unknown as number[]
      );
      const l = new THREE.Matrix4()
        .makeTranslation(originMerc.x, originMerc.y, originMerc.z)
        .scale(new THREE.Vector3(mScale, -mScale, mScale))
        .multiply(ROTATION_X);
      camera.projectionMatrix = m.multiply(l);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

      // advance the clocks by real time, each at its own speed; a long gap
      // (a hidden tab) is capped so the pattern does not leap
      const now = performance.now();
      const dt = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
      lastFrame = now;
      waveTime += dt * look.waveSpeed;
      flowTime += dt * look.flowSpeed;
      drift.addScaledVector(flowDir, dt * look.flowSpeed);
      uniforms.uWaveTime.value = waveTime;
      uniforms.uFlowTime.value = flowTime;

      // 512 px tiles: the world is 512 * 2^zoom css pixels wide
      uniforms.uMetersPerScreenPixel.value =
        1 / (512 * 2 ** map.getZoom()) / mScale;

      // three's resetState drops the depth range MapLibre set for 3D layers;
      // hand it back so later layers test against the same depth space
      const savedDepthRange = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;
      renderer.resetState();
      renderer.render(scene, camera);
      gl.depthRange(savedDepthRange[0], savedDepthRange[1]);
    },

    onRemove() {
      renderer?.dispose();
      renderer = null;
      rendererContext = null;
    },
  };

  /**
   * Where the water belongs in the style's order: under `beforeId` when the
   * route named one and that layer exists, on top otherwise. The host keeps
   * appending layers after the water is attached (its basemap once the style
   * has loaded, then whatever the visitor adds), and each of those lands
   * above the water. An opaque basemap raster above the water hides it
   * completely, so every style change puts the water back where it belongs.
   * `moveLayer` fires `styledata` again; the position check makes that second
   * pass a no-op rather than a loop.
   */
  const ensureOrder = (): void => {
    if (disposed || !map.getStyle() || !map.getLayer(id)) return;
    const order = map.getLayersOrder();
    const at = order.indexOf(id);
    if (beforeId && map.getLayer(beforeId)) {
      const target = order.indexOf(beforeId);
      if (at !== target - 1) map.moveLayer(id, beforeId);
    } else if (at !== order.length - 1) {
      map.moveLayer(id);
    }
  };

  /** idempotent, and safe from `styledata`: a basemap swap drops custom layers */
  const attach = (): void => {
    if (disposed || !map.getStyle()) return;
    if (map.getLayer(id)) {
      ensureOrder();
      return;
    }
    try {
      map.addLayer(layer, beforeId && map.getLayer(beforeId) ? beforeId : undefined);
    } catch (error) {
      // the style is still loading; `styledata` brings us back here
      console.warn("[FLOOD] could not attach the water layer yet", error);
    }
  };

  const onStyleData = (): void => attach();

  const tick = (now: number): void => {
    if (disposed) return;
    if (mesh.visible && moving && now - lastRepaint >= 1000 / ANIMATION_FPS) {
      lastRepaint = now;
      map.triggerRepaint();
    }
    rafHandle = requestAnimationFrame(tick);
  };

  updateHeight();
  attach();
  map.on("styledata", onStyleData);
  map.on("moveend", ensurePatch);
  map.on("terrain", updateHeight);
  ensurePatch();
  if (animate) {
    rafHandle = requestAnimationFrame(tick);
  }

  return {
    setLevel: (next: number) => {
      if (disposed || level === next) return;
      level = next;
      uniforms.uLevel.value = next;
      updateHeight();
      map.triggerRepaint();
    },
    setOpacity: (next: number) => {
      if (disposed) return;
      uniforms.uOpacity.value = Math.max(0, Math.min(1, next));
      map.triggerRepaint();
    },
    setLook: (next: FloodLook) => {
      if (disposed) return;
      applyLook(next);
      map.triggerRepaint();
    },
    destroy: () => {
      if (disposed) return;
      disposed = true;
      loadToken += 1;
      cancelAnimationFrame(rafHandle);
      map.off("styledata", onStyleData);
      map.off("moveend", ensurePatch);
      map.off("terrain", updateHeight);
      if (map.getStyle() && map.getLayer(id)) {
        map.removeLayer(id);
      }
      texture?.dispose();
      texture = null;
      geometry.dispose();
      material.dispose();
      renderer?.dispose();
      renderer = null;
      map.triggerRepaint();
    },
  };
};
