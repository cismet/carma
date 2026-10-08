import { useCallback, useEffect, useRef, useState } from "react";
import { MercatorCoordinate, type Map as MaplibreMap } from "maplibre-gl";
import {
  Color,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import {
  acquireSharedThreeScene,
  claimClick,
} from "@carma-mapping/engines/maplibre";
import type { SharedThreeSceneRuntime } from "@carma-mapping/engines/maplibre";

import type {
  CardinalDirection,
  ObliqueImageRecord,
  ObliqueSelectionData,
} from "../../core/types";
import {
  groupObjectCoverageImages,
  type ObjectCoverageGroups,
  type ObjectCoverageImage,
  type ObjectCoverageSphere,
} from "../../core/utils/object-coverage";
import { CARDINALS_CLOCKWISE } from "../../core/utils/orientation";
import { resolveCameraAltitude } from "../utils/flyToImage";
import { sceneToPhotoEnu } from "../../core/utils/image-projection";
import { FOOTPRINT_SELECTION_COLOR } from "../../core/constants";
import type { CssPixels } from "@carma-units";

const MIN_RADIUS_METERS = 0.1;
const COVERAGE_BATCH_SIZE = 64;
let nextRuntimeId = 0;

type ScreenPoint = { x: number; y: number };
type SceneProjector = (
  lngLat: [number, number],
  altitudeMeters: number
) => Vector3 | null;

/** Build a physical metre basis through the shared scene's actual projection. */
export const objectCoverageSphereMatrix = (
  sphere: ObjectCoverageSphere,
  project: SceneProjector
): Matrix4 | null => {
  const { longitude, latitude, heightMeters } = sphere.center;
  const anchor = MercatorCoordinate.fromLngLat(
    [longitude, latitude],
    heightMeters
  );
  const meter = anchor.meterInMercatorCoordinateUnits();
  const eastLngLat = new MercatorCoordinate(
    anchor.x + meter,
    anchor.y,
    anchor.z
  ).toLngLat();
  const northLngLat = new MercatorCoordinate(
    anchor.x,
    anchor.y - meter,
    anchor.z
  ).toLngLat();
  const origin = project([longitude, latitude], heightMeters);
  const east = project([eastLngLat.lng, eastLngLat.lat], heightMeters);
  const north = project([northLngLat.lng, northLngLat.lat], heightMeters);
  const up = project([longitude, latitude], heightMeters + 1);
  if (!origin || !east || !north || !up) return null;
  return new Matrix4()
    .makeBasis(east.sub(origin), up.sub(origin), north.sub(origin).negate())
    .setPosition(origin)
    .scale(new Vector3().setScalar(sphere.radiusMeters));
};

/** Three-dimensional radius in the same DHHN metre frame as the picked centre. */
export const objectCoverageRadiusMeters = (
  center: ObjectCoverageSphere["center"],
  edge: MercatorCoordinate
): number => {
  const anchor = MercatorCoordinate.fromLngLat(
    [center.longitude, center.latitude],
    center.heightMeters
  );
  const meter = anchor.meterInMercatorCoordinateUnits();
  return Math.hypot(
    (edge.x - anchor.x) / meter,
    (edge.y - anchor.y) / meter,
    edge.toAltitude() - center.heightMeters
  );
};

const emptyGroups = (): Map<CardinalDirection, ObjectCoverageImage[]> =>
  new Map(CARDINALS_CLOCKWISE.map((direction) => [direction, []]));

/** A bounded catalog scan yields between batches and never publishes canceled work. */
export const computeObjectCoverageGroups = async (
  data: ObliqueSelectionData,
  sphere: ObjectCoverageSphere,
  heightOffset: number,
  signal: AbortSignal,
  resolveAltitude = resolveCameraAltitude,
  yieldBatch: () => Promise<void> = () =>
    new Promise((resolve) => window.setTimeout(resolve, 0))
): Promise<{ groups: ObjectCoverageGroups; error: string | null }> => {
  const groups = emptyGroups();
  const records = data.imageRecords.values();
  let firstError: string | null = null;
  while (true) {
    signal.throwIfAborted();
    const batch: ObliqueImageRecord[] = [];
    for (let index = 0; index < COVERAGE_BATCH_SIZE; index++) {
      const next = records.next();
      if (next.done) break;
      batch.push(next.value);
    }
    if (!batch.length) break;
    const altitudes = new Map<string, number>();
    await Promise.all(
      batch.map(async (record) => {
        const dataset = data.datasets.get(record.seriesId);
        if (!dataset) return;
        try {
          const altitude = await resolveAltitude(
            record,
            dataset.heightDatum,
            heightOffset,
            dataset.allowUnverifiedSourceHeight
          );
          if (Number.isFinite(altitude)) altitudes.set(record.id, altitude);
        } catch (error) {
          firstError ??=
            error instanceof Error
              ? error.message
              : "Der Höhenbezug einer Bildserie konnte nicht bestimmt werden.";
        }
      })
    );
    signal.throwIfAborted();
    const chunk = groupObjectCoverageImages(data, sphere, altitudes, batch);
    for (const [direction, images] of chunk)
      groups.get(direction)!.push(...images);
    await yieldBatch();
  }
  signal.throwIfAborted();
  for (const images of groups.values())
    images.sort(
      (a, b) =>
        b.pixelsPerMeter - a.pixelsPerMeter ||
        a.record.id.localeCompare(b.record.id)
    );
  return { groups, error: firstError };
};

/** Two map clicks share the normal terrain/mesh anchor and the existing renderer. */
export const useObjectCoverage = ({
  map,
  enabled,
  suspended,
  data,
  resetToken,
  heightOffset,
  readViewAnchor,
  onCancel,
}: {
  map: MaplibreMap | null;
  enabled: boolean;
  suspended: boolean;
  data: ObliqueSelectionData | null;
  resetToken: string;
  heightOffset: number;
  readViewAnchor: (point: ScreenPoint) => MercatorCoordinate | undefined;
  onCancel: () => void;
}) => {
  const [center, setCenter] = useState<ObjectCoverageSphere["center"] | null>(
    null
  );
  const [sphere, setSphere] = useState<ObjectCoverageSphere | null>(null);
  const [groups, setGroups] = useState<ObjectCoverageGroups>(emptyGroups);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const centerRef = useRef(center);
  centerRef.current = center;
  const sphereRef = useRef(sphere);
  sphereRef.current = sphere;
  // Draft radius belongs to the scene; only committed selections enter React.
  const displaySphereRef = useRef<ObjectCoverageSphere | null>(null);
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  const readAnchorRef = useRef(readViewAnchor);
  readAnchorRef.current = readViewAnchor;
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  const computationRef = useRef<AbortController | null>(null);
  const epochRef = useRef(0);
  const reset = useCallback(() => {
    epochRef.current++;
    computationRef.current?.abort();
    computationRef.current = null;
    centerRef.current = null;
    sphereRef.current = null;
    displaySphereRef.current = null;
    setCenter(null);
    setSphere(null);
    setGroups(emptyGroups());
    setLoading(false);
    setError(null);
    map?.triggerRepaint();
  }, [map]);

  useEffect(() => {
    reset();
    return () => {
      epochRef.current++;
      computationRef.current?.abort();
    };
  }, [map, enabled, data, resetToken, heightOffset, reset]);

  useEffect(() => {
    // The reset effect clears the ref before React commits the cleared state.
    if (!enabled || !sphere || !data || sphereRef.current !== sphere) {
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    computationRef.current = controller;
    const epoch = ++epochRef.current;
    setLoading(true);
    setError(null);
    void computeObjectCoverageGroups(
      data,
      sphere,
      heightOffset,
      controller.signal
    )
      .then((result) => {
        if (controller.signal.aborted || epoch !== epochRef.current) return;
        setGroups(result.groups);
        setError(result.error);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || epoch !== epochRef.current) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Die Objektabdeckung konnte nicht berechnet werden."
        );
      })
      .finally(() => {
        if (!controller.signal.aborted && epoch === epochRef.current)
          setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, sphere, data, heightOffset]);

  useEffect(() => {
    if (!map || !enabled) return undefined;
    const lease = acquireSharedThreeScene(map);
    const root = new Group();
    root.matrixAutoUpdate = false;
    root.visible = false;
    const geometry = new SphereGeometry(1, 32, 20);
    const fill = new MeshBasicMaterial({
      color: "#1677ff",
      opacity: 0.3,
      transparent: true,
      depthWrite: false,
    });
    root.add(new Mesh(geometry, fill));
    const overlayId = "oblique-object-coverage-" + ++nextRuntimeId;
    let previousSphere: ObjectCoverageSphere | null = null;
    let previousFrame = "";
    const contourColor = new Color(FOOTPRINT_SELECTION_COLOR);
    const runtime: SharedThreeSceneRuntime = {
      id: overlayId,
      originLngLat: [map.getCenter().lng, map.getCenter().lat],
      root,
      update: () => {
        const current = displaySphereRef.current;
        const frame = lease.layer.getLocalFrame();
        const origin = lease.layer.projectSceneToLngLat([0, 0, 0]);
        const frameKey = origin?.join(",") + ":" + frame?.revision;
        if (current === previousSphere && frameKey === previousFrame) return;
        previousSphere = current;
        previousFrame = frameKey;
        const matrix =
          current &&
          objectCoverageSphereMatrix(current, (lngLat, height) =>
            lease.layer.projectLngLatToScene(lngLat, height)
          );
        root.visible = matrix !== null && matrix !== undefined;
        if (matrix) {
          root.matrix.copy(matrix);
          root.matrixWorldNeedsUpdate = true;
        }
        if (
          !current ||
          !matrix ||
          !frame ||
          !origin ||
          !(current.radiusMeters > 0)
        ) {
          lease.layer.setMapStyleProjectiveOverlay?.(overlayId, null);
          return;
        }
        const sceneToSphere = sceneToPhotoEnu(
          origin,
          frame.sceneFromLocal,
          current.center,
          current.center.heightMeters
        );
        sceneToSphere.premultiply(
          new Matrix4().makeScale(
            1 / current.radiusMeters,
            1 / current.radiusMeters,
            1 / current.radiusMeters
          )
        );
        lease.layer.setMapStyleProjectiveOverlay?.(overlayId, {
          marks: [
            {
              shape: "sphere",
              sceneToImage: sceneToSphere,
              sceneToImageTerrain: matrix.clone().invert(),
              color: contourColor,
              width: 2 as CssPixels,
              opacity: 1,
              showUpMarker: false,
            },
          ],
          trailColor: contourColor,
          trailDuration: 1,
          opacity: 1,
        });
      },
      dispose: () => {
        geometry.dispose();
        fill.dispose();
        lease.layer.setMapStyleProjectiveOverlay?.(overlayId, null);
      },
    };
    lease.layer.addRuntime(runtime);
    map.triggerRepaint();
    return () => {
      lease.layer.removeRuntime(runtime.id);
      lease.release();
      map.triggerRepaint();
    };
  }, [map, enabled]);

  useEffect(() => {
    if (!map || !enabled) return undefined;
    // The photo preview mounts beside the map container (see ObliqueOverlay),
    // so photo clicks only pass the shared parent.
    const container = map.getContainer().parentElement ?? map.getContainer();
    const canvas = map.getCanvas();
    const previousCursor = canvas.style.cursor;
    canvas.style.cursor = "crosshair";
    let pressedAt: ScreenPoint | null = null;
    let dragged = false;
    let pointerFrame: number | null = null;
    let pointer: ScreenPoint | null = null;
    const pointOf = (event: MouseEvent): ScreenPoint => {
      const bounds = canvas.getBoundingClientRect();
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    };
    const claim = (event: MouseEvent) => {
      claimClick(event);
      event.preventDefault();
      event.stopPropagation();
    };
    const onDown = (event: PointerEvent) => {
      if (event.target !== canvas || event.button !== 0) return;
      pressedAt = pointOf(event);
      dragged = false;
    };
    const updateDraft = () => {
      pointerFrame = null;
      const current = centerRef.current;
      if (!pointer || !current || sphereRef.current || suspendedRef.current)
        return;
      const edge = readAnchorRef.current(pointer);
      if (!edge) return;
      const radiusMeters = objectCoverageRadiusMeters(current, edge);
      if (!Number.isFinite(radiusMeters)) return;
      const next = { center: current, radiusMeters };
      displaySphereRef.current = next;
      map.triggerRepaint();
    };
    const onMove = (event: PointerEvent) => {
      if (event.target !== canvas) return;
      pointer = pointOf(event);
      if (
        pressedAt &&
        Math.hypot(pointer.x - pressedAt.x, pointer.y - pressedAt.y) > 5
      )
        dragged = true;
      if (pointerFrame === null)
        pointerFrame = window.requestAnimationFrame(updateDraft);
    };
    const onClick = (event: MouseEvent) => {
      if (event.target !== canvas || event.button !== 0) return;
      claim(event);
      pressedAt = null;
      if (dragged || suspendedRef.current || sphereRef.current) return;
      const anchor = readAnchorRef.current(pointOf(event));
      if (!anchor) return;
      const lngLat = anchor.toLngLat();
      if (!centerRef.current) {
        const next = {
          longitude: lngLat.lng,
          latitude: lngLat.lat,
          heightMeters: anchor.toAltitude(),
        };
        centerRef.current = next;
        setCenter(next);
        return;
      }
      const radiusMeters = objectCoverageRadiusMeters(
        centerRef.current,
        anchor
      );
      if (!Number.isFinite(radiusMeters) || radiusMeters < MIN_RADIUS_METERS)
        return;
      const next = { center: centerRef.current, radiusMeters };
      sphereRef.current = next;
      displaySphereRef.current = next;
      setSphere(next);
      map.triggerRepaint();
    };
    const onDoubleClick = (event: MouseEvent) => {
      if (event.target === canvas) claim(event);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      reset();
      cancelRef.current();
    };
    container.addEventListener("pointerdown", onDown, true);
    container.addEventListener("pointermove", onMove, true);
    container.addEventListener("click", onClick, true);
    container.addEventListener("dblclick", onDoubleClick, true);
    window.addEventListener("keydown", onEscape, true);
    return () => {
      container.removeEventListener("pointerdown", onDown, true);
      container.removeEventListener("pointermove", onMove, true);
      container.removeEventListener("click", onClick, true);
      container.removeEventListener("dblclick", onDoubleClick, true);
      window.removeEventListener("keydown", onEscape, true);
      if (pointerFrame !== null) window.cancelAnimationFrame(pointerFrame);
      if (canvas.style.cursor === "crosshair")
        canvas.style.cursor = previousCursor;
    };
  }, [map, enabled, reset]);

  return { center, sphere, groups, loading, error, reset };
};
