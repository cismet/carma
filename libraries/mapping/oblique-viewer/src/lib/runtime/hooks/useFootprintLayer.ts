import { useEffect, useRef } from "react";
import { FOOTPRINT_SELECTION_COLOR } from "../../core/constants";
import type { Map as MaplibreMap } from "maplibre-gl";

import { claimClick, isClickClaimed } from "@carma-mapping/engines/maplibre";

import type {
  AnimationConfig,
  ObliqueFootprintsStyle,
  ObliqueImageRecord,
} from "../../core/types";
import {
  createFootprintOutlineLayer,
  type FootprintOutlineLayer,
} from "../footprint-outline-layer";

/**
 * The selected footprint as native ground features, captured onto the mesh
 * by the shared map-style pass (see footprint-outline-layer).
 *
 * Locking the footprint (while the preview is up, or on the way out) fades
 * the line rather than removing it.
 */

export const OBLIQUE_FOOTPRINT_LAYER_ID = "carma-oblique-footprint-outline";

const DEFAULT_STYLE: Required<ObliqueFootprintsStyle> = {
  outlineColor: FOOTPRINT_SELECTION_COLOR,
  outlineWidth: 5,
  outlineOpacity: 1,
  fillOpacity: 0.2,
  inactiveOpacity: 0.2,
};

type UseFootprintLayerOptions = {
  map: MaplibreMap | null;
  enabled: boolean;
  selectedImageId: string | null;
  selectedRecord: ObliqueImageRecord | null;
  nearbyRecords?: readonly ObliqueImageRecord[];
  seriesLabel?: string;
  seriesLabels?: ReadonlyMap<string, string | undefined>;
  /** fade the outline out and keep it out until unlocked */
  locked: boolean;
  style?: ObliqueFootprintsStyle;
  fadeOut?: AnimationConfig;
  onClick?: (imageId: string) => void;
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
  seriesLabel,
  seriesLabels,
  locked,
  style,
  fadeOut,
  onClick,
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
  const findAtScreenPointRef = useRef(findAtScreenPoint);
  findAtScreenPointRef.current = findAtScreenPoint;
  const seriesLabelsRef = useRef(seriesLabels);
  seriesLabelsRef.current = seriesLabels;
  const catalogHover = !!findAtScreenPoint;

  // the layer exists while the viewer is on; the effects below run after
  // this one and feed it
  useEffect(() => {
    if (!map || !enabled) return undefined;
    const layer = createFootprintOutlineLayer(map, OBLIQUE_FOOTPRINT_LAYER_ID, {
      color: outlineColor,
      width: outlineWidth,
      opacity: outlineOpacity,
      fillOpacity: Math.max(0, Math.min(0.2, fillOpacity)),
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
      },
      nearbyRecords
        ?.filter((record) => record.id !== selectedImageId && record.footprint)
        .map((record) => ({
          id: record.id,
          ring: record.footprint!,
          pose: record.pose,
          seriesLabel: seriesLabels?.get(record.seriesId),
        }))
    );
  }, [
    map,
    enabled,
    selectedImageId,
    selectedRecord,
    nearbyRecords,
    seriesLabel,
    seriesLabels,
  ]);

  // the look
  useEffect(() => {
    layerRef.current?.setStyle({
      color: outlineColor,
      width: outlineWidth,
      opacity: outlineOpacity,
      fillOpacity: Math.max(0, Math.min(0.2, fillOpacity)),
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
    if (!map || !enabled || locked || (!selectedImageId && !catalogHover))
      return undefined;
    const container = map.getCanvasContainer();
    const canvas = map.getCanvas();
    const previousCursor = canvas.style.cursor;
    let ownsCursor = false;
    let pressedAt: { x: number; y: number } | null = null;
    let dragged = false;
    let disposed = false;
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
      hoverGeneration++;
      if (hoverTimer !== undefined) return;
      hoverTimer = setTimeout(() => {
        hoverTimer = undefined;
        const point = pointerPoint;
        const find = findAtScreenPointRef.current;
        if (!point || !find || disposed) return;
        const generation = hoverGeneration;
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
            hoveredPick = { point, record };
            layerRef.current?.setHoveredImage(record.id, {
              id: record.id,
              ring: record.footprint,
              pose: record.pose,
              seriesLabel: seriesLabelsRef.current?.get(record.seriesId),
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
      if (event.button !== 0 || moved || isClickClaimed(event) || !hit(event))
        return;
      const clickedImageId =
        cachedImageId(event) ??
        layerRef.current?.imageAtScreenPoint(screenPoint(event));
      claimClick(event);
      layerRef.current?.setLocked(true, fadeOutRef.current);
      restoreCursor();
      const id = clickedImageId ?? selectedImageId;
      if (id) onClickRef.current?.(id);
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
  }, [map, enabled, locked, selectedImageId, catalogHover]);

  // the fade on lock
  useEffect(() => {
    layerRef.current?.setLocked(locked, fadeOutRef.current);
  }, [map, enabled, locked]);
};
