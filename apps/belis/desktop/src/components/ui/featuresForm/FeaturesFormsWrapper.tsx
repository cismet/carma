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
import { Modal, message, Select } from "antd";
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
  promoteDraftHiddenToPermanent,
} from "../../../store/slices/featuresForms";
import { getJWT } from "../../../store/slices/auth";
import type { DokumentItem } from "../DocumentPreview";
import { ChangedFieldsProvider } from "./DraftFieldHighlight";
import { LOCKED_FIELD_CLASSES } from "./readOnlyFormUtils";
import {
  getAllowlistedPaths,
  getCreationDefaults,
  recordSelectionDefaults,
  CREATION_DEFAULTS_ALLOWLIST,
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
import {
  removeMeasurements,
  addMeasurements,
} from "@carma-mapping/measurements";
import {
  buildSyntheticFeature,
  buildSyntheticFetchedData,
  enrichSyntheticProps,
} from "../../../helper/buildSyntheticFeature";
// import { mergeLineStringsClosestEndpoints } from "../../../helper/mergeLineStrings";
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
    const stashedLabel = draft?.linkedStandortLabel;
    const label =
      typeof stashedLabel === "string" ? stashedLabel : `Standort ${id}`;
    return {
      key: geometryKey,
      label,
      geometry: geometry as MeasurementGeometryOption["geometry"],
      geometryWgs84: draft?.geometryWgs84,
    };
  }, [
    isCreation,
    formKey,
    draft?.geometryKey,
    draft?.geometry,
    draft?.geometryWgs84,
    draft?.linkedStandortLabel,
  ]);

  // Fallback for the edge case where the user deletes the underlying
  // measurement via terra-draw while it's attached to this draft. The
  // attachment normally keeps the measurement in the Redux slice (just
  // hidden from terra-draw) so buildMeasurementGeometryOptions surfaces
  // it; if the user explicitly deletes it, we still want the draft to
  // remain saveable and the dropdown to show a recognizable label, so
  // reconstruct the option from the snapshot stashed on the draft.
  const measurementOption = useMemo<MeasurementGeometryOption | null>(() => {
    if (!isCreation) return null;
    const geometryKey = draft?.geometryKey;
    const geometry = draft?.geometry;
    if (!geometryKey || !geometry) return null;
    if (!geometryKey.startsWith("measurement.")) return null;
    // Still in the measurements slice (normal attached state)? Then
    // buildMeasurementGeometryOptions already covers it — only reconstruct
    // for the rare case where the measurement was deleted out from under
    // the draft.
    const stillLive = measurements.some(
      (f) => `measurement.${String(f.id)}` === geometryKey
    );
    if (stillLive) return null;
    return {
      key: geometryKey,
      label: draft?.measurementLabel ?? "Messung",
      geometry: geometry as MeasurementGeometryOption["geometry"],
    };
  }, [
    isCreation,
    draft?.geometryKey,
    draft?.geometry,
    draft?.measurementLabel,
    measurements,
  ]);

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
    // Extension drafts only accept LineString measurements — a point
    // measurement can't be auto-connected to a Leitung.
    // if (draft?.isExtension) {
    //   measurementOpts = measurementOpts.filter(
    //     (o) => o.geometry.type === "LineString"
    //   );
    // }
    const base = standortOption
      ? [standortOption, ...measurementOpts]
      : measurementOpts;
    // This draft's own assigned-and-deleted measurement, prepended so the
    // Select can render its label and the value-match logic resolves it.
    return measurementOption ? [measurementOption, ...base] : base;
  }, [
    measurements,
    standortOption,
    measurementOption,
    consumedByOtherDrafts,
    // draft?.isExtension,
  ]);
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

  // Bring a previously-attached measurement back into terra-draw. The
  // measurement stays in Redux while attached (so the dropdown can render
  // it) but is hidden from terra-draw; releasing the attachment makes it
  // visible and editable again. No-op when there was no prior measurement
  // attachment or its Redux record is gone.
  const restoreAttachedMeasurement = useCallback(
    (geometryKey: string | undefined) => {
      if (!geometryKey || !geometryKey.startsWith("measurement.")) return;
      const feature = measurements.find(
        (f) => `measurement.${String(f.id)}` === geometryKey
      );
      if (!feature) return;
      const rawId = String(feature.id).replace(/^measurement\./, "");
      addMeasurements([{ ...feature, id: rawId }]);
    },
    [measurements]
  );

  const handleCancel = useCallback(() => {
    if (featureId) {
      // Bring any attached measurement back into terra-draw before the
      // draft goes away — discarding the draft must not silently destroy
      // the user's measurement work.
      restoreAttachedMeasurement(draft?.geometryKey);
      dispatch(removeDraft(featureId));
      onSelectNextDraft?.(featureId);
    }
    setIsEditing(false);
  }, [
    featureId,
    dispatch,
    onSelectNextDraft,
    draft?.geometryKey,
    restoreAttachedMeasurement,
  ]);

  const handleSaveComplete = useCallback(() => {
    if (featureId) {
      // Update baseline to the saved values so subsequent edits highlight correctly.
      // Skip when draft.values is empty (file-only saves) to avoid wiping the
      // proper baseline with {} – that would break dirty-field detection.
      if (draft?.values && Object.keys(draft.values).length > 0) {
        dispatch(setOriginalValues({ featureId, values: draft.values }));
      }
      // Promote hiddenOriginalIds before removing the draft so the parent
      // Standort (etc.) stays suppressed on the regular vector layers until
      // the brandnew tile contains the new record.
      dispatch(promoteDraftHiddenToPermanent(featureId));
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

    // Brandnew (creation) drafts without a geometry would be POSTed with no
    // geom field, producing a NULL-geometry row server-side that surfaces
    // the next day as a malformed feature in brand.new.features.json and
    // breaks the symbol layer's rendering pass. Stop here and explain.
    if (draft.isCreation && !draft.geometry) {
      Modal.warning({
        title: "Geometrie fehlt",
        content:
          "Bitte weisen Sie diesem Entwurf zuerst eine Geometrie zu, bevor Sie ihn speichern.",
        okText: "OK",
      });
      return;
    }

    setSaving(true);
    try {
      const result = await saveFeatureDraft(jwt, featureId, draft);
      if (result.success) {
        dispatch(promoteDraftHiddenToPermanent(featureId));
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

  // Extension drafts ("Leitung verlängern") carry the source Leitung's id on
  // the synthetic feature so sidebar/sticky header/InfoBox render "L-13564"
  // instead of the "???" placeholder. Re-apply on every rebuild — form-change
  // values come from getFieldsValue() and wouldn't carry it otherwise.
  // const withExtensionId = (
  //   props: Record<string, unknown>
  // ): Record<string, unknown> =>
  //   draft?.isExtension && draft.extendingLeitungId != null
  //     ? { ...props, _originalId: draft.extendingLeitungId }
  //     : props;
  const withExtensionId = (
    props: Record<string, unknown>
  ): Record<string, unknown> => props;

  const handleDraftChange = useCallback(
    (values: Record<string, unknown>) => {
      if (!featureId || !formKey) return;

      if (isCreation) {
        // Rebuild the synthetic feature so denormalized props (e.g.
        // leitung.bezeichnung from fk_leitungstyp) flow into the mini-map
        // render and trigger the right per-type style. The Bestand-Leuchten
        // count (set at draft open from the linked Standort tile; refreshed
        // by setDraftBestandLeuchten when the mast fetch resolves) feeds the
        // leuchten icon's dot count formula.
        const enrichedValues = enrichSyntheticProps(
          formKey,
          values,
          keyTablesData,
          draft?.bestandLeuchtenCount ?? 0
        );
        const newFeature = buildSyntheticFeature(
          formKey,
          featureId,
          withExtensionId(enrichedValues),
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
      draft?.bestandLeuchtenCount,
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
        keyTablesData,
        draft?.bestandLeuchtenCount ?? 0
      );
      const previousGeometryKey = draft?.geometryKey;
      // Clear case: user hit the "x" in the allowClear select.
      if (!newKey) {
        // Extension drafts always have something to show — fall back to the
        // original Leitung line so the brandnew layer keeps rendering, and
        // dispatch via setDraft (clearDraftGeometry would also wipe the
        // geometry, which we don't want here).
        // if (draft?.isExtension && draft.originalGeometryEpsg25832) {
        //   const newFeature = buildSyntheticFeature(
        //     formKey,
        //     featureId,
        //     withExtensionId(enrichedValues),
        //     draft.originalGeometryEpsg25832
        //   );
        //   dispatch(
        //     setDraft({
        //       featureId,
        //       featureType: formKey,
        //       values: currentValues,
        //       feature: newFeature,
        //       fetchedData: buildSyntheticFetchedData(
        //         formKey,
        //         deserializeValues(currentValues)
        //       ),
        //       isCreation: true,
        //       geometry: draft.originalGeometryEpsg25832,
        //       geometryKey: undefined,
        //       measurementLabel: undefined,
        //     })
        //   );
        //   restoreAttachedMeasurement(previousGeometryKey);
        //   if (selectedFeatureId) {
        //     selectFeature(selectedFeatureId, newFeature as never);
        //   }
        //   return;
        // }
        const newFeature = buildSyntheticFeature(
          formKey,
          featureId,
          withExtensionId(enrichedValues),
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
        // Releasing the attachment — bring the measurement back into
        // terra-draw so the user sees it again on the map.
        restoreAttachedMeasurement(previousGeometryKey);
        if (selectedFeatureId) {
          selectFeature(selectedFeatureId, newFeature as never);
        }
        return;
      }
      const opt = geometryOptions.find((o) => o.key === newKey);
      if (!opt) return;
      // Extension flow: the dispatched geometry is the original line + picked
      // line, auto-joined at the closest endpoints. The picked option stays
      // as the geometryKey so the dropdown still shows the user's choice.
      // const geom =
      //   draft?.isExtension &&
      //   draft.originalGeometryEpsg25832?.type === "LineString" &&
      //   opt.geometry.type === "LineString"
      //     ? mergeLineStringsClosestEndpoints(
      //         draft.originalGeometryEpsg25832,
      //         opt.geometry
      //       )
      //     : opt.geometry;
      const geom = opt.geometry;
      const isMeasurement = newKey.startsWith("measurement.");
      const newFeature = buildSyntheticFeature(
        formKey,
        featureId,
        withExtensionId(enrichedValues),
        geom
      );
      // Switching to a different geometry — restore the previous
      // measurement attachment (if any) before consuming the new one.
      // Same-key re-pick is a no-op for restore (the feature isn't in
      // terra-draw to begin with).
      if (previousGeometryKey && previousGeometryKey !== newKey) {
        restoreAttachedMeasurement(previousGeometryKey);
      }
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
          geometryWgs84: opt.geometryWgs84,
          // Stash the label as a fallback for the case where the user
          // deletes the underlying measurement from terra-draw while it's
          // attached — the dropdown then falls back to this label.
          measurementLabel: isMeasurement ? opt.label : undefined,
        })
      );
      // Hide the measurement from terra-draw while it backs the draft —
      // the draft renders its own styled feature in its place. The
      // measurement stays in Redux so the dropdown can still show it and
      // a later detach can restore it without data loss.
      if (isMeasurement) {
        const consumed = measurements.find(
          (f) => `measurement.${String(f.id)}` === newKey
        );
        if (consumed) {
          const rawId = String(consumed.id).replace(/^measurement\./, "");
          removeMeasurements([rawId]);
        }
      }
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
      draft?.bestandLeuchtenCount,
      draft?.geometryKey,
      geometryOptions,
      keyTablesData,
      measurements,
      dispatch,
      selectedFeatureId,
      selectFeature,
      restoreAttachedMeasurement,
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
        const serialized = serializeValues(values);
        dispatch(setOriginalValues({ featureId, values: serialized }));
        // Selecting an existing feature in Fachobjekte seeds the per-form "+"
        // button's memory (selectionDefaults) for that type, so it creates the
        // next draft pre-filled with this feature's allowlisted fields. The
        // toolbar dropdown reads a separate memory and is unaffected. Skip
        // creation drafts — their memory is owned by the draft-edit path (#645).
        if (
          !isCreation &&
          formKey &&
          CREATION_DEFAULTS_ALLOWLIST[formKey] != null
        ) {
          dispatch(
            recordSelectionDefaults({
              featureType: formKey,
              values: serialized,
            })
          );
        }
      }
    },
    [featureId, formKey, isCreation, dispatch]
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
                      draft?.geometryKey?.startsWith(STANDORT_OPTION_PREFIX)
                        ? `mb-3 ${LOCKED_FIELD_CLASSES}`
                        : draft?.geometryKey &&
                          draft.geometryKey === draft?.prefillGeometryKey
                        ? "mb-3 draft-prefilled-field"
                        : draft?.geometryKey
                        ? "mb-3 draft-changed-field"
                        : "mb-3"
                    }
                  >
                    <span className="text-sm font-medium text-gray-700">
                      {/* draft?.isExtension && draft.extendingLeitungId != null
                        ? `Leitung L-${draft.extendingLeitungId} verlängern`
                        : "Neue Geometrien" */}
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
