import {
  CanvasTexture,
  Float32BufferAttribute,
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
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
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
 * with the ruler flag carries ticks across it at the metric beat and knots
 * at the major beats, rebuilt per frame so they face the camera and keep
 * their screen size.
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

/** A white disc for the knots; the material tints it. Null without a 2D canvas (tests). */
let knotTexture: CanvasTexture | null | undefined;
const resolveKnotTexture = () => {
  if (knotTexture !== undefined) return knotTexture;
  const size = 32;
  const canvas =
    typeof document === "undefined" ? null : document.createElement("canvas");
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas?.getContext("2d") ?? null;
  } catch {
    context = null;
  }
  if (!canvas || !context) {
    knotTexture = null;
    return knotTexture;
  }
  canvas.width = size;
  canvas.height = size;
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  context.fill();
  knotTexture = new CanvasTexture(canvas);
  knotTexture.colorSpace = SRGBColorSpace;
  return knotTexture;
};

/** The ticks and knots of a ruler line. */
type SceneRuler = {
  ticks: LineSegments2;
  knots: Points<BufferGeometry, PointsMaterial>;
  tickCount: number;
};

const createRuler = (
  scene: MapLibreAnnotationScene,
  id: string,
  style: AnnotationSceneLineStyle
): SceneRuler => {
  const { color, opacity } = parseCssColor(style.color);
  const ticks = new LineSegments2(
    new LineSegmentsGeometry(),
    new LineMaterial({
      color: color.getHex(),
      linewidth: style.width,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: true,
    })
  );
  ticks.material.polygonOffset = true;
  ticks.material.polygonOffsetFactor =
    MAPLIBRE_SCENE_LINE_DEFAULTS.polygonOffsetFactor;
  ticks.material.polygonOffsetUnits =
    MAPLIBRE_SCENE_LINE_DEFAULTS.polygonOffsetUnits;
  ticks.frustumCulled = false;
  ticks.renderOrder = MAPLIBRE_SCENE_LINE_DEFAULTS.renderOrder;
  ticks.userData.annotationPickId = id;
  ticks.visible = false;
  scene.root.add(ticks);
  const knotMaterial = new PointsMaterial({
    color: color.getHex(),
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    sizeAttenuation: false,
  });
  const texture = resolveKnotTexture();
  if (texture) {
    knotMaterial.map = texture;
    knotMaterial.alphaTest = 0.5;
  }
  const knots = new Points(new BufferGeometry(), knotMaterial);
  knots.frustumCulled = false;
  knots.renderOrder = MAPLIBRE_SCENE_LINE_DEFAULTS.renderOrder + 1;
  knots.userData.annotationPickId = id;
  knots.visible = false;
  scene.root.add(knots);
  return { ticks, knots, tickCount: 0 };
};

const disposeRuler = (scene: MapLibreAnnotationScene, ruler: SceneRuler | null) => {
  if (!ruler) return;
  scene.root.remove(ruler.ticks);
  scene.root.remove(ruler.knots);
  ruler.ticks.geometry.dispose();
  ruler.ticks.material.dispose();
  ruler.knots.geometry.dispose();
  ruler.knots.material.dispose();
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
};

export const createMapLibreSceneLineCollection = (
  scene: MapLibreAnnotationScene,
  _options: AnnotationSceneLineCollectionOptions = {},
  /** The ruler of metric lines shares the grid pitch of the area fills. */
  rulerStyle: ResolvedMapLibreAreaFillStyle = MAPLIBRE_AREA_FILL_STYLE_DEFAULTS
): AnnotationSceneLineCollection => {
  const entries = new Set<SceneLineEntry>();
  let destroyed = false;
  const midpoint = new Vector3();
  const cameraScene = new Vector3();
  const beatECEF = new Vector3();
  const beatScene = new Vector3();
  const segmentStart = new Vector3();
  const segmentEnd = new Vector3();
  const lineDirection = new Vector3();
  const viewDirection = new Vector3();
  const across = new Vector3();
  const screenScratch = { x: 0, y: 0 };

  /**
   * Ticks across the line at every beat from the first vertex, longer ones
   * and knots at the major beats, each facing the camera at its screen
   * size. Beats near a vertex or a segment midpoint are left out: the node
   * markers and the insert handles of a selected measurement sit there.
   */
  const applyRuler = (
    entry: SceneLineEntry,
    ruler: SceneRuler,
    flat: number[],
    pixelsPerMeter: number,
    pixelRatio: number
  ) => {
    const camera = scene.getCameraScenePosition(cameraScene);
    if (!camera || !(pixelsPerMeter > 0)) {
      ruler.ticks.visible = false;
      ruler.knots.visible = false;
      return;
    }
    const beat = resolveRulerPitchMeters(pixelsPerMeter, rulerStyle);
    const major = resolveRulerMajorPitchMeters(beat, rulerStyle);
    const clearance = rulerStyle.rulerMarkerClearanceCssPx;
    const keepClear: Vector2[] = [];
    const positions = entry.positionsECEF;
    for (let index = 0; index < positions.length; index += 1) {
      const vertex = scene.worldToScreen(positions[index]!, screenScratch);
      if (vertex) keepClear.push(new Vector2(vertex.x, vertex.y));
      if (index + 1 < positions.length) {
        beatECEF.addVectors(positions[index]!, positions[index + 1]!).multiplyScalar(0.5);
        const handle = scene.worldToScreen(beatECEF, screenScratch);
        if (handle) keepClear.push(new Vector2(handle.x, handle.y));
      }
    }
    const tickPositions: number[] = [];
    const knotPositions: number[] = [];
    let travelled = 0;
    let nextBeat = beat;
    for (let index = 0; index + 1 < positions.length; index += 1) {
      const start = positions[index]!;
      const end = positions[index + 1]!;
      const length = start.distanceTo(end);
      if (!(length > 0)) continue;
      segmentStart.set(flat[index * 3]!, flat[index * 3 + 1]!, flat[index * 3 + 2]!);
      segmentEnd.set(
        flat[index * 3 + 3]!,
        flat[index * 3 + 4]!,
        flat[index * 3 + 5]!
      );
      lineDirection.subVectors(segmentEnd, segmentStart).normalize();
      while (nextBeat <= travelled + length) {
        const t = (nextBeat - travelled) / length;
        beatECEF.lerpVectors(start, end, t);
        const isMajor = Math.abs(nextBeat / major - Math.round(nextBeat / major)) < 1e-6;
        nextBeat += beat;
        const screen = scene.worldToScreen(beatECEF, screenScratch);
        if (!screen) continue;
        if (
          keepClear.some(
            (point) => Math.hypot(point.x - screen.x, point.y - screen.y) < clearance
          )
        ) {
          continue;
        }
        if (!scene.sceneFromEcef(beatECEF, beatScene)) continue;
        viewDirection.subVectors(beatScene, camera).normalize();
        across.crossVectors(lineDirection, viewDirection);
        if (across.lengthSq() < 1e-8) continue;
        across.normalize();
        const localPixelsPerMeter = scene.getPixelsPerMeterAtScene(beatScene);
        if (!(localPixelsPerMeter > 0)) continue;
        const half =
          (isMajor ? rulerStyle.rulerMajorTickCssPx : rulerStyle.rulerMinorTickCssPx) /
          2 /
          localPixelsPerMeter;
        tickPositions.push(
          beatScene.x - across.x * half,
          beatScene.y - across.y * half,
          beatScene.z - across.z * half,
          beatScene.x + across.x * half,
          beatScene.y + across.y * half,
          beatScene.z + across.z * half
        );
        if (isMajor) knotPositions.push(beatScene.x, beatScene.y, beatScene.z);
      }
      travelled += length;
    }
    const tickCount = tickPositions.length / 6;
    ruler.ticks.visible = tickCount > 0;
    if (tickCount > 0) {
      if (tickCount !== ruler.tickCount) {
        ruler.ticks.geometry.dispose();
        ruler.ticks.geometry = new LineSegmentsGeometry();
        ruler.tickCount = tickCount;
      }
      ruler.ticks.geometry.setPositions(tickPositions);
      ruler.ticks.material.linewidth = entry.style.width * pixelRatio;
    }
    ruler.knots.visible = knotPositions.length > 0;
    if (knotPositions.length > 0) {
      ruler.knots.geometry.setAttribute(
        "position",
        new Float32BufferAttribute(knotPositions, 3)
      );
      ruler.knots.geometry.computeBoundingSphere();
      ruler.knots.material.size = rulerStyle.rulerKnotCssPx * pixelRatio;
    }
  };

  const applyGeometry = (entry: SceneLineEntry) => {
    const flat = resolveScenePositions(scene, entry.positionsECEF);
    const drawable = entry.visible && flat !== null && flat.length >= 6;
    entry.line.visible = drawable;
    if (entry.occludedLine) entry.occludedLine.visible = drawable;
    if (!drawable || !flat) {
      if (entry.ruler) {
        entry.ruler.ticks.visible = false;
        entry.ruler.knots.visible = false;
      }
      return;
    }
    const vertexCount = flat.length / 3;
    const targets = [entry.line, entry.occludedLine].filter(
      (line): line is Line2 => line !== null
    );
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
    // `LineSegments2` resets the resolution to the physical viewport before
    // every draw, so the width is in physical pixels: scale the CSS-pixel
    // width the runtime asks for by the pixel ratio, and the line looks the
    // same as the Cesium polyline of that width while staying crisp.
    const pixelRatio = scene.getPixelRatio();
    const visibleMaterial = entry.line.material as LineMaterial;
    visibleMaterial.linewidth = entry.style.width * pixelRatio;
    midpoint.set(
      (flat[0]! + flat[flat.length - 3]!) / 2,
      (flat[1]! + flat[flat.length - 2]!) / 2,
      (flat[2]! + flat[flat.length - 1]!) / 2
    );
    const pixelsPerMeter = scene.getPixelsPerMeterAtScene(midpoint);
    if (entry.ruler) {
      applyRuler(entry, entry.ruler, flat, pixelsPerMeter, pixelRatio);
    }
    if (entry.occludedLine) {
      const material = entry.occludedLine.material as LineMaterial;
      material.linewidth = entry.style.width * pixelRatio;
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
        ruler: options.ruler ? createRuler(scene, options.id, style) : null,
        vertexCount: 0,
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
          entry.style = nextStyle;
          const needsOccluded = Boolean(nextStyle.occludedDashed);
          if (needsOccluded && !entry.occludedLine) {
            entry.occludedLine = createLine(entry, LINE_PASS.OCCLUDED);
            entry.vertexCount = 0;
          } else if (!needsOccluded && entry.occludedLine) {
            disposeLine(entry.occludedLine);
            entry.occludedLine = null;
          }
          // The ruler carries the colour in its materials: rebuild it.
          disposeRuler(scene, entry.ruler);
          entry.ruler = nextStyle.ruler
            ? createRuler(scene, entry.id, nextStyle)
            : null;
          for (const [line, pass] of [
            [entry.line, LINE_PASS.VISIBLE],
            [entry.occludedLine, LINE_PASS.OCCLUDED],
          ] as const) {
            if (!line) continue;
            const previous = line.material as LineMaterial;
            line.material = createLineMaterial(nextStyle, pass);
            previous.dispose();
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
