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
export type InactiveFootprint = { id: string; ring: Position[] };
export type FootprintOutlineLayer = {
  setRing: (
    ring: Position[] | null,
    annotation?: {
      pose: ObliquePose | null;
      seriesLabel?: string;
      imageId?: string;
    },
    inactive?: readonly InactiveFootprint[]
  ) => void;
  containsScreenPoint: (point: { x: number; y: number }) => boolean;
  imageAtScreenPoint: (point: { x: number; y: number }) => string | null;
  setStyle: (style: FootprintOutlineStyle) => void;
  setLocked: (locked: boolean, fade?: AnimationConfig) => void;
  destroy: () => void;
};
const DEFAULT_FADE_MS = 300;
const LABEL_WIDTH = 512;
const LABEL_HEIGHT = 256;

export const createFootprintOutlineLayer = (
  map: MaplibreMap,
  id: string,
  initialStyle: FootprintOutlineStyle
): FootprintOutlineLayer => {
  const sourceId = `${id}-source`,
    hitId = `${id}-interior`,
    caretId = `${id}-caret`,
    labelId = `${id}-label`,
    imageId = `${id}-label-image`;
  const layerIds = [hitId, id, caretId, labelId];
  let style = initialStyle,
    locked = false,
    destroyed = false,
    attaching = false;
  let data: FeatureCollection = { type: "FeatureCollection", features: [] };
  let revision = 0;
  let labelText: string | undefined, labelColor: string | undefined;
  let labelImage: ImageData | null = null;
  let labelImageDirty = false;
  let labelCanvas: HTMLCanvasElement | null = null;
  let labelRing: Position[] | null = null;
  let surfaceLease: ReturnType<typeof acquireSharedThreeScene> | null = null;
  let surfaceTexture: CanvasTexture | null = null;
  let sharedLayerId: string | null = null;
  let surfaceBounds: [number, number, number, number] | null = null;
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
      });
  };
  const renderFade = () => {
    if (!fadeState || !surfaceLease) return;
    const t = Math.max(
      0,
      Math.min(
        1,
        (performance.now() - fadeState.start) / Math.max(1, fadeState.duration)
      )
    );
    surfaceOpacity = fadeState.from + (fadeState.to - fadeState.from) * t;
    publishSurface();
    if (t >= 1) fadeState = null;
    else map.triggerRepaint();
  };
  map.on("render", renderFade);

  const updateLabelImage = (text: string | undefined) => {
    if (
      !text ||
      (text === labelText && style.color === labelColor && labelImage)
    )
      return;
    const canvas = document.createElement("canvas");
    canvas.width = LABEL_WIDTH;
    canvas.height = LABEL_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.font = "800 172px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    const fontSize = Math.min(
      172,
      (172 * 480) / Math.max(480, context.measureText(text).width)
    );
    context.font = `800 ${fontSize}px sans-serif`;
    context.fillStyle = style.color;
    context.fillText(text, 256, 132);
    labelCanvas = canvas;
    labelImage = context.getImageData(0, 0, LABEL_WIDTH, LABEL_HEIGHT);
    labelText = text;
    labelColor = style.color;
    labelImageDirty = true;
  };
  const attachImage = () => {
    if (!labelImage) return;
    const exists = map.hasImage(imageId);
    if (exists && !labelImageDirty) return;
    // Register only after the geometry commit. Image writes can emit styledata
    // synchronously, which must never rasterize a half-built footprint.
    labelImageDirty = false;
    try {
      if (exists) map.updateImage(imageId, labelImage);
      else map.addImage(imageId, labelImage);
    } catch (error) {
      labelImageDirty = true;
      throw error;
    }
  };
  const opacity = () => (locked ? 0 : style.opacity);
  const nativeOpacity = () => (surfaceLease ? 0 : opacity());
  const inactiveOpacity = () =>
    Math.max(0, Math.min(0.1, style.inactiveOpacity ?? 0.1));
  const fillOpacity = () =>
    Math.max(0, Math.min(0.2, style.fillOpacity ?? 0.2));
  const lineOpacity = (): ExpressionSpecification => [
    "*",
    nativeOpacity(),
    ["case", ["==", ["get", "active"], false], inactiveOpacity(), 1],
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
      surfaceLease.layer.setMapStyleSurfaceOverlay(id, null);
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
    context.lineWidth =
      ((style.width / (512 * 2 ** zoom)) * canvas.width) / width;
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
    context.globalAlpha = inactiveOpacity();
    context.beginPath();
    polygons
      .filter((feature) => feature.properties?.active === false)
      .forEach(trace);
    context.stroke();
    for (const feature of activeFeatures) {
      context.beginPath();
      trace(feature);
      context.globalAlpha = 1;
      context.stroke();
    }
    if (labelRing && labelCanvas) {
      const [p0, p1, , p3] = labelRing.map(pixel);
      context.globalAlpha = 0.5;
      context.setTransform(
        (p1.x - p0.x) / LABEL_WIDTH,
        (p1.y - p0.y) / LABEL_WIDTH,
        (p3.x - p0.x) / LABEL_HEIGHT,
        (p3.y - p0.y) / LABEL_HEIGHT,
        p0.x,
        p0.y
      );
      context.drawImage(labelCanvas, 0, 0);
    }
    const northWest = new MercatorCoordinate(left, top).toLngLat();
    const southEast = new MercatorCoordinate(
      left + width,
      top + height
    ).toLngLat();
    surfaceBounds = [
      northWest.lng,
      southEast.lat,
      southEast.lng,
      northWest.lat,
    ];
    const previous = surfaceTexture;
    surfaceTexture = new CanvasTexture(canvas);
    publishSurface();
    previous?.dispose();
  };
  const applyStyle = () => {
    for (const lineId of [id, caretId]) {
      if (!map.getLayer(lineId)) continue;
      map.setPaintProperty(lineId, "line-color", style.color);
      map.setPaintProperty(lineId, "line-width", style.width);
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
              "line-color": style.color,
              "line-width": style.width,
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
            "icon-image": imageId,
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
          const origin = MercatorCoordinate.fromLngLat([
            ring[0][0],
            ring[0][1],
          ]);
          const meterScale = origin.meterInMercatorCoordinateUnits();
          const polygon = ring.map(([lng, lat]) => {
            const point = MercatorCoordinate.fromLngLat([lng, lat]);
            return new Vector2(
              (point.x - origin.x) / meterScale,
              -(point.y - origin.y) / meterScale
            );
          });
          const marker = footprintMarkerGeometry(polygon, annotation.pose);
          if (marker) {
            const toLngLat = (point: Vector2): number[] => {
              const coordinate = new MercatorCoordinate(
                origin.x + point.x * meterScale,
                origin.y - point.y * meterScale
              ).toLngLat();
              return [coordinate.lng, coordinate.lat];
            };
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
                  scale: edge.length() * meterScale,
                  rotationDeg: (Math.atan2(-edge.y, edge.x) * 180) / Math.PI,
                },
                geometry: { type: "Point", coordinates: toLngLat(center) },
              });
            }
          }
        }
      }
      data = { type: "FeatureCollection", features };
      surfaceDirty = true;
      attach();
      (map.getSource(sourceId) as GeoJSONSource | undefined)?.setData(data);
    },
    containsScreenPoint(point) {
      return renderedFootprints(point).length > 0;
    },
    imageAtScreenPoint(point) {
      const hits = renderedFootprints(point);
      const feature =
        hits.find((feature) => feature.properties?.active === true) ?? hits[0];
      return typeof feature?.properties?.imageId === "string"
        ? feature.properties.imageId
        : null;
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
        if (map.hasImage(imageId)) map.removeImage(imageId);
      } catch {
        /* Map teardown or a style replacement has already removed them. */
      }
    },
  };
};
