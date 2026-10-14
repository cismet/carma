import { Vector3 } from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import {
  prepareSegmentDashMaterial,
  updateSceneLineBuffers,
  updateSegmentDashScales,
} from "./maplibre-scene-line-buffers";
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type {
  AnnotationSceneLineCollection,
  AnnotationSceneLineHandle,
  AnnotationSceneLineOptions,
  AnnotationSceneLineStyle,
} from "@carma-mapping/annotations/core";

import type { MapLibreAnnotationScene } from "./maplibre-annotation-scene.types";
import {
  MAPLIBRE_MEASUREMENT_STYLE_DEFAULTS,
  type ResolvedMapLibreMeasurementStyle,
} from "./maplibre-measurement-style";
import { MAPLIBRE_SCENE_LINE_DEFAULTS } from "./maplibre-scene-defaults";
import {
  LINE_PASS,
  applyLineLook,
  createLineHaloMaterial,
  createLineMaterial,
  hasOccludedPass,
  resolveLineDashPx,
  resolveLineRenderOrder,
  setLineCuts,
  setLineHaloInner,
  type LinePass,
} from "./maplibre-scene-line-materials";
import {
  createRuler,
  disposeRuler,
  hideRuler,
  placeRulerDots,
  type SceneRuler,
} from "./maplibre-scene-ruler";

/**
 * Annotation lines in the shared Three.js scene: `Line2` with CSS-pixel widths
 * drawn in MapLibre's framebuffer, so the mesh and the terrain depth-test them
 * like any other content. The occluded part of a line is a second draw of the
 * same geometry that only passes where the scene is nearer (`GreaterDepth`),
 * dashed and faint, on top. A line with the ruler flag carries dots at the
 * metric beat and larger dots at the major beats, placed per frame so they
 * keep their screen size.
 *
 * Style fields beyond colour and width: `dash` dashes the visible pass in CSS
 * pixels (rescaled to world units every frame, like the occluded pass);
 * `opacity` scales both passes; `overlay` draws the line after the
 * depth-tested ones without testing or writing depth, so it has no occluded
 * pass and no halo (the halo is a depth-tested shade).
 */

/** Shared-scene positions the annotation can be drawn with, or null while one is unprojectable. */
const resolveScenePositions = (
  scene: MapLibreAnnotationScene,
  positionsECEF: readonly Vector3[]
): Float32Array | null => {
  const flat = new Float32Array(positionsECEF.length * 3);
  let index = 0;
  const scratch = new Vector3();
  for (const position of positionsECEF) {
    const scenePosition = scene.sceneFromEcef(position, scratch);
    if (!scenePosition) return null;
    flat.set([scenePosition.x, scenePosition.y, scenePosition.z], index);
    index += 3;
  }
  return flat;
};

type SceneLineEntry = {
  id: string;
  positionsECEF: Vector3[];
  style: AnnotationSceneLineStyle;
  visible: boolean;
  line: LineSegments2;
  occludedLine: LineSegments2 | null;
  /** The darkening halo under the visible line. */
  haloLine: LineSegments2;
  ruler: SceneRuler | null;
  vertexCount: number;
  /** The scene positions last uploaded; an equal frame uploads nothing. */
  uploadedFlat: Float32Array | null;
  segmentPairs: boolean;
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
  /** The ruler of metric lines shares the grid pitch of the area fills. */
  rulerStyle: ResolvedMapLibreMeasurementStyle = MAPLIBRE_MEASUREMENT_STYLE_DEFAULTS
): AnnotationSceneLineCollection => {
  const entries = new Set<SceneLineEntry>();
  const leaveSceneLineCuts = joinSceneLineCuts(scene, entries);
  let destroyed = false;
  const midpoint = new Vector3();

  const applyGeometry = (entry: SceneLineEntry) => {
    const flat = resolveScenePositions(scene, entry.positionsECEF);
    const drawable =
      entry.visible &&
      flat !== null &&
      flat.length >= 6 &&
      (!entry.segmentPairs || flat.length % 6 === 0);
    entry.line.visible = drawable;
    entry.haloLine.visible =
      drawable &&
      entry.style.halo !== false &&
      (!entry.style.overlay || entry.style.overlayHalo === true);
    entry.haloLine.material.depthTest = !(
      entry.style.overlay && entry.style.overlayHalo
    );
    if (entry.occludedLine) entry.occludedLine.visible = drawable;
    if (!drawable || !flat) {
      if (entry.ruler) hideRuler(entry.ruler);
      return;
    }
    const vertexCount = flat.length / 3;
    const targets = [entry.line, entry.haloLine, entry.occludedLine].filter(
      (line): line is LineSegments2 => line !== null
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
        entry.line.geometry.dispose();
        const geometry = entry.segmentPairs
          ? new LineSegmentsGeometry()
          : new LineGeometry();
        for (const line of targets) line.geometry = geometry;
        entry.vertexCount = vertexCount;
      }
      updateSceneLineBuffers(entry.line.geometry, flat, entry.segmentPairs);
      entry.uploadedFlat = flat;
    }
    if (entry.segmentPairs) {
      updateSegmentDashScales(entry.line.geometry, scene, flat);
    }
    // `LineSegments2` resets the resolution to the physical viewport before
    // every draw, so the widths are in physical pixels: the CSS-pixel width
    // the runtime asks for is scaled by the pixel ratio.
    const pixelRatio = scene.getPixelRatio();
    const lineWidthPx =
      entry.style.width * pixelRatio +
      MAPLIBRE_SCENE_LINE_DEFAULTS.edgeFeatherPx;
    const haloMaterial = entry.haloLine.material as LineMaterial;
    const haloWidthPx =
      lineWidthPx + 2 * MAPLIBRE_SCENE_LINE_DEFAULTS.haloWidthPx * pixelRatio;
    haloMaterial.linewidth = haloWidthPx;
    setLineHaloInner(haloMaterial, lineWidthPx / haloWidthPx);
    midpoint.set(
      (flat[0]! + flat[flat.length - 3]!) / 2,
      (flat[1]! + flat[flat.length - 2]!) / 2,
      (flat[2]! + flat[flat.length - 1]!) / 2
    );
    const pixelsPerMeter = scene.getPixelsPerMeterAtScene(midpoint);
    entry.rulerCuts = entry.ruler
      ? placeRulerDots(
          scene,
          rulerStyle,
          entry.ruler,
          entry,
          pixelsPerMeter,
          pixelRatio
        )
      : [];
    const dash = resolveLineDashPx(entry.style);
    for (const line of [entry.line, entry.occludedLine]) {
      if (!line) continue;
      const material = line.material as LineMaterial;
      material.linewidth = lineWidthPx;
      if (material.dashed && (entry.segmentPairs || pixelsPerMeter > 0)) {
        // Dash lengths are world units; scale them to CSS pixels at the line.
        material.dashSize = entry.segmentPairs
          ? dash.dashPx
          : dash.dashPx / pixelsPerMeter;
        material.gapSize = entry.segmentPairs
          ? dash.gapPx
          : dash.gapPx / pixelsPerMeter;
      }
    }
  };

  const unsubscribeFrame = scene.subscribeFrameUpdate(() => {
    for (const entry of entries) applyGeometry(entry);
  });

  const createLine = (
    entry: Pick<SceneLineEntry, "id" | "style" | "segmentPairs">,
    pass: LinePass
  ) => {
    const material = createLineMaterial(entry.style, pass);
    const line = entry.segmentPairs
      ? new LineSegments2(
          new LineSegmentsGeometry(),
          prepareSegmentDashMaterial(material)
        )
      : new Line2(new LineGeometry(), material);
    line.frustumCulled = false;
    line.renderOrder = resolveLineRenderOrder(entry.style, pass);
    line.userData.annotationPickId = entry.id;
    line.visible = false;
    scene.root.add(line);
    return line;
  };

  const createHaloLine = (segmentPairs: boolean) => {
    const line = segmentPairs
      ? new LineSegments2(new LineSegmentsGeometry(), createLineHaloMaterial())
      : new Line2(new LineGeometry(), createLineHaloMaterial());
    line.frustumCulled = false;
    line.renderOrder = MAPLIBRE_SCENE_LINE_DEFAULTS.haloRenderOrder;
    // not a pick target: the halo only shades what lies under the line
    line.raycast = () => {};
    line.visible = false;
    scene.root.add(line);
    return line;
  };

  const disposeLine = (line: LineSegments2 | null, disposeGeometry = true) => {
    if (!line) return;
    scene.root.remove(line);
    if (disposeGeometry) line.geometry.dispose();
    (line.material as LineMaterial).dispose();
  };

  const disposeEntry = (entry: SceneLineEntry) => {
    disposeLine(entry.line);
    disposeLine(entry.haloLine, false);
    disposeLine(entry.occludedLine, false);
    disposeRuler(scene, entry.ruler);
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
        rulerStartMeters: options.rulerStartMeters,
        halo: options.halo,
        overlay: options.overlay,
        overlayHalo: options.overlayHalo,
        dash: options.dash,
        opacity: options.opacity,
      };
      const entry: SceneLineEntry = {
        id: options.id,
        positionsECEF: (options.positions ?? []).map((position) =>
          position.clone()
        ),
        style,
        visible: options.visible ?? true,
        segmentPairs: options.segmentPairs === true,
        line: createLine(
          {
            id: options.id,
            style,
            segmentPairs: options.segmentPairs === true,
          },
          LINE_PASS.VISIBLE
        ),
        haloLine: createHaloLine(options.segmentPairs === true),
        occludedLine: hasOccludedPass(style)
          ? createLine(
              {
                id: options.id,
                style,
                segmentPairs: options.segmentPairs === true,
              },
              LINE_PASS.OCCLUDED
            )
          : null,
        ruler: options.ruler
          ? createRuler(scene, options.id, style, rulerStyle)
          : null,
        vertexCount: 0,
        uploadedFlat: null,
        rulerCuts: [],
      };
      // All passes draw the same positions and distances, with separate looks.
      for (const line of [entry.haloLine, entry.occludedLine]) {
        if (!line) continue;
        line.geometry.dispose();
        line.geometry = entry.line.geometry;
      }
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
            hasOccludedPass(nextStyle) !== hasOccludedPass(previousStyle);
          const lookChanged =
            Boolean(nextStyle.overlay) !== Boolean(previousStyle.overlay) ||
            Boolean(nextStyle.overlayHalo) !==
              Boolean(previousStyle.overlayHalo) ||
            nextStyle.dash?.dashPx !== previousStyle.dash?.dashPx ||
            nextStyle.dash?.gapPx !== previousStyle.dash?.gapPx ||
            (nextStyle.opacity ?? 1) !== (previousStyle.opacity ?? 1);
          // Hosts re-send the style on every render: an equal one must not
          // replace the materials, or each render would release and
          // recompile their shader programs.
          if (
            !colorChanged &&
            !rulerChanged &&
            !occludedChanged &&
            !lookChanged &&
            nextStyle.width === previousStyle.width &&
            (nextStyle.halo !== false) === (previousStyle.halo !== false)
          ) {
            return;
          }
          entry.style = nextStyle;
          if (occludedChanged) {
            if (hasOccludedPass(nextStyle)) {
              entry.occludedLine = createLine(entry, LINE_PASS.OCCLUDED);
              entry.occludedLine.geometry.dispose();
              entry.occludedLine.geometry = entry.line.geometry;
              // The new pass reads the already initialized shared buffers.
            } else if (entry.occludedLine) {
              disposeLine(entry.occludedLine, false);
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
          // The colour is baked into the materials: rebuild them then. Opacity,
          // dashing and the depth state change in place (dashing recompiles).
          if (colorChanged || lookChanged) {
            for (const [line, pass] of [
              [entry.line, LINE_PASS.VISIBLE],
              [entry.occludedLine, LINE_PASS.OCCLUDED],
            ] as const) {
              if (!line) continue;
              line.renderOrder = resolveLineRenderOrder(nextStyle, pass);
              if (!colorChanged) {
                applyLineLook(line.material as LineMaterial, nextStyle, pass);
                continue;
              }
              const previous = line.material as LineMaterial;
              line.material = entry.segmentPairs
                ? prepareSegmentDashMaterial(
                    createLineMaterial(nextStyle, pass)
                  )
                : createLineMaterial(nextStyle, pass);
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
          disposeEntry(entry);
          scene.requestRender();
        },
      };
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      unsubscribeFrame();
      leaveSceneLineCuts();
      entries.forEach(disposeEntry);
      entries.clear();
      scene.requestRender();
    },
  };
};
