import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

import { useComparingActions } from "@carma-mapping/addons";

import {
  getSelectedFeature,
  setSecondaryInfoBoxElements,
  setSelectedFeature,
} from "../store/slices/features";

/**
 * Drops the feature selection while the comparison runs.
 *
 * The compare panels do not select: their maps are handed `selectionEnabled:
 * false`, and the map the geoportal's click-to-infobox flow is bound to is the
 * app's own, which is hidden underneath. A selection made before entering
 * therefore keeps its info box on screen with nothing on the panels to explain
 * it, and no click can get rid of it.
 *
 * So the mode has one rule: no selection while comparing. This also covers a
 * selection arriving from elsewhere mid-comparison, e.g. the gazetteer, whose
 * marker lives on the hidden map and would be just as unreachable.
 */
export function useComparingSelectionReset() {
  const dispatch = useDispatch();
  const { isOn } = useComparingActions();
  const selectedFeature = useSelector(getSelectedFeature);

  useEffect(() => {
    if (!isOn || !selectedFeature) {
      return;
    }
    dispatch(setSelectedFeature(null));
    dispatch(setSecondaryInfoBoxElements([]));
  }, [dispatch, isOn, selectedFeature]);
}
