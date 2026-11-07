import { useCallback, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import { useAddonState } from "@carma-mapping/addons";
import { useMapSelection } from "@carma-mapping/contexts";

import {
  getFeatures,
  getSecondaryInfoBoxElements,
  getSelectedFeature,
  setFeatures,
  setPreferredLayerId,
  setSecondaryInfoBoxElements,
  setSelectedFeature,
} from "../store/slices/features";
import { getSelectedLayerIndexIsNoSelection } from "../store/slices/mapping";
import { getUIMode, UIMode } from "../store/slices/ui";

/**
 * Drops the selected feature and its info box, the same four actions a click
 * into an empty spot of the map sends (`useLibreMapClickHandler`).
 */
export const useClearFeatureSelection = () => {
  const dispatch = useDispatch();
  const { clearSelection } = useMapSelection();
  const selectedFeature = useSelector(getSelectedFeature);
  const features = useSelector(getFeatures);
  const secondaryInfoBoxElements = useSelector(getSecondaryInfoBoxElements);

  const hasSelection =
    !!selectedFeature ||
    features.length > 0 ||
    secondaryInfoBoxElements.length > 0;

  const clearFeatureSelection = useCallback(() => {
    dispatch(setSecondaryInfoBoxElements([]));
    dispatch(setFeatures([]));
    dispatch(setPreferredLayerId(""));
    dispatch(setSelectedFeature(null));
    clearSelection();
  }, [dispatch, clearSelection]);

  return { hasSelection, clearFeatureSelection };
};

const OPEN_OVERLAY_SELECTOR = [
  '[role="dialog"]',
  ".ant-popover:not(.ant-popover-hidden)",
  ".modal.show",
].join(", ");

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || !!target.closest("input, textarea, select"));

/** a dialog or popover on screen, whose own Escape handler closes it */
const hasOpenOverlay = () =>
  Array.from(document.querySelectorAll(OPEN_OVERLAY_SELECTOR)).some(
    (element) => element.getClientRects().length > 0
  );

/**
 * Escape clears the selection, unless something else on screen owns the key:
 * a text field, a dialog or popover, the layer settings (`SecondaryView`), or
 * a map tool (measurement, print, feature info, highlighting, annotation),
 * each of which ends itself on Escape.
 */
export const useClearSelectionOnEscape = () => {
  const { hasSelection, clearFeatureSelection } = useClearFeatureSelection();
  const uiMode = useSelector(getUIMode);
  const noLayerSelected = useSelector(getSelectedLayerIndexIsNoSelection);
  const [highlightMode] = useAddonState("highlightMode");
  const [annotationMode] = useAddonState("annotationMode");

  const isFreeRef = useRef(false);
  isFreeRef.current =
    hasSelection &&
    uiMode === UIMode.DEFAULT &&
    noLayerSelected &&
    !highlightMode?.isOn &&
    !annotationMode?.isOn;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        !isFreeRef.current ||
        isEditable(event.target) ||
        hasOpenOverlay()
      ) {
        return;
      }
      clearFeatureSelection();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [clearFeatureSelection]);
};
