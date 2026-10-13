import { moveVector3Toward } from "@carma-commons/math";
import { TWO_PI } from "@carma-units";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DynamicDrawUsage,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";
import type { AnnotationSceneLineStyle } from "@carma-mapping/annotations/core";

import { createCanvas2d } from "./maplibre-canvas-2d";
import { parseCssColor } from "./maplibre-css-color";
import type { MapLibreAnnotationScene } from "./maplibre-annotation-scene.types";
import {
  resolveRulerMajorPitchMeters,
  resolveRulerPitchMeters,
  type ResolvedMapLibreMeasurementStyle,
} from "./maplibre-measurement-style";
import { MAPLIBRE_SCENE_LINE_DEFAULTS } from "./maplibre-scene-defaults";

/** The dots of a ruler line: one point cloud per size. */
export type SceneRuler = {
  minor: Points<BufferGeometry, PointsMaterial>;
  major: Points<BufferGeometry, PointsMaterial>;
};

const RULER_DOT_TEXTURE_SIZE = 64;
/** `rulerDotStroke` value for a ring in the colour of the line. */
const RULER_DOT_STROKE_LINE_COLOR = "currentColor";
const RULER_DOT_MIN_CAPACITY = 64;

const rulerDotTextures = new Map<string, CanvasTexture | null>();

/**
 * A ruler dot as a texture: a disc in the fill colour inside a ring in the
 * stroke colour, drawn smooth on a canvas so small dots keep round edges.
 * Cached per look; null without a 2D canvas (tests).
 */
const resolveRulerDotTexture = (
  fill: string,
  stroke: string | null,
  ringShare: number
) => {
  const key = `${fill}|${stroke ?? ""}|${ringShare.toFixed(3)}`;
  const cached = rulerDotTextures.get(key);
  if (cached !== undefined) return cached;
  const surface = createCanvas2d(RULER_DOT_TEXTURE_SIZE);
  if (!surface) {
    rulerDotTextures.set(key, null);
    return null;
  }
  const { canvas, context } = surface;
  const size = RULER_DOT_TEXTURE_SIZE;
  const radius = size / 2 - 1;
  const drawDisc = (color: string, discRadius: number) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(size / 2, size / 2, discRadius, 0, TWO_PI);
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

const resolveRulerDotFill = (
  style: AnnotationSceneLineStyle,
  rulerStyle: ResolvedMapLibreMeasurementStyle
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
  rulerStyle: ResolvedMapLibreMeasurementStyle,
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

export const createRuler = (
  scene: MapLibreAnnotationScene,
  id: string,
  style: AnnotationSceneLineStyle,
  rulerStyle: ResolvedMapLibreMeasurementStyle
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

export const disposeRuler = (
  scene: MapLibreAnnotationScene,
  ruler: SceneRuler | null
) => {
  if (!ruler) return;
  disposeRulerDots(scene, ruler.minor);
  disposeRulerDots(scene, ruler.major);
};

export const hideRuler = (ruler: SceneRuler) => {
  ruler.minor.visible = false;
  ruler.major.visible = false;
};

/**
 * The dots of one size: positions go into a reused dynamic buffer and are
 * uploaded only when they moved, so a static view uploads nothing and a
 * moving one reuses the buffer instead of creating one per frame.
 */
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

type ScreenPoint = { x: number; y: number };

const beatECEF = new Vector3();
const beatScene = new Vector3();
const cameraScene = new Vector3();
const screenScratch: ScreenPoint = { x: 0, y: 0 };

/**
 * Dots on the line at every beat from the first vertex (or from
 * `rulerStartMeters`, so a chain counts on from the segments before it),
 * larger ones at the major beats, sized from the line width. Beats near a
 * vertex or a segment midpoint are left out: the node markers and the insert
 * ticks of a selected measurement sit there. Returns the screen circles of
 * the dots the line stops under, see `setLineCuts`.
 */
export const placeRulerDots = (
  scene: MapLibreAnnotationScene,
  rulerStyle: ResolvedMapLibreMeasurementStyle,
  ruler: SceneRuler,
  line: {
    positionsECEF: readonly Vector3[];
    style: AnnotationSceneLineStyle;
  },
  pixelsPerMeter: number,
  pixelRatio: number
): number[] => {
  const camera = scene.getCameraScenePosition(cameraScene);
  if (!camera || !(pixelsPerMeter > 0)) {
    hideRuler(ruler);
    return [];
  }
  const beat = resolveRulerPitchMeters(pixelsPerMeter, rulerStyle);
  const major = resolveRulerMajorPitchMeters(beat);
  const clearance = rulerStyle.rulerMarkerClearanceCssPx;
  const keepClear: ScreenPoint[] = [];
  const positions = line.positionsECEF;
  for (let index = 0; index < positions.length; index += 1) {
    const vertex = scene.worldToScreen(positions[index]!, screenScratch);
    if (vertex) keepClear.push({ x: vertex.x, y: vertex.y });
    if (index + 1 < positions.length) {
      beatECEF
        .addVectors(positions[index]!, positions[index + 1]!)
        .multiplyScalar(0.5);
      const handle = scene.worldToScreen(beatECEF, screenScratch);
      if (handle) keepClear.push({ x: handle.x, y: handle.y });
    }
  }
  const minorPositions: number[] = [];
  const majorPositions: number[] = [];
  const width = line.style.width * pixelRatio;
  const minorSizePx = width * rulerStyle.rulerMinorDotWidthFactor;
  const majorSizePx = width * rulerStyle.rulerMajorDotWidthFactor;
  const viewportHeight = scene.getCssViewport().height;
  const cuts: number[] = [];
  let travelled = Math.max(0, line.style.rulerStartMeters ?? 0);
  let nextBeat = (Math.floor(travelled / beat + 1e-9) + 1) * beat;
  for (let index = 0; index + 1 < positions.length; index += 1) {
    const start = positions[index]!;
    const end = positions[index + 1]!;
    const length = start.distanceTo(end);
    if (!(length > 0)) continue;
    while (nextBeat <= travelled + length) {
      beatECEF.lerpVectors(start, end, (nextBeat - travelled) / length);
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
      const lifted = moveVector3Toward(
        beatScene,
        camera,
        Math.min(
          MAPLIBRE_SCENE_LINE_DEFAULTS.rulerDotLiftMeters,
          beatScene.distanceTo(camera) / 2
        )
      );
      (isMajor ? majorPositions : minorPositions).push(
        lifted.x,
        lifted.y,
        lifted.z
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
  return cuts;
};
