import { useEffect, useRef } from "react";
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
import {
  findMatchingFeature,
  type FootprintCollection,
} from "../utils/footprints";

/**
 * The selected footprint as native ground features, captured onto the mesh
 * by the shared map-style pass (see footprint-outline-layer).
 *
 * Locking the footprint (while the preview is up, or on the way out) fades
 * the line rather than removing it.
 */

export const OBLIQUE_FOOTPRINT_LAYER_ID = "carma-oblique-footprint-outline";

const DEFAULT_STYLE: Required<ObliqueFootprintsStyle> = {
  outlineColor: "#ffffff",
  outlineWidth: 5,
  outlineOpacity: 1,
  fillOpacity: 0.2,
  inactiveOpacity: 0.1,
};

type UseFootprintLayerOptions = {
  map: MaplibreMap | null;
  enabled: boolean;
  footprintData: FootprintCollection | null;
  selectedImageId: string | null;
  selectedRecord: ObliqueImageRecord | null;
  nearbyRecords?: readonly ObliqueImageRecord[];
  seriesLabel?: string;
  /** fade the outline out and keep it out until unlocked */
  locked: boolean;
  style?: ObliqueFootprintsStyle;
  fadeOut?: AnimationConfig;
  onClick?: (imageId: string) => void;
};

export const useFootprintLayer = ({
  map,
  enabled,
  footprintData,
  selectedImageId,
  selectedRecord,
  nearbyRecords,
  seriesLabel,
  locked,
  style,
  fadeOut,
  onClick,
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

  // the layer exists while the viewer is on; the effects below run after
  // this one and feed it
  useEffect(() => {
    if (!map || !enabled) return undefined;
    const layer = createFootprintOutlineLayer(map, OBLIQUE_FOOTPRINT_LAYER_ID, {
      color: outlineColor,
      width: outlineWidth,
      opacity: outlineOpacity,
      fillOpacity: Math.max(0, Math.min(0.2, fillOpacity)),
      inactiveOpacity: Math.max(0, Math.min(0.1, inactiveOpacity)),
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
    const feature =
      footprintData && selectedImageId
        ? findMatchingFeature(footprintData.features, selectedImageId)
        : undefined;
    layerRef.current?.setRing(
      feature?.geometry.coordinates[0] ?? null,
      {
        pose: selectedRecord?.pose ?? null,
        seriesLabel,
        imageId: selectedImageId ?? undefined,
      },
      nearbyRecords
        ?.filter((record) => record.id !== selectedImageId && record.footprint)
        .map((record) => ({ id: record.id, ring: record.footprint! }))
    );
  }, [
    map,
    enabled,
    footprintData,
    selectedImageId,
    selectedRecord,
    nearbyRecords,
    seriesLabel,
  ]);

  // the look
  useEffect(() => {
    layerRef.current?.setStyle({
      color: outlineColor,
      width: outlineWidth,
      opacity: outlineOpacity,
      fillOpacity: Math.max(0, Math.min(0.2, fillOpacity)),
      inactiveOpacity: Math.max(0, Math.min(0.1, inactiveOpacity)),
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
    if (!map || !enabled || locked || !selectedImageId) return undefined;
    const container = map.getCanvasContainer();
    const canvas = map.getCanvas();
    const previousCursor = canvas.style.cursor;
    let ownsCursor = false;
    let pressedAt: { x: number; y: number } | null = null;
    let dragged = false;
    const hit = (event: MouseEvent): boolean => {
      if (event.target !== canvas || !onClickRef.current) return false;
      const rect = canvas.getBoundingClientRect();
      return !!layerRef.current?.containsScreenPoint({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };
    const restoreCursor = () => {
      if (ownsCursor && canvas.style.cursor === "pointer")
        canvas.style.cursor = previousCursor;
      ownsCursor = false;
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
      if (event.buttons || !hit(event)) restoreCursor();
      else {
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
      const rect = canvas.getBoundingClientRect();
      const clickedImageId = layerRef.current?.imageAtScreenPoint({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
      claimClick(event);
      layerRef.current?.setLocked(true, fadeOutRef.current);
      restoreCursor();
      onClickRef.current?.(clickedImageId ?? selectedImageId);
    };
    const onPointerCancel = () => {
      pressedAt = null;
      dragged = false;
      restoreCursor();
    };
    container.addEventListener("pointerdown", onPointerDown, true);
    container.addEventListener("pointermove", onPointerMove, true);
    container.addEventListener("pointercancel", onPointerCancel, true);
    container.addEventListener("pointerleave", restoreCursor);
    container.addEventListener("click", onClick, true);
    return () => {
      container.removeEventListener("pointerdown", onPointerDown, true);
      container.removeEventListener("pointermove", onPointerMove, true);
      container.removeEventListener("pointercancel", onPointerCancel, true);
      container.removeEventListener("pointerleave", restoreCursor);
      container.removeEventListener("click", onClick, true);
      restoreCursor();
    };
  }, [map, enabled, locked, selectedImageId]);

  // the fade on lock
  useEffect(() => {
    layerRef.current?.setLocked(locked, fadeOutRef.current);
  }, [map, enabled, locked]);
};
