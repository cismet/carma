import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { FormInstance } from "antd";
import { message } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import type {
  BestandLeuchteEntry,
  DraftFile,
} from "../../../store/slices/featuresForms";
import {
  getTabFocusRequest,
  setDraftBestandLeuchten,
} from "../../../store/slices/featuresForms";
import { useSelector, useDispatch } from "react-redux";
import { getJWT } from "../../../store/slices/auth";
import {
  getAllowlistedPaths,
  getCreationDefaults,
  recordDefaults,
  recordSelectionDefaults,
} from "../../../store/slices/creationDefaults";
import type { RootState } from "../../../store";
import {
  serializeValues,
  deserializeValues,
} from "../../../helper/draftSerialize";
import { DokumentItem } from "../DocumentPreview";
import { getDocumentKey } from "../FilePreview";
import FeatureFormLayout from "./FeatureFormLayout";
import { useCreateFeatureDraft } from "../useCreateFeatureDraft";
import { extractListItem } from "../BelisSidebar";
import LeuchteFormFields from "./LeuchteFormFields";
import { normalizeSensorValues } from "./sensorFields";
import MastFormFields, { projectMastToFormValues } from "./MastFormFields";
import {
  fetchFeatureById,
  updateDataByClassName,
} from "../../../helper/apiMethods";
import { uploadDraftFiles } from "../../../helper/uploadDraftFiles";
import {
  ChangedFieldsProvider,
  FieldPrefix,
  LockedFields,
} from "./DraftFieldHighlight";
import { useRepeatableChanges } from "./useRepeatableChanges";
import dayjs from "dayjs";
import { useFeatureRights } from "./FeatureRightsContext";

const transformDatesForBackend = (
  values: Record<string, unknown>
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (dayjs.isDayjs(value)) {
      result[key] = value.format("YYYY-MM-DDTHH:mm:ss");
    } else {
      result[key] = value;
    }
  }
  return result;
};

// Leuchte fields mirrored from the Standort tab. A change touching only these
// is a programmatic sync, not a user edit.
const SYNTHETIC_SYNC_FIELDS = new Set([
  "strassenschluessel_pk",
  "strassenschluessel_strasse",
  "fk_strassenschluessel",
  "fk_kennziffer",
  "lfd_nummer",
]);
const isSyntheticLeuchteChange = (
  changedValues: Record<string, unknown>
): boolean => {
  const keys = Object.keys(changedValues);
  return keys.length > 0 && keys.every((k) => SYNTHETIC_SYNC_FIELDS.has(k));
};

// Flattens a server Leuchte into the `draftValues.leuchte` form shape, to seed
// a new Leuchte from an existing one on the Standort. Mast-owned fields and
// Leuchtennummer are omitted.
const projectBestandLeuchteToFormValues = (
  leuchte: Record<string, unknown>
): Record<string, unknown> => {
  const leuchtentyp = leuchte.tkey_leuchtentyp as
    | Record<string, unknown>
    | undefined;
  const energielieferant = leuchte.tkey_energielieferant as
    | Record<string, unknown>
    | undefined;
  const rundsteuerempfaenger = leuchte.rundsteuerempfaengerObject as
    | Record<string, unknown>
    | undefined;
  const dk1Object = leuchte.fk_dk1Object as Record<string, unknown> | undefined;
  const dk2Object = leuchte.fk_dk2Object as Record<string, unknown> | undefined;
  const unterhLeuchte = leuchte.tkey_unterh_leuchte as
    | Record<string, unknown>
    | undefined;
  const leuchtmittelObj = leuchte.leuchtmittelObject as
    | Record<string, unknown>
    | undefined;
  const toDayjs = (v: unknown) =>
    v == null || v === "" ? null : dayjs(v as string | number | Date);
  return {
    fk_leuchttyp: leuchtentyp?.id ?? null,
    inbetriebnahme_leuchte: toDayjs(leuchte.inbetriebnahme_leuchte),
    zaehler: leuchte.zaehler,
    montagefirma_leuchte: leuchte.montagefirma_leuchte,
    fk_energielieferant: energielieferant?.id ?? null,
    schaltstelle: leuchte.schaltstelle,
    rundsteuerempfaenger: rundsteuerempfaenger?.id ?? null,
    einbaudatum: toDayjs(leuchte.einbaudatum),
    fk_dk1: dk1Object?.id ?? leuchte.fk_dk1,
    anzahl_1dk: leuchte.anzahl_1dk,
    anschlussleistung_1dk: leuchte.anschlussleistung_1dk,
    fk_dk2: dk2Object?.id ?? leuchte.fk_dk2,
    anzahl_2dk: leuchte.anzahl_2dk,
    anschlussleistung_2dk: leuchte.anschlussleistung_2dk,
    fk_unterhaltspflicht_leuchte: unterhLeuchte?.id ?? null,
    wechseldatum: toDayjs(leuchte.wechseldatum),
    naechster_wechsel: toDayjs(leuchte.naechster_wechsel),
    leuchtmittel: leuchtmittelObj?.id ?? leuchte.leuchtmittel,
    lebensdauer: leuchte.lebensdauer,
    sonderturnus: toDayjs(leuchte.wartungszyklus),
    vorschaltgeraet: leuchte.vorschaltgeraet,
    wechselvorschaltgeraet: toDayjs(leuchte.wechselvorschaltgeraet),
    bemerkungen: leuchte.bemerkungen,
  };
};

interface LeuchteFormProps {
  data: Record<string, unknown> | null;
  rawFeature?: { properties?: Record<string, unknown> } | null;
  onClose?: () => void;
  readOnly?: boolean;
  loading?: boolean;
  draftValues?: Record<string, unknown>;
  draftFiles?: DraftFile[];
  hasDraft?: boolean;
  isCreation?: boolean;
  /** Draft/feature identity; resets the field components on draft switch. */
  featureId?: string;
  /** Creation only: link the new Leuchte to this Mast (shown read-only). */
  linkedMastId?: number;
  formHeaderContent?: ReactNode;
  onDraftChange?: (values: Record<string, unknown>) => void;
  onDraftFilesChange?: (files: DraftFile[]) => void;
  onOriginalValues?: (values: Record<string, unknown>) => void;
  onToggleReadOnly?: () => void;
  onCancel?: () => void;
  onSaveComplete?: () => void;
  removedDocumentKeys?: Set<string>;
  onRemovedDocumentKeysChange?: (keys: Set<string>) => void;
}

const LeuchteForm = ({
  data,
  rawFeature,
  onClose,
  readOnly = true,
  loading,
  draftValues,
  draftFiles,
  hasDraft,
  isCreation,
  featureId,
  linkedMastId,
  formHeaderContent,
  onDraftChange,
  onDraftFilesChange,
  onOriginalValues,
  onToggleReadOnly,
  onCancel,
  onSaveComplete,
  removedDocumentKeys: removedDocumentKeysProp,
  onRemovedDocumentKeysChange,
}: LeuchteFormProps) => {
  const { fieldsReadOnly } = useFeatureRights();
  const removedDocumentKeys = removedDocumentKeysProp ?? new Set<string>();
  const dispatch = useDispatch();
  const [saving, setSaving] = useState(false);
  const [localDocuments, setLocalDocuments] = useState<DokumentItem[] | null>(
    null
  );
  // Leuchte 1's form; its values build the save payload.
  const primaryFormRef = useRef<FormInstance | null>(null);
  // Bumped when Leuchte 1 is removed, to remount it with the promoted values.
  const [primaryFormResetKey, setPrimaryFormResetKey] = useState(0);

  const originalValuesRef = useRef<Record<string, unknown>>({});

  // Draft the user actually edited; only it may update the shared defaults.
  const editedDraftIdRef = useRef<string | undefined>(undefined);

  const handleLeuchteOriginalValues = useCallback(
    (values: Record<string, unknown>) => {
      originalValuesRef.current = {
        ...originalValuesRef.current,
        leuchte: values,
      };
      onOriginalValues?.(originalValuesRef.current);
    },
    [onOriginalValues]
  );

  const handleMastOriginalValues = useCallback(
    (values: Record<string, unknown>) => {
      originalValuesRef.current = {
        ...originalValuesRef.current,
        mast: values,
      };
      onOriginalValues?.(originalValuesRef.current);
    },
    [onOriginalValues]
  );

  // Last edited Leuchte tab ("main" = Leuchte 1, else `_tabId`); reset per draft.
  const [lastEditedLeuchteTabId, setLastEditedLeuchteTabId] =
    useState<string>("main");
  useEffect(() => {
    setLastEditedLeuchteTabId("main");
  }, [featureId]);

  // Visible tab ("general" = Leuchte 1, else `_tabId`); seeds the header "+".
  const [activeFormTabKey, setActiveFormTabKey] = useState<string>("general");

  const handleLeuchteValuesChange = useCallback(
    (
      changedValues: Record<string, unknown>,
      allValues: Record<string, unknown>
    ) => {
      // Mirror syncs are not user edits.
      if (!isSyntheticLeuchteChange(changedValues)) {
        setLastEditedLeuchteTabId("main");
        editedDraftIdRef.current = featureId;
      }
      onDraftChange?.({
        ...draftValues,
        leuchte: allValues,
      });
    },
    [onDraftChange, draftValues, featureId]
  );

  const handleMastValuesChange = useCallback(
    (
      _changedValues: Record<string, unknown>,
      allValues: Record<string, unknown>
    ) => {
      editedDraftIdRef.current = featureId;
      onDraftChange?.({
        ...draftValues,
        mast: allValues,
      });
    },
    [onDraftChange, draftValues, featureId]
  );

  // Wiederholfelder (header copy/paste), Leuchte slice only.
  const handleRepeatablePaste = useCallback(
    (formValues: Record<string, unknown>) => {
      editedDraftIdRef.current = featureId;
      onDraftChange?.({ ...draftValues, leuchte: formValues });
    },
    [onDraftChange, draftValues, featureId]
  );
  const repeatableChanges = useRepeatableChanges({
    featureType: "leuchte",
    slice: "leuchte",
    formRef: primaryFormRef,
    onPaste: handleRepeatablePaste,
  });

  const handleSave = async () => {
    if (!jwt) {
      message.error("Nicht authentifiziert");
      return;
    }

    const leuchteId = leuchtenArray?.[0]?.id as number | undefined;
    if (!leuchteId) {
      message.error("Keine Leuchten-ID gefunden");
      return;
    }

    const primaryForm = primaryFormRef.current;
    if (!primaryForm) {
      return;
    }

    setSaving(true);
    try {
      // Only Leuchte 1 is saved; extra tabs are local-only for now.
      const formValues = primaryForm.getFieldsValue();

      // Not accepted by the backend under these names.
      const {
        strassenschluessel_pk,
        strassenschluessel_strasse,
        sonderturnus,
        ...rest
      } = formValues;

      let uploadedDocuments: DokumentItem[] = [];
      if (draftFiles && draftFiles.length > 0) {
        uploadedDocuments = await uploadDraftFiles(jwt, draftFiles);
      }

      // Existing minus removed, plus uploaded.
      const hasDocumentChanges =
        uploadedDocuments.length > 0 || removedDocumentKeys.size > 0;
      let finalDokumenteArray: DokumentItem[] | undefined;
      if (hasDocumentChanges) {
        const kept = documents.filter(
          (doc) => !removedDocumentKeys.has(getDocumentKey(doc))
        );
        finalDokumenteArray = [...kept, ...uploadedDocuments];
      }

      const dataToSave = transformDatesForBackend(
        normalizeSensorValues({
          id: leuchteId,
          ...rest,
          // Form "sonderturnus" is "wartungszyklus" on the server.
          ...(sonderturnus !== undefined
            ? { wartungszyklus: sonderturnus }
            : {}),
          ...(finalDokumenteArray !== undefined
            ? { dokumenteArray: finalDokumenteArray }
            : {}),
        })
      );

      await updateDataByClassName(jwt, "tdta_leuchten", dataToSave);

      if (hasDocumentChanges && finalDokumenteArray) {
        setLocalDocuments(finalDokumenteArray);
        onRemovedDocumentKeysChange?.(new Set());
      }

      if (removedDocumentKeys.size > 0) {
        message.success(
          removedDocumentKeys.size === 1
            ? "1 Datei gelöscht"
            : `${removedDocumentKeys.size} Dateien gelöscht`
        );
      }
      message.success("Leuchte gespeichert");
      onSaveComplete?.();
    } catch (error) {
      console.error("Save error:", error);
      message.error(
        error instanceof Error ? error.message : "Fehler beim Speichern"
      );
    } finally {
      setSaving(false);
    }
  };
  const [mastData, setMastData] = useState<Record<string, unknown> | null>(
    null
  );
  const [isMastLoading, setIsMastLoading] = useState(false);
  // Extra Leuchten tabs (creation only), in tab order; `_tabId` is the key.
  const extraLeuchten = (draftValues?.leuchten ?? []) as Array<
    Record<string, unknown>
  >;
  // Values of the last edited Leuchte tab, recorded into creationDefaults.
  const referenceLeuchteValues = useMemo(() => {
    if (lastEditedLeuchteTabId !== "main") {
      const entry = extraLeuchten.find(
        (e) => e._tabId === lastEditedLeuchteTabId
      );
      if (entry) {
        const { _tabId: _unused, ...rest } = entry;
        void _unused;
        return rest as Record<string, unknown>;
      }
    }
    return (draftValues?.leuchte ?? {}) as Record<string, unknown>;
  }, [lastEditedLeuchteTabId, extraLeuchten, draftValues]);
  // Record the last edited tab + Mast into creationDefaults; the slice's own
  // listener only sees Leuchte 1. Layout effect so highlights don't flash gray.
  useLayoutEffect(() => {
    if (!isCreation) return;
    // Only a genuinely edited draft may record, once per edit.
    if (editedDraftIdRef.current == null) return;
    if (editedDraftIdRef.current !== featureId) return;
    editedDraftIdRef.current = undefined;
    const recordPayload = {
      featureType: "leuchte",
      values: {
        leuchte: serializeValues(referenceLeuchteValues),
        mast: serializeValues(
          (draftValues?.mast ?? {}) as Record<string, unknown>
        ),
      },
    };
    dispatch(recordDefaults(recordPayload));
    // Keep selectionDefaults in sync, including a full clear.
    dispatch(recordSelectionDefaults(recordPayload));
  }, [
    isCreation,
    referenceLeuchteValues,
    draftValues?.mast,
    dispatch,
    featureId,
  ]);

  // Shared "last values" every Leuchte tab diffs against (green = current).
  const leuchteCreationDefaults = useSelector((state: RootState) =>
    getCreationDefaults(state, "leuchte")
  );
  // Stored serialized; deserialize so dates compare as dayjs.
  const leuchteDefaultsForDiff = useMemo(
    () => ({
      leuchte: deserializeValues(
        (leuchteCreationDefaults?.leuchte as Record<string, unknown>) ?? {}
      ),
    }),
    [leuchteCreationDefaults]
  );
  // Paths like "leuchte.fk_leuchttyp" for the per-tab highlight providers.
  const leuchteAllowlistedPaths = useMemo(
    () => getAllowlistedPaths("leuchte"),
    []
  );
  // Same fields without the "leuchte." prefix, for seeding new tabs.
  const leuchteAllowlistedFields = useMemo(
    () =>
      [...leuchteAllowlistedPaths]
        .filter((p) => p.startsWith("leuchte."))
        .map((p) => p.slice("leuchte.".length)),
    [leuchteAllowlistedPaths]
  );
  const handleAddLeuchteTab = useCallback(() => {
    const current = (draftValues?.leuchten ?? []) as Array<
      Record<string, unknown>
    >;
    const baseSlice = draftValues?.leuchte as
      | Record<string, unknown>
      | undefined;
    const baseNumber =
      typeof baseSlice?.leuchtennummer === "number"
        ? (baseSlice.leuchtennummer as number)
        : typeof baseSlice?.leuchtennummer === "string" &&
          baseSlice.leuchtennummer !== ""
        ? Number(baseSlice.leuchtennummer)
        : 0;
    // Seed from the visible Leuchte tab, else the last edited one. Only
    // allowlisted fields carry over; leuchtennummer is always auto-assigned.
    let sourceSlice: Record<string, unknown>;
    if (activeFormTabKey === "general") {
      sourceSlice = baseSlice ?? {};
    } else if (activeFormTabKey?.startsWith("extra-")) {
      const entry = current.find((e) => e._tabId === activeFormTabKey);
      if (entry) {
        const { _tabId: _unused, ...rest } = entry;
        void _unused;
        sourceSlice = rest as Record<string, unknown>;
      } else {
        sourceSlice = referenceLeuchteValues;
      }
    } else {
      sourceSlice = referenceLeuchteValues;
    }
    // Like the header "+": record the source values into both memories.
    const recordPayload = {
      featureType: "leuchte",
      values: {
        leuchte: serializeValues(sourceSlice),
        mast: serializeValues(
          (draftValues?.mast ?? {}) as Record<string, unknown>
        ),
      },
    };
    dispatch(recordDefaults(recordPayload));
    dispatch(recordSelectionDefaults(recordPayload));
    const rehydratedSeed: Record<string, unknown> = {};
    for (const f of leuchteAllowlistedFields) {
      const v = sourceSlice[f];
      if (v !== undefined && v !== null && v !== "") {
        rehydratedSeed[f] = v;
      }
    }
    // redux-persist can strip the dayjs prototype; DatePicker needs it.
    for (const dateKey of ["inbetriebnahme_leuchte"]) {
      const raw = rehydratedSeed[dateKey];
      if (raw == null || raw === "") {
        delete rehydratedSeed[dateKey];
        continue;
      }
      const d = dayjs.isDayjs(raw) ? raw : dayjs(raw as string | number | Date);
      rehydratedSeed[dateKey] = d.isValid() ? d : null;
    }
    const newTabId = `extra-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    const newEntry: Record<string, unknown> = {
      ...rehydratedSeed,
      _tabId: newTabId,
      leuchtennummer: baseNumber + current.length + 1,
    };
    onDraftChange?.({
      ...draftValues,
      leuchten: [...current, newEntry],
    });
    return newTabId;
  }, [
    draftValues,
    onDraftChange,
    leuchteAllowlistedFields,
    activeFormTabKey,
    referenceLeuchteValues,
    dispatch,
  ]);
  const handleRemoveLeuchteTab = useCallback(
    (id: string) => {
      const current = (draftValues?.leuchten ?? []) as Array<
        Record<string, unknown>
      >;
      const next = current.filter((entry) => entry._tabId !== id);
      const nextDraft: Record<string, unknown> = { ...draftValues };
      if (next.length > 0) {
        nextDraft.leuchten = next;
      } else {
        delete nextDraft.leuchten;
      }
      onDraftChange?.(nextDraft);
    },
    [draftValues, onDraftChange]
  );
  // Remove Leuchte 1 by promoting `leuchten[0]`; remount its form.
  const handleRemoveFirstLeuchte = useCallback(() => {
    const current = (draftValues?.leuchten ?? []) as Array<
      Record<string, unknown>
    >;
    if (current.length === 0) return;
    const [promoted, ...rest] = current;
    const { _tabId: promotedTabId, ...promotedFields } = promoted;
    void promotedTabId;
    const nextDraft: Record<string, unknown> = {
      ...draftValues,
      leuchte: promotedFields,
    };
    if (rest.length > 0) {
      nextDraft.leuchten = rest;
    } else {
      delete nextDraft.leuchten;
    }
    setLastEditedLeuchteTabId("main");
    editedDraftIdRef.current = featureId;
    setPrimaryFormResetKey((n) => n + 1);
    onDraftChange?.(nextDraft);
  }, [draftValues, onDraftChange, featureId]);
  const handleExtraValuesChange = useCallback(
    (
      tabId: string,
      changedValues: Record<string, unknown>,
      allValues: Record<string, unknown>
    ) => {
      const current = (draftValues?.leuchten ?? []) as Array<
        Record<string, unknown>
      >;
      const idx = current.findIndex((entry) => entry._tabId === tabId);
      if (idx < 0) return;
      const next = [...current];
      next[idx] = { ...allValues, _tabId: tabId };
      // Mirror syncs are not user edits.
      if (!isSyntheticLeuchteChange(changedValues)) {
        setLastEditedLeuchteTabId(tabId);
        editedDraftIdRef.current = featureId;
      }
      onDraftChange?.({
        ...draftValues,
        leuchten: next,
      });
    },
    [draftValues, onDraftChange, featureId]
  );
  const jwt = useSelector(getJWT);
  const createFeatureDraft = useCreateFeatureDraft();

  // Forward sidebar tab-focus requests that target this draft.
  const tabFocusRequest = useSelector(getTabFocusRequest);
  const layoutTabFocus = useMemo(
    () =>
      tabFocusRequest && tabFocusRequest.draftKey === featureId
        ? { tabKey: tabFocusRequest.tabKey, nonce: tabFocusRequest.nonce }
        : undefined,
    [tabFocusRequest, featureId]
  );

  const handleToggleRemoveDocument = useCallback(
    (key: string) => {
      const next = new Set(removedDocumentKeys);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      onRemovedDocumentKeysChange?.(next);
    },
    [removedDocumentKeys, onRemovedDocumentKeysChange]
  );

  useEffect(() => {
    setLocalDocuments(null);
  }, [data]);

  const leuchteData = data as Record<string, unknown>;
  const leuchtenArray = leuchteData?.tdta_leuchten as
    | Array<Record<string, unknown>>
    | undefined;
  const serverDocuments: DokumentItem[] =
    (leuchtenArray?.[0]?.dokumenteArray as DokumentItem[]) || [];
  const documents = localDocuments ?? serverDocuments;

  const leuchte = leuchtenArray?.[0] || null;

  const standortMast = leuchte?.tdta_standort_mast as
    | Record<string, unknown>
    | undefined;
  const mastId = standortMast?.id as number | undefined;

  // Documents of related entities
  const leuchtenTyp = leuchte?.tkey_leuchtentyp as
    | Record<string, unknown>
    | undefined;
  const leuchtenTypDocuments =
    (leuchtenTyp?.dokumenteArray as DokumentItem[]) ?? [];
  const standortMastDocuments =
    (standortMast?.dokumenteArray as DokumentItem[]) ?? [];

  const leuchtenTypTitle = leuchtenTyp?.typenbezeichnung
    ? `Leuchtentyp (${leuchtenTyp.typenbezeichnung as string})`
    : "Leuchtentyp";

  const extraDocumentSections = [
    { title: leuchtenTypTitle, documents: leuchtenTypDocuments },
    // { title: "Mast", documents: standortMastDocuments },
  ];

  // Existing Leuchte's Mast, or the Standort preselected during creation.
  const effectiveMastId = mastId ?? linkedMastId;
  useEffect(() => {
    if (effectiveMastId && jwt) {
      setIsMastLoading(true);
      fetchFeatureById(jwt, effectiveMastId, "mast")
        .then((result) => {
          const mastArray = result?.tdta_standort_mast as
            | Array<Record<string, unknown>>
            | undefined;
          setMastData(mastArray?.[0] || null);
        })
        .catch((error) => {
          console.error("Failed to fetch mast data:", error);
          setMastData(null);
        })
        .finally(() => {
          setIsMastLoading(false);
        });
    } else {
      setMastData(null);
    }
  }, [effectiveMastId, jwt]);

  // View mode has no Mast tab, so report the fetched Mast as original values;
  // otherwise the green "+" would seed an empty Standort.
  useEffect(() => {
    if (isCreation) return;
    if (!mastData) return;
    handleMastOriginalValues(projectMastToFormValues(mastData));
  }, [isCreation, mastData, handleMastOriginalValues]);

  // Once per mast fetch: (a) copy Strassenschluessel/Kennziffer/lfd_nummer into
  // the Mast slice, (b) seed the Leuchte slice from the lowest-numbered existing
  // Leuchte. One effect, so both writes use the same draftValues.
  const linkedMastHydratedForRef = useRef<unknown>(undefined);
  useEffect(() => {
    if (linkedMastId == null) return;
    if (!mastData) return;
    if (linkedMastHydratedForRef.current === mastData) return;
    linkedMastHydratedForRef.current = mastData;

    // (a) Mast slice
    const ssel = mastData.tkey_strassenschluessel as
      | Record<string, unknown>
      | undefined;
    const kennziffer = mastData.tkey_kennziffer as
      | Record<string, unknown>
      | undefined;
    const existingMast = (draftValues?.mast ?? {}) as Record<string, unknown>;
    const nextMast: Record<string, unknown> = { ...existingMast };
    if (ssel) {
      nextMast.strassenschluessel_pk = ssel.pk;
      nextMast.strassenschluessel_strasse = ssel.strasse;
      nextMast.fk_strassenschluessel = ssel.id;
    }
    if (kennziffer?.id != null) {
      nextMast.fk_kennziffer = kennziffer.id;
    }
    if (mastData.lfd_nummer != null) {
      nextMast.lfd_nummer = mastData.lfd_nummer;
    }

    // (b) Leuchte slice; deduped because the mast query can repeat Leuchten.
    const rawBestand = (mastData.leuchtenArray ?? []) as Array<
      Record<string, unknown>
    >;
    const seenBestandIds = new Set<number | string>();
    const dedupedBestand: Array<Record<string, unknown>> = [];
    for (const entry of rawBestand) {
      const id = entry.id as number | string | undefined;
      if (id == null) continue;
      if (seenBestandIds.has(id)) continue;
      seenBestandIds.add(id);
      dedupedBestand.push(entry);
    }
    const sortedBestand = dedupedBestand.sort((a, b) => {
      const an = Number(a.leuchtennummer);
      const bn = Number(b.leuchtennummer);
      const aFinite = Number.isFinite(an);
      const bFinite = Number.isFinite(bn);
      if (aFinite && bFinite) return an - bn;
      if (aFinite) return -1;
      if (bFinite) return 1;
      return 0;
    });
    const existingLeuchte = (draftValues?.leuchte ?? {}) as Record<
      string,
      unknown
    >;
    let nextLeuchte: Record<string, unknown> | undefined;
    if (sortedBestand.length > 0) {
      const seed = projectBestandLeuchteToFormValues(sortedBestand[0]);
      // User input beats the template.
      for (const [k, v] of Object.entries(existingLeuchte)) {
        if (v === undefined || v === null || v === "") continue;
        seed[k] = v;
      }
      // Keep the auto-assigned number.
      if (existingLeuchte.leuchtennummer !== undefined) {
        seed.leuchtennummer = existingLeuchte.leuchtennummer;
      }
      nextLeuchte = seed;
    }

    onDraftChange?.({
      ...draftValues,
      mast: nextMast,
      ...(nextLeuchte ? { leuchte: nextLeuchte } : {}),
    });

    if (nextLeuchte) {
      dispatch(
        recordDefaults({
          featureType: "leuchte",
          values: { leuchte: serializeValues(nextLeuchte) },
        })
      );
    }
  }, [linkedMastId, mastData, draftValues, onDraftChange, dispatch]);

  // The selected feature is a click-time snapshot; prefer the fetched record.
  const fetchedLeuchte = leuchtenArray?.[0];
  const fetchedTyp = fetchedLeuchte?.tkey_leuchtentyp as
    | { leuchtentyp?: string; fabrikat?: string }
    | undefined;
  const rawProps =
    !isCreation &&
    fetchedLeuchte &&
    String(fetchedLeuchte.id) === String(rawFeature?.properties?.id)
      ? {
          ...rawFeature?.properties,
          lfd_nummer: fetchedLeuchte.lfd_nummer,
          leuchtennummer: fetchedLeuchte.leuchtennummer,
          leuchtentyp: fetchedTyp?.leuchtentyp,
          fabrikat: fetchedTyp?.fabrikat,
        }
      : rawFeature?.properties;
  const subtitle =
    (rawProps?.fabrikat as string) ||
    (rawProps?.leuchttyp_fabrikat as string) ||
    "-ohne Fabrikat-";

  const sidebarMain = extractListItem("leuchten", {
    ...rawFeature,
    properties: rawProps,
  }).main;

  if (!data) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400">
        Keine Daten ausgewählt
      </div>
    );
  }

  // Creation only: Standort tab, read-only when a Mast is linked, otherwise
  // editable and a new Mast is created on save.
  const showCreationStandortTab = isCreation === true;
  const mastTabReadOnly = linkedMastId != null;
  // Read-only tabs for the Standort's existing Leuchten, sorted by number.
  // Deduped: the mast query can return a Leuchte several times.
  const bestandLeuchten = (() => {
    const raw = (mastData?.leuchtenArray ?? []) as Array<
      Record<string, unknown>
    >;
    const seen = new Set<number | string>();
    const unique: Array<Record<string, unknown>> = [];
    for (const entry of raw) {
      const id = entry.id as number | string | undefined;
      if (id == null) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      unique.push(entry);
    }
    return unique.sort((a, b) => {
      const an = Number(a.leuchtennummer);
      const bn = Number(b.leuchtennummer);
      const aFinite = Number.isFinite(an);
      const bFinite = Number.isFinite(bn);
      if (aFinite && bFinite) return an - bn;
      if (aFinite) return -1;
      if (bFinite) return 1;
      return 0;
    });
  })();
  const bestandOffset = bestandLeuchten.length;
  // Must match `expandDraftSidebarFeatures` so sidebar clicks focus the tab.
  const buildBestandTabKey = (
    sibling: Record<string, unknown>,
    idx: number
  ) => {
    const id = sibling.id as number | string | undefined;
    const raw = sibling.leuchtennummer;
    const leuchtennummerLabel =
      typeof raw === "number" || typeof raw === "string"
        ? String(raw)
        : undefined;
    return `bestand-${id ?? leuchtennummerLabel ?? idx}`;
  };
  // Bestand Leuchten for the sidebar rows.
  const bestandSidebarProjection = useMemo<BestandLeuchteEntry[]>(() => {
    if (!showCreationStandortTab) return [];
    const mastLfd = mastData?.lfd_nummer as number | string | undefined;
    const mastStrasse =
      ((
        mastData?.tkey_strassenschluessel as Record<string, unknown> | undefined
      )?.strasse as string | undefined) ??
      ((
        mastData?.tkey_strassenschluessel as Record<string, unknown> | undefined
      )?.bezeichnung as string | undefined);
    return bestandLeuchten
      .map<BestandLeuchteEntry | null>((sibling, idx) => {
        const id = sibling.id;
        if (typeof id !== "number") return null;
        const leuchtenTyp = sibling.tkey_leuchtentyp as
          | Record<string, unknown>
          | undefined;
        const leuchtennummerRaw = sibling.leuchtennummer;
        const leuchtennummer =
          typeof leuchtennummerRaw === "number" ||
          typeof leuchtennummerRaw === "string"
            ? leuchtennummerRaw
            : undefined;
        return {
          id,
          tabKey: buildBestandTabKey(sibling, idx),
          leuchtennummer,
          leuchtentyp:
            typeof leuchtenTyp?.leuchtentyp === "string"
              ? leuchtenTyp.leuchtentyp
              : undefined,
          fabrikat:
            typeof leuchtenTyp?.fabrikat === "string"
              ? leuchtenTyp.fabrikat
              : undefined,
          lfd_nummer: mastLfd,
          strasse: mastStrasse,
        };
      })
      .filter((entry): entry is BestandLeuchteEntry => entry !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bestandLeuchten, mastData, showCreationStandortTab]);
  // Push to the draft only when changed; an empty list clears it.
  const lastBestandSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isCreation || !featureId) return;
    const signature = JSON.stringify(bestandSidebarProjection);
    if (lastBestandSignatureRef.current === signature) return;
    lastBestandSignatureRef.current = signature;
    dispatch(
      setDraftBestandLeuchten({
        featureId,
        bestandLeuchten: bestandSidebarProjection,
      })
    );
  }, [bestandSidebarProjection, dispatch, featureId, isCreation]);
  // Creation only: extra Leuchten tabs, numbered after the Bestand tabs.
  const extraGeneralTabs = showCreationStandortTab
    ? extraLeuchten.map((entry, idx) => {
        const tabId = entry._tabId as string;
        const { _tabId: _unusedTabId, ...entryFields } = entry;
        void _unusedTabId;
        const tabNumber = bestandOffset + idx + 2;
        return {
          key: tabId,
          label: (
            <span>
              Leuchte {tabNumber}{" "}
              <CloseOutlined
                role="button"
                aria-label={`Leuchte ${tabNumber} entfernen`}
                style={{ fontSize: 10, marginLeft: 4, color: "#8c8c8c" }}
                onClick={(e) => {
                  // Keep the click from activating the tab.
                  e.stopPropagation();
                  handleRemoveLeuchteTab(tabId);
                }}
              />
            </span>
          ),
          children: (
            // Own provider so highlights use this tab's values, not Leuchte 1's.
            <ChangedFieldsProvider
              originalValues={{}}
              draftValues={{ leuchte: entryFields }}
              allowlistedPaths={
                isCreation ? leuchteAllowlistedPaths : undefined
              }
              currentDefaults={isCreation ? leuchteDefaultsForDiff : undefined}
            >
              <FieldPrefix name="leuchte">
                <LeuchteFormFields
                  leuchte={null}
                  readOnly={readOnly || fieldsReadOnly}
                  isCreation={isCreation}
                  featureId={`${featureId ?? ""}#${tabId}`}
                  hideStrassenschluessel={isCreation}
                  draftValues={entryFields}
                  mastDraftValues={
                    draftValues?.mast as Record<string, unknown> | undefined
                  }
                  onValuesChange={(changed, all) =>
                    handleExtraValuesChange(tabId, changed, all)
                  }
                />
              </FieldPrefix>
            </ChangedFieldsProvider>
          ),
        };
      })
    : [];
  const bestandTabs =
    showCreationStandortTab && bestandLeuchten.length > 0
      ? bestandLeuchten.map((sibling, idx) => {
          const tabKey = buildBestandTabKey(sibling, idx);
          return {
            key: tabKey,
            label: `Leuchte ${idx + 1}`,
            children: (
              // Locked: existing Leuchten render gray like the linked Standort.
              <FieldPrefix name="leuchte">
                <LockedFields locked={true}>
                  <LeuchteFormFields
                    leuchte={sibling}
                    readOnly={true}
                    isCreation={false}
                    featureId={`${featureId ?? ""}#${tabKey}`}
                    locked={true}
                  />
                </LockedFields>
              </FieldPrefix>
            ),
          };
        })
      : [];
  const additionalTabs = showCreationStandortTab
    ? [
        {
          key: "standort",
          label: "Standort",
          children: (
            <>
              {formHeaderContent}
              <div
                className={
                  isMastLoading
                    ? "opacity-50 pointer-events-none transition-opacity"
                    : "transition-opacity"
                }
              >
                <FieldPrefix name="mast">
                  <LockedFields locked={mastTabReadOnly}>
                    <MastFormFields
                      mast={mastTabReadOnly ? mastData : null}
                      readOnly={mastTabReadOnly}
                      isCreation={!mastTabReadOnly}
                      featureId={featureId}
                      locked={mastTabReadOnly}
                      draftValues={
                        mastTabReadOnly
                          ? undefined
                          : (draftValues?.mast as
                              | Record<string, unknown>
                              | undefined)
                      }
                      onValuesChange={handleMastValuesChange}
                      onOriginalValues={
                        mastTabReadOnly ? undefined : handleMastOriginalValues
                      }
                    />
                  </LockedFields>
                </FieldPrefix>
              </div>
            </>
          ),
        },
        ...bestandTabs,
      ]
    : [];

  // Creation wraps this in its own provider; otherwise the outer one diffs it.
  const leuchteOneContent = (
    <FieldPrefix name="leuchte">
      <LeuchteFormFields
        leuchte={leuchte}
        readOnly={readOnly || fieldsReadOnly}
        isCreation={isCreation}
        featureId={featureId}
        hideStrassenschluessel={isCreation}
        onFormInstance={(form) => {
          primaryFormRef.current = form;
        }}
        draftValues={
          draftValues?.leuchte as Record<string, unknown> | undefined
        }
        mastDraftValues={
          draftValues?.mast as Record<string, unknown> | undefined
        }
        onValuesChange={handleLeuchteValuesChange}
        onOriginalValues={handleLeuchteOriginalValues}
      />
    </FieldPrefix>
  );

  return (
    <FeatureFormLayout
      tabsResetKey={featureId}
      tabFocusRequest={layoutTabFocus}
      title={`Leuchte ${sidebarMain}`}
      cancelLabel={sidebarMain || ""}
      isCreation={isCreation}
      formHeaderContent={isCreation ? undefined : formHeaderContent}
      subtitle={subtitle}
      documents={documents}
      mainDocumentsTitle="Leuchte"
      extraDocumentSections={extraDocumentSections}
      jwt={jwt}
      draftFiles={draftFiles}
      onDraftFilesChange={onDraftFilesChange}
      removedDocumentKeys={removedDocumentKeys}
      onToggleRemoveDocument={handleToggleRemoveDocument}
      debugData={data}
      rawFeatureData={rawFeature}
      additionalTabs={additionalTabs}
      extraGeneralTabs={extraGeneralTabs}
      // Wiederholfelder, Leuchte only for now.
      showRepeatableChangesButtons
      onCopyRepeatableChanges={repeatableChanges.onCopy}
      onPasteRepeatableChanges={repeatableChanges.onPaste}
      onClearRepeatableChanges={repeatableChanges.onClear}
      repeatableChangesCount={repeatableChanges.count}
      onAddTab={showCreationStandortTab ? handleAddLeuchteTab : undefined}
      onActiveTabChange={setActiveFormTabKey}
      onCreateRelatedDraft={() => {
        // Seed from the visible Leuchte tab; `_tabId` is not allowlisted.
        if (isCreation && draftValues) {
          const activeExtra = activeFormTabKey?.startsWith("extra-")
            ? extraLeuchten.find((e) => e._tabId === activeFormTabKey)
            : undefined;
          const seedValues = activeExtra
            ? { ...draftValues, leuchte: activeExtra }
            : draftValues;
          createFeatureDraft("leuchte", { seedValues });
          return;
        }
        createFeatureDraft("leuchte", { seedFromSelection: true });
      }}
      onCopyValues={() => {
        // Remember the visible Leuchte + Mast for the next creation (view mode
        // reads the reported original values).
        const activeExtra = activeFormTabKey?.startsWith("extra-")
          ? extraLeuchten.find((e) => e._tabId === activeFormTabKey)
          : undefined;
        const source = draftValues ?? originalValuesRef.current;
        const leuchteSlice = (activeExtra ?? source.leuchte ?? {}) as Record<
          string,
          unknown
        >;
        const mastSlice = (source.mast ?? {}) as Record<string, unknown>;
        const recordPayload = {
          featureType: "leuchte",
          values: {
            leuchte: serializeValues(leuchteSlice),
            mast: serializeValues(mastSlice),
          },
        };
        dispatch(recordDefaults(recordPayload));
        dispatch(recordSelectionDefaults(recordPayload));
      }}
      generalTabLabel={
        isCreation ? (
          <span>
            Leuchte {bestandOffset + 1}
            {extraLeuchten.length > 0 && (
              <CloseOutlined
                role="button"
                aria-label={`Leuchte ${bestandOffset + 1} entfernen`}
                style={{ fontSize: 10, marginLeft: 4, color: "#8c8c8c" }}
                onClick={(e) => {
                  // Keep the click from activating the tab.
                  e.stopPropagation();
                  handleRemoveFirstLeuchte();
                }}
              />
            )}
          </span>
        ) : undefined
      }
      additionalTabsPosition={isCreation ? "before" : undefined}
      loading={loading}
      saving={saving}
      readOnly={readOnly}
      hasDraft={hasDraft || removedDocumentKeys.size > 0}
      onToggleReadOnly={onToggleReadOnly}
      onCancel={onCancel}
      onSave={handleSave}
    >
      {/* Creation: diff Leuchte 1 against the shared defaults like the extra
       * tabs. Existing features use the outer provider. */}
      {isCreation ? (
        <ChangedFieldsProvider
          key={primaryFormResetKey}
          originalValues={{}}
          draftValues={{
            leuchte: (draftValues?.leuchte ?? {}) as Record<string, unknown>,
          }}
          allowlistedPaths={leuchteAllowlistedPaths}
          currentDefaults={leuchteDefaultsForDiff}
        >
          {leuchteOneContent}
        </ChangedFieldsProvider>
      ) : (
        leuchteOneContent
      )}
    </FeatureFormLayout>
  );
};

export default LeuchteForm;
