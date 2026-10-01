import type { Map as MaplibreMap } from "maplibre-gl";
import type { Position } from "geojson";
import { CanvasTexture, Color, Matrix4 } from "three";

import {
  acquireSharedThreeScene,
  getSharedThreeSceneRuntimes,
  type MapStyleProjectiveOverlay,
  type SharedThreeSceneFrame,
} from "@carma-mapping/engines/maplibre";

import type {
  AnimationConfig,
  ObliqueDataset,
  ObliqueImageRecord,
  ObliquePose,
} from "../core/types";
import { getCameraCalibration } from "../core/utils/calibration";
import { poseOf, resolveCameraAltitude } from "./utils/flyToImage";
import {
  imageProjectionMatrix,
  sceneToPhotoEnu,
  sceneToMercatorPhotoEnu,
} from "./utils/image-projection";
import type { CssPixels } from "@carma-units";

/**
 * Calibrated photo-frustum plane intersections on existing mesh receivers.
 * One bounded mark table and a small white year-label atlas are rendered by the
 * shared scene. Ring coordinates remain coarse search data, never native layers.
 */
export type FootprintOutlineStyle = {
  color: string;
  /** CSS pixels */
  width: number;
  opacity: number;
  fillOpacity?: number;
  inactiveOpacity?: number;
};
export type InactiveFootprint = {
  id: string;
  ring: Position[];
  pose?: ObliquePose;
  seriesLabel?: string;
  record?: ObliqueImageRecord;
  dataset?: ObliqueDataset;
  heightOffset?: number;
};
export type FootprintOutlineLayer = {
  setRing: (
    ring: Position[] | null,
    annotation?: {
      pose: ObliquePose | null;
      seriesLabel?: string;
      hoverLabel?: string;
      imageId?: string;
      record?: ObliqueImageRecord;
      dataset?: ObliqueDataset;
      heightOffset?: number;
    },
    inactive?: readonly InactiveFootprint[]
  ) => void;
  containsScreenPoint: (point: { x: number; y: number }) => boolean;
  imageAtScreenPoint: (point: { x: number; y: number }) => string | null;
  setStyle: (style: FootprintOutlineStyle) => void;
  setHoveredImage: (
    imageId: string | null,
    candidate?: InactiveFootprint
  ) => void;
  setLocked: (locked: boolean, fade?: AnimationConfig) => void;
  destroy: () => void;
};
const TRAIL_DURATION_MS = 8000;
const TRAIL_REPAINT_INTERVAL_MS = 100;
const OUTLINE_WIDTH_SCALE = 2 / 3;
const LABEL_FONT_WEIGHT = 1000;
const LABEL_WIDTH = 512;
const LABEL_HEIGHT = 256;
const LABEL_FONT_FAMILY =
  '"Arial Black", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", sans-serif';

const createLabelCanvas = (
  text: string,
  color: string
): HTMLCanvasElement | null => {
  const canvas = document.createElement("canvas");
  canvas.width = LABEL_WIDTH;
  canvas.height = LABEL_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.font = LABEL_FONT_WEIGHT + " 172px " + LABEL_FONT_FAMILY;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const fontSize = Math.min(
    172,
    (172 * 480) / Math.max(480, context.measureText(text).width)
  );
  context.font = LABEL_FONT_WEIGHT + " " + fontSize + "px " + LABEL_FONT_FAMILY;
  context.fillStyle = color;
  context.fillText(text, 256, 132);
  return canvas;
};

export const createFootprintOutlineLayer = (
  map: MaplibreMap,
  id: string,
  initialStyle: FootprintOutlineStyle
): FootprintOutlineLayer => {
  const sourceId = `${id}-source`,
    hitId = `${id}-interior`,
    caretId = `${id}-caret`,
    labelId = `${id}-label`,
    imageId = `${id}-label-image`,
    hoverImageId = `${id}-hover-label-image`;
  const layerIds = [hitId, id, caretId, labelId];
  let style = initialStyle,
    locked = false,
    destroyed = false,
    attaching = false;
  const labelCandidates = new Map<string, InactiveFootprint>();
  let hoveredImageId: string | null = null;
  let centerFootprint: InactiveFootprint | null = null;
  let centerAnnotation:
    | {
        pose: ObliquePose | null;
        seriesLabel?: string;
        hoverLabel?: string;
        imageId?: string;
        record?: ObliqueImageRecord;
        dataset?: ObliqueDataset;
        heightOffset?: number;
      }
    | undefined;
  const trails = new Map<
    string,
    { footprint: InactiveFootprint; start: number }
  >();
  let trailTimer: ReturnType<typeof setTimeout> | undefined;
  let trailRepaintTimer: ReturnType<typeof setTimeout> | undefined;
  const clearTrailRepaint = () => {
    if (trailRepaintTimer !== undefined) clearTimeout(trailRepaintTimer);
    trailRepaintTimer = undefined;
  };
  let externalHoverCandidate: InactiveFootprint | undefined;
  let surfaceLease: ReturnType<typeof acquireSharedThreeScene> | null = null;
  let projectiveOverlay: MapStyleProjectiveOverlay | null = null;
  let removeBeforeRender: (() => void) | undefined;
  let localFrameKey = "";
  const projectionCache = new Map<
    string,
    {
      footprint: InactiveFootprint;
      altitude?: number;
      matrix?: Matrix4;
      terrainMatrix?: Matrix4;
      frameKey?: string;
    }
  >();
  let labelAtlas: CanvasTexture | undefined;
  let labelAtlasKey = "";
  const whiteLabels = new Map<string, HTMLCanvasElement>();
  const labelRects = new Map<
    string,
    readonly [number, number, number, number]
  >();
  let surfaceDirty = true;
  let surfaceOpacity = initialStyle.opacity;
  const viewportBounds = () => {
    const { width, height } = map.transform ?? {};
    if (!width || !height) return null;
    const corners = [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ].map(([x, y]) => map.unproject([x, y]));
    return [
      Math.min(...corners.map((p) => p.lng)),
      Math.min(...corners.map((p) => p.lat)),
      Math.max(...corners.map((p) => p.lng)),
      Math.max(...corners.map((p) => p.lat)),
    ];
  };
  const visibleTrail = (
    footprint: InactiveFootprint,
    bounds: number[] | null
  ) =>
    !bounds ||
    (Math.max(...footprint.ring.map((p) => p[0])) >= bounds[0] &&
      Math.min(...footprint.ring.map((p) => p[0])) <= bounds[2] &&
      Math.max(...footprint.ring.map((p) => p[1])) >= bounds[1] &&
      Math.min(...footprint.ring.map((p) => p[1])) <= bounds[3]);
  const rememberTrail = (footprint: InactiveFootprint | undefined | null) => {
    if (!footprint || !visibleTrail(footprint, viewportBounds())) return;
    trails.delete(footprint.id);
    trails.set(footprint.id, { footprint, start: performance.now() });
    while (trails.size > 32) trails.delete(trails.keys().next().value!);
  };
  const pruneTrails = () => {
    const bounds = viewportBounds(),
      now = performance.now();
    let changed = false;
    for (const [key, value] of trails)
      if (
        now - value.start >= TRAIL_DURATION_MS ||
        key === centerFootprint?.id ||
        key === effectiveHoveredId() ||
        !visibleTrail(value.footprint, bounds)
      ) {
        trails.delete(key);
        changed = true;
      }
    if (changed) surfaceDirty = true;
    return changed;
  };
  const scheduleTrailExpiry = () => {
    if (trailTimer !== undefined) clearTimeout(trailTimer);
    trailTimer = undefined;
    if (!trails.size || destroyed) return;
    const deadline = Math.min(
      ...Array.from(trails.values(), (value) => value.start + TRAIL_DURATION_MS)
    );
    trailTimer = setTimeout(() => {
      trailTimer = undefined;
      if (destroyed) return;
      if (pruneTrails()) updateSurface();
      scheduleTrailExpiry();
      if (!locked) map.triggerRepaint();
    }, Math.max(1, deadline - performance.now()));
  };
  const scheduleTrailRepaint = () => {
    if (
      !trails.size ||
      locked ||
      destroyed ||
      style.opacity <= 0 ||
      trailRepaintTimer !== undefined
    )
      return;
    trailRepaintTimer = setTimeout(() => {
      trailRepaintTimer = undefined;
      if (locked || destroyed || style.opacity <= 0) return;
      if (pruneTrails()) {
        updateSurface();
        scheduleTrailExpiry();
      }
      map.triggerRepaint();
      scheduleTrailRepaint();
    }, TRAIL_REPAINT_INTERVAL_MS);
  };

  const hoverCandidate = () => {
    const pointer = hoveredImageId
      ? labelCandidates.get(hoveredImageId) ??
        (externalHoverCandidate?.id === hoveredImageId
          ? externalHoverCandidate
          : undefined)
      : undefined;
    return pointer ?? centerFootprint ?? undefined;
  };
  const effectiveHoveredId = () => hoverCandidate()?.id ?? "";
  const fillOpacity = () =>
    Math.max(0, Math.min(0.08, style.fillOpacity ?? 0.08));
  const updateLabelAtlas = (texts: string[]) => {
    const labels = [...new Set(texts.filter(Boolean))],
      key = labels.join("\0");
    if (key === labelAtlasKey) return undefined;
    labelAtlasKey = key;
    const previous = labelAtlas;
    labelAtlas = undefined;
    labelRects.clear();
    if (labels.length) {
      const canvas = document.createElement("canvas");
      canvas.width = LABEL_WIDTH * labels.length;
      canvas.height = LABEL_HEIGHT;
      const context = canvas.getContext("2d");
      if (context) {
        labels.forEach((label, index) => {
          let cached = whiteLabels.get(label);
          if (!cached) {
            cached = createLabelCanvas(label, "white") ?? undefined;
            if (cached) whiteLabels.set(label, cached);
          }
          if (cached) {
            context.drawImage(cached, index * LABEL_WIDTH, 0);
            labelRects.set(label, [
              index / labels.length,
              0,
              1 / labels.length,
              1,
            ]);
          }
        });
        labelAtlas = new CanvasTexture(canvas);
      }
    }
    return previous;
  };
  const projectionKey = (footprint: InactiveFootprint) =>
    footprint.record?.id +
    "|" +
    footprint.dataset?.heightDatum +
    "|" +
    (footprint.heightOffset ?? 0);
  const projectionFor = (footprint: InactiveFootprint) => {
    const { record, dataset } = footprint;
    if (!record || !dataset) return undefined;
    const offset = footprint.heightOffset ?? 0,
      key = projectionKey(footprint);
    let cached = projectionCache.get(key);
    if (
      cached &&
      cached.footprint.record === record &&
      cached.footprint.dataset === dataset
    )
      return cached;
    cached = { footprint };
    projectionCache.set(key, cached);
    if (
      dataset.heightDatum === "dhhn2016" ||
      (dataset.heightDatum === "unknown" &&
        dataset.allowUnverifiedSourceHeight &&
        import.meta.env.DEV)
    )
      cached.altitude = record.z + offset;
    else {
      const pending = cached;
      void resolveCameraAltitude(
        record,
        dataset.heightDatum,
        offset,
        dataset.allowUnverifiedSourceHeight
      )
        .then((altitude) => {
          if (destroyed || projectionCache.get(key) !== pending) return;
          pending.altitude = altitude;
          surfaceDirty = true;
          updateSurface();
          map.triggerRepaint();
        })
        .catch(() => {
          /* A calibrated mark waits until the source altitude is resolved. */
        });
    }
    if (projectionCache.size > 96) {
      const retained = new Set([
        centerFootprint?.id,
        effectiveHoveredId(),
        ...trails.keys(),
      ]);
      for (const [key, value] of projectionCache)
        if (!retained.has(value.footprint.id)) projectionCache.delete(key);
    }
    return cached;
  };
  const updateProjective = (frame?: SharedThreeSceneFrame) => {
    if (!surfaceLease?.layer.setMapStyleProjectiveOverlay) return;
    const localFrame = frame?.localFrame ?? surfaceLease.layer.getLocalFrame();
    const origin = surfaceLease.layer.projectSceneToLngLat([0, 0, 0]);
    if (!localFrame || !origin) return;
    const key = origin.join("|") + "|" + localFrame.revision;
    if (!surfaceDirty && localFrameKey === key) return;
    localFrameKey = key;
    surfaceDirty = false;
    const hovered = locked ? centerFootprint ?? undefined : hoverCandidate();
    const current = [
      centerFootprint,
      !locked && hovered?.id !== centerFootprint?.id ? hovered : null,
    ].filter((value): value is InactiveFootprint => !!value);
    const labelFor = (footprint: InactiveFootprint) =>
      locked
        ? undefined
        : footprint.id === hovered?.id
        ? footprint.seriesLabel
        : centerAnnotation?.seriesLabel;
    const retired = updateLabelAtlas(
      current.map((value) => labelFor(value) ?? "")
    );
    const marks: MapStyleProjectiveOverlay["marks"][number][] = [];
    for (const footprint of [
      ...(locked
        ? []
        : Array.from(trails.values(), (value) => value.footprint)),
      ...current,
    ]) {
      const projection = projectionCache.get(projectionKey(footprint));
      if (
        projection?.altitude === undefined ||
        !footprint.record ||
        !footprint.dataset
      )
        continue;
      if (projection.frameKey !== key || !projection.matrix) {
        const pose = poseOf(footprint.record, footprint.dataset);
        const position = surfaceLease.layer.projectLngLatToScene(
          [pose.longitude, pose.latitude],
          projection.altitude
        );
        if (!position) continue;
        const calibration = getCameraCalibration(
          footprint.dataset,
          footprint.record.cameraId
        );
        projection.matrix = imageProjectionMatrix(
          footprint.record,
          calibration,
          pose,
          sceneToPhotoEnu(
            origin,
            localFrame.sceneFromLocal,
            pose,
            projection.altitude
          )
        );
        projection.terrainMatrix = imageProjectionMatrix(
          footprint.record,
          calibration,
          pose,
          sceneToMercatorPhotoEnu(position)
        );
        projection.frameKey = key;
      }
      const trail = trails.get(footprint.id),
        label = !trail ? labelFor(footprint) : undefined;
      marks.push({
        sceneToImage: projection.matrix,
        sceneToImageTerrain: projection.terrainMatrix,
        color: new Color(
          trail || footprint.id === hovered?.id ? "#ffff00" : style.color
        ),
        width: (style.width * OUTLINE_WIDTH_SCALE) as CssPixels,
        opacity: trail
          ? Math.max(0, Math.min(0.2, style.inactiveOpacity ?? 0.2))
          : 1,
        fillOpacity:
          !locked && !trail && footprint.id === centerFootprint?.id
            ? fillOpacity()
            : 0,
        showUpMarker: !locked,
        trailStartedAt: trail ? trail.start / 1000 : undefined,
        labelRect: label ? labelRects.get(label) : undefined,
      });
    }
    projectiveOverlay = marks.length
      ? {
          marks,
          labelAtlas,
          trailColor: new Color(style.color),
          trailDuration: TRAIL_DURATION_MS / 1000,
          opacity: surfaceOpacity,
        }
      : null;
    surfaceLease.layer.setMapStyleProjectiveOverlay(id, projectiveOverlay);
    retired?.dispose();
  };
  const updateSurface = () => {
    const receiver = getSharedThreeSceneRuntimes(map).some(
      (runtime) => runtime.receivesMapStyleTexture
    );
    if (!receiver) {
      if (surfaceLease) {
        surfaceLease.layer.setMapStyleProjectiveOverlay?.(id, null);
        removeBeforeRender?.();
        removeBeforeRender = undefined;
        surfaceLease.release();
        surfaceLease = null;
      }
      projectiveOverlay = null;
      surfaceOpacity = Math.max(0, Math.min(1, style.opacity));
      return;
    }
    if (!surfaceLease) {
      const lease = acquireSharedThreeScene(map);
      if (!lease.layer.setMapStyleProjectiveOverlay) {
        lease.release();
        return;
      }
      surfaceLease = lease;
      removeBeforeRender =
        lease.layer.addBeforeRenderCallback?.(updateProjective);
      surfaceDirty = true;
    }
    updateProjective();
  };
  const attach = () => {
    if (destroyed || attaching) return;
    attaching = true;
    try {
      updateSurface();
    } catch {
      /* Style replacement/loading: the next styledata/idle retries. */
    } finally {
      attaching = false;
    }
  };
  const onIdle = () => {
    if (destroyed || attaching) return;
    if (pruneTrails()) scheduleTrailExpiry();
    attach();
    scheduleTrailRepaint();
  };
  map.on("styledata", attach);
  map.on("idle", onIdle);
  // HMR can retain the old native layers. Remove them outside a draw callback
  // so MapLibre's in-flight symbol placement never observes a partial style.
  const legacyCleanup = setTimeout(() => {
    if (destroyed) return;
    try {
      for (const layerId of layerIds.slice().reverse())
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      for (const key of [imageId, hoverImageId])
        if (map.hasImage(key)) map.removeImage(key);
    } catch {
      /* A style replacement or map teardown has already removed them. */
    }
  }, 0);
  attach();
  return {
    setRing(ring, annotation, inactive) {
      labelCandidates.clear();
      for (const candidate of inactive ?? [])
        if (candidate.ring.length >= 4)
          labelCandidates.set(candidate.id, candidate);
      const next =
        ring && ring.length >= 4
          ? {
              id: annotation?.imageId ?? "__oblique-center",
              ring,
              pose: annotation?.pose ?? undefined,
              seriesLabel: annotation?.hoverLabel ?? annotation?.seriesLabel,
              record: annotation?.record,
              dataset: annotation?.dataset,
              heightOffset: annotation?.heightOffset,
            }
          : null;
      if (next) labelCandidates.set(next.id, next);
      if (
        centerFootprint?.id === next?.id &&
        centerFootprint?.ring === next?.ring &&
        centerAnnotation?.pose === annotation?.pose &&
        centerAnnotation?.seriesLabel === annotation?.seriesLabel &&
        centerAnnotation?.hoverLabel === annotation?.hoverLabel &&
        centerFootprint?.dataset === next?.dataset &&
        centerFootprint?.heightOffset === next?.heightOffset
      )
        return;
      if (centerFootprint && next?.id !== centerFootprint.id)
        rememberTrail(centerFootprint);
      centerFootprint = next;
      centerAnnotation = annotation;
      if (next) projectionFor(next);
      pruneTrails();
      surfaceDirty = true;
      attach();
      scheduleTrailExpiry();
      scheduleTrailRepaint();
      map.triggerRepaint();
    },
    containsScreenPoint() {
      return false;
    },
    imageAtScreenPoint() {
      return null;
    },
    setHoveredImage(next, candidate) {
      if (
        hoveredImageId === next &&
        externalHoverCandidate?.ring === candidate?.ring &&
        externalHoverCandidate?.seriesLabel === candidate?.seriesLabel &&
        externalHoverCandidate?.dataset === candidate?.dataset &&
        externalHoverCandidate?.heightOffset === candidate?.heightOffset
      )
        return;
      const previousHover = hoverCandidate();
      if (
        previousHover &&
        previousHover.id !== centerFootprint?.id &&
        previousHover.id !== next
      )
        rememberTrail(previousHover);
      hoveredImageId = next;
      externalHoverCandidate = candidate;
      const currentHover = hoverCandidate();
      if (currentHover) projectionFor(currentHover);
      pruneTrails();
      surfaceDirty = true;
      updateSurface();
      scheduleTrailExpiry();
      scheduleTrailRepaint();
      map.triggerRepaint();
    },
    setStyle(next) {
      if (
        next.color === style.color &&
        next.width === style.width &&
        next.opacity === style.opacity &&
        next.fillOpacity === style.fillOpacity &&
        next.inactiveOpacity === style.inactiveOpacity
      )
        return;
      style = next;
      if (style.opacity <= 0) clearTrailRepaint();
      else scheduleTrailRepaint();
      surfaceDirty = true;
      surfaceOpacity = Math.max(0, Math.min(1, style.opacity));
      attach();
    },
    setLocked(next) {
      if (next === locked) return;
      locked = next;
      if (locked) clearTrailRepaint();
      if (next && hoveredImageId) {
        hoveredImageId = null;
        externalHoverCandidate = undefined;
      }
      surfaceOpacity = Math.max(0, Math.min(1, style.opacity));
      surfaceDirty = true;
      updateSurface();
      map.triggerRepaint();
      if (!locked) {
        pruneTrails();
        scheduleTrailExpiry();
        scheduleTrailRepaint();
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      map.off("styledata", attach);
      map.off("idle", onIdle);
      clearTimeout(legacyCleanup);
      if (trailTimer !== undefined) clearTimeout(trailTimer);
      clearTrailRepaint();
      trailTimer = undefined;
      trails.clear();
      removeBeforeRender?.();
      surfaceLease?.layer.setMapStyleProjectiveOverlay?.(id, null);
      surfaceLease?.release();
      surfaceLease = null;
      labelAtlas?.dispose();
      labelAtlas = undefined;
      projectionCache.clear();
      whiteLabels.clear();
    },
  };
};
