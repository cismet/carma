import { Vector3 } from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type {
  AnnotationSceneLineCollection,
  AnnotationSceneLineHandle,
  AnnotationSceneLineOptions,
  AnnotationSceneLineStyle,
} from "@carma-mapping/annotations/core";

import type { MapLibreAnnotationScene } from "./maplibre-annotation-scene";
import {
  MAPLIBRE_AREA_FILL_STYLE_DEFAULTS,
  type ResolvedMapLibreAreaFillStyle,
} from "./maplibre-area-fill-style";
import { MAPLIBRE_SCENE_LINE_DEFAULTS } from "./maplibre-scene-line-defaults";
import {
  LINE_PASS,
  createLineHaloMaterial,
  createLineMaterial,
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
 */

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

type SceneLineEntry = {
  id: string;
  positionsECEF: Vector3[];
  style: AnnotationSceneLineStyle;
  visible: boolean;
  line: Line2;
  occludedLine: Line2 | null;
  /** The darkening halo under the visible line. */
  haloLine: Line2;
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
  /** The ruler of metric lines shares the grid pitch of the area fills. */
  rulerStyle: ResolvedMapLibreAreaFillStyle = MAPLIBRE_AREA_FILL_STYLE_DEFAULTS
): AnnotationSceneLineCollection => {
  const entries = new Set<SceneLineEntry>();
  const leaveSceneLineCuts = joinSceneLineCuts(scene, entries);
  let destroyed = false;
  const midpoint = new Vector3();

  const applyGeometry = (entry: SceneLineEntry) => {
    const flat = resolveScenePositions(scene, entry.positionsECEF);
    const drawable = entry.visible && flat !== null && flat.length >= 6;
    entry.line.visible = drawable;
    entry.haloLine.visible = drawable && entry.style.halo !== false;
    if (entry.occludedLine) entry.occludedLine.visible = drawable;
    if (!drawable || !flat) {
      if (entry.ruler) hideRuler(entry.ruler);
      return;
    }
    const vertexCount = flat.length / 3;
    const targets = [entry.line, entry.haloLine, entry.occludedLine].filter(
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
    // every draw, so the widths are in physical pixels: the CSS-pixel width
    // the runtime asks for is scaled by the pixel ratio.
    const pixelRatio = scene.getPixelRatio();
    const lineWidthPx =
      entry.style.width * pixelRatio +
      MAPLIBRE_SCENE_LINE_DEFAULTS.edgeFeatherPx;
    (entry.line.material as LineMaterial).linewidth = lineWidthPx;
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

  const createHaloLine = () => {
    const line = new Line2(new LineGeometry(), createLineHaloMaterial());
    line.frustumCulled = false;
    line.renderOrder = MAPLIBRE_SCENE_LINE_DEFAULTS.haloRenderOrder;
    // not a pick target: the halo only shades what lies under the line
    line.raycast = () => {};
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

  const disposeEntry = (entry: SceneLineEntry) => {
    disposeLine(entry.line);
    disposeLine(entry.haloLine);
    disposeLine(entry.occludedLine);
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
      };
      const entry: SceneLineEntry = {
        id: options.id,
        positionsECEF: (options.positions ?? []).map((position) =>
          position.clone()
        ),
        style,
        visible: options.visible ?? true,
        line: createLine({ id: options.id, style }, LINE_PASS.VISIBLE),
        haloLine: createHaloLine(),
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
            nextStyle.width === previousStyle.width &&
            (nextStyle.halo !== false) === (previousStyle.halo !== false)
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
