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

const createLineMaterial = (
  style: AnnotationSceneLineStyle,
  occluded: boolean
): LineMaterial => {
  const { color, opacity } = parseCssColor(style.color);
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

type SceneLineEntry = {
  id: string;
  positionsECEF: Vector3[];
  style: AnnotationSceneLineStyle;
  visible: boolean;
  line: Line2;
  occludedLine: Line2 | null;
  vertexCount: number;
};

export const createMapLibreSceneLineCollection = (
  scene: MapLibreAnnotationScene,
  _options: AnnotationSceneLineCollectionOptions = {}
): AnnotationSceneLineCollection => {
  const entries = new Set<SceneLineEntry>();
  let destroyed = false;
  const midpoint = new Vector3();

  const applyGeometry = (entry: SceneLineEntry) => {
    const flat = resolveScenePositions(scene, entry.positionsECEF);
    const drawable = entry.visible && flat !== null && flat.length >= 6;
    entry.line.visible = drawable;
    if (entry.occludedLine) entry.occludedLine.visible = drawable;
    if (!drawable || !flat) return;
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
    (entry.line.material as LineMaterial).linewidth =
      entry.style.width * pixelRatio;
    if (entry.occludedLine) {
      const material = entry.occludedLine.material as LineMaterial;
      material.linewidth = entry.style.width * pixelRatio;
      // Dash lengths are world units; scale them to CSS pixels at the line.
      midpoint.set(
        (flat[0]! + flat[flat.length - 3]!) / 2,
        (flat[1]! + flat[flat.length - 2]!) / 2,
        (flat[2]! + flat[flat.length - 1]!) / 2
      );
      const pixelsPerMeter = scene.getPixelsPerMeterAtScene(midpoint);
      if (pixelsPerMeter > 0) {
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
    occluded: boolean
  ) => {
    const line = new Line2(
      new LineGeometry(),
      createLineMaterial(entry.style, occluded)
    );
    line.frustumCulled = false;
    line.renderOrder = occluded
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
      };
      const entry: SceneLineEntry = {
        id: options.id,
        positionsECEF: (options.positions ?? []).map((position) =>
          position.clone()
        ),
        style,
        visible: options.visible ?? true,
        line: createLine({ id: options.id, style }, false),
        occludedLine: options.occludedDashed
          ? createLine({ id: options.id, style }, true)
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
            entry.occludedLine = createLine(entry, true);
            entry.vertexCount = 0;
          } else if (!needsOccluded && entry.occludedLine) {
            disposeLine(entry.occludedLine);
            entry.occludedLine = null;
          }
          for (const [line, occluded] of [
            [entry.line, false],
            [entry.occludedLine, true],
          ] as const) {
            if (!line) continue;
            const previous = line.material as LineMaterial;
            line.material = createLineMaterial(nextStyle, occluded);
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
      }
      entries.clear();
      scene.requestRender();
    },
  };
};
