import { GreaterDepth, Vector3 } from "three";
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
  resolveAreaFillGridPitchMeters,
  resolveRulerMajorPitchMeters,
  type ResolvedMapLibreAreaFillStyle,
} from "./maplibre-area-fill-style";

/**
 * Annotation lines in the shared Three.js scene: `Line2` with CSS-pixel widths
 * drawn in MapLibre's framebuffer, so the mesh and the terrain depth-test them
 * like any other content. The occluded part of a line is a second draw of the
 * same geometry that only passes where the scene is nearer (`GreaterDepth`),
 * dashed and faint, on top: the Cesium `depthFailMaterial` idea, replacing
 * the SVG overlay trace the Cesium runtime drew for hidden edges.
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
  /** Depth-tested, continuous; at reduced opacity under a ruler pass. */
  VISIBLE: "visible",
  /** Depth-fail, dashed in CSS pixels, faint, on top. */
  OCCLUDED: "occluded",
  /** Depth-tested, dashed in world metres at full opacity over the visible pass. */
  RULER: "ruler",
  /** Depth-tested, dashed at the major pitch, wider and faint under the visible pass. */
  MAJOR: "major",
} as const;

type LinePass = (typeof LINE_PASS)[keyof typeof LINE_PASS];

const createLineMaterial = (
  style: AnnotationSceneLineStyle,
  pass: LinePass,
  ruler: ResolvedMapLibreAreaFillStyle
): LineMaterial => {
  const { color, opacity } = parseCssColor(style.color);
  const occluded = pass === LINE_PASS.OCCLUDED;
  const passOpacity =
    pass === LINE_PASS.OCCLUDED
      ? opacity * MAPLIBRE_SCENE_LINE_DEFAULTS.occludedOpacity
      : pass === LINE_PASS.VISIBLE && style.metricDashed === true
      ? opacity * ruler.rulerMinorOpacityShare
      : pass === LINE_PASS.MAJOR
      ? opacity * ruler.rulerMajorOpacityShare
      : opacity;
  const material = new LineMaterial({
    color: color.getHex(),
    linewidth: style.width,
    transparent: true,
    opacity: passOpacity,
    depthWrite: false,
    depthTest: true,
    dashed: pass !== LINE_PASS.VISIBLE,
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

type SceneLineEntry = {
  id: string;
  positionsECEF: Vector3[];
  style: AnnotationSceneLineStyle;
  visible: boolean;
  line: Line2;
  occludedLine: Line2 | null;
  rulerLine: Line2 | null;
  majorLine: Line2 | null;
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

  const applyGeometry = (entry: SceneLineEntry) => {
    const flat = resolveScenePositions(scene, entry.positionsECEF);
    const drawable = entry.visible && flat !== null && flat.length >= 6;
    entry.line.visible = drawable;
    if (entry.occludedLine) entry.occludedLine.visible = drawable;
    if (entry.rulerLine) entry.rulerLine.visible = drawable;
    if (entry.majorLine) entry.majorLine.visible = drawable;
    if (!drawable || !flat) return;
    const vertexCount = flat.length / 3;
    const targets = [
      entry.line,
      entry.occludedLine,
      entry.rulerLine,
      entry.majorLine,
    ].filter((line): line is Line2 => line !== null);
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
    if (entry.rulerLine) {
      // The fine beat: half the grid pitch at full opacity, half at the
      // dimmed opacity of the pass underneath, in world metres.
      const minorPitch = resolveAreaFillGridPitchMeters(pixelsPerMeter, rulerStyle);
      const material = entry.rulerLine.material as LineMaterial;
      material.linewidth = entry.style.width * pixelRatio;
      material.dashSize = minorPitch / 2;
      material.gapSize = minorPitch / 2;
      if (entry.majorLine) {
        // The coarse beat: every other major cell wider and faint underneath.
        const majorPitch = resolveRulerMajorPitchMeters(minorPitch, rulerStyle);
        const major = entry.majorLine.material as LineMaterial;
        major.linewidth =
          entry.style.width * rulerStyle.rulerMajorWidthFactor * pixelRatio;
        major.dashSize = majorPitch;
        major.gapSize = majorPitch;
      }
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
      createLineMaterial(entry.style, pass, rulerStyle)
    );
    line.frustumCulled = false;
    line.renderOrder =
      pass === LINE_PASS.OCCLUDED
        ? MAPLIBRE_SCENE_LINE_DEFAULTS.occludedRenderOrder
        : pass === LINE_PASS.MAJOR
        ? MAPLIBRE_SCENE_LINE_DEFAULTS.renderOrder - 1
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
        metricDashed: options.metricDashed,
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
        rulerLine: options.metricDashed
          ? createLine({ id: options.id, style }, LINE_PASS.RULER)
          : null,
        majorLine: options.metricDashed
          ? createLine({ id: options.id, style }, LINE_PASS.MAJOR)
          : null,
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
          const needsRuler = Boolean(nextStyle.metricDashed);
          if (needsRuler && !entry.rulerLine) {
            entry.rulerLine = createLine(entry, LINE_PASS.RULER);
            entry.majorLine = createLine(entry, LINE_PASS.MAJOR);
            entry.vertexCount = 0;
          } else if (!needsRuler && entry.rulerLine) {
            disposeLine(entry.rulerLine);
            disposeLine(entry.majorLine);
            entry.rulerLine = null;
            entry.majorLine = null;
          }
          for (const [line, pass] of [
            [entry.line, LINE_PASS.VISIBLE],
            [entry.occludedLine, LINE_PASS.OCCLUDED],
            [entry.rulerLine, LINE_PASS.RULER],
            [entry.majorLine, LINE_PASS.MAJOR],
          ] as const) {
            if (!line) continue;
            const previous = line.material as LineMaterial;
            line.material = createLineMaterial(nextStyle, pass, rulerStyle);
            previous.dispose();
          }
          applyGeometry(entry);
          scene.requestRender();
        },
        setVisible: (visible) => {
          if (removed || destroyed) return;
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
          disposeLine(entry.rulerLine);
          disposeLine(entry.majorLine);
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
        disposeLine(entry.rulerLine);
        disposeLine(entry.majorLine);
      }
      entries.clear();
      scene.requestRender();
    },
  };
};
