import { useState, useCallback, useMemo, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { featureFormRegistry } from "./index";
import {
  getSelectedFeature,
  getFeatureDataVersion,
} from "../../../store/slices/featureCollection";
import {
  getDraft,
  getDraftFiles,
  getRemovedDocumentKeys,
  setDraft,
  setDraftFiles,
  setDraftDocumentsInfo,
  setRemovedDocumentKeys,
  removeDraft,
  setOriginalValues,
  getOriginalValues,
  hasDraftChanges,
  getGlobalEditMode,
  isCreationDraftKey,
} from "../../../store/slices/featuresForms";
import type { DokumentItem } from "../DocumentPreview";
import { ChangedFieldsProvider } from "./DraftFieldHighlight";
import type { DraftFile } from "../../../store/slices/featuresForms";
import type { RootState } from "../../../store";
import {
  serializeValues,
  deserializeValues,
} from "../../../helper/draftSerialize";

interface FeaturesFormsWrapperProps {
  featureType?: string;
  data: any;
  rawFeature?: any;
  readOnly?: boolean;
  loading?: boolean;
  onSelectNextDraft?: (removedFeatureId: string) => void;
}

// Map form key to the GraphQL response key used to extract dokumenteArray
const formKeyToGraphqlKey: Record<string, string> = {
  leuchte: "tdta_leuchten",
  standort: "tdta_standort_mast",
  leitung: "leitung",
  schaltstelle: "schaltstelle",
  mauerlasche: "mauerlasche",
  abzweigdose: "abzweigdose",
};

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
  onSelectNextDraft,
}: FeaturesFormsWrapperProps) => {
  const dispatch = useDispatch();
  const selectedFeature = useSelector(getSelectedFeature);

  // Creation drafts use their draft key directly as featureId
  const isCreation = rawFeature?.properties?._isCreation === true;
  const creationDraftKey = isCreation
    ? String(rawFeature.properties.id)
    : undefined;

  // Build a composite draft key: "sourceLayer:databasePK".
  // Database PKs alone are not unique across source layers (e.g. Leuchte PK=1
  // vs Standort PK=1 are different features). Including the sourceLayer prevents
  // draft key collisions between feature types.
  const rawPK = rawFeature?.properties?.id;
  const dbPK =
    rawPK != null
      ? String(rawPK)
      : selectedFeature?.id != null
      ? String(selectedFeature.id)
      : undefined;
  const sourceLayer = featureType ?? "";
  const featureId = creationDraftKey ?? (dbPK != null ? `${sourceLayer}:${dbPK}` : undefined);

  // Store a serializable snapshot of the raw feature for the draft.
  // MapLibre's MapGeoJSONFeature contains non-serializable objects (layer, state)
  // that don't survive redux-persist round-trips. We keep only the fields the
  // sidebar extractors and draft display actually need.
  const draftFeature = useMemo(() => {
    const f = rawFeature ?? selectedFeature;
    if (!f) return undefined;
    return {
      type: f.type ?? "Feature",
      id: f.id,
      properties: f.properties ?? {},
      geometry: f.geometry,
      sourceLayer: f.sourceLayer ?? sourceLayer,
      source: f.source ?? "",
      layer: {
        id: f.sourceLayer ?? sourceLayer,
        source: f.source ?? "",
        type: "circle" as const,
      },
      state: {},
    };
  }, [rawFeature, selectedFeature, sourceLayer]);
  const draft = useSelector((state: RootState) => getDraft(state, featureId));
  const draftFiles = useSelector((state: RootState) =>
    getDraftFiles(state, featureId)
  );
  const hasChanges = useSelector((state: RootState) =>
    hasDraftChanges(state, featureId)
  );
  const originalValues = useSelector((state: RootState) =>
    getOriginalValues(state, featureId)
  );
  const removedDocKeys = useSelector((state: RootState) =>
    getRemovedDocumentKeys(state, featureId)
  );

  const removedDocumentKeys = useMemo(
    () => new Set(removedDocKeys),
    [removedDocKeys]
  );

  const featureDataVersion = useSelector(getFeatureDataVersion);
  const globalEditMode = useSelector(getGlobalEditMode);
  const [isEditing, setIsEditing] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const effectiveReadOnly = readOnlyProp && !isEditing && !globalEditMode;

  // Exit edit mode when feature data is refetched externally (e.g. Save All)
  useEffect(() => {
    if (!isCreation) {
      setIsEditing(false);
      setResetKey((prev) => prev + 1);
    }
  }, [featureDataVersion, isCreation]);

  // Set empty original values for creation drafts so all fields appear as "changed"
  useEffect(() => {
    if (isCreation && featureId) {
      dispatch(setOriginalValues({ featureId, values: {} }));
    }
  }, [isCreation, featureId, dispatch]);

  const deserializedDraftValues = useMemo(
    () => (draft?.values ? deserializeValues(draft.values) : undefined),
    [draft?.values]
  );

  const formKey = featureType ? featureTypeToFormKey[featureType] : undefined;
  const FormComponent = formKey ? featureFormRegistry[formKey] : undefined;

  // Keep draft's existingDocuments and featureDbId in sync with server data.
  // Only updates when a draft already exists (avoids creating ghost drafts).
  // Skip for creation drafts — they have no server data.
  useEffect(() => {
    if (isCreation) return;
    if (!featureId || !formKey || !draft || !data) return;
    const graphqlKey = formKeyToGraphqlKey[formKey];
    if (!graphqlKey) return;
    const dataObj = data as Record<string, unknown>;
    const arr = dataObj[graphqlKey] as
      | Array<Record<string, unknown>>
      | undefined;
    const firstItem = arr?.[0];
    if (!firstItem) return;
    const docs = (firstItem.dokumenteArray as DokumentItem[]) ?? [];
    const dbId = firstItem.id as number | undefined;
    if (dbId != null) {
      dispatch(
        setDraftDocumentsInfo({
          featureId,
          existingDocuments: docs,
          featureDbId: dbId,
        })
      );
    }
  }, [featureId, formKey, data, draft, dispatch, isCreation]);

  const handleToggleReadOnly = useCallback(() => {
    setIsEditing((prev) => !prev);
  }, []);

  const handleCancel = useCallback(() => {
    if (featureId) {
      dispatch(removeDraft(featureId));
      onSelectNextDraft?.(featureId);
    }
    setResetKey((prev) => prev + 1);
    setIsEditing(false);
  }, [featureId, dispatch, onSelectNextDraft]);

  const handleSaveComplete = useCallback(() => {
    if (featureId) {
      // Update baseline to the saved values so subsequent edits highlight correctly.
      // Skip when draft.values is empty (file-only saves) to avoid wiping the
      // proper baseline with {} – that would break dirty-field detection.
      if (draft?.values && Object.keys(draft.values).length > 0) {
        dispatch(setOriginalValues({ featureId, values: draft.values }));
      }
      dispatch(removeDraft(featureId));
    }
    setIsEditing(false);
  }, [featureId, dispatch, draft?.values]);

  const handleDraftChange = useCallback(
    (values: Record<string, unknown>) => {
      if (featureId && formKey) {
        dispatch(
          setDraft({
            featureId,
            featureType: formKey,
            values: serializeValues(values),
            feature: draftFeature,
            fetchedData: data,
          })
        );
      }
    },
    [featureId, formKey, dispatch, draftFeature, data]
  );

  const handleOriginalValues = useCallback(
    (values: Record<string, unknown>) => {
      if (featureId) {
        dispatch(
          setOriginalValues({ featureId, values: serializeValues(values) })
        );
      }
    },
    [featureId, dispatch]
  );

  const handleDraftFilesChange = useCallback(
    (files: DraftFile[]) => {
      if (featureId && formKey) {
        dispatch(
          setDraftFiles({
            featureId,
            featureType: formKey,
            files,
            feature: draftFeature,
            fetchedData: data,
          })
        );
      }
    },
    [featureId, formKey, dispatch, draftFeature, data]
  );

  const handleRemovedDocumentKeysChange = useCallback(
    (keys: Set<string>) => {
      if (featureId && formKey) {
        dispatch(
          setRemovedDocumentKeys({
            featureId,
            featureType: formKey,
            keys: [...keys],
            feature: draftFeature,
            fetchedData: data,
          })
        );
      }
    },
    [featureId, formKey, dispatch, draftFeature, data]
  );

  if (FormComponent) {
    return (
      <ChangedFieldsProvider
        originalValues={originalValues}
        draftValues={draft?.values}
      >
        <div className="h-full">
          {isCreation && (
            <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-3 py-2 rounded mb-2">
              Neuer Entwurf — noch nicht gespeichert
            </div>
          )}
          <FormComponent
            key={resetKey}
            data={data}
            rawFeature={rawFeature}
            readOnly={effectiveReadOnly}
            loading={loading}
            draftValues={deserializedDraftValues}
            draftFiles={draftFiles}
            hasDraft={isCreation || hasChanges}
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
