import { useEffect, useRef } from "react";
import { FOOTPRINT_SELECTION_COLOR } from "../../core/constants";
import type { Map as MaplibreMap } from "maplibre-gl";

import { claimClick, isClickClaimed } from "@carma-mapping/engines/maplibre";

import type {
  AnimationConfig,
  ObliqueFootprintsStyle,
  ObliqueDataset,
  ObliqueImageRecord,
} from "../../core/types";
import {
  createFootprintOutlineLayer,
  type FootprintOutlineLayer,
} from "../footprint-outline-layer";

/** Photo-camera projected markings; catalog picks remain independent of drawn marks. */

export const OBLIQUE_FOOTPRINT_LAYER_ID = "carma-oblique-footprint-outline";

const DEFAULT_STYLE: Required<ObliqueFootprintsStyle> = {
  outlineColor: FOOTPRINT_SELECTION_COLOR,
  outlineWidth: 2,
  outlineOpacity: 1,
  fillOpacity: 0.08,
  inactiveOpacity: 0.2,
};

type UseFootprintLayerOptions = {
  map: MaplibreMap | null;
  enabled: boolean;
  selectedImageId: string | null;
  selectedRecord: ObliqueImageRecord | null;
  nearbyRecords?: readonly ObliqueImageRecord[];
  datasets?: ReadonlyMap<string, ObliqueDataset>;
  heightOffset?: number;
  seriesLabel?: string;
  seriesLabels?: ReadonlyMap<string, string | undefined>;
  /** Labels only distinguish multiple successfully loaded, enabled catalogs. */
  showSeriesLabels?: boolean;
  /** Disable further picks during flight/preview while retaining its center contour. */
  locked: boolean;
  style?: ObliqueFootprintsStyle;
  fadeOut?: AnimationConfig;
  onClick?: (imageId: string) => void;
  onDoubleClick?: (imageId: string) => void;
  onHoveredRecord?: (record: ObliqueImageRecord | null) => void;
  findAtScreenPoint?: (point: {
    x: number;
    y: number;
  }) => Promise<ObliqueImageRecord | null | undefined>;
};

export const useFootprintLayer = ({
  map,
  enabled,
  selectedImageId,
  selectedRecord,
  nearbyRecords,
  datasets,
  heightOffset = 0,
  seriesLabel,
  seriesLabels,
  showSeriesLabels = true,
  locked,
  style,
  fadeOut,
  onClick,
  onDoubleClick,
  onHoveredRecord,
  findAtScreenPoint,
}: UseFootprintLayerOptions): void => {
  const {
    outlineColor,
    outlineWidth,
    outlineOpacity,
    fillOpacity,
    inactiveOpacity,
  } = {
    ...DEFAULT_STYLE,
    ...(style ?? {}),
  };
  const layerRef = useRef<FootprintOutlineLayer | null>(null);
  const fadeOutRef = useRef(fadeOut);
  fadeOutRef.current = fadeOut;
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;
  const onDoubleClickRef = useRef(onDoubleClick);
  onDoubleClickRef.current = onDoubleClick;
  const lastClickRef = useRef<{
    id: string;
    x: number;
    y: number;
    time: number;
  } | null>(null);
  const onHoveredRecordRef = useRef(onHoveredRecord);
  onHoveredRecordRef.current = onHoveredRecord;
  const selectedImageIdRef = useRef(selectedImageId);
  selectedImageIdRef.current = selectedImageId;
  const findAtScreenPointRef = useRef(findAtScreenPoint);
  findAtScreenPointRef.current = findAtScreenPoint;
  const seriesLabelsRef = useRef(seriesLabels);
  seriesLabelsRef.current = seriesLabels;
  const catalogHover = !!findAtScreenPoint;
  const hasSelectedImage = !!selectedImageId;
  const nearbyRecordsRef = useRef(nearbyRecords);
  nearbyRecordsRef.current = nearbyRecords;
  const datasetsRef = useRef(datasets);
  datasetsRef.current = datasets;
  const heightOffsetRef = useRef(heightOffset);
  heightOffsetRef.current = heightOffset;

  // the layer exists while the viewer is on; the effects below run after
  // this one and feed it
  useEffect(() => {
    if (!map || !enabled) return undefined;
    const layer = createFootprintOutlineLayer(map, OBLIQUE_FOOTPRINT_LAYER_ID, {
      color: outlineColor,
      width: outlineWidth,
      opacity: outlineOpacity,
      fillOpacity: Math.max(0, Math.min(0.08, fillOpacity)),
      inactiveOpacity: Math.max(0, Math.min(0.2, inactiveOpacity)),
    });
    layerRef.current = layer;
    return () => {
      layerRef.current = null;
      layer.destroy();
    };
    // the look is applied by its own effect; a new colour is no reason to rebuild
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, enabled]);

  useEffect(() => {
    layerRef.current?.setLabelsVisible(showSeriesLabels);
  }, [map, enabled, showSeriesLabels]);

  // the ring under the outline
  useEffect(() => {
    layerRef.current?.setRing(
      selectedRecord?.footprint ?? null,
      {
        pose: selectedRecord?.pose ?? null,
        seriesLabel,
        hoverLabel: selectedRecord
          ? seriesLabels?.get(selectedRecord.seriesId)
          : undefined,
        imageId: selectedImageId ?? undefined,
        record: selectedRecord ?? undefined,
        dataset: selectedRecord
          ? datasets?.get(selectedRecord.seriesId)
          : undefined,
        heightOffset,
      },
      nearbyRecordsRef.current
        ?.filter((record) => record.id !== selectedImageId && record.footprint)
        .map((record) => ({
          id: record.id,
          ring: record.footprint!,
          pose: record.pose,
          seriesLabel: seriesLabels?.get(record.seriesId),
          record,
          dataset: datasets?.get(record.seriesId),
          heightOffset,
        }))
    );
  }, [
    map,
    enabled,
    selectedImageId,
    selectedRecord,
    datasets,
    heightOffset,
    seriesLabel,
    seriesLabels,
  ]);

  // the look
  useEffect(() => {
    layerRef.current?.setStyle({
      color: outlineColor,
      width: outlineWidth,
      opacity: outlineOpacity,
      fillOpacity: Math.max(0, Math.min(0.08, fillOpacity)),
      inactiveOpacity: Math.max(0, Math.min(0.2, inactiveOpacity)),
    });
  }, [
    map,
    enabled,
    outlineColor,
    outlineWidth,
    outlineOpacity,
    fillOpacity,
    inactiveOpacity,
  ]);

  // Claim the DOM click before the host starts feature-info selection.
  useEffect(() => {
    if (!map || !enabled) return;
    // Keep this listener during the first flight and over the mounted preview.
    const container = map.getContainer?.() ?? map.getCanvasContainer();
    const host = container.parentElement ?? container;
    const onSecondClick = (event: MouseEvent) => {
      const last = lastClickRef.current;
      if (
        event.detail !== 2 ||
        !last ||
        performance.now() - last.time > 1500 ||
        Math.hypot(event.clientX - last.x, event.clientY - last.y) > 5 ||
        (event.target instanceof Element &&
          event.target.closest("button, input, select, a"))
      )
        return;
      // Do not let the second click dismiss the preview before dblclick centers it.
      claimClick(event);
      event.preventDefault();
      event.stopPropagation();
    };
    const onDoubleClick = (event: MouseEvent) => {
      const last = lastClickRef.current;
      if (
        !last ||
        !onDoubleClickRef.current ||
        event.button !== 0 ||
        performance.now() - last.time > 1500 ||
        Math.hypot(event.clientX - last.x, event.clientY - last.y) > 5 ||
        (event.target instanceof Element &&
          event.target.closest("button, input, select, a"))
      )
        return;
      lastClickRef.current = null;
      claimClick(event);
      event.preventDefault();
      event.stopPropagation();
      onDoubleClickRef.current(last.id);
    };
    host.addEventListener("dblclick", onDoubleClick, true);
    host.addEventListener("click", onSecondClick, true);
    return () => {
      lastClickRef.current = null;
      host.removeEventListener("dblclick", onDoubleClick, true);
      host.removeEventListener("click", onSecondClick, true);
    };
  }, [map, enabled]);

  useEffect(() => {
    if (!map || !enabled || locked || (!hasSelectedImage && !catalogHover))
      return undefined;
    const container = map.getCanvasContainer();
    const canvas = map.getCanvas();
    const previousCursor = canvas.style.cursor;
    let ownsCursor = false;
    let pressedAt: { x: number; y: number } | null = null;
    let dragged = false;
    let disposed = false;
    let clickPending = false;
    let hoverGeneration = 0;
    let hoverTimer: ReturnType<typeof setTimeout> | undefined;
    let pointerPoint: { x: number; y: number } | null = null;
    let hoveredPick: {
      point: { x: number; y: number };
      record: ObliqueImageRecord;
    } | null = null;
    const screenPoint = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const cachedImageId = (event: MouseEvent) => {
      const point = screenPoint(event);
      return hoveredPick &&
        Math.hypot(
          point.x - hoveredPick.point.x,
          point.y - hoveredPick.point.y
        ) <= 1
        ? hoveredPick.record.id
        : null;
    };
    const hit = (event: MouseEvent): boolean => {
      if (event.target !== canvas || !onClickRef.current) return false;
      return (
        !!cachedImageId(event) ||
        !!layerRef.current?.containsScreenPoint(screenPoint(event))
      );
    };
    const clearHover = () => {
      if (hoveredPick) onHoveredRecordRef.current?.(null);
      hoveredPick = null;
      if (ownsCursor && canvas.style.cursor === "pointer")
        canvas.style.cursor = previousCursor;
      ownsCursor = false;
      layerRef.current?.setHoveredImage(null);
    };
    const restoreCursor = () => {
      hoverGeneration++;
      clearTimeout(hoverTimer);
      hoverTimer = undefined;
      pointerPoint = null;
      clearHover();
    };
    const requestHover = () => {
      if (hoverTimer !== undefined) return;
      hoverTimer = setTimeout(() => {
        hoverTimer = undefined;
        const point = pointerPoint;
        const find = findAtScreenPointRef.current;
        if (!point || !find || disposed || clickPending) return;
        const generation = ++hoverGeneration;
        void find(point)
          .then((record) => {
            if (
              disposed ||
              generation !== hoverGeneration ||
              record === undefined
            )
              return;
            if (!record?.footprint) {
              clearHover();
              return;
            }
            if (hoveredPick?.record.id !== record.id)
              onHoveredRecordRef.current?.(record);
            hoveredPick = { point, record };
            layerRef.current?.setHoveredImage(record.id, {
              id: record.id,
              ring: record.footprint,
              pose: record.pose,
              seriesLabel: seriesLabelsRef.current?.get(record.seriesId),
              record,
              dataset: datasetsRef.current?.get(record.seriesId),
              heightOffset: heightOffsetRef.current,
            });
            canvas.style.cursor = "pointer";
            ownsCursor = true;
          })
          .catch(() => {
            if (!disposed && generation === hoverGeneration) clearHover();
          });
      }, 50);
    };
    const onMapMove = () => {
      hoverGeneration++;
      clearTimeout(hoverTimer);
      hoverTimer = undefined;
      clearHover();
    };
    const onMapMoveEnd = () => {
      if (pointerPoint) requestHover();
    };
    const onPointerDown = (event: PointerEvent) => {
      pressedAt = { x: event.clientX, y: event.clientY };
      dragged = false;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (clickPending) return;
      if (
        pressedAt &&
        Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) > 3
      )
        dragged = true;
      if (event.buttons || event.target !== canvas) {
        restoreCursor();
        return;
      }
      if (findAtScreenPointRef.current) {
        pointerPoint = screenPoint(event);
        requestHover();
      } else if (!hit(event)) restoreCursor();
      else {
        layerRef.current?.setHoveredImage(
          layerRef.current.imageAtScreenPoint(screenPoint(event))
        );
        canvas.style.cursor = "pointer";
        ownsCursor = true;
      }
    };
    const onClick = (event: MouseEvent) => {
      const moved =
        dragged ||
        (pressedAt &&
          Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) >
            3);
      pressedAt = null;
      dragged = false;
      if (
        event.button !== 0 ||
        moved ||
        isClickClaimed(event) ||
        event.target !== canvas ||
        clickPending ||
        !onClickRef.current
      )
        return;
      const cached = cachedImageId(event);
      const find = findAtScreenPointRef.current;
      if (!cached && !find && !hit(event)) return;
      // Claim before feature-info starts; an oriented footprint does not have a
      // native MapLibre feature to hit, and the first click need not await hover.
      claimClick(event);
      clickPending = true;
      const point = screenPoint(event);
      restoreCursor();
      const clickGeneration = hoverGeneration;
      const activate = (id: string | null | undefined) => {
        if (disposed) return;
        clickPending = false;
        if (!id || clickGeneration !== hoverGeneration) return;
        lastClickRef.current = {
          id,
          x: event.clientX,
          y: event.clientY,
          time: performance.now(),
        };
        layerRef.current?.setLocked(true, fadeOutRef.current);
        onClickRef.current?.(id);
      };
      if (cached) activate(cached);
      else if (find) {
        void find(point).then(
          (record) => activate(record?.id),
          () => activate(null)
        );
      } else
        activate(
          layerRef.current?.imageAtScreenPoint(point) ??
            selectedImageIdRef.current
        );
    };
    const onPointerCancel = () => {
      pressedAt = null;
      dragged = false;
      restoreCursor();
    };
    if (catalogHover) {
      map.on("move", onMapMove);
      map.on("moveend", onMapMoveEnd);
    }
    container.addEventListener("pointerdown", onPointerDown, true);
    container.addEventListener("pointermove", onPointerMove, true);
    container.addEventListener("pointercancel", onPointerCancel, true);
    container.addEventListener("pointerleave", restoreCursor);
    container.addEventListener("click", onClick, true);
    return () => {
      disposed = true;
      if (catalogHover) {
        map.off("move", onMapMove);
        map.off("moveend", onMapMoveEnd);
      }
      container.removeEventListener("pointerdown", onPointerDown, true);
      container.removeEventListener("pointermove", onPointerMove, true);
      container.removeEventListener("pointercancel", onPointerCancel, true);
      container.removeEventListener("pointerleave", restoreCursor);
      container.removeEventListener("click", onClick, true);
      restoreCursor();
    };
  }, [map, enabled, locked, hasSelectedImage, catalogHover]);

  // the fade on lock
  useEffect(() => {
    layerRef.current?.setLocked(locked, fadeOutRef.current);
  }, [map, enabled, locked]);
};
