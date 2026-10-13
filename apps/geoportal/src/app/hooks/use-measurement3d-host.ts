import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  MEASUREMENT3D_LAYER_ID,
  MEASUREMENT3D_TOOLS_INTERACTION_ID,
  useAddonState,
  useMeasurement3dLayerRow,
  useMeasurement3dRuntimeServices,
} from "@carma-mapping/addons";

import { resolveVisibleSavedAnnotationCollectionIds } from "../components/annotations/saved-annotation-collection-registration";
import {
  appendLayer,
  getActiveInteractionButtonID,
  getActiveInteractionLayerID,
  getLayers,
  removeLayer,
  setActiveInteractionButtonID,
  setActiveInteractionLayerID,
  updateLayer,
} from "../store/slices/mapping";
import {
  useSavedAnnotationCollectionSync,
  type SavedAnnotationCollectionSyncServices,
} from "./use-saved-annotation-collection-sync";

/** The 3D measurement addon is switched on and can measure (a mesh is drawn). */
export const useIsMeasurement3dOn = (): boolean => {
  const [state] = useAddonState("measurement3d");
  return (state?.isOn ?? false) && (state?.available ?? false);
};

/** App half of the 3D measurement row: the dispatches the library half asks for. */
export const useMeasurement3dLayerButton = () => {
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);
  const activeInteractionLayerID = useSelector(getActiveInteractionLayerID);
  const activeInteractionButtonID = useSelector(getActiveInteractionButtonID);
  useMeasurement3dLayerRow({
    hasRow: layers.some((layer) => layer.id === MEASUREMENT3D_LAYER_ID),
    panelOpen:
      activeInteractionLayerID === MEASUREMENT3D_LAYER_ID &&
      activeInteractionButtonID === MEASUREMENT3D_TOOLS_INTERACTION_ID,
    onAdd: (layer) => {
      dispatch(appendLayer(layer));
      dispatch(setActiveInteractionLayerID(layer.id));
      dispatch(
        setActiveInteractionButtonID(MEASUREMENT3D_TOOLS_INTERACTION_ID)
      );
    },
    onUpdate: (layer) => dispatch(updateLayer(layer)),
    onRemove: (id) => {
      dispatch(removeLayer(id));
      dispatch(setActiveInteractionLayerID(null));
      dispatch(setActiveInteractionButtonID(null));
    },
  });
};

const NO_RUNTIME: SavedAnnotationCollectionSyncServices = {
  appendAnnotationsRuntimePersistenceState: () => [],
  removeExternalAnnotationsByCollection: () => undefined,
};

/**
 * Saved measurement sets join the 3D measurement runtime of the MapLibre
 * view, and leave it when their row is hidden or closed: a set saved in this
 * view goes into the runtime directly, so the registration alone would never
 * take it out again.
 */
export const useMeasurement3dSavedCollectionSync = () => {
  const services = useMeasurement3dRuntimeServices();
  const layers = useSelector(getLayers);
  useSavedAnnotationCollectionSync(services ?? NO_RUNTIME);
  // Rows seen visible: only a row that was there and is now hidden or gone
  // takes its set out. A set saved a moment ago may reach the runtime before
  // its row reaches the store, and must stay.
  const seenVisibleRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const visibleCollectionIds =
      resolveVisibleSavedAnnotationCollectionIds(layers);
    const left = [...seenVisibleRef.current].filter(
      (collectionId) => !visibleCollectionIds.has(collectionId)
    );
    seenVisibleRef.current = new Set(visibleCollectionIds);
    if (!services) return;
    for (const collectionId of left) {
      services.removeExternalAnnotationsByCollection({
        type: "saved-measurement",
        id: collectionId,
      });
    }
  }, [layers, services]);
};
