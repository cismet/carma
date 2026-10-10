import {
  BufferAttribute,
  CanvasTexture,
  DynamicDrawUsage,
  BufferGeometry,
  GreaterDepth,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type {
  AnnotationSceneLineCollection,
  AnnotationSceneLineCollectionOptions,
  AnnotationSceneLineHandle,
  AnnotationSceneLineOptions,
  AnnotationSceneLineStyle,
} from "@carma-mapping/annotations/runtime";

import { parseCssColor } from "./css-color";
import type { MapLibreAnnotationScene } from "./maplibre-annotation-scene";
import {
  MAPLIBRE_AREA_FILL_STYLE_DEFAULTS,
  resolveRulerMajorPitchMeters,
  resolveRulerPitchMeters,
  type ResolvedMapLibreAreaFillStyle,
} from "./maplibre-area-fill-style";

/**
 * Annotation lines in the shared Three.js scene: `Line2` with CSS-pixel widths
 * drawn in MapLibre's framebuffer, so the mesh and the terrain depth-test them
 * like any other content. The occluded part of a line is a second draw of the
 * same geometry that only passes where the scene is nearer (`GreaterDepth`),
 * dashed and faint, on top: the Cesium `depthFailMaterial` idea, replacing
 * the SVG overlay trace the Cesium runtime drew for hidden edges. A line
 * with the ruler flag carries dots at the metric beat and larger dots at
 * the major beats, placed per frame so they keep their screen size.
 */

export const MAPLIBRE_SCENE_LINE_DEFAULTS = Object.freeze({
  renderOrder: 1_000,
  occludedRenderOrder: 1_001,
  occludedOpacity: 0.45,
  occludedDashPx: 6,
  occludedGapPx: 4,
  /** Pulls the visible pass a hair toward the camera so surface-hugging lines do not z-fight. */
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
  /** Ruler dots move this far toward the camera; points cannot use the polygon offset. */
  rulerDotLiftMeters: 0.2,
  /** Extra quad width in physical pixels the line sides fade out over. */
  edgeFeatherPx: 1,
});

/** Shared-scene positions the annotation can be drawn with, or null while one is unprojectable. */
const resolveScenePositions = (
  scene: MapLibreAnnotationScene,
  positionsECEF: readonly Vector3[]
): number[] | null => {
  const flat: number[] = [];
  const scratch = new Vector3();
  for (const position of positionsECEF) {
    const scenePosition = scene.sceneFromEcef(position, scratch);
    if (!scenePosition) return null;
    flat.push(scenePosition.x, scenePosition.y, scenePosition.z);
  }
  return flat;
};

const LINE_PASS = {
  /** Depth-tested, continuous. */
  VISIBLE: "visible",
  /** Depth-fail, dashed in CSS pixels, faint, on top. */
  OCCLUDED: "occluded",
} as const;

type LinePass = (typeof LINE_PASS)[keyof typeof LINE_PASS];

/**
 * The MapLibre canvas has no MSAA and `LineMaterial` cuts its sides hard,
 * so the sides fade out over one physical pixel instead. The quad is drawn
 * `edgeFeatherPx` wider than the line (see the width update), the coverage
 * ramp runs over that rim and the line keeps its width.
 */
/** Dots a line stops under: at most this many per line. */
const RULER_CUT_MAX = 128;

type LineCutUniforms = {
  rulerCuts: { value: Float32Array };
  rulerCutCount: { value: number };
};

const lineCutUniforms = (material: LineMaterial): LineCutUniforms =>
  material.userData["lineCuts"] as LineCutUniforms;

/**
 * Hands a line the screen circles of its ruler dots, in physical pixels from
 * the bottom left as `gl_FragCoord` counts them, as flat x, y, radius
 * triples. The line fades out inside them, so it stops under a dot instead
 * of showing through its see-through core.
 */
const setLineCuts = (material: LineMaterial, cuts: readonly number[]) => {
  const uniforms = lineCutUniforms(material);
  const count = Math.min(cuts.length / 3, RULER_CUT_MAX);
  if (count === 0 && uniforms.rulerCutCount.value === 0) return;
  uniforms.rulerCuts.value.set(cuts.slice(0, count * 3));
  uniforms.rulerCutCount.value = count;
};

/**
 * The MapLibre canvas has no MSAA and `LineMaterial` cuts its sides hard,
 * so the sides fade out over one physical pixel instead. The quad is drawn
 * `edgeFeatherPx` wider than the line (see the width update), the coverage
 * ramp runs over that rim and the line keeps its width. The same pass
 * leaves out the circles of the line's ruler dots, see `setLineCuts`.
 */
const featherLineEdges = (material: LineMaterial): void => {
  const cuts: LineCutUniforms = {
    rulerCuts: { value: new Float32Array(RULER_CUT_MAX * 3) },
    rulerCutCount: { value: 0 },
  };
  material.userData["lineCuts"] = cuts;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, cuts);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        `uniform vec3 rulerCuts[ ${RULER_CUT_MAX} ];
      uniform int rulerCutCount;
      void main() {`
      )
      .replace(
        "#include <logdepthbuf_fragment>",
        `{
        float capB = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
        float across = abs( vUv.y ) > 1.0
          ? sqrt( vUv.x * vUv.x + capB * capB )
          : abs( vUv.x );
        alpha *= clamp( ( 1.0 - across ) * 0.5 * linewidth, 0.0, 1.0 );
        for ( int i = 0; i < ${RULER_CUT_MAX}; i ++ ) {
          if ( i >= rulerCutCount ) break;
          vec3 cut = rulerCuts[ i ];
          alpha *= smoothstep( cut.z - 0.75, cut.z + 0.75, distance( gl_FragCoord.xy, cut.xy ) );
        }
      }
      #include <logdepthbuf_fragment>`
      );
  };
};

const createLineMaterial = (
  style: AnnotationSceneLineStyle,
  pass: LinePass
): LineMaterial => {
  const { color, opacity } = parseCssColor(style.color);
  const occluded = pass === LINE_PASS.OCCLUDED;
  const material = new LineMaterial({
    color: color.getHex(),
    linewidth: style.width,
    transparent: true,
    opacity: occluded
      ? opacity * MAPLIBRE_SCENE_LINE_DEFAULTS.occludedOpacity
      : opacity,
    depthWrite: false,
    depthTest: true,
    dashed: occluded,
  });
  featherLineEdges(material);
  if (occluded) {
    material.depthFunc = GreaterDepth;
    material.dashSize = MAPLIBRE_SCENE_LINE_DEFAULTS.occludedDashPx;
    material.gapSize = MAPLIBRE_SCENE_LINE_DEFAULTS.occludedGapPx;
  } else {
    material.polygonOffset = true;
    material.polygonOffsetFactor =
      MAPLIBRE_SCENE_LINE_DEFAULTS.polygonOffsetFactor;
    material.polygonOffsetUnits =
      MAPLIBRE_SCENE_LINE_DEFAULTS.polygonOffsetUnits;
  }
  return material;
};

/**
 * A ruler dot as a texture: a disc in the fill colour inside a ring in the
 * stroke colour, drawn smooth on a canvas so small dots keep round edges.
 * Cached per look; null without a 2D canvas (tests).
 */
const RULER_DOT_TEXTURE_SIZE = 64;
/** `rulerDotStroke` value for a ring in the colour of the line. */
const RULER_DOT_STROKE_LINE_COLOR = "currentColor";
const rulerDotTextures = new Map<string, CanvasTexture | null>();
const resolveRulerDotTexture = (
  fill: string,
  stroke: string | null,
  ringShare: number
) => {
  const key = `${fill}|${stroke ?? ""}|${ringShare.toFixed(3)}`;
  const cached = rulerDotTextures.get(key);
  if (cached !== undefined) return cached;
  const canvas =
    typeof document === "undefined" ? null : document.createElement("canvas");
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas?.getContext("2d") ?? null;
  } catch {
    context = null;
  }
  if (!canvas || !context) {
    rulerDotTextures.set(key, null);
    return null;
  }
  const size = RULER_DOT_TEXTURE_SIZE;
  const radius = size / 2 - 1;
  canvas.width = size;
  canvas.height = size;
  const drawDisc = (color: string, discRadius: number) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(size / 2, size / 2, discRadius, 0, Math.PI * 2);
    context.fill();
  };
  if (stroke && ringShare > 0) {
    drawDisc(stroke, radius);
    // Cut the ring open first so a translucent fill shows the scene, not the ring.
    const innerRadius = radius * Math.max(0, 1 - ringShare);
    context.globalCompositeOperation = "destination-out";
    drawDisc("#000000", innerRadius);
    context.globalCompositeOperation = "source-over";
    drawDisc(fill, innerRadius);
  } else {
    drawDisc(fill, radius);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  rulerDotTextures.set(key, texture);
  return texture;
};

/** The dots of a ruler line: one point cloud per size. */
type SceneRuler = {
  minor: Points<BufferGeometry, PointsMaterial>;
  major: Points<BufferGeometry, PointsMaterial>;
};

const resolveRulerDotFill = (
  style: AnnotationSceneLineStyle,
  rulerStyle: ResolvedMapLibreAreaFillStyle
) => {
  if (rulerStyle.rulerDotFill) return rulerStyle.rulerDotFill;
  const { color } = parseCssColor(style.color);
  return `#${color
    .clone()
    .multiplyScalar(rulerStyle.rulerDotTintFactor)
    .getHexString()}`;
};

const createRulerDots = (
  scene: MapLibreAnnotationScene,
  id: string,
  style: AnnotationSceneLineStyle,
  rulerStyle: ResolvedMapLibreAreaFillStyle,
  dotWidthFactor: number
) => {
  const { color: lineColor, opacity } = parseCssColor(style.color);
  const fill = resolveRulerDotFill(style, rulerStyle);
  const stroke =
    rulerStyle.rulerDotStroke === RULER_DOT_STROKE_LINE_COLOR
      ? `#${lineColor.getHexString()}`
      : rulerStyle.rulerDotStroke;
  // The ring keeps its width in line widths whatever the dot size.
  const ringShare =
    (2 * rulerStyle.rulerDotStrokeWidthFactor) / Math.max(dotWidthFactor, 1e-6);
  const texture = resolveRulerDotTexture(fill, stroke, ringShare);
  const material = new PointsMaterial({
    color: texture ? 0xffffff : parseCssColor(fill).color.getHex(),
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    sizeAttenuation: false,
  });
  if (texture) {
    material.map = texture;
    material.alphaTest = 0.01;
  }
  const dots = new Points(new BufferGeometry(), material);
  dots.frustumCulled = false;
  dots.renderOrder = MAPLIBRE_SCENE_LINE_DEFAULTS.renderOrder + 1;
  dots.userData.annotationPickId = id;
  dots.visible = false;
  scene.root.add(dots);
  return dots;
};

const createRuler = (
  scene: MapLibreAnnotationScene,
  id: string,
  style: AnnotationSceneLineStyle,
  rulerStyle: ResolvedMapLibreAreaFillStyle
): SceneRuler => ({
  minor: createRulerDots(
    scene,
    id,
    style,
    rulerStyle,
    rulerStyle.rulerMinorDotWidthFactor
  ),
  major: createRulerDots(
    scene,
    id,
    style,
    rulerStyle,
    rulerStyle.rulerMajorDotWidthFactor
  ),
});

const disposeRulerDots = (
  scene: MapLibreAnnotationScene,
  dots: Points<BufferGeometry, PointsMaterial>
) => {
  scene.root.remove(dots);
  dots.geometry.dispose();
  dots.material.dispose();
};

const disposeRuler = (
  scene: MapLibreAnnotationScene,
  ruler: SceneRuler | null
) => {
  if (!ruler) return;
  disposeRulerDots(scene, ruler.minor);
  disposeRulerDots(scene, ruler.major);
};

/**
 * The dots of one size: positions go into a reused dynamic buffer and are
 * uploaded only when they moved, so a static view uploads nothing and a
 * moving one reuses the buffer instead of creating one per frame.
 */
const RULER_DOT_MIN_CAPACITY = 64;
const applyRulerDots = (
  dots: Points<BufferGeometry, PointsMaterial>,
  positions: number[],
  sizePx: number
) => {
  dots.visible = positions.length > 0;
  dots.material.size = sizePx;
  if (positions.length === 0) return;
  const geometry = dots.geometry;
  const count = positions.length / 3;
  const current = geometry.getAttribute("position") as
    | BufferAttribute
    | undefined;
  if (current && current.array.length >= positions.length) {
    const array = current.array as Float32Array;
    let unchanged = geometry.drawRange.count === count;
    for (let index = 0; unchanged && index < positions.length; index += 1) {
      if (array[index] !== Math.fround(positions[index]!)) unchanged = false;
    }
    if (unchanged) return;
    array.set(positions);
    current.needsUpdate = true;
  } else {
    // Growing: release the old buffer before the larger one replaces it.
    geometry.dispose();
    const array = new Float32Array(
      Math.max(positions.length * 2, RULER_DOT_MIN_CAPACITY * 3)
    );
    array.set(positions);
    const attribute = new BufferAttribute(array, 3);
    attribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute("position", attribute);
  }
  geometry.setDrawRange(0, count);
  geometry.computeBoundingSphere();
};

type SceneLineEntry = {
  id: string;
  positionsECEF: Vector3[];
  style: AnnotationSceneLineStyle;
  visible: boolean;
  line: Line2;
  occludedLine: Line2 | null;
  ruler: SceneRuler | null;
  vertexCount: number;
  /** The scene positions last uploaded; an equal frame uploads nothing. */
  uploadedFlat: number[] | null;
  /** This frame's ruler dot circles, see `setLineCuts`; empty without dots. */
  rulerCuts: number[];
};

const setEntryLineCuts = (entry: SceneLineEntry, cuts: readonly number[]) => {
  setLineCuts(entry.line.material as LineMaterial, cuts);
  if (entry.occludedLine) {
    setLineCuts(entry.occludedLine.material as LineMaterial, cuts);
  }
};

/**
 * Every line of a scene stops under every ruler dot of that scene, whichever
 * collection draws it: a tool's draft lines and the runtime's edges come
 * from different collections and lie on top of each other while a
 * measurement is drawn. The union is built before the draw, after every
 * collection has placed this frame's dots.
 */
const sceneLineCutRegistries = new WeakMap<
  MapLibreAnnotationScene,
  { collections: Set<Set<SceneLineEntry>>; unsubscribe: () => void }
>();

const joinSceneLineCuts = (
  scene: MapLibreAnnotationScene,
  entries: Set<SceneLineEntry>
): (() => void) => {
  let registry = sceneLineCutRegistries.get(scene);
  if (!registry) {
    const collections = new Set<Set<SceneLineEntry>>();
    const unsubscribe = scene.subscribePreRender(() => {
      const cuts: number[] = [];
      for (const collection of collections) {
        for (const entry of collection) {
          if (entry.visible) cuts.push(...entry.rulerCuts);
        }
      }
      for (const collection of collections) {
        for (const entry of collection) setEntryLineCuts(entry, cuts);
      }
    });
    registry = { collections, unsubscribe };
    sceneLineCutRegistries.set(scene, registry);
  }
  const joined = registry;
  joined.collections.add(entries);
  return () => {
    joined.collections.delete(entries);
    if (joined.collections.size === 0) {
      joined.unsubscribe();
      sceneLineCutRegistries.delete(scene);
    }
  };
};

export const createMapLibreSceneLineCollection = (
  scene: MapLibreAnnotationScene,
  _options: AnnotationSceneLineCollectionOptions = {},
  /** The ruler of metric lines shares the grid pitch of the area fills. */
  rulerStyle: ResolvedMapLibreAreaFillStyle = MAPLIBRE_AREA_FILL_STYLE_DEFAULTS
): AnnotationSceneLineCollection => {
  const entries = new Set<SceneLineEntry>();
  const leaveSceneLineCuts = joinSceneLineCuts(scene, entries);
  let destroyed = false;
  const midpoint = new Vector3();
  const beatECEF = new Vector3();
  const beatScene = new Vector3();
  const cameraScene = new Vector3();
  const towardCamera = new Vector3();
  const screenScratch = { x: 0, y: 0 };

  /**
   * Dots on the line at every beat from the first vertex, larger ones at
   * the major beats, sized from the line width. Beats near a vertex or a
   * segment midpoint are left out: the node markers and the insert ticks
   * of a selected measurement sit there.
   */
  const applyRuler = (
    entry: SceneLineEntry,
    ruler: SceneRuler,
    pixelsPerMeter: number,
    pixelRatio: number
  ) => {
    const camera = scene.getCameraScenePosition(cameraScene);
    if (!camera || !(pixelsPerMeter > 0)) {
      ruler.minor.visible = false;
      ruler.major.visible = false;
      entry.rulerCuts = [];
      return;
    }
    const beat = resolveRulerPitchMeters(pixelsPerMeter, rulerStyle);
    const major = resolveRulerMajorPitchMeters(beat);
    const clearance = rulerStyle.rulerMarkerClearanceCssPx;
    const keepClear: Vector2[] = [];
    const positions = entry.positionsECEF;
    for (let index = 0; index < positions.length; index += 1) {
      const vertex = scene.worldToScreen(positions[index]!, screenScratch);
      if (vertex) keepClear.push(new Vector2(vertex.x, vertex.y));
      if (index + 1 < positions.length) {
        beatECEF
          .addVectors(positions[index]!, positions[index + 1]!)
          .multiplyScalar(0.5);
        const handle = scene.worldToScreen(beatECEF, screenScratch);
        if (handle) keepClear.push(new Vector2(handle.x, handle.y));
      }
    }
    const minorPositions: number[] = [];
    const majorPositions: number[] = [];
    const width = entry.style.width * pixelRatio;
    const minorSizePx = width * rulerStyle.rulerMinorDotWidthFactor;
    const majorSizePx = width * rulerStyle.rulerMajorDotWidthFactor;
    const viewportHeight = scene.getCssViewport().height;
    const cuts: number[] = [];
    let travelled = 0;
    let nextBeat = beat;
    for (let index = 0; index + 1 < positions.length; index += 1) {
      const start = positions[index]!;
      const end = positions[index + 1]!;
      const length = start.distanceTo(end);
      if (!(length > 0)) continue;
      while (nextBeat <= travelled + length) {
        const t = (nextBeat - travelled) / length;
        beatECEF.lerpVectors(start, end, t);
        const isMajor =
          Math.abs(nextBeat / major - Math.round(nextBeat / major)) < 1e-6;
        nextBeat += beat;
        const screen = scene.worldToScreen(beatECEF, screenScratch);
        if (!screen) continue;
        if (
          keepClear.some(
            (point) =>
              Math.hypot(point.x - screen.x, point.y - screen.y) < clearance
          )
        ) {
          continue;
        }
        if (!scene.sceneFromEcef(beatECEF, beatScene)) continue;
        // Points get no polygon offset, so a dot on a surface-hugging line
        // would z-fight with the mesh: lift it a little toward the camera.
        towardCamera.subVectors(camera, beatScene);
        const range = towardCamera.length();
        if (range > 0) {
          beatScene.addScaledVector(
            towardCamera,
            Math.min(
              MAPLIBRE_SCENE_LINE_DEFAULTS.rulerDotLiftMeters,
              range / 2
            ) / range
          );
        }
        (isMajor ? majorPositions : minorPositions).push(
          beatScene.x,
          beatScene.y,
          beatScene.z
        );
        cuts.push(
          screen.x * pixelRatio,
          (viewportHeight - screen.y) * pixelRatio,
          (isMajor ? majorSizePx : minorSizePx) / 2
        );
      }
      travelled += length;
    }
    applyRulerDots(ruler.minor, minorPositions, minorSizePx);
    applyRulerDots(ruler.major, majorPositions, majorSizePx);
    entry.rulerCuts = cuts;
  };

  const applyGeometry = (entry: SceneLineEntry) => {
    const flat = resolveScenePositions(scene, entry.positionsECEF);
    const drawable = entry.visible && flat !== null && flat.length >= 6;
    entry.line.visible = drawable;
    if (entry.occludedLine) entry.occludedLine.visible = drawable;
    if (!drawable || !flat) {
      if (entry.ruler) {
        entry.ruler.minor.visible = false;
        entry.ruler.major.visible = false;
      }
      return;
    }
    const vertexCount = flat.length / 3;
    const targets = [entry.line, entry.occludedLine].filter(
      (line): line is Line2 => line !== null
    );
    // The frame hook runs this every frame; the scene positions only move
    // with the measurement or the placement, so most frames upload nothing
    // (a `setPositions` creates new GPU buffers each time).
    const unchanged =
      vertexCount === entry.vertexCount &&
      entry.uploadedFlat !== null &&
      entry.uploadedFlat.length === flat.length &&
      entry.uploadedFlat.every((value, index) => value === flat[index]);
    if (!unchanged) {
      if (vertexCount !== entry.vertexCount) {
        // `LineGeometry.setPositions` keeps the instance count; a new vertex
        // count needs a fresh geometry.
        for (const line of targets) {
          line.geometry.dispose();
          line.geometry = new LineGeometry();
        }
        entry.vertexCount = vertexCount;
      }
      for (const line of targets) {
        line.geometry.setPositions(flat);
        line.computeLineDistances();
      }
      entry.uploadedFlat = flat;
    }
    // `LineSegments2` resets the resolution to the physical viewport before
    // every draw, so the width is in physical pixels: scale the CSS-pixel
    // width the runtime asks for by the pixel ratio, and the line looks the
    // same as the Cesium polyline of that width while staying crisp.
    const pixelRatio = scene.getPixelRatio();
    const lineWidthPx =
      entry.style.width * pixelRatio +
      MAPLIBRE_SCENE_LINE_DEFAULTS.edgeFeatherPx;
    const visibleMaterial = entry.line.material as LineMaterial;
    visibleMaterial.linewidth = lineWidthPx;
    midpoint.set(
      (flat[0]! + flat[flat.length - 3]!) / 2,
      (flat[1]! + flat[flat.length - 2]!) / 2,
      (flat[2]! + flat[flat.length - 1]!) / 2
    );
    const pixelsPerMeter = scene.getPixelsPerMeterAtScene(midpoint);
    if (entry.ruler) {
      applyRuler(entry, entry.ruler, pixelsPerMeter, pixelRatio);
    } else {
      entry.rulerCuts = [];
    }
    if (entry.occludedLine) {
      const material = entry.occludedLine.material as LineMaterial;
      material.linewidth = lineWidthPx;
      if (pixelsPerMeter > 0) {
        // Dash lengths are world units; scale them to CSS pixels at the line.
        material.dashSize =
          MAPLIBRE_SCENE_LINE_DEFAULTS.occludedDashPx / pixelsPerMeter;
        material.gapSize =
          MAPLIBRE_SCENE_LINE_DEFAULTS.occludedGapPx / pixelsPerMeter;
      }
    }
  };

  const unsubscribeFrame = scene.subscribeFrameUpdate(() => {
    for (const entry of entries) applyGeometry(entry);
  });

  const createLine = (
    entry: Pick<SceneLineEntry, "id" | "style">,
    pass: LinePass
  ) => {
    const line = new Line2(
      new LineGeometry(),
      createLineMaterial(entry.style, pass)
    );
    line.frustumCulled = false;
    line.renderOrder =
      pass === LINE_PASS.OCCLUDED
        ? MAPLIBRE_SCENE_LINE_DEFAULTS.occludedRenderOrder
        : MAPLIBRE_SCENE_LINE_DEFAULTS.renderOrder;
    line.userData.annotationPickId = entry.id;
    line.visible = false;
    scene.root.add(line);
    return line;
  };

  const disposeLine = (line: Line2 | null) => {
    if (!line) return;
    scene.root.remove(line);
    line.geometry.dispose();
    (line.material as LineMaterial).dispose();
  };

  return {
    addLine: (
      options: AnnotationSceneLineOptions
    ): AnnotationSceneLineHandle => {
      const style: AnnotationSceneLineStyle = {
        color: options.color,
        width: options.width,
        occludedDashed: options.occludedDashed,
        ruler: options.ruler,
      };
      const entry: SceneLineEntry = {
        id: options.id,
        positionsECEF: (options.positions ?? []).map((position) =>
          position.clone()
        ),
        style,
        visible: options.visible ?? true,
        line: createLine({ id: options.id, style }, LINE_PASS.VISIBLE),
        occludedLine: options.occludedDashed
          ? createLine({ id: options.id, style }, LINE_PASS.OCCLUDED)
          : null,
        ruler: options.ruler
          ? createRuler(scene, options.id, style, rulerStyle)
          : null,
        vertexCount: 0,
        uploadedFlat: null,
        rulerCuts: [],
      };
      entries.add(entry);
      applyGeometry(entry);
      scene.requestRender();
      let removed = false;
      return {
        id: options.id,
        setPositions: (positions) => {
          if (removed || destroyed) return;
          // The hover loop re-applies the same positions every frame; a
          // repaint for an unchanged line would keep the map rendering forever.
          if (
            positions.length === entry.positionsECEF.length &&
            positions.every((position, index) =>
              position.equals(entry.positionsECEF[index]!)
            )
          ) {
            return;
          }
          entry.positionsECEF = positions.map((position) => position.clone());
          applyGeometry(entry);
          scene.requestRender();
        },
        setStyle: (nextStyle) => {
          if (removed || destroyed) return;
          const previousStyle = entry.style;
          const colorChanged = nextStyle.color !== previousStyle.color;
          const rulerChanged =
            Boolean(nextStyle.ruler) !== Boolean(previousStyle.ruler);
          const occludedChanged =
            Boolean(nextStyle.occludedDashed) !==
            Boolean(previousStyle.occludedDashed);
          // Hosts re-send the style on every render: an equal one must not
          // replace the materials, or each render would release and
          // recompile their shader programs.
          if (
            !colorChanged &&
            !rulerChanged &&
            !occludedChanged &&
            nextStyle.width === previousStyle.width
          ) {
            return;
          }
          entry.style = nextStyle;
          if (occludedChanged) {
            if (nextStyle.occludedDashed) {
              entry.occludedLine = createLine(entry, LINE_PASS.OCCLUDED);
              entry.vertexCount = 0;
              entry.uploadedFlat = null;
            } else if (entry.occludedLine) {
              disposeLine(entry.occludedLine);
              entry.occludedLine = null;
            }
          }
          // The ruler carries the colour in its materials: rebuild it then.
          if (rulerChanged || colorChanged) {
            disposeRuler(scene, entry.ruler);
            entry.ruler = nextStyle.ruler
              ? createRuler(scene, entry.id, nextStyle, rulerStyle)
              : null;
          }
          if (colorChanged) {
            for (const [line, pass] of [
              [entry.line, LINE_PASS.VISIBLE],
              [entry.occludedLine, LINE_PASS.OCCLUDED],
            ] as const) {
              if (!line) continue;
              const previous = line.material as LineMaterial;
              line.material = createLineMaterial(nextStyle, pass);
              previous.dispose();
            }
          }
          applyGeometry(entry);
          scene.requestRender();
        },
        setVisible: (visible) => {
          if (removed || destroyed || entry.visible === visible) return;
          entry.visible = visible;
          applyGeometry(entry);
          scene.requestRender();
        },
        destroy: () => {
          if (removed) return;
          removed = true;
          entries.delete(entry);
          disposeLine(entry.line);
          disposeLine(entry.occludedLine);
          disposeRuler(scene, entry.ruler);
          scene.requestRender();
        },
      };
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      unsubscribeFrame();
      leaveSceneLineCuts();
      for (const entry of entries) {
        disposeLine(entry.line);
        disposeLine(entry.occludedLine);
        disposeRuler(scene, entry.ruler);
      }
      entries.clear();
      scene.requestRender();
    },
  };
};
