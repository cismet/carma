import { useState, useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import { featureFormRegistry } from "./index";
import { getSelectedFeature } from "../../../store/slices/featureCollection";
import {
  getDraft,
  setDraft,
  removeDraft,
  setOriginalValues,
  hasDraftChanges,
} from "../../../store/slices/featuresForms";
import type { RootState } from "../../../store";

interface FeaturesFormsWrapperProps {
  featureType?: string;
  data: any;
  rawFeature?: any;
  readOnly?: boolean;
  loading?: boolean;
}

// Map sourceLayer values to registry keys
const featureTypeToFormKey: Record<string, string> = {
  leuchten: "leuchte",
  tdta_leuchten: "leuchte",
  leitungen: "leitung",
  leitung: "leitung",
  tdta_standort_mast: "standort",
  standort_mast: "standort",
  masten: "standort",
  mast: "standort",
  standorte: "standort",
  schaltstelle: "schaltstelle",
  schaltstellen: "schaltstelle",
  mauerlasche: "mauerlasche",
  mauerlaschen: "mauerlasche",
  abzweigdose: "abzweigdose",
  abzweigdosen: "abzweigdose",
};

const FeaturesFormsWrapper = ({
  featureType,
  data,
  rawFeature,
  readOnly: readOnlyProp = true,
  loading,
}: FeaturesFormsWrapperProps) => {
  const dispatch = useDispatch();
  const selectedFeature = useSelector(getSelectedFeature);
  const featureId = selectedFeature?.id != null ? String(selectedFeature.id) : undefined;
  const draft = useSelector((state: RootState) => getDraft(state, featureId));
  const hasChanges = useSelector((state: RootState) => hasDraftChanges(state, featureId));

  const [isEditing, setIsEditing] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const effectiveReadOnly = readOnlyProp && !isEditing;

  const formKey = featureType ? featureTypeToFormKey[featureType] : undefined;
  const FormComponent = formKey ? featureFormRegistry[formKey] : undefined;

  const handleToggleReadOnly = useCallback(() => {
    setIsEditing((prev) => !prev);
  }, []);

  const handleCancel = useCallback(() => {
    if (featureId) {
      dispatch(removeDraft(featureId));
    }
    setResetKey((prev) => prev + 1);
    setIsEditing(false);
  }, [featureId, dispatch]);

  const handleSaveComplete = useCallback(() => {
    if (featureId) {
      dispatch(removeDraft(featureId));
    }
    setIsEditing(false);
  }, [featureId, dispatch]);

  const handleDraftChange = useCallback(
    (values: Record<string, unknown>) => {
      if (featureId && formKey) {
        dispatch(setDraft({ featureId, featureType: formKey, values }));
      }
    },
    [featureId, formKey, dispatch]
  );

  const handleOriginalValues = useCallback(
    (values: Record<string, unknown>) => {
      if (featureId) {
        dispatch(setOriginalValues({ featureId, values }));
      }
    },
    [featureId, dispatch]
  );

  if (FormComponent) {
    return (
      <div className="h-full">
        <FormComponent
          key={resetKey}
          data={data}
          rawFeature={rawFeature}
          readOnly={effectiveReadOnly}
          loading={loading}
          draftValues={draft?.values}
          hasDraft={hasChanges}
          onDraftChange={handleDraftChange}
          onOriginalValues={handleOriginalValues}
          onToggleReadOnly={handleToggleReadOnly}
          onCancel={handleCancel}
          onSaveComplete={handleSaveComplete}
        />
      </div>
    );
  }
};

export default FeaturesFormsWrapper;
