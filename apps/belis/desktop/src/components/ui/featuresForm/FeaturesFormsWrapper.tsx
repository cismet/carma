import { useState, useCallback, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import dayjs from "dayjs";
import { featureFormRegistry } from "./index";
import { getSelectedFeature } from "../../../store/slices/featureCollection";
import {
  getDraft,
  getDraftFiles,
  getRemovedDocumentKeys,
  setDraft,
  setDraftFiles,
  setRemovedDocumentKeys,
  removeDraft,
  setOriginalValues,
  getOriginalValues,
  hasDraftChanges,
} from "../../../store/slices/featuresForms";
import { ChangedFieldsProvider } from "./DraftFieldHighlight";
import type { DraftFile } from "../../../store/slices/featuresForms";
import type { RootState } from "../../../store";

const DAYJS_PREFIX = "__dayjs:";

const serializeValues = (values: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (dayjs.isDayjs(value)) {
      // Normalize to date-only (YYYY-MM-DD) so local-time vs UTC differences
      // from DatePicker don't cause false-positive dirty detection.
      result[key] = DAYJS_PREFIX + value.format("YYYY-MM-DD");
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = serializeValues(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
};

const deserializeValues = (values: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string" && value.startsWith(DAYJS_PREFIX)) {
      result[key] = dayjs(value.slice(DAYJS_PREFIX.length));
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      // Handle corrupted dayjs objects from old persist data (have $d property)
      if ("$d" in obj) {
        result[key] = dayjs(obj["$d"] as string);
      } else {
        result[key] = deserializeValues(obj);
      }
    } else {
      result[key] = value;
    }
  }
  return result;
};

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
  const draftFiles = useSelector((state: RootState) => getDraftFiles(state, featureId));
  const hasChanges = useSelector((state: RootState) => hasDraftChanges(state, featureId));
  const originalValues = useSelector((state: RootState) => getOriginalValues(state, featureId));
  const removedDocKeys = useSelector((state: RootState) => getRemovedDocumentKeys(state, featureId));

  const removedDocumentKeys = useMemo(() => new Set(removedDocKeys), [removedDocKeys]);

  const [isEditing, setIsEditing] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const effectiveReadOnly = readOnlyProp && !isEditing;

  const deserializedDraftValues = useMemo(
    () => (draft?.values ? deserializeValues(draft.values) : undefined),
    [draft?.values]
  );

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
      // Update baseline to the saved values so subsequent edits highlight correctly
      if (draft?.values) {
        dispatch(setOriginalValues({ featureId, values: draft.values }));
      }
      dispatch(removeDraft(featureId));
    }
    setIsEditing(false);
  }, [featureId, dispatch, draft?.values]);

  const handleDraftChange = useCallback(
    (values: Record<string, unknown>) => {
      if (featureId && formKey) {
        dispatch(setDraft({ featureId, featureType: formKey, values: serializeValues(values) }));
      }
    },
    [featureId, formKey, dispatch]
  );

  const handleOriginalValues = useCallback(
    (values: Record<string, unknown>) => {
      if (featureId) {
        dispatch(setOriginalValues({ featureId, values: serializeValues(values) }));
      }
    },
    [featureId, dispatch]
  );

  const handleDraftFilesChange = useCallback(
    (files: DraftFile[]) => {
      if (featureId && formKey) {
        dispatch(setDraftFiles({ featureId, featureType: formKey, files }));
      }
    },
    [featureId, formKey, dispatch]
  );

  const handleRemovedDocumentKeysChange = useCallback(
    (keys: Set<string>) => {
      if (featureId && formKey) {
        dispatch(setRemovedDocumentKeys({ featureId, featureType: formKey, keys: [...keys] }));
      }
    },
    [featureId, formKey, dispatch]
  );

  if (FormComponent) {
    return (
      <ChangedFieldsProvider
        originalValues={originalValues}
        draftValues={draft?.values}
      >
        <div className="h-full">
          <FormComponent
            key={resetKey}
            data={data}
            rawFeature={rawFeature}
            readOnly={effectiveReadOnly}
            loading={loading}
            draftValues={deserializedDraftValues}
            draftFiles={draftFiles}
            hasDraft={hasChanges}
            onDraftChange={handleDraftChange}
            onDraftFilesChange={handleDraftFilesChange}
            onOriginalValues={handleOriginalValues}
            onToggleReadOnly={handleToggleReadOnly}
            onCancel={handleCancel}
            onSaveComplete={handleSaveComplete}
            removedDocumentKeys={removedDocumentKeys}
            onRemovedDocumentKeysChange={handleRemovedDocumentKeysChange}
          />
        </div>
      </ChangedFieldsProvider>
    );
  }
};

export default FeaturesFormsWrapper;
