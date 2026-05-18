import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  createContext,
  useContext,
} from "react";
import { useSelector, useDispatch } from "react-redux";
import { message, Select } from "antd";
import { featureFormRegistry } from "./index";
import {
  getSelectedFeature,
  getFeatureDataVersion,
  incrementFeatureDataVersion,
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
  clearDraftGeometry,
  setOriginalValues,
  getOriginalValues,
  hasDraftChanges,
  getGlobalEditMode,
  isCreationDraftKey,
  getAllDrafts,
} from "../../../store/slices/featuresForms";
import { getJWT } from "../../../store/slices/auth";
import type { DokumentItem } from "../DocumentPreview";
import { ChangedFieldsProvider } from "./DraftFieldHighlight";
import {
  getAllowlistedPaths,
  getCreationDefaults,
} from "../../../store/slices/creationDefaults";
import type { DraftFile } from "../../../store/slices/featuresForms";
import type { RootState } from "../../../store";
import {
  serializeValues,
  deserializeValues,
} from "../../../helper/draftSerialize";
import { saveFeatureDraft } from "../../../helper/featureFormSaveHelpers";
import {
  buildMeasurementGeometryOptions,
  parseStandortIdFromKey,
  STANDORT_OPTION_PREFIX,
  type MeasurementGeometryOption,
} from "../../../helper/geometryOptions";
import {
  getMeasurements,
  setMeasurements,
} from "../../../store/slices/measurements";
import { removeMeasurements } from "@carma-mapping/measurements";
import {
  buildSyntheticFeature,
  buildSyntheticFetchedData,
  enrichSyntheticProps,
} from "../../../helper/buildSyntheticFeature";
import { getKeyTablesData } from "../../../store/slices/keyTables";
import { useMapSelection } from "@carma-mapping/engines/maplibre";

interface SingleSaveContext {
  onSaveSingle?: () => Promise<void>;
  savingSingle: boolean;
}

const SingleSaveCtx = createContext<SingleSaveContext>({ savingSingle: false });

export const useSingleSave = () => useContext(SingleSaveCtx);

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
  const { selectedFeatureId, selectFeature } = useMapSelection();

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

  const jwt = useSelector(getJWT) as string | null;
  const featureDataVersion = useSelector(getFeatureDataVersion);
  const globalEditMode = useSelector(getGlobalEditMode);
  const measurements = useSelector(getMeasurements);
  const allDrafts = useSelector(getAllDrafts);
  const keyTablesData = useSelector(getKeyTablesData);

  // When creating a new Leuchte that's linked to an existing Standort, expose
  // that Standort as a geometry-source option in the dropdown. The link is
  // captured at "+ Leuchte" click time (CreateFeatureDropdown) and persisted
  // on the draft itself, since opening the creation draft replaces
  // selectedFeature in Redux and the original Standort selection is lost.
  const formKey = featureType ? featureTypeToFormKey[featureType] : undefined;
  const standortOption = useMemo<MeasurementGeometryOption | null>(() => {
    if (!isCreation || formKey !== "leuchte") return null;
    const geometryKey = draft?.geometryKey;
    const geometry = draft?.geometry;
    if (!geometryKey || !geometry) return null;
    if (!geometryKey.startsWith(STANDORT_OPTION_PREFIX)) return null;
    const id = parseStandortIdFromKey(geometryKey);
    if (id == null) return null;
    const props = (draft?.feature?.properties ?? {}) as Record<string, unknown>;
    const stashedLabel = props._linkedStandortLabel;
    const label =
      typeof stashedLabel === "string" ? stashedLabel : `Standort ${id}`;
    return {
      key: geometryKey,
      label,
      geometry: geometry as MeasurementGeometryOption["geometry"],
    };
  }, [isCreation, formKey, draft?.geometryKey, draft?.geometry, draft?.feature]);

  // Measurement keys already claimed by other in-progress creation drafts —
  // each measurement can back at most one new feature, so don't offer it
  // again in any other draft's geometry selector.
  const consumedByOtherDrafts = useMemo(() => {
    const set = new Set<string>();
    for (const [id, d] of Object.entries(allDrafts)) {
      if (id === featureId) continue;
      if (!d.isCreation) continue;
      const key = d.geometryKey;
      if (key && key.startsWith("measurement.")) set.add(key);
    }
    return set;
  }, [allDrafts, featureId]);

  const geometryOptions = useMemo(() => {
    const measurementOpts = buildMeasurementGeometryOptions(measurements).filter(
      (o) => !consumedByOtherDrafts.has(o.key)
    );
    return standortOption ? [standortOption, ...measurementOpts] : measurementOpts;
  }, [measurements, standortOption, consumedByOtherDrafts]);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const effectiveReadOnly =
    !isCreation && readOnlyProp && !isEditing && !globalEditMode;

  // Exit edit mode when feature data is refetched externally (e.g. Save All).
  // No FormComponent remount here: re-population happens inside *FormFields via
  // a data-identity check, which preserves scroll position and avoids the
  // brief stale-data flicker that a key-bumped remount caused.
  useEffect(() => {
    if (!isCreation) {
      setIsEditing(false);
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

  const FormComponent = formKey ? featureFormRegistry[formKey] : undefined;

  const allowlistedPaths = useMemo(
    () =>
      isCreation && formKey ? getAllowlistedPaths(formKey) : undefined,
    [isCreation, formKey]
  );

  const currentDefaults = useSelector((state: RootState) =>
    isCreation && formKey ? getCreationDefaults(state, formKey) : undefined
  );

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

  const handleServerSave = useCallback(async () => {
    if (!jwt) {
      void message.error("Nicht authentifiziert");
      return;
    }
    if (!featureId || !draft) return;

    setSaving(true);
    try {
      const result = await saveFeatureDraft(jwt, featureId, draft);
      if (result.success) {
        dispatch(removeDraft(featureId));
        dispatch(incrementFeatureDataVersion());
        void message.success("Gespeichert");
        if (isCreation) {
          // Drop the consumed measurement from the dropdown source AND from
          // the terra-draw layer on the map. Redux ids are namespaced
          // (`measurement.<uuid>`) and the draft's geometryKey is the
          // double-prefixed dropdown key (`measurement.measurement.<uuid>`);
          // strip one prefix off the Redux id to recover the raw terra-draw
          // id that removeMeasurements expects.
          if (draft.geometryKey) {
            const consumed = measurements.find(
              (f) => `measurement.${String(f.id)}` === draft.geometryKey
            );
            if (consumed) {
              const filtered = measurements.filter((f) => f !== consumed);
              dispatch(setMeasurements(filtered));
              const rawId = String(consumed.id).replace(/^measurement\./, "");
              removeMeasurements([rawId]);
            }
          }
          onSelectNextDraft?.(featureId);
        } else {
          setIsEditing(false);
        }
      } else {
        void message.error(
          `Fehler beim Speichern: ${result.error ?? "Unbekannter Fehler"}`
        );
      }
    } catch (err) {
      void message.error(
        `Fehler beim Speichern: ${
          err instanceof Error ? err.message : "Unbekannter Fehler"
        }`
      );
    } finally {
      setSaving(false);
    }
  }, [
    jwt,
    featureId,
    draft,
    isCreation,
    measurements,
    dispatch,
    onSelectNextDraft,
  ]);

  const handleDraftChange = useCallback(
    (values: Record<string, unknown>) => {
      if (!featureId || !formKey) return;

      if (isCreation) {
        // Rebuild the synthetic feature so denormalized props (e.g.
        // leitung.bezeichnung from fk_leitungstyp) flow into the mini-map
        // render and trigger the right per-type style.
        const enrichedValues = enrichSyntheticProps(
          formKey,
          values,
          keyTablesData
        );
        const newFeature = buildSyntheticFeature(
          formKey,
          featureId,
          enrichedValues,
          draft?.geometry
        );
        dispatch(
          setDraft({
            featureId,
            featureType: formKey,
            values: serializeValues(values),
            feature: newFeature,
            fetchedData: buildSyntheticFetchedData(formKey, values),
            isCreation: true,
            geometry: draft?.geometry,
            geometryKey: draft?.geometryKey,
          })
        );
        if (selectedFeatureId) {
          selectFeature(selectedFeatureId, newFeature as never);
        }
        return;
      }

      dispatch(
        setDraft({
          featureId,
          featureType: formKey,
          values: serializeValues(values),
          feature: draftFeature,
          fetchedData: data,
        })
      );
    },
    [
      featureId,
      formKey,
      isCreation,
      keyTablesData,
      draft?.geometry,
      draft?.geometryKey,
      dispatch,
      draftFeature,
      data,
      selectedFeatureId,
      selectFeature,
    ]
  );

  const handleGeometryChange = useCallback(
    (newKey: string | undefined) => {
      if (!featureId || !formKey) return;
      const currentValues = draft?.values ?? {};
      const enrichedValues = enrichSyntheticProps(
        formKey,
        deserializeValues(currentValues),
        keyTablesData
      );
      // Clear case: user hit the "x" in the allowClear select.
      if (!newKey) {
        const newFeature = buildSyntheticFeature(
          formKey,
          featureId,
          enrichedValues,
          undefined
        );
        dispatch(
          clearDraftGeometry({
            featureId,
            feature: newFeature,
            fetchedData: buildSyntheticFetchedData(
              formKey,
              deserializeValues(currentValues)
            ),
          })
        );
        if (selectedFeatureId) {
          selectFeature(selectedFeatureId, newFeature as never);
        }
        return;
      }
      const opt = geometryOptions.find((o) => o.key === newKey);
      if (!opt) return;
      const geom = opt.geometry;
      const newFeature = buildSyntheticFeature(
        formKey,
        featureId,
        enrichedValues,
        geom
      );
      dispatch(
        setDraft({
          featureId,
          featureType: formKey,
          values: currentValues,
          feature: newFeature,
          fetchedData: buildSyntheticFetchedData(
            formKey,
            deserializeValues(currentValues)
          ),
          isCreation: true,
          geometry: geom,
          geometryKey: newKey,
        })
      );
      // Push the new feature into MapSelectionContext so the datasheet
      // mini-map (which reads rawFeature) re-centers on the new geometry.
      if (selectedFeatureId) {
        selectFeature(selectedFeatureId, newFeature as never);
      }
    },
    [
      featureId,
      formKey,
      draft?.values,
      geometryOptions,
      keyTablesData,
      dispatch,
      selectedFeatureId,
      selectFeature,
    ]
  );

  // Tracks featureIds whose single-option geometry the user explicitly cleared,
  // so the auto-apply effect below doesn't immediately re-apply it.
  const userClearedGeometryRef = useRef<Set<string>>(new Set());
  const prevGeometryKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!featureId) return;
    const prev = prevGeometryKeyRef.current;
    const now = draft?.geometryKey;
    if (prev && !now) {
      userClearedGeometryRef.current.add(featureId);
    } else if (now) {
      userClearedGeometryRef.current.delete(featureId);
    }
    prevGeometryKeyRef.current = now;
  }, [featureId, draft?.geometryKey]);

  useEffect(() => {
    if (!isCreation) return;
    if (geometryOptions.length !== 1) return;
    if (featureId && userClearedGeometryRef.current.has(featureId)) return;
    const only = geometryOptions[0];
    if (draft?.geometryKey === only.key) return;
    handleGeometryChange(only.key);
  }, [
    isCreation,
    featureId,
    geometryOptions,
    draft?.geometryKey,
    handleGeometryChange,
  ]);

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

  const singleSaveValue = useMemo(
    () => ({
      onSaveSingle: draft ? handleServerSave : undefined,
      savingSingle: saving,
    }),
    [draft, handleServerSave, saving]
  );

  if (FormComponent) {
    return (
      <SingleSaveCtx.Provider value={singleSaveValue}>
        <ChangedFieldsProvider
          originalValues={originalValues}
          draftValues={draft?.values}
          allowlistedPaths={allowlistedPaths}
          currentDefaults={currentDefaults}
        >
          <div className="h-full">
            <FormComponent
              data={data}
              rawFeature={rawFeature}
              readOnly={effectiveReadOnly}
              loading={loading}
              draftValues={deserializedDraftValues}
              draftFiles={draftFiles}
              hasDraft={isCreation || hasChanges}
              isCreation={isCreation}
              featureId={featureId}
              linkedMastId={parseStandortIdFromKey(draft?.geometryKey)}
              formHeaderContent={
                isCreation ? (
                  <div
                    className={
                      draft?.geometryKey &&
                      draft.geometryKey === draft?.prefillGeometryKey
                        ? "mb-3 draft-prefilled-field"
                        : draft?.geometryKey
                        ? "mb-3 draft-changed-field"
                        : "mb-3"
                    }
                  >
                    <span className="text-sm font-medium text-gray-700">
                      Neue Geometrien
                    </span>
                    <Select
                      value={
                        geometryOptions.some(
                          (o) => o.key === draft?.geometryKey
                        )
                          ? draft?.geometryKey
                          : undefined
                      }
                      onChange={handleGeometryChange}
                      className="w-full mt-1"
                      size="large"
                      placeholder="Messung wählen"
                      allowClear
                    >
                      {geometryOptions.map((opt) => (
                        <Select.Option key={opt.key} value={opt.key}>
                          {opt.label}
                        </Select.Option>
                      ))}
                    </Select>
                  </div>
                ) : undefined
              }
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
      </SingleSaveCtx.Provider>
    );
  }
};

export default FeaturesFormsWrapper;
