import { useEffect, useMemo, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import { dropInfoElementsOfLayers } from "../store/slices/features";
import { getLayers } from "../store/slices/mapping";

/**
 * Takes the info box of a layer down when the layer leaves the map.
 *
 * Removing a single layer clears its info box where it is removed, but the
 * stack is also replaced as a whole: applying a discover map, loading a config
 * by id, "Alle Karteninhalte entfernen". None of those know about the info box,
 * so it stayed on screen for a layer that was gone.
 *
 * Only the layers that actually disappeared are dropped. An info box that
 * belongs to no layer (a vehicle, a gazetteer hit) is left alone, and so is
 * one whose layer is also part of the new stack.
 */
export function useRemovedLayerInfoBoxReset() {
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);
  // flattened, so the members of a removed group count as removed too
  const layerIdsSignature = useMemo(
    () => layers.map((layer) => layer.id).join("\n"),
    [layers]
  );
  const previousIdsRef = useRef<string[] | null>(null);

  useEffect(() => {
    const currentIds = layerIdsSignature ? layerIdsSignature.split("\n") : [];
    const previousIds = previousIdsRef.current;
    previousIdsRef.current = currentIds;
    if (!previousIds) {
      return;
    }
    const current = new Set(currentIds);
    const removedIds = previousIds.filter((id) => !current.has(id));
    if (removedIds.length > 0) {
      dispatch(dropInfoElementsOfLayers(removedIds));
    }
  }, [dispatch, layerIdsSignature]);
}
