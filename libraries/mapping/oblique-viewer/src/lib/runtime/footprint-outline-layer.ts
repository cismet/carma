import { MercatorCoordinate } from "maplibre-gl";
import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MaplibreMap,
} from "maplibre-gl";
import type { FeatureCollection, Position } from "geojson";
import { CanvasTexture, Vector2 } from "three";

import {
  acquireSharedThreeScene,
  getSharedThreeSceneRuntimes,
} from "@carma-mapping/engines/maplibre";

import type { AnimationConfig, ObliquePose } from "../core/types";
import { footprintMarkerGeometry } from "../core/utils/footprint-marker";
import { diagonalIntersection } from "../core/utils/footprint-diagonal-intersection";
import { MAX_VISIBLE_FOOTPRINTS } from "../core/utils/viewport-footprints";
import { radToDeg, type Radians } from "@carma-units";

/**
 * Native terrain features plus a world-aligned texture on visible mesh receivers.
 * Replaces the manual Three scene/tessellation and repeated DEM queries. GeoJSON
 * tiling and terrain subdivision belong to MapLibre's existing worker pipeline.
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
};
export type FootprintOutlineLayer = {
  setRing: (
    ring: Position[] | null,
    annotation?: {
      pose: ObliquePose | null;
      seriesLabel?: string;
      hoverLabel?: string;
      imageId?: string;
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
const DEFAULT_FADE_MS = 300;
const FOOTPRINT_TRANSITION_MS = 180;
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

const markerForRing = (ring: Position[], pose: ObliquePose) => {
  const origin = MercatorCoordinate.fromLngLat([ring[0][0], ring[0][1]]);
  const meterScale = origin.meterInMercatorCoordinateUnits();
  const polygon = ring.map(([lng, lat]) => {
    const point = MercatorCoordinate.fromLngLat([lng, lat]);
    return new Vector2(
      (point.x - origin.x) / meterScale,
      -(point.y - origin.y) / meterScale
    );
  });
  const marker = footprintMarkerGeometry(polygon, pose);
  if (!marker) return null;
  const toLngLat = (point: Vector2): number[] => {
    const coordinate = new MercatorCoordinate(
      origin.x + point.x * meterScale,
      origin.y - point.y * meterScale
    ).toLngLat();
    return [coordinate.lng, coordinate.lat];
  };
  return { marker, toLngLat, meterScale };
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
  let data: FeatureCollection = { type: "FeatureCollection", features: [] };
  let baseData = data;
  const labelCandidates = new Map<string, InactiveFootprint>();
  let hoverText: string | undefined;
  let hoverCanvas: HTMLCanvasElement | null = null;
  let hoverImage: ImageData | null = null;
  let hoverImageDirty = false;
  let hoverRing: Position[] | null = null;
  let revision = 0;
  let hoveredImageId: string | null = null;
  let externalHoverCandidate: InactiveFootprint | undefined;
  const centers = new Map<string, [number, number]>();
  let labelText: string | undefined, labelColor: string | undefined;
  let labelImage: ImageData | null = null;
  let labelImageDirty = false;
  let labelCanvas: HTMLCanvasElement | null = null;
  let labelRing: Position[] | null = null;
  let surfaceLease: ReturnType<typeof acquireSharedThreeScene> | null = null;
  let surfaceTexture: CanvasTexture | null = null;
  let sharedLayerId: string | null = null;
  let surfaceBounds: [number, number, number, number] | null = null;
  let previousSurface:
    | { texture: CanvasTexture; bounds: [number, number, number, number] }
    | undefined;
  let surfaceTransitionStart: number | null = null;
  let surfaceTransition = 1;
  const clearPreviousSurface = () => {
    const previous = previousSurface;
    previousSurface = undefined;
    surfaceTransitionStart = null;
    surfaceTransition = 1;
    return previous;
  };
  let surfaceDirty = true,
    surfaceZoom = Number.NaN;
  let surfaceOpacity = initialStyle.opacity;
  let fadeState: {
    start: number;
    duration: number;
    from: number;
    to: number;
  } | null = null;
  const publishSurface = () => {
    if (surfaceTexture && surfaceBounds)
      surfaceLease?.layer.setMapStyleSurfaceOverlay?.(id, {
        texture: surfaceTexture,
        bounds: surfaceBounds,
        opacity: surfaceOpacity,
        previous: previousSurface,
        transition: surfaceTransition,
      });
  };
  const renderFade = () => {
    if ((!fadeState && surfaceTransitionStart === null) || !surfaceLease)
      return;
    const now = performance.now();
    if (fadeState) {
      const t = Math.max(
        0,
        Math.min(1, (now - fadeState.start) / Math.max(1, fadeState.duration))
      );
      surfaceOpacity = fadeState.from + (fadeState.to - fadeState.from) * t;
      if (t >= 1) fadeState = null;
    }
    let retired: typeof previousSurface;
    if (surfaceTransitionStart !== null) {
      surfaceTransition = Math.max(
        0,
        Math.min(1, (now - surfaceTransitionStart) / FOOTPRINT_TRANSITION_MS)
      );
      if (surfaceTransition >= 1) retired = clearPreviousSurface();
    }
    publishSurface();
    retired?.texture.dispose();
    if (fadeState || surfaceTransitionStart !== null) map.triggerRepaint();
  };
  map.on("render", renderFade);

  const updateLabelImage = (text: string | undefined) => {
    if (
      !text ||
      (text === labelText && style.color === labelColor && labelImage)
    )
      return;
    const canvas = createLabelCanvas(text, style.color);
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    labelCanvas = canvas;
    labelImage = context.getImageData(0, 0, LABEL_WIDTH, LABEL_HEIGHT);
    labelText = text;
    labelColor = style.color;
    labelImageDirty = true;
  };
  const attachImage = () => {
    for (const [key, pixels, dirty, isHover] of [
      [imageId, labelImage, labelImageDirty, false],
      [hoverImageId, hoverImage, hoverImageDirty, true],
    ] as const) {
      if (!pixels) continue;
      const exists = map.hasImage(key);
      if (exists && !dirty) continue;
      // Image writes can emit styledata: publish only after a complete geometry commit.
      if (isHover) hoverImageDirty = false;
      else labelImageDirty = false;
      try {
        if (exists) map.updateImage(key, pixels);
        else map.addImage(key, pixels);
      } catch (error) {
        if (isHover) hoverImageDirty = true;
        else labelImageDirty = true;
        throw error;
      }
    }
  };
  const updateHoveredLabel = () => {
    hoverRing = null;
    data = { type: "FeatureCollection", features: [...baseData.features] };
    const candidate = hoveredImageId
      ? labelCandidates.get(hoveredImageId) ??
        (externalHoverCandidate?.id === hoveredImageId
          ? externalHoverCandidate
          : undefined)
      : undefined;
    if (
      candidate &&
      candidate.ring.length >= 4 &&
      !data.features.some(
        (feature) =>
          feature.geometry.type === "Polygon" &&
          feature.properties?.imageId === candidate.id
      )
    ) {
      const polygonCount = data.features.filter(
        (feature) => feature.geometry.type === "Polygon"
      ).length;
      if (polygonCount >= MAX_VISIBLE_FOOTPRINTS) {
        let lastInactive = -1;
        for (let i = data.features.length - 1; i >= 0; i--) {
          const feature = data.features[i];
          if (
            feature.geometry.type === "Polygon" &&
            feature.properties?.active === false
          ) {
            lastInactive = i;
            break;
          }
        }
        if (lastInactive >= 0) data.features.splice(lastInactive, 1);
      }
      data.features.push({
        type: "Feature",
        properties: {
          part: "footprint",
          revision,
          active: false,
          imageId: candidate.id,
        },
        geometry: { type: "Polygon", coordinates: [candidate.ring] },
      });
      const [p0, p1, p2, p3] = candidate.ring;
      const center = diagonalIntersection(p0, p1, p2, p3);
      if (center) centers.set(candidate.id, center);
    }
    const projected = candidate?.pose
      ? markerForRing(candidate.ring, candidate.pose)
      : null;
    const text = candidate?.seriesLabel;
    if (!projected || !text) return;
    if (text !== hoverText || !hoverCanvas) {
      const canvas = createLabelCanvas(text, "#ffff00");
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;
      hoverCanvas = canvas;
      hoverImage = context.getImageData(0, 0, LABEL_WIDTH, LABEL_HEIGHT);
      hoverText = text;
      hoverImageDirty = true;
    }
    const { marker, toLngLat, meterScale } = projected;
    hoverRing = marker.labelCorners.map(toLngLat);
    const center = marker.labelCorners
      .reduce((sum, point) => sum.add(point), new Vector2())
      .divideScalar(4);
    const edge = marker.labelCorners[1].clone().sub(marker.labelCorners[0]);
    // Hover takes precedence: expose a single identity annotation in either renderer.
    data.features = data.features.filter(
      (feature) => feature.properties?.part !== "label"
    );
    data.features.push({
      type: "Feature",
      properties: {
        part: "label",
        hovered: true,
        imageId: hoveredImageId,
        scale: edge.length() * meterScale,
        rotationDeg: radToDeg(Math.atan2(-edge.y, edge.x) as Radians),
      },
      geometry: { type: "Point", coordinates: toLngLat(center) },
    });
  };
  const opacity = () => (locked ? 0 : style.opacity);
  const nativeOpacity = () => (surfaceLease ? 0 : opacity());
  const inactiveOpacity = () =>
    Math.max(0, Math.min(0.2, style.inactiveOpacity ?? 0.2)) /
    Math.max(0.2, style.opacity);
  const fillOpacity = () =>
    Math.max(0, Math.min(0.2, style.fillOpacity ?? 0.2));
  const lineOpacity = (): ExpressionSpecification => [
    "*",
    nativeOpacity(),
    [
      "case",
      ["==", ["get", "imageId"], hoveredImageId ?? ""],
      1,
      ["==", ["get", "active"], false],
      inactiveOpacity(),
      1,
    ],
  ];
  const lineColor = (): ExpressionSpecification => [
    "case",
    ["==", ["get", "imageId"], hoveredImageId ?? ""],
    "#ffff00",
    style.color,
  ];
  const lineWidth = (): ExpressionSpecification => [
    "*",
    style.width * OUTLINE_WIDTH_SCALE,
    [
      "case",
      ["==", ["get", "imageId"], hoveredImageId ?? ""],
      1,
      ["==", ["get", "active"], false],
      0.5,
      1,
    ],
  ];
  const renderedFootprints = (point: { x: number; y: number }) =>
    !destroyed && !locked && style.opacity > 0 && !!map.getLayer(hitId)
      ? map
          .queryRenderedFeatures([point.x, point.y], { layers: [hitId] })
          .filter((feature) => feature.properties?.revision === revision)
      : [];
  const updateSurface = () => {
    const receivers = getSharedThreeSceneRuntimes(map).some(
      (runtime) => runtime.receivesMapStyleTexture
    );
    const wasActive = !!surfaceLease;
    if (!receivers) {
      fadeState = null;
      surfaceOpacity = opacity();
      surfaceLease?.layer.setMapStyleSurfaceOverlay?.(id, null);
      clearPreviousSurface()?.texture.dispose();
      surfaceLease?.release();
      surfaceLease = null;
      if (wasActive) applyStyle();
      return;
    }
    if (!surfaceLease) {
      surfaceLease = acquireSharedThreeScene(map);
      if (!surfaceLease.layer.setMapStyleSurfaceOverlay) {
        surfaceLease.release();
        surfaceLease = null;
        return;
      }
      sharedLayerId = surfaceLease.layer.id;
      surfaceDirty = true;
      applyStyle();
    }
    const zoom = map.getZoom();
    if (!surfaceDirty && zoom === surfaceZoom) return;
    surfaceDirty = false;
    surfaceZoom = zoom;
    const polygons = data.features.filter((f) => f.geometry.type === "Polygon");
    const polygon =
      polygons.find((f) => f.properties?.active !== false) ?? polygons[0];
    if (!polygon || polygon.geometry.type !== "Polygon") {
      surfaceLease.layer.setMapStyleSurfaceOverlay?.(id, null);
      clearPreviousSurface()?.texture.dispose();
      surfaceTexture?.dispose();
      surfaceTexture = null;
      return;
    }
    const coordinates = polygons.flatMap((feature) =>
      feature.geometry.type === "Polygon"
        ? feature.geometry.coordinates[0].map((point) =>
            MercatorCoordinate.fromLngLat([point[0], point[1]])
          )
        : []
    );
    const minX = Math.min(...coordinates.map((p) => p.x)),
      minY = Math.min(...coordinates.map((p) => p.y));
    const maxX = Math.max(...coordinates.map((p) => p.x)),
      maxY = Math.max(...coordinates.map((p) => p.y));
    const span = Math.max(maxX - minX, maxY - minY);
    if (!(span > 0)) return;
    const margin = span * 0.01;
    const left = minX - margin,
      top = minY - margin,
      width = maxX - minX + 2 * margin,
      height = maxY - minY + 2 * margin;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(
      16,
      Math.round((2048 * width) / Math.max(width, height))
    );
    canvas.height = Math.max(
      16,
      Math.round((2048 * height) / Math.max(width, height))
    );
    const context = canvas.getContext("2d");
    if (!context) return;
    const pixel = (point: Position): Vector2 => {
      const merc = MercatorCoordinate.fromLngLat([point[0], point[1]]);
      return new Vector2(
        ((merc.x - left) / width) * canvas.width,
        ((merc.y - top) / height) * canvas.height
      );
    };
    context.strokeStyle = style.color;
    const outlineWidth =
      (((style.width * OUTLINE_WIDTH_SCALE) / (512 * 2 ** zoom)) *
        canvas.width) /
      width;
    context.lineWidth = outlineWidth;
    context.lineJoin = "round";
    context.lineCap = "round";
    const trace = (feature: FeatureCollection["features"][number]) => {
      const points =
        feature.geometry.type === "Polygon"
          ? feature.geometry.coordinates[0]
          : feature.geometry.type === "LineString"
          ? feature.geometry.coordinates
          : null;
      points
        ?.map(pixel)
        .forEach((point, index) =>
          index === 0
            ? context.moveTo(point.x, point.y)
            : context.lineTo(point.x, point.y)
        );
      if (feature.geometry.type === "Polygon") context.closePath();
    };
    context.fillStyle = style.color;
    // One background pass avoids accumulating opacity where inactive rings overlap.
    context.globalAlpha = inactiveOpacity();
    context.beginPath();
    polygons
      .filter((feature) => feature.properties?.active === false)
      .forEach(trace);
    context.fill();
    const activeFeatures = data.features.filter(
      (feature) => feature.properties?.active !== false
    );
    const activePolygon = activeFeatures.find(
      (feature) => feature.geometry.type === "Polygon"
    );
    if (activePolygon) {
      context.beginPath();
      trace(activePolygon);
      context.save();
      context.clip();
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.restore();
      context.globalAlpha = fillOpacity();
      context.fill();
    }
    context.lineWidth = outlineWidth * 0.5;
    context.globalAlpha = inactiveOpacity();
    context.beginPath();
    polygons
      .filter(
        (feature) =>
          feature.properties?.active === false &&
          feature.properties.imageId !== hoveredImageId
      )
      .forEach(trace);
    context.stroke();
    context.lineWidth = outlineWidth;
    for (const feature of activeFeatures) {
      context.beginPath();
      trace(feature);
      context.globalAlpha = 1;
      context.stroke();
    }
    const hovered = polygons.find(
      (feature) => feature.properties?.imageId === hoveredImageId
    );
    if (hovered) {
      context.strokeStyle = "#ffff00";
      context.globalAlpha = 1;
      context.beginPath();
      trace(hovered);
      context.stroke();
    }
    for (const [ring, image] of [
      [hoverRing ? null : labelRing, labelCanvas],
      [hoverRing, hoverCanvas],
    ] as const) {
      if (!ring || !image) continue;
      const [p0, p1, , p3] = ring.map(pixel);
      context.globalAlpha = 0.5;
      context.setTransform(
        (p1.x - p0.x) / LABEL_WIDTH,
        (p1.y - p0.y) / LABEL_WIDTH,
        (p3.x - p0.x) / LABEL_HEIGHT,
        (p3.y - p0.y) / LABEL_HEIGHT,
        p0.x,
        p0.y
      );
      context.drawImage(image, 0, 0);
    }
    const northWest = new MercatorCoordinate(left, top).toLngLat();
    const southEast = new MercatorCoordinate(
      left + width,
      top + height
    ).toLngLat();
    const oldTexture = surfaceTexture;
    const oldBounds = surfaceBounds;
    const retired = clearPreviousSurface();
    surfaceBounds = [
      northWest.lng,
      southEast.lat,
      southEast.lng,
      northWest.lat,
    ];
    if (oldTexture && oldBounds)
      previousSurface = { texture: oldTexture, bounds: oldBounds };
    surfaceTransitionStart = performance.now();
    surfaceTransition = 0;
    surfaceTexture = new CanvasTexture(canvas);
    publishSurface();
    retired?.texture.dispose();
    map.triggerRepaint();
  };
  const applyStyle = () => {
    for (const lineId of [id, caretId]) {
      if (!map.getLayer(lineId)) continue;
      map.setPaintProperty(lineId, "line-color", lineColor());
      map.setPaintProperty(lineId, "line-width", lineWidth());
      map.setPaintProperty(lineId, "line-opacity", lineOpacity());
    }
    if (map.getLayer(labelId))
      map.setPaintProperty(labelId, "icon-opacity", nativeOpacity() * 0.5);
    if (map.getLayer(hitId)) {
      map.setPaintProperty(hitId, "fill-color", style.color);
      map.setPaintProperty(hitId, "fill-opacity", [
        "*",
        nativeOpacity(),
        [
          "case",
          ["==", ["get", "active"], false],
          inactiveOpacity(),
          fillOpacity(),
        ],
      ]);
      map.setLayoutProperty(
        hitId,
        "visibility",
        locked || style.opacity <= 0 ? "none" : "visible"
      );
    }
  };
  const placeLayers = () => {
    if (!getSharedThreeSceneRuntimes(map).length) return;
    // Discover once. Reacquiring/releasing a lease on every idle/style event
    // would force the shared label/style reconciliation again.
    if (!sharedLayerId) {
      const lease = acquireSharedThreeScene(map);
      sharedLayerId = lease.layer.id;
      lease.release();
    }
    const order = map.getLayersOrder();
    const sharedIndex = order.indexOf(sharedLayerId);
    if (sharedIndex < 0) return;
    // The shared scene owns capture order. Ground overlays must precede it.
    for (const layerId of layerIds) {
      if (order.indexOf(layerId) > sharedIndex)
        map.moveLayer(layerId, sharedLayerId);
    }
  };
  const attach = () => {
    if (destroyed || attaching) return;
    attaching = true;
    try {
      if (!map.getSource(sourceId))
        map.addSource(sourceId, { type: "geojson", data });
      attachImage();
      if (!map.getLayer(hitId))
        map.addLayer({
          id: hitId,
          type: "fill",
          source: sourceId,
          filter: ["==", ["get", "part"], "footprint"],
          layout: { visibility: locked ? "none" : "visible" },
          paint: {
            "fill-opacity-transition": {
              duration: FOOTPRINT_TRANSITION_MS,
              delay: 0,
            },
            "fill-color": style.color,
            "fill-opacity": [
              "*",
              nativeOpacity(),
              [
                "case",
                ["==", ["get", "active"], false],
                inactiveOpacity(),
                fillOpacity(),
              ],
            ],
          },
        });
      for (const [layerId, part] of [
        [id, "footprint"],
        [caretId, "caret"],
      ]) {
        if (!map.getLayer(layerId))
          map.addLayer({
            id: layerId,
            type: "line",
            source: sourceId,
            filter: ["==", ["get", "part"], part],
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
              "line-opacity-transition": {
                duration: FOOTPRINT_TRANSITION_MS,
                delay: 0,
              },
              "line-color": lineColor(),
              "line-width": lineWidth(),
              "line-opacity": lineOpacity(),
            },
          });
      }
      if (!map.getLayer(labelId))
        map.addLayer({
          id: labelId,
          type: "symbol",
          source: sourceId,
          metadata: { "carma:map-style-placement": "draped" },
          filter: ["==", ["get", "part"], "label"],
          layout: {
            "icon-image": [
              "case",
              ["==", ["get", "hovered"], true],
              hoverImageId,
              imageId,
            ],
            "icon-pitch-alignment": "map",
            "icon-rotation-alignment": "map",
            "icon-rotate": ["get", "rotationDeg"],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            // A 512px sprite follows the marker's world width, independent of zoom.
            "icon-size": [
              "interpolate",
              ["exponential", 2],
              ["zoom"],
              0,
              ["get", "scale"],
              24,
              ["*", ["get", "scale"], 2 ** 24],
            ],
          },
          paint: { "icon-opacity": nativeOpacity() * 0.5 },
        });
      updateSurface();
      placeLayers();
    } catch {
      /* Style replacement/loading: the next styledata/idle retries. */
    } finally {
      attaching = false;
    }
  };
  map.on("styledata", attach);
  map.on("idle", attach);
  attach();
  return {
    setRing(ring, annotation, inactive) {
      revision++;
      surfaceDirty = true;
      labelRing = null;
      labelCandidates.clear();
      for (const candidate of inactive ?? [])
        if (candidate.ring.length >= 4)
          labelCandidates.set(candidate.id, candidate);
      if (ring && annotation?.imageId && ring.length >= 4)
        labelCandidates.set(annotation.imageId, {
          id: annotation.imageId,
          ring,
          pose: annotation.pose ?? undefined,
          seriesLabel: annotation.hoverLabel ?? annotation.seriesLabel,
        });
      const features: FeatureCollection["features"] = (inactive ?? [])
        .filter((footprint) => footprint.ring.length >= 4)
        .map((footprint) => ({
          type: "Feature",
          properties: {
            part: "footprint",
            revision,
            active: false,
            imageId: footprint.id,
          },
          geometry: { type: "Polygon", coordinates: [footprint.ring] },
        }));
      if (ring && ring.length >= 4) {
        features.push({
          type: "Feature",
          properties: {
            part: "footprint",
            revision,
            active: true,
            imageId: annotation?.imageId,
          },
          geometry: { type: "Polygon", coordinates: [ring] },
        });
        if (annotation?.pose) {
          const projected = markerForRing(ring, annotation.pose);
          if (projected) {
            const { marker, toLngLat, meterScale } = projected;
            const [tip, right, left] = marker.triangle;
            features.push({
              type: "Feature",
              properties: { part: "caret" },
              geometry: {
                type: "LineString",
                coordinates: [right, tip, left].map(toLngLat),
              },
            });
            const text = annotation.seriesLabel;
            if (text) {
              updateLabelImage(text);
              labelRing = marker.labelCorners.map(toLngLat);
              const center = marker.labelCorners
                .reduce((sum, point) => sum.add(point), new Vector2())
                .divideScalar(4);
              const edge = marker.labelCorners[1]
                .clone()
                .sub(marker.labelCorners[0]);
              features.push({
                type: "Feature",
                properties: {
                  part: "label",
                  imageId: annotation.imageId,
                  scale: edge.length() * meterScale,
                  rotationDeg: (Math.atan2(-edge.y, edge.x) * 180) / Math.PI,
                },
                geometry: { type: "Point", coordinates: toLngLat(center) },
              });
            }
          }
        }
      }
      centers.clear();
      for (const feature of features) {
        if (
          feature.geometry.type !== "Polygon" ||
          typeof feature.properties?.imageId !== "string"
        )
          continue;
        const points = feature.geometry.coordinates[0];
        if (points.length >= 4) {
          const center = diagonalIntersection(
            points[0],
            points[1],
            points[2],
            points[3]
          );
          if (center) centers.set(feature.properties.imageId, center);
        }
      }
      baseData = { type: "FeatureCollection", features };
      updateHoveredLabel();
      surfaceDirty = true;
      attach();
      (map.getSource(sourceId) as GeoJSONSource | undefined)?.setData(data);
    },
    containsScreenPoint(point) {
      return renderedFootprints(point).length > 0;
    },
    imageAtScreenPoint(point) {
      const hits = renderedFootprints(point);
      if (!hits.length) return null;
      const target = map.unproject([point.x, point.y]);
      const targetMercator = MercatorCoordinate.fromLngLat(target);
      let nearestDistance = Infinity;
      let feature = hits[0];
      // Rank the intersecting images against the next view axis, not worker tile order.
      for (const hit of hits) {
        const center = centers.get(hit.properties?.imageId);
        if (!center) continue;
        const mercator = MercatorCoordinate.fromLngLat(center);
        const distance =
          (mercator.x - targetMercator.x) ** 2 +
          (mercator.y - targetMercator.y) ** 2;
        if (
          distance < nearestDistance ||
          (distance === nearestDistance && hit.properties?.active === true)
        ) {
          nearestDistance = distance;
          feature = hit;
        }
      }
      return typeof feature?.properties?.imageId === "string"
        ? feature.properties.imageId
        : null;
    },
    setHoveredImage(next, candidate) {
      if (
        hoveredImageId === next &&
        externalHoverCandidate?.ring === candidate?.ring &&
        externalHoverCandidate?.seriesLabel === candidate?.seriesLabel
      )
        return;
      if (
        externalHoverCandidate &&
        !labelCandidates.has(externalHoverCandidate.id)
      )
        centers.delete(externalHoverCandidate.id);
      hoveredImageId = next;
      externalHoverCandidate = candidate;
      updateHoveredLabel();
      attachImage();
      (map.getSource(sourceId) as GeoJSONSource | undefined)?.setData(data);
      surfaceDirty = true;
      updateSurface();
      applyStyle();
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
      surfaceDirty = true;
      if (!fadeState) surfaceOpacity = opacity();
      updateLabelImage(labelText);
      attachImage();
      updateSurface();
      applyStyle();
    },
    setLocked(next, fade) {
      if (next === locked) return;
      locked = next;
      if (next && hoveredImageId) {
        hoveredImageId = null;
        externalHoverCandidate = undefined;
        updateHoveredLabel();
        (map.getSource(sourceId) as GeoJSONSource | undefined)?.setData(data);
        surfaceDirty = true;
        updateSurface();
      }
      if (surfaceLease) {
        fadeState = {
          from: surfaceOpacity,
          to: opacity(),
          start: performance.now() + (fade?.delay ?? 0),
          duration: fade?.duration ?? DEFAULT_FADE_MS,
        };
        map.triggerRepaint();
      } else surfaceOpacity = opacity();
      for (const [layerId, property] of [
        [hitId, "fill-opacity"],
        [id, "line-opacity"],
        [caretId, "line-opacity"],
        [labelId, "icon-opacity"],
      ]) {
        if (map.getLayer(layerId))
          map.setPaintProperty(layerId, `${property}-transition`, {
            duration: fade?.duration ?? DEFAULT_FADE_MS,
            delay: fade?.delay ?? 0,
          });
      }
      applyStyle();
    },
    destroy() {
      destroyed = true;
      map.off("styledata", attach);
      map.off("idle", attach);
      map.off("render", renderFade);
      fadeState = null;
      surfaceLease?.layer.setMapStyleSurfaceOverlay?.(id, null);
      surfaceLease?.release();
      surfaceLease = null;
      surfaceTexture?.dispose();
      surfaceTexture = null;
      try {
        for (const layerId of layerIds.slice().reverse())
          if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
        for (const key of [imageId, hoverImageId])
          if (map.hasImage(key)) map.removeImage(key);
      } catch {
        /* Map teardown or a style replacement has already removed them. */
      }
    },
  };
};
