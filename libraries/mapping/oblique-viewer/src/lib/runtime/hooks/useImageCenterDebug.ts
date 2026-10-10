import { physicalImageQueryTarget } from "../utils/image-selection-ecef";
import { physicalCenterDistance } from "../../core/utils/image-selection-index";
import { useEffect, useRef } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { distanceMeters } from "@carma-geo/utils";
import {
  PI,
  degToRadNumeric,
  type Degrees,
  type Radians,
  type DevicePixels,
} from "@carma-units";
import { Matrix4, Plane, Raycaster, Vector3, Vector4 } from "three";
import { acquireSharedThreeScene } from "@carma-mapping/engines/maplibre";
import type { ObliqueGroundTarget, ObliqueImageRecord } from "../../core/types";
import {
  imageProjectionMatrix,
  sceneToPhotoEnu,
} from "../../core/utils/image-projection";
import {
  normalizeSeamlessCenterY,
  seamlessImageCenterDistance,
} from "../../core/utils/seamless-image-center";
import {
  objectCoveragePixelRay,
  projectObjectCoveragePoint,
} from "../../core/utils/object-coverage";
import type {
  ScenePreviewPhoto,
  ScenePreviewImageMapping,
} from "./useScenePreviewImage";
import {
  photoCenterRays,
  presentationPointToScene,
  sceneToPresentationPoint,
  screenPointOnPhotoPlane,
} from "../../core/utils/photo-center-rays";
import type { PhotoAxisSurfaceMode } from "../utils/photo-axis-picker";

import {
  photoReferenceDistanceMeters,
  type PhotoReferencePoint,
} from "../utils/photo-reference-points";

type Options = {
  map: MaplibreMap | null;
  enabled: boolean;
  readRecords: () => readonly ObliqueImageRecord[];
  selectedId: string | null;
  centerY: number;
  showOpticalCenters?: boolean;
  showScreenCenters?: boolean;
  surfaceMode: PhotoAxisSurfaceMode;
  resolvePhoto: (record: ObliqueImageRecord) => Promise<ScenePreviewPhoto>;
  resolveReferencePoint?: (
    record: ObliqueImageRecord,
    centerY: number,
    mode: PhotoAxisSurfaceMode
  ) => Promise<PhotoReferencePoint | null>;
  readReferenceRevision?: () => string;
  readReferenceHeight?: (record: ObliqueImageRecord) => number;
  readTarget: () => ObliqueGroundTarget | null;
  readPointerTarget?: (point: {
    x: number;
    y: number;
  }) => ObliqueGroundTarget | null;
  readPlaneMapping?: () => ScenePreviewImageMapping | null;
  intersectSurface: (
    ray: Raycaster,
    eye: [number, number],
    mode: PhotoAxisSurfaceMode
  ) => { point: Vector3 } | null;
};
const LIMIT = 128;
const MAX_LABEL_TILT = degToRadNumeric(60) as Radians;
const meterFormat = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 1,
});
type GroundPoint = {
  longitude: number;
  latitude: number;
  heightMeters: number;
};
type Entry = {
  record: ObliqueImageRecord;
  photo?: ScenePreviewPhoto;
  refreshPhoto?: boolean;
  hit?: GroundPoint | null;
  reference?: PhotoReferencePoint | null;
  centers?: Partial<Record<"axis" | "up", GroundPoint>>;
  opticalUv?: { x: number; y: number };
  pending: boolean;
  dirty: boolean;
  cameraKey: string;
  projection?: Matrix4;
  enu?: Matrix4;
  frameKey?: string;
};

const cameraKey = (record: ObliqueImageRecord) =>
  JSON.stringify([
    record.seriesId,
    record.cameraId,
    record.x,
    record.y,
    record.z,
    record.m,
    record.centerWGS84,
    record.fallbackHeading,
    record.pose,
    record.catalogCenter,
  ]);

/** Read-only debug; four photos per batch, sampling only the requested centre types. */
export const useImageCenterDebug = (options: Options) => {
  const current = useRef(options);
  current.current = options;
  useEffect(() => {
    const { map } = current.current;
    if (!map || !options.enabled) return;
    const scene = acquireSharedThreeScene(map);
    const canvas = document.createElement("canvas");
    canvas.dataset.obliqueCenterDebug = "true";
    canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5";
    canvas.setAttribute(
      "aria-label",
      "Bildhauptpunkte und Bildmitten: Fadenkreuze und Mausabstände"
    );
    map.getCanvasContainer().appendChild(canvas);
    const context = canvas.getContext("2d");
    const entries = new Map<string, Entry>();
    let disposed = false,
      generation = 0,
      configuration = "",
      surfaceRevision = "";
    let scheduled: ReturnType<typeof setTimeout> | undefined;
    let preparing = false;
    let paintRevision = 0;
    let lastPaintKey = "";
    let selectedId = current.current.selectedId;
    let pointer: { x: number; y: number } | null = null;
    let pointerTarget: ObliqueGroundTarget | null = null;
    let pointerTimer: ReturnType<typeof setTimeout> | undefined;
    const physicalQueries: Record<
      "view" | "pointer",
      { key: string; target: ObliqueGroundTarget | null }
    > = {
      view: { key: "", target: null },
      pointer: { key: "", target: null },
    };
    const resolvePhysicalQuery = (
      kind: "view" | "pointer",
      target: ObliqueGroundTarget | null
    ) => {
      const key = target
        ? `${target.longitude}|${target.latitude}|${target.heightMeters}|${target.heightDatum}`
        : "";
      if (physicalQueries[kind].key === key) return;
      const request = { key, target: null as ObliqueGroundTarget | null };
      physicalQueries[kind] = request;
      if (target)
        void physicalImageQueryTarget(target)
          .then((value) => {
            if (disposed || physicalQueries[kind] !== request) return;
            request.target = value;
            paintRevision++;
            map.triggerRepaint();
          })
          .catch(() => {});
    };
    const samplePointer = () => {
      if (pointerTimer !== undefined || !pointer || disposed) return;
      pointerTimer = setTimeout(() => {
        pointerTimer = undefined;
        if (disposed || !pointer) return;
        pointerTarget = current.current.readPointerTarget?.(pointer) ?? null;
        resolvePhysicalQuery("pointer", pointerTarget);
        paintRevision++;
        map.triggerRepaint();
      }, 40);
    };
    const onPointerMove = (event: PointerEvent) => {
      const rect = map.getCanvasContainer().getBoundingClientRect();
      const next = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      if (pointer?.x === next.x && pointer?.y === next.y) return;
      pointer = next;
      paintRevision++;
      samplePointer();
      map.triggerRepaint();
    };
    const onPointerLeave = () => {
      pointer = null;
      pointerTarget = null;
      resolvePhysicalQuery("pointer", null);
      clearTimeout(pointerTimer);
      pointerTimer = undefined;
      paintRevision++;
      map.triggerRepaint();
    };
    map.getCanvasContainer().addEventListener("pointermove", onPointerMove);
    map.getCanvasContainer().addEventListener("pointerleave", onPointerLeave);
    let resolvePhoto = current.current.resolvePhoto;
    let resolveReferencePoint = current.current.resolveReferencePoint;
    let readTarget = current.current.readTarget;
    let readPointerTarget = current.current.readPointerTarget;
    let clip: Matrix4 | null = null;
    const removeFrame = scene.layer.addBeforeRenderCallback?.((frame) => {
      const previous = clip?.clone();
      clip ??= new Matrix4();
      clip.multiplyMatrices(
        frame.renderCamera.projectionMatrix,
        frame.renderCamera.matrixWorldInverse
      );

      if (!previous?.equals(clip)) samplePointer();
    });
    const projectionFor = (entry: Entry) => {
      if (!entry.photo) return undefined;
      const frame = scene.layer.getLocalFrame(),
        origin = scene.layer.projectSceneToLngLat([0, 0, 0]);
      if (!frame || !origin) return undefined;
      const key = [...origin, ...frame.sceneFromLocal.elements].join(",");
      if (entry.frameKey !== key) {
        entry.enu = sceneToPhotoEnu(
          origin,
          frame.sceneFromLocal,
          entry.photo.pose,
          entry.photo.altitude
        );
        entry.projection = imageProjectionMatrix(
          entry.record,
          entry.photo.calibration,
          entry.photo.pose,
          entry.enu
        );
        entry.frameKey = key;
      }
      return { projection: entry.projection!, enu: entry.enu! };
    };
    const groundOf = (point: Vector3): GroundPoint | null => {
      const frame = scene.layer.getLocalFrame(),
        origin = scene.layer.projectSceneToLngLat([0, 0, 0]);
      return frame && origin
        ? sceneToPresentationPoint(point, origin, frame.sceneFromLocal)
        : null;
    };
    const pointOf = (point: GroundPoint): Vector3 | null => {
      const frame = scene.layer.getLocalFrame(),
        origin = scene.layer.projectSceneToLngLat([0, 0, 0]);
      return frame && origin
        ? presentationPointToScene(point, origin, frame.sceneFromLocal)
        : null;
    };
    const schedule = () => {
      if (
        disposed ||
        scheduled !== undefined ||
        preparing ||
        ![...entries.values()].some((entry) => entry.dirty && !entry.pending)
      )
        return;
      scheduled = setTimeout(() => {
        scheduled = undefined;
        preparing = true;
        const epoch = generation,
          settings = current.current;
        const batch = [...entries.values()]
          .filter((entry) => entry.dirty && !entry.pending)
          .slice(0, 4);
        const prepare = async () => {
          for (const entry of batch) {
            if (disposed || generation !== epoch) break;
            entry.pending = true;
            try {
              const photo =
                entry.photo && !entry.refreshPhoto
                  ? entry.photo
                  : await settings.resolvePhoto(entry.record);
              if (
                disposed ||
                generation !== epoch ||
                entries.get(entry.record.id) !== entry
              )
                continue;
              const reference = await settings.resolveReferencePoint?.(
                entry.record,
                normalizeSeamlessCenterY(settings.centerY),
                settings.surfaceMode
              );
              if (
                disposed ||
                generation !== epoch ||
                entries.get(entry.record.id) !== entry
              )
                continue;
              if (entry.photo !== photo) entry.frameKey = undefined;
              entry.photo = photo;
              entry.reference = reference ?? null;
              entry.refreshPhoto = false;
              entry.dirty = false;
              const geometry = projectionFor(entry);
              if (!geometry) {
                entry.hit ??= null;
                continue;
              }
              const rays = photoCenterRays({
                projection: geometry.projection,
                sceneToPhoto: geometry.enu,
                calibration: entry.photo.calibration,
                centerY: 0.5,
              });
              const stored = entry.record.catalogCenter;
              let anchor = stored ? pointOf(stored) : null;
              if (!anchor && rays.sensor) {
                const ground = pointOf({
                  longitude: entry.photo.pose.longitude,
                  latitude: entry.photo.pose.latitude,
                  heightMeters:
                    settings.readReferenceHeight?.(entry.record) ?? 0,
                });
                const up = new Vector3(0, 0, 1).transformDirection(
                  geometry.enu.clone().invert()
                );
                anchor = ground
                  ? rays.sensor.intersectPlane(
                      new Plane().setFromNormalAndCoplanarPoint(up, ground),
                      new Vector3()
                    )
                  : null;
              }
              // Stored midpoint is authoritative. Missing catalogs use an explicit
              // reference plane, never a live mesh/DEM hit or hidden network query.
              entry.hit = stored ?? (anchor ? groundOf(anchor) : null);
              entry.centers = {};
              if (anchor && rays.axis) {
                const plane = new Plane().setFromNormalAndCoplanarPoint(
                  rays.axis.direction,
                  anchor
                );
                const axis = rays.axis.intersectPlane(plane, new Vector3());
                // Sensor-cross orientation is independent of the pitched reference ray.
                const sensorUp = objectCoveragePixelRay(
                  geometry.projection,
                  rays.eye,
                  {
                    x: (photo.calibration.widthPx * 0.5) as DevicePixels,
                    y: (photo.calibration.heightPx * 0.5 - 1) as DevicePixels,
                  },
                  photo.calibration
                );
                const up = sensorUp?.intersectPlane(plane, new Vector3());
                if (axis) entry.centers.axis = groundOf(axis) ?? undefined;
                if (up) entry.centers.up = groundOf(up) ?? undefined;
              }
              if (settings.showOpticalCenters !== false) {
                const pixel =
                  rays.axis &&
                  projectObjectCoveragePoint(
                    geometry.projection,
                    rays.eye.clone().add(rays.axis.direction),
                    entry.photo.calibration
                  );
                if (pixel)
                  entry.opticalUv = {
                    x: pixel.x / entry.photo.calibration.widthPx,
                    y: 1 - pixel.y / entry.photo.calibration.heightPx,
                  };
              }
              entry.hit ??= null;
            } catch {
              if (
                !disposed &&
                generation === epoch &&
                entries.get(entry.record.id) === entry
              ) {
                entry.dirty = false;
                entry.hit ??= null;
                entry.reference = null;
              }
            } finally {
              entry.pending = false;
              if (generation === epoch) paintRevision++;
            }
          }
        };
        void prepare().finally(() => {
          preparing = false;
          if (!disposed) {
            map.triggerRepaint();
            schedule();
          }
        });
      }, 0);
    };
    const refreshSurfaces = () => {
      const origin = scene.layer.projectSceneToLngLat([0, 0, 0]);
      const frame = scene.layer.getLocalFrame();
      const key = `${origin?.join(",") ?? ""}:${
        frame?.sceneFromLocal.elements.join(",") ?? ""
      }:${current.current.readReferenceRevision?.() ?? ""}`;
      if (key === surfaceRevision) return;
      surfaceRevision = key;
      generation++;
      for (const entry of entries.values()) entry.dirty = true;
      schedule();
    };
    const draw = () => {
      if (disposed || !context) return;
      const settings = current.current;
      refreshSurfaces();
      if (readTarget !== settings.readTarget) {
        readTarget = settings.readTarget;
        paintRevision++;
      }
      if (selectedId !== settings.selectedId) {
        selectedId = settings.selectedId;
        const selected = selectedId && entries.get(selectedId);
        if (selected) selected.dirty = true;
        paintRevision++;
      }
      if (readPointerTarget !== settings.readPointerTarget) {
        readPointerTarget = settings.readPointerTarget;
        samplePointer();
      }
      const nextConfiguration = `${settings.surfaceMode}:${
        settings.showOpticalCenters !== false
      }:${settings.showScreenCenters !== false}:${normalizeSeamlessCenterY(
        settings.centerY
      )}`;
      if (
        nextConfiguration !== configuration ||
        resolvePhoto !== settings.resolvePhoto ||
        resolveReferencePoint !== settings.resolveReferencePoint
      ) {
        generation++;
        samplePointer();
        const photoChanged = resolvePhoto !== settings.resolvePhoto;
        for (const entry of entries.values()) {
          entry.dirty = true;
          if (photoChanged) entry.refreshPhoto = true;
        }
        paintRevision++;
        configuration = nextConfiguration;
        resolvePhoto = settings.resolvePhoto;
        resolveReferencePoint = settings.resolveReferencePoint;
      }
      const records = [
        ...new Map(
          settings.readRecords().map((record) => [record.id, record])
        ).values(),
      ];
      const visible = records.slice(0, LIMIT),
        ids = new Set(visible.map((record) => record.id));
      for (const id of entries.keys()) {
        if (!ids.has(id)) {
          entries.delete(id);
          paintRevision++;
        }
      }
      for (const record of visible) {
        const previous = entries.get(record.id);
        if (previous?.record === record) continue;
        const key = cameraKey(record);
        if (previous?.cameraKey === key) {
          if (previous.record.sourceId !== record.sourceId) paintRevision++;
          previous.record = record;
        } else {
          entries.set(record.id, {
            record,
            cameraKey: key,
            pending: false,
            dirty: true,
          });
          paintRevision++;
        }
      }
      schedule();
      const width = map.transform.width,
        height = map.transform.height;
      if (!(width > 0 && height > 0)) return;
      const ratio = Math.min(
        globalThis.devicePixelRatio || 1,
        2,
        Math.sqrt((8 * 1024 * 1024) / (width * height))
      );
      const w = Math.ceil(width * ratio),
        h = Math.ceil(height * ratio);
      const frame = scene.layer.getLocalFrame();
      const origin = scene.layer.projectSceneToLngLat([0, 0, 0]);
      const paintKey = [
        width,
        height,
        ratio,
        settings.selectedId,
        settings.centerY,
        records.length,
        paintRevision,
        pointer?.x,
        pointer?.y,
        ...(settings.readPlaneMapping?.()?.viewportToImage.elements ?? []),
        ...(origin ?? []),
        ...(clip?.elements ?? []),
        ...(frame?.sceneFromLocal.elements ?? []),
      ].join(",");
      if (paintKey === lastPaintKey) return;
      lastPaintKey = paintKey;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const centerX = width / 2,
        centerY = height / 2;
      context.lineWidth = 1;
      context.font = "12px monospace";
      context.strokeStyle = "#ff4477";
      context.beginPath();
      context.moveTo(centerX - 8, centerY);
      context.lineTo(centerX + 8, centerY);
      context.moveTo(centerX, centerY - 8);
      context.lineTo(centerX, centerY + 8);
      context.stroke();
      const target = settings.readTarget();
      resolvePhysicalQuery("view", target);
      const scenePoint = (ground: ObliqueGroundTarget | GroundPoint | null) =>
        ground && ground.heightMeters !== undefined
          ? pointOf({ ...ground, heightMeters: ground.heightMeters })
          : null;
      const screenPoint = (point: Vector3 | null) => {
        if (!point || !clip) return null;
        const projected = new Vector4(
          point.x,
          point.y,
          point.z,
          1
        ).applyMatrix4(clip);
        if (!(projected.w > 0)) return null;
        const x = ((projected.x / projected.w + 1) * width) / 2,
          y = ((1 - projected.y / projected.w) * height) / 2;
        return Number.isFinite(x + y) &&
          x >= 0 &&
          x <= width &&
          y >= 0 &&
          y <= height
          ? { x, y }
          : null;
      };
      const cross = (
        position: { x: number; y: number } | null,
        color: string,
        diagonal = false,
        up?: { x: number; y: number } | null
      ) => {
        if (!position) return;
        const dx = up ? up.x - position.x : 0,
          dy = up ? up.y - position.y : -1;
        const length = Math.hypot(dx, dy);
        const ux = length > 1e-6 ? dx / length : 0,
          uy = length > 1e-6 ? dy / length : -1;
        const directions = diagonal
          ? [
              [(ux - uy) * 5, (uy + ux) * 5],
              [(ux + uy) * 5, (uy - ux) * 5],
            ]
          : [
              [7, 0],
              [0, 7],
            ];
        context.save();
        context.globalAlpha = 1;
        context.beginPath();
        for (const [x, y] of directions) {
          context.moveTo(position.x - x, position.y - y);
          context.lineTo(position.x + x, position.y + y);
        }
        context.lineWidth = 4;
        context.strokeStyle = "#111";
        context.stroke();
        context.lineWidth = 2;
        context.strokeStyle = color;
        context.stroke();
        context.restore();
      };
      const catalogCross = (position: { x: number; y: number } | null) => {
        if (!position) return;
        cross(position, "#3ddcff");
        context.save();
        context.beginPath();
        context.moveTo(position.x, position.y - 5);
        context.lineTo(position.x + 5, position.y);
        context.lineTo(position.x, position.y + 5);
        context.lineTo(position.x - 5, position.y);
        context.lineTo(position.x, position.y - 5);
        context.lineWidth = 2;
        context.strokeStyle = "#3ddcff";
        context.stroke();
        context.restore();
      };
      if (pointer) cross(pointer, "#ff8dc7");
      const mapping = settings.readPlaneMapping?.();
      const inverse =
        mapping && mapping.viewportToImage.determinant() !== 0
          ? mapping.viewportToImage.clone().invert()
          : null;
      const planePoint = (entry: Entry, x: number, y: number) => {
        if (
          !inverse ||
          !mapping ||
          entry.record.id !== settings.selectedId ||
          (mapping.imageId && mapping.imageId !== settings.selectedId)
        )
          return null;
        const p = new Vector3(x, y, 1).applyMatrix3(inverse);
        const point = {
          x: (p.x / p.z) * mapping.viewport.width,
          y: (1 - p.y / p.z) * mapping.viewport.height,
        };
        return Number.isFinite(point.x + point.y) ? point : null;
      };
      const distanceFor = (
        entry: Entry,
        screen: { x: number; y: number } | null
      ) => {
        const geometry = projectionFor(entry),
          anchor = entry.hit && pointOf(entry.hit);
        const e = geometry?.projection.elements;
        const point =
          clip && screen && anchor && e
            ? screenPointOnPhotoPlane(
                clip,
                screen,
                { width, height },
                new Vector3(e[3], e[7], e[11]),
                anchor
              )
            : null;
        const pixel =
          point && geometry && entry.photo
            ? projectObjectCoveragePoint(
                geometry.projection,
                point,
                entry.photo.calibration
              )
            : null;
        return pixel && entry.photo
          ? seamlessImageCenterDistance(
              {
                x: pixel.x / entry.photo.calibration.widthPx,
                y: 1 - pixel.y / entry.photo.calibration.heightPx,
              },
              settings.centerY
            )
          : null;
      };
      const connections: {
        entry: Entry;
        reference: GroundPoint;
        position: { x: number; y: number };
        viewPixels: number;
        mousePixels: number | null;
        viewCovered: boolean;
        mouseCovered: boolean;
        viewDistance: number;
        mouseDistance: number;
      }[] = [];
      for (const entry of entries.values()) {
        // Ground markers always use the actual world position, never the flat-photo homography.
        catalogCross(
          screenPoint(scenePoint(entry.record.catalogCenter ?? null))
        );
        cross(
          screenPoint(scenePoint(entry.reference?.target ?? null)),
          "#ffb347"
        );
        const opticalPosition =
          (entry.opticalUv &&
            planePoint(entry, entry.opticalUv.x, entry.opticalUv.y)) ||
          screenPoint(scenePoint(entry.centers?.axis ?? null));
        const imagePosition =
          planePoint(entry, 0.5, 0.5) ||
          screenPoint(scenePoint(entry.hit ?? null));
        if (settings.showOpticalCenters !== false)
          cross(opticalPosition, "#61ff9a");
        if (settings.showScreenCenters !== false) {
          const up =
            planePoint(
              entry,
              0.5,
              0.5 + 1 / (entry.photo?.calibration.heightPx ?? 1)
            ) || screenPoint(scenePoint(entry.centers?.up ?? null));
          cross(imagePosition, "#ae94ff", true, up);
        }
        const reference = settings.resolveReferencePoint
          ? entry.reference?.target
          : settings.showScreenCenters !== false
          ? entry.hit
          : entry.centers?.axis;
        const position = settings.resolveReferencePoint
          ? screenPoint(scenePoint(entry.reference?.target ?? null))
          : settings.showScreenCenters !== false
          ? imagePosition
          : opticalPosition;
        if (!reference || !position || !projectionFor(entry)) continue;
        if (
          position.x < 0 ||
          position.x > width ||
          position.y < 0 ||
          position.y > height
        )
          continue;
        connections.push({
          entry,
          reference,
          position,
          viewPixels: Math.hypot(centerX - position.x, centerY - position.y),
          mousePixels: pointer
            ? Math.hypot(pointer.x - position.x, pointer.y - position.y)
            : null,
          viewCovered: distanceFor(entry, { x: centerX, y: centerY }) !== null,
          mouseCovered: distanceFor(entry, pointer) !== null,
          viewDistance: settings.resolveReferencePoint
            ? (physicalQueries.view.target
                ? photoReferenceDistanceMeters(
                    entry.reference ?? null,
                    physicalQueries.view.target
                  )
                : null) ?? Infinity
            : entry.record.catalogCenter
            ? physicalCenterDistance(
                entry.record,
                physicalQueries.view.target ?? {}
              ) ?? Infinity
            : Math.hypot(centerX - position.x, centerY - position.y),
          mouseDistance: settings.resolveReferencePoint
            ? (physicalQueries.pointer.target
                ? photoReferenceDistanceMeters(
                    entry.reference ?? null,
                    physicalQueries.pointer.target
                  )
                : null) ?? Infinity
            : entry.record.catalogCenter
            ? physicalCenterDistance(
                entry.record,
                physicalQueries.pointer.target ?? {}
              ) ?? Infinity
            : pointer
            ? Math.hypot(pointer.x - position.x, pointer.y - position.y)
            : Infinity,
        });
      }
      let nearestView: (typeof connections)[number] | undefined;
      let nearestMouse: (typeof connections)[number] | undefined;
      for (const item of connections) {
        if (
          item.viewCovered &&
          Number.isFinite(item.viewDistance) &&
          (!nearestView ||
            item.viewDistance < nearestView.viewDistance ||
            (item.viewDistance === nearestView.viewDistance &&
              item.entry.record.id < nearestView.entry.record.id))
        )
          nearestView = item;
        if (
          item.mouseCovered &&
          item.mousePixels !== null &&
          Number.isFinite(item.mouseDistance) &&
          (!nearestMouse ||
            item.mouseDistance < nearestMouse.mouseDistance ||
            (item.mouseDistance === nearestMouse.mouseDistance &&
              item.entry.record.id < nearestMouse.entry.record.id))
        )
          nearestMouse = item;
      }
      const drawConnection = (
        item: (typeof connections)[number],
        from: { x: number; y: number },
        ground: ObliqueGroundTarget | null,
        pixels: number,
        covered: boolean,
        nearest: boolean,
        color: string,
        prefix: "V" | "M"
      ) => {
        const dx = item.position.x - from.x,
          dy = item.position.y - from.y;
        if (pixels < 1) return;
        context.save();
        context.strokeStyle = color;
        context.globalAlpha = nearest ? 0.85 : 0.3;
        context.lineWidth = nearest ? 2.5 : 0.75;
        context.setLineDash(covered ? [] : [1, 4]);
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(item.position.x, item.position.y);
        context.stroke();
        context.setLineDash([]);
        if (!nearest) {
          context.restore();
          return;
        }
        context.globalAlpha = 1;
        context.translate(
          (from.x + item.position.x) / 2,
          (from.y + item.position.y) / 2
        );
        let angle = Math.atan2(dy, dx) as Radians;
        if (angle > PI / 2) angle = (angle - PI) as Radians;
        if (angle < -PI / 2) angle = (angle + PI) as Radians;
        // Nearly vertical lines use perpendicular labels, keeping text upright.
        if (Math.abs(angle) > MAX_LABEL_TILT)
          angle = (angle - (Math.sign(angle) * PI) / 2) as Radians;
        context.rotate(angle);
        context.font = "11px monospace";
        context.textAlign = "center";
        context.lineWidth = 3;
        context.strokeStyle = "#111";
        context.fillStyle = color;
        const physicalTarget =
          prefix === "V"
            ? physicalQueries.view.target
            : physicalQueries.pointer.target;
        const meters = settings.resolveReferencePoint
          ? physicalTarget
            ? photoReferenceDistanceMeters(
                item.entry.reference ?? null,
                physicalTarget
              )
            : null
          : item.entry.record.catalogCenter
          ? physicalCenterDistance(
              item.entry.record,
              (prefix === "V"
                ? physicalQueries.view.target
                : physicalQueries.pointer.target) ?? {}
            ) ?? null
          : ground
          ? distanceMeters(
              {
                longitude: item.reference.longitude as Degrees,
                latitude: item.reference.latitude as Degrees,
              },
              {
                longitude: ground.longitude as Degrees,
                latitude: ground.latitude as Degrees,
              }
            )
          : null;
        if (meters !== null && Number.isFinite(meters)) {
          const label = `${meterFormat.format(meters)} m`;
          context.textBaseline = "bottom";
          context.strokeText(label, 0, -3);
          context.fillText(label, 0, -3);
        }
        const label = `${prefix} ${Math.round(pixels)} px`;
        context.textBaseline = "top";
        context.strokeText(label, 0, 3);
        context.fillText(label, 0, 3);
        context.restore();
      };
      for (const item of connections) {
        drawConnection(
          item,
          { x: centerX, y: centerY },
          target,
          item.viewPixels,
          item.viewCovered,
          item === nearestView,
          item.entry.record.id === settings.selectedId ? "#ffe45e" : "#59e8ff",
          "V"
        );
        if (pointer && item.mousePixels !== null)
          drawConnection(
            item,
            pointer,
            pointerTarget,
            item.mousePixels,
            item.mouseCovered,
            item === nearestMouse,
            "#ff8dc7",
            "M"
          );
      }
      context.save();
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.globalAlpha = 1;
      context.font = "11px sans-serif";
      context.textAlign = "left";
      context.textBaseline = "middle";
      const legendY = height - 54;
      catalogCross({ x: 16, y: legendY });
      cross({ x: 174, y: legendY }, "#ffb347");
      for (const [text, x, color] of [
        ["Katalog-Bodenpunkt", 28, "#3ddcff"],
        ["Referenz-Bodenpunkt", 186, "#ffb347"],
      ] as const) {
        context.strokeStyle = "#111";
        context.lineWidth = 3;
        context.strokeText(text, x, legendY);
        context.fillStyle = color;
        context.fillText(text, x, legendY);
      }
      context.restore();
    };
    map.on("render", draw);
    map.on("idle", refreshSurfaces);
    refreshSurfaces();
    map.triggerRepaint();
    return () => {
      disposed = true;
      generation++;
      clearTimeout(scheduled);
      clearTimeout(pointerTimer);
      map
        .getCanvasContainer()
        .removeEventListener("pointermove", onPointerMove);
      map
        .getCanvasContainer()
        .removeEventListener("pointerleave", onPointerLeave);
      map.off("render", draw);
      map.off("idle", refreshSurfaces);
      entries.clear();
      canvas.remove();
      removeFrame?.();
      scene.release();
    };
  }, [options.map, options.enabled]);
  useEffect(() => {
    if (options.enabled) options.map?.triggerRepaint();
  }, [
    options.map,
    options.enabled,
    options.selectedId,
    options.centerY,
    options.surfaceMode,
    options.readRecords,
    options.resolvePhoto,
    options.readReferenceHeight,
    options.resolveReferencePoint,
    options.readReferenceRevision,
    options.readTarget,
    options.readPointerTarget,
    options.readPlaneMapping,
  ]);
};
