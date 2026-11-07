import { useEffect } from "react";

import { registerMeasurement3dHostUi } from "@carma-mapping/addons";

import { IS_MEASUREMENT3D_AVAILABLE } from "../../config/measurement3d-availability";
import { useGeoportalAnnotationDeleteConfirmation } from "../../hooks/use-geoportal-annotation-delete-confirmation";
import { useMeasurement3dModeSync } from "../../hooks/use-measurement3d-mode-sync";
import {
  useMeasurement3dLayerButton,
  useMeasurement3dSavedCollectionSync,
} from "../../hooks/use-measurement3d-host";
import { GEOPORTAL_LAYER_TOOL_ACTION_TOOLBAR_CLASS_NAMES } from "../layers/layer-tool-action-button-style";
import { renderGeoportalAnnotationToolButtonBackdrop } from "./annotation-tool-button-backdrop";
import { Measurement3dInfoBox } from "./Measurement3dInfoBox";

const ModeSync = () => {
  useMeasurement3dModeSync();
  return null;
};

/** Keeps the 3D measurement tool exclusive with the app's other map modes; only where the addon runs. */
export const Measurement3dModeSync = () =>
  IS_MEASUREMENT3D_AVAILABLE ? <ModeSync /> : null;

const LayerSync = () => {
  const { confirmAnnotationDelete, deleteConfirmationModal } =
    useGeoportalAnnotationDeleteConfirmation();
  useMeasurement3dLayerButton();
  useMeasurement3dSavedCollectionSync();
  useEffect(
    () =>
      registerMeasurement3dHostUi({
        InfoBox: Measurement3dInfoBox,
        toolbar: {
          classNames: GEOPORTAL_LAYER_TOOL_ACTION_TOOLBAR_CLASS_NAMES,
          renderToolButtonBackdrop: renderGeoportalAnnotationToolButtonBackdrop,
        },
        confirmDelete: confirmAnnotationDelete,
      }),
    [confirmAnnotationDelete]
  );
  return deleteConfirmationModal;
};

/**
 * The Geoportal side of the 3D measurement on the MapLibre view: its layer
 * row, its saved sets, and the UI the addon takes from the app (info box,
 * toolbar look, delete confirmation); only where the addon runs.
 */
export const Measurement3dLayerSync = () =>
  IS_MEASUREMENT3D_AVAILABLE ? <LayerSync /> : null;
