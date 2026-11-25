import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  carStopLabel,
  useVehicleAnimationActions,
  type SelectedCar,
} from "@carma-mapping/addons";
import type { FeatureInfo } from "@carma-mapping/utils";

import {
  getSelectedFeature,
  setSelectedFeature,
} from "../store/slices/features";

/** the info box feature a selected vehicle becomes; one id, so a refresh replaces it in place */
export const VEHICLE_FEATURE_ID = "vehicle-animation-car";

/**
 * What the box says about a vehicle: the cab display as the title, the next
 * stop with its time as the subtitle, the service underneath.
 */
const featureOf = (car: SelectedCar, header: string): FeatureInfo => ({
  id: VEHICLE_FEATURE_ID,
  showMarker: false,
  properties: {
    header,
    title: car.destination ?? header,
    subtitle: carStopLabel(car),
    additionalInfo: car.service,
  },
});

/**
 * Shows the vehicle the animation engine reports as selected in the
 * geoportal's info box, and tells the engine when the box moved on.
 *
 * The engine cannot reach the store (libraries carry no redux), so it writes
 * the selection into its addon channel and this hook, which lives in the app,
 * turns it into the `features` slice's selected feature. The other way round,
 * the box closing or showing some other feature drops the vehicle from the
 * channel, and the engine takes the highlight off.
 */
export function useVehicleAnimationInfoBox() {
  const dispatch = useDispatch();
  const selectedFeature = useSelector(getSelectedFeature);
  const { title, selectedCar, setSelectedCar } = useVehicleAnimationActions();

  const boxShowsCar = selectedFeature?.id === VEHICLE_FEATURE_ID;
  /**
   * Whether the box has shown the current selection yet. The store lags the
   * dispatch by a render, so "the box shows no vehicle" only means "closed"
   * once it has shown one.
   */
  const shownRef = useRef(false);
  if (boxShowsCar) shownRef.current = true;
  if (selectedCar === null) shownRef.current = false;

  // the engine picked a vehicle, or refreshed the one it has: show it
  useEffect(() => {
    if (!selectedCar) return;
    dispatch(setSelectedFeature(featureOf(selectedCar, title)));
  }, [dispatch, selectedCar, title]);

  // the selection ended on the engine's side (the vehicle left the model, the
  // animation was switched off): a box still showing it closes
  useEffect(() => {
    if (selectedCar === null && boxShowsCar) {
      dispatch(setSelectedFeature(null));
    }
  }, [dispatch, selectedCar, boxShowsCar]);

  // the box was closed, or shows something else now: drop the highlight
  useEffect(() => {
    if (selectedCar !== null && !boxShowsCar && shownRef.current) {
      setSelectedCar(null);
    }
  }, [selectedCar, boxShowsCar, setSelectedCar]);
}

/**
 * Mounts the hook where it stays mounted while the controls are hidden, in a
 * ride or in zen mode. A component of its own, so its once-a-second updates
 * re-render nothing else.
 */
export const VehicleAnimationInfoBoxSync = () => {
  useVehicleAnimationInfoBox();
  return null;
};
