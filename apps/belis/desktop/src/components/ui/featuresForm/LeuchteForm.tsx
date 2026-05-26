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
} from "../../../store/slices/creationDefaults";
import type { RootState } from "../../../store";
import { serializeValues, deserializeValues } from "../../../helper/draftSerialize";
import { DokumentItem } from "../DocumentPreview";
import { getDocumentKey } from "../FilePreview";
import FeatureFormLayout from "./FeatureFormLayout";
import { useCreateFeatureDraft } from "../useCreateFeatureDraft";
import { extractListItem } from "../BelisSidebar";
import LeuchteFormFields from "./LeuchteFormFields";
import MastFormFields from "./MastFormFields";
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
import dayjs from "dayjs";

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

// Fields on a Leuchte tab that are never user-editable during creation:
// Strassenschluessel/Kennziffer/Laufende Nr. are set on the Standort tab and
// only mirrored into the Leuchte form by LeuchteFormFields' subscription
// effects. A values-change touching *only* these is therefore a programmatic
// sync (it also fires when the user merely switches to a draft), not a genuine
// edit, and must not mark the draft as the one to remember.
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

// Project a server-side Leuchte record (with resolved `tkey_*` / `*Object`
// nested references) into the flat form-field shape that `draftValues.leuchte`
// carries. Mirrors the `serverValues` blob built in LeuchteFormFields, so a
// draft seeded from this is indistinguishable from one typed by hand. Used to
// pre-fill a new "+ Leuchte zu Standort N" draft from the first existing
// Leuchte on the parent Standort. Strassenschluessel / Kennziffer /
// Laufende Nr. and Leuchtennummer are omitted: the Mast slice owns the first
// three (mirrored into every tab via subscription), and Leuchtennummer is
// auto-assigned at draft-open time.
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
  const dk1Object = leuchte.fk_dk1Object as
    | Record<string, unknown>
    | undefined;
  const dk2Object = leuchte.fk_dk2Object as
    | Record<string, unknown>
    | undefined;
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
  /** Stable identity of the current draft/feature. Threaded into the field
   * components so their reset effects fire when the user switches between
   * drafts (in creation mode, where mast/leuchte are always null, identity
   * cannot be derived from those props). */
  featureId?: string;
  /** When set during creation, the new Leuchte links to this existing Mast.
   * The Mast tab then displays its data read-only (no new Mast is created). */
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
  const removedDocumentKeys = removedDocumentKeysProp ?? new Set<string>();
  const dispatch = useDispatch();
  const [saving, setSaving] = useState(false);
  const [localDocuments, setLocalDocuments] = useState<DokumentItem[] | null>(
    null
  );
  // Each LeuchteFormFields owns its own Antd Form. We only need a handle on
  // Leuchte 1 (the "primary" form) — `handleSave` reads its values to build
  // the save payload. Extra Leuchten tabs are local-only until Scope B lands.
  const primaryFormRef = useRef<FormInstance | null>(null);
  // Strassenschluessel/Kennziffer mirroring from the Standort/Mast tab into
  // each Leuchten tab now happens inside `LeuchteFormFields` itself, pulling
  // from the Mast draft slice via the `mastDraftValues` prop. No registry,
  // no broadcast, no per-form ref tracking in this parent: a newly mounted
  // tab subscribes at mount and catches up to the current Mast state.

  const originalValuesRef = useRef<Record<string, unknown>>({});

  // featureId of the draft the user has actually typed into. The recordDefaults
  // dispatch below only writes the shared cross-draft "last values" memory when
  // this matches the draft currently on screen — so merely opening or switching
  // back to another draft never re-asserts its (possibly stale) values over a
  // newer edit made in a different draft.
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

  // Tracks which Leuchte tab the user touched most recently. Its allowlisted
  // values become the "reference" both providers below diff against, so a fresh
  // edit on any tab turns that tab green and pushes the others (with stale
  // values) gray — mirroring Schaltstelle's single-record behavior across tabs.
  // "main" stands for Leuchte 1 (sourced from `draftValues.leuchte`); extra
  // tabs use their `_tabId`. Reset to "main" on draft identity changes.
  const [lastEditedLeuchteTabId, setLastEditedLeuchteTabId] =
    useState<string>("main");
  useEffect(() => {
    setLastEditedLeuchteTabId("main");
  }, [featureId]);

  const handleLeuchteValuesChange = useCallback(
    (
      changedValues: Record<string, unknown>,
      allValues: Record<string, unknown>
    ) => {
      // Ignore the programmatic Strassenschluessel/Kennziffer/Laufende-Nr.
      // syncs — they also fire on a draft the user only switched to. Only a
      // genuine field edit marks this draft as the one to remember.
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
      // The Mast slice is the single source of truth for Strassenschluessel
      // and Kennziffer. Each `LeuchteFormFields` subscribes to it via
      // `mastDraftValues` and applies values into its own form — no parent-
      // side broadcast or per-form override Map needed here anymore.
      editedDraftIdRef.current = featureId;
      onDraftChange?.({
        ...draftValues,
        mast: allValues,
      });
    },
    [onDraftChange, draftValues, featureId]
  );

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
      // Scope-A constraint: only Leuchte 1 (the primary form) is persisted to
      // the backend. Extra "+"-added Leuchten tabs are local-only until the
      // multi-save Scope B work lands.
      const formValues = primaryForm.getFieldsValue();

      // Remove display-only fields that the backend doesn't expect
      const {
        strassenschluessel_pk,
        strassenschluessel_strasse,
        sonderturnus,
        ...rest
      } = formValues;

      // Upload pending draft files first
      let uploadedDocuments: DokumentItem[] = [];
      if (draftFiles && draftFiles.length > 0) {
        uploadedDocuments = await uploadDraftFiles(jwt, draftFiles);
      }

      // Build final dokumenteArray: existing minus removed, plus newly uploaded
      const hasDocumentChanges =
        uploadedDocuments.length > 0 || removedDocumentKeys.size > 0;
      let finalDokumenteArray: DokumentItem[] | undefined;
      if (hasDocumentChanges) {
        const kept = documents.filter(
          (doc) => !removedDocumentKeys.has(getDocumentKey(doc))
        );
        finalDokumenteArray = [...kept, ...uploadedDocuments];
      }

      const dataToSave = transformDatesForBackend({
        id: leuchteId,
        ...rest,
        // Map form field "sonderturnus" back to server field "wartungszyklus"
        ...(sonderturnus !== undefined ? { wartungszyklus: sonderturnus } : {}),
        // Include updated documents array when changed
        ...(finalDokumenteArray !== undefined
          ? { dokumenteArray: finalDokumenteArray }
          : {}),
      });

      console.log("xxx saving leuchte:", JSON.stringify(dataToSave, null, 2));
      await updateDataByClassName(jwt, "tdta_leuchten", dataToSave);

      // Update local documents so changes appear immediately
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
  // Extra Leuchten tabs (creation flow only) are persisted in the Redux draft
  // under `values.leuchten` as an array of per-tab field bags. Each entry
  // carries a stable `_tabId` so React keys survive edits, and the array order
  // matches the visible tab order. Stripped from save payloads in
  // saveCreationDraft.
  const extraLeuchten = (draftValues?.leuchten ?? []) as Array<
    Record<string, unknown>
  >;
  // Values from the most recently edited Leuchte tab. These get mirrored into
  // the cross-draft `creationDefaults` memory below; that shared memory — not
  // this local value — is what every tab diffs against for the green/gray
  // highlight, so the "last value" is consistent across all Leuchten drafts.
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
  // Mirror the most-recently-edited Leuchte tab + the Mast slice into the
  // creationDefaults memory. That slice's own `setDraft` listener only reads
  // the primary `leuchte` slice (Leuchte 1) and is blind to extra-tab edits in
  // `values.leuchten[]`; a later Mast edit would also re-assert that stale
  // Leuchte 1 slice. Re-recording here on every reference/Mast change keeps
  // the next new Leuchte feature seeded from the tab last worked on.
  //
  // useLayoutEffect (not useEffect): the highlight below diffs against this
  // recorded memory, so the write must land before the browser paints —
  // otherwise an extra-tab keystroke flashes gray for one frame until the
  // memory catches up.
  useLayoutEffect(() => {
    if (!isCreation) return;
    // Only the draft the user actually edited may update the shared memory.
    // On mount — or when switching back to an untouched draft — this guard is
    // false, so the form never re-records its own (potentially stale) values
    // over a newer edit made in a different draft.
    if (editedDraftIdRef.current == null) return;
    if (editedDraftIdRef.current !== featureId) return;
    // Consume the signal: record exactly once per genuine edit. A later
    // re-render of this same draft (e.g. on switching back to it) then finds
    // the ref cleared and won't re-assert its now-stale values.
    editedDraftIdRef.current = undefined;
    dispatch(
      recordDefaults({
        featureType: "leuchte",
        values: {
          leuchte: serializeValues(referenceLeuchteValues),
          mast: serializeValues(
            (draftValues?.mast ?? {}) as Record<string, unknown>
          ),
        },
      })
    );
  }, [
    isCreation,
    referenceLeuchteValues,
    draftValues?.mast,
    dispatch,
    featureId,
  ]);

  // The single cross-draft "last values" record for Leuchten, kept in sync by
  // the recordDefaults dispatch above. Every Leuchte tab — Leuchte 1 and every
  // extra "+"-tab, in every draft — diffs its fields against this, so a field
  // that no longer holds the most recent value renders gray and only the
  // current value stays green.
  const leuchteCreationDefaults = useSelector((state: RootState) =>
    getCreationDefaults(state, "leuchte")
  );
  // The creationDefaults slice stores *serialized* values — dayjs dates live
  // there as `__dayjs:` strings. The highlight diff below runs against
  // `draftValues`, which is already deserialized (real dayjs objects), so the
  // defaults must be deserialized too. Without this every date field compares
  // a dayjs object against a string, `isFormValueEqual` always returns false,
  // and the field wrongly renders gray instead of green.
  const leuchteDefaultsForDiff = useMemo(
    () => ({
      leuchte: deserializeValues(
        (leuchteCreationDefaults?.leuchte as Record<string, unknown>) ?? {}
      ),
    }),
    [leuchteCreationDefaults]
  );
  // Allowlisted paths shaped like "leuchte.fk_leuchttyp" — used by the
  // per-extra-tab ChangedFieldsProvider below to compute green highlights
  // against that tab's own slice (not Leuchte 1's).
  const leuchteAllowlistedPaths = useMemo(
    () => getAllowlistedPaths("leuchte"),
    []
  );
  // Bare leuchte-subtree field names (no "leuchte." prefix) — used to seed a
  // new "+" tab from the reference tab's allowlisted values.
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
    // Seed the new tab purely from the remembered ("last value") fields — the
    // shared creationDefaults memory — so a "+" tab starts like a fresh draft.
    // A field with no remembered value is left empty, not copied from the
    // reference tab; that stops a new tab from inheriting another tab's
    // diverged (gray) values. The memory already reflects extra-tab edits:
    // the recordDefaults effect above mirrors the last-edited tab into it.
    const remembered = leuchteDefaultsForDiff.leuchte;
    const rehydratedSeed: Record<string, unknown> = {};
    for (const f of leuchteAllowlistedFields) {
      const v = remembered[f];
      if (v !== undefined && v !== null && v !== "") {
        rehydratedSeed[f] = v;
      }
    }
    // Antd DatePicker calls `.isValid()` on its value. Date fields can lose
    // their dayjs prototype across redux-persist serialization, so rewrap any
    // known date field with `dayjs(...)` before handing it to the form.
    for (const dateKey of ["inbetriebnahme_leuchte"]) {
      const raw = rehydratedSeed[dateKey];
      if (raw == null || raw === "") {
        delete rehydratedSeed[dateKey];
        continue;
      }
      const d = dayjs.isDayjs(raw)
        ? raw
        : dayjs(raw as string | number | Date);
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
    leuchteDefaultsForDiff,
    leuchteAllowlistedFields,
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
      // See handleLeuchteValuesChange: skip the programmatic mirror syncs.
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

  // Sidebar-driven tab focus: clicking a nested row in the "Entwürfe" list
  // (Standort parent / a Leuchte child) raises a focus request. Forward it to
  // FeatureFormLayout only when it targets this very draft.
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

  // Reset local documents override when data changes
  useEffect(() => {
    setLocalDocuments(null);
  }, [data]);

  // Extract documents from tdta_leuchten[0].dokumenteArray
  const leuchteData = data as Record<string, unknown>;
  const leuchtenArray = leuchteData?.tdta_leuchten as
    | Array<Record<string, unknown>>
    | undefined;
  const serverDocuments: DokumentItem[] =
    (leuchtenArray?.[0]?.dokumenteArray as DokumentItem[]) || [];
  const documents = localDocuments ?? serverDocuments;

  // Extract leuchte object for the form
  const leuchte = leuchtenArray?.[0] || null;

  // Extract tdta_standort_mast id from leuchte
  const standortMast = leuchte?.tdta_standort_mast as
    | Record<string, unknown>
    | undefined;
  const mastId = standortMast?.id as number | undefined;

  // Extra document sections from related entities
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

  // Fetch mast data if either:
  //   - viewing an existing Leuchte that links to a Mast (mastId), or
  //   - creating a new Leuchte with a pre-selected Standort (linkedMastId).
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

  // One-shot hydration when the parent Standort's data arrives. Keyed on the
  // `mastData` identity (one fetch = one ref bump) so re-renders don't dispatch
  // again, and both side effects below share the bump — that's load-bearing,
  // because each writes a different slice of the draft and a stale-`draftValues`
  // closure would let the second clobber the first if they fired in separate
  // effects on the same render.
  //
  // (a) Hydrate the Mast slice with Strassenschluessel / Kennziffer / lfd_nummer
  //     from the linked Standort. The subscription path inside LeuchteFormFields
  //     mirrors those into every Leuchte tab (current + later "+"-added).
  // (b) Seed the editable Leuchte slice from `leuchtenArray[0]` (the lowest-
  //     numbered existing Leuchte on this Mast), so the new lamp inherits its
  //     siblings' Leuchtentyp / Energielieferant / Schaltstelle / etc. Any field
  //     the user typed before the fetch returned wins; Leuchtennummer keeps its
  //     auto-assigned value; mast-owned fields are excluded (they flow through
  //     the Mast slice's mirror, not the Leuchte slice). Also dispatched into
  //     `creationDefaults.leuchte` via `recordDefaults` so any "+" tab added
  //     inside this draft picks up the same template (handleAddLeuchteTab seeds
  //     from that memory).
  const linkedMastHydratedForRef = useRef<unknown>(undefined);
  useEffect(() => {
    if (linkedMastId == null) return;
    if (!mastData) return;
    if (linkedMastHydratedForRef.current === mastData) return;
    linkedMastHydratedForRef.current = mastData;

    // (a) Mast slice hydration
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

    // (b) Bestand[0] seeding for the editable Leuchte slice. Same dedup-by-id
    // pass as the bestandLeuchten declaration below — the join in
    // `tdta_standort_mast_by_id` can return the same Leuchte several times.
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
      // Any field the user already typed (e.g. while the fetch was inflight)
      // beats the bestand template.
      for (const [k, v] of Object.entries(existingLeuchte)) {
        if (v === undefined || v === null || v === "") continue;
        seed[k] = v;
      }
      // Auto-assigned at draft-open time; never overwrite from bestand.
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

  // Extract fabrikat for subtitle - use rawFeature (vector tile) to match list display
  const rawProps = rawFeature?.properties;
  const subtitle =
    (rawProps?.fabrikat as string) ||
    (rawProps?.leuchttyp_fabrikat as string) ||
    "-ohne Fabrikat-";

  // Header identifier comes from the shared sidebar extractor, so the sticky
  // header reads identically to the sidebar row — drafts included.
  const sidebarMain = extractListItem("leuchten", rawFeature).main;

  if (!data) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400">
        Keine Daten ausgewählt
      </div>
    );
  }

  // Build additional tabs.
  // For brand-new Leuchten the Standort tab always appears and owns the
  // Strassenschluessel input + the "Neue Geometrien" selector:
  //   - if a Standort was selected (linkedMastId), show its data read-only,
  //     prefilled from the server; the existing Mast is reused on save.
  //   - otherwise show empty editable fields and a fresh Mast is created at
  //     save time from these values. The Leuchte form mirrors the Mast's
  //     Strassenschluessel so its own fk_strassenschluessel stays in sync.
  // For existing Leuchten the Standort tab stays out of scope here (handled
  // separately by the Mast/Standort form).
  const showCreationStandortTab = isCreation === true;
  const mastTabReadOnly = linkedMastId != null;
  // Read-only tabs for the parent Standort's existing Leuchten. Driven by the
  // mast fetch (`tdta_standort_mast_by_id`) that already runs when the form
  // opens — `mastData.leuchtenArray` carries each existing Leuchte with its
  // resolved key-table objects (tkey_*, *_Object, dokumenteArray …) that
  // LeuchteFormFields reads. Sorted by leuchtennummer ascending so labels are
  // a stable 1-based sequence that continues through the new draft tabs —
  // matching the existing-Mast view (Standort | Leuchte 1 | Leuchte 2 | …).
  // Empty until the fetch resolves. No draft state, no edits, no save
  // participation; the user-visible non-deletability falls out of these tabs
  // living in `additionalTabs` (no close affordance) rather than
  // `extraGeneralTabs`. Declared up here because the extra-tab labels and
  // `generalTabLabel` below all need `bestandLeuchten.length` as their offset.
  // Dedup by Leuchte `id` first: `tdta_standort_mast_by_id` joins with related
  // tables (dokumente, key tables) and can return the same Leuchte several
  // times when those relations are multi-cardinality. Without this filter a
  // Mast with 6 Leuchten ends up with N×6 read-only tabs (and matching sidebar
  // rows) — confused users count them as duplicates of the data.
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
  // `tabKey` is the contract between this form's read-only Bestand tabs and
  // the Entwürfe sidebar rows produced by `expandDraftSidebarFeatures` — both
  // sides derive it from the same fields so a sidebar click can focus the
  // matching tab via `requestDraftTabFocus`.
  const buildBestandTabKey = (
    sibling: Record<string, unknown>,
    idx: number
  ) => {
    const id = sibling.id as number | string | undefined;
    const raw = sibling.leuchtennummer;
    const leuchtennummerLabel =
      typeof raw === "number" || typeof raw === "string" ? String(raw) : undefined;
    return `bestand-${id ?? leuchtennummerLabel ?? idx}`;
  };
  // Slim projection of the bestand Leuchten, mirrored onto the Redux draft so
  // the sidebar can list one row per entry. Built directly off the same
  // `bestandLeuchten` array used for the form tabs, so tabKeys line up by
  // construction.
  const bestandSidebarProjection = useMemo<BestandLeuchteEntry[]>(() => {
    if (!showCreationStandortTab) return [];
    const mastLfd = mastData?.lfd_nummer as number | string | undefined;
    const mastStrasse =
      ((mastData?.tkey_strassenschluessel as
        | Record<string, unknown>
        | undefined)?.strasse as string | undefined) ??
      ((mastData?.tkey_strassenschluessel as
        | Record<string, unknown>
        | undefined)?.bezeichnung as string | undefined);
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
  // Push the projection onto the draft (`featureId` is the draft key in
  // creation mode). Keyed on a JSON-stable signature so the same projection
  // doesn't dispatch on every render. Cleared when the projection is empty
  // so re-opening a form against a different Standort can't leak entries.
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
  // Only the creation flow exposes the multi-Leuchte "+" affordance. Extras
  // live in the Redux draft under `values.leuchten[]`; each entry's `_tabId`
  // is the React key. The seeded `leuchtennummer` is frozen at "+"-click time
  // (LeuchteForm.handleAddLeuchteTab) so it doesn't drift if the user later
  // edits Leuchte 1's number. Tab label is shifted past the bestand tabs so
  // existing + new form a single 1-based sequence.
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
                  // Antd Tabs routes clicks anywhere in the label to onChange;
                  // stop propagation so the close icon doesn't also activate
                  // the tab on its way out.
                  e.stopPropagation();
                  handleRemoveLeuchteTab(tabId);
                }}
              />
            </span>
          ),
          children: (
            // Each extra Leuchte tab renders the same form fields as "Leuchte 1"
            // with its own Antd Form instance. Strassenschluessel + Kennziffer
            // arrive via the standard `mastDraftValues` subscription path,
            // with sticky per-tab Kennziffer override semantics inside
            // LeuchteFormFields. Field edits write back to `values.leuchten[idx]`
            // via handleExtraValuesChange so the save loop can persist them.
            //
            // The nested ChangedFieldsProvider scopes green/gray highlights to
            // *this* tab's slice — without it, the outer provider would paint
            // every Leuchte tab using Leuchte 1's diff.
            <ChangedFieldsProvider
              originalValues={{}}
              draftValues={{ leuchte: entryFields }}
              allowlistedPaths={isCreation ? leuchteAllowlistedPaths : undefined}
              currentDefaults={isCreation ? leuchteDefaultsForDiff : undefined}
            >
              <FieldPrefix name="leuchte">
                <LeuchteFormFields
                  leuchte={null}
                  readOnly={readOnly}
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
              // `LockedFields` swallows the green/prefilled highlight inside
              // its subtree so existing-Leuchte tabs render in the same gray
              // "locked" style as the linked-Mast Standort tab. The editable
              // tabs below stay green because they live outside this provider.
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

  // Leuchte 1's field block. In creation mode it is wrapped in a dedicated
  // ChangedFieldsProvider (below); on an existing feature it is rendered bare
  // so the outer FeaturesFormsWrapper provider — which holds the real
  // originalValues — supplies the changed/prefilled diff.
  const leuchteOneContent = (
    <FieldPrefix name="leuchte">
      <LeuchteFormFields
        leuchte={leuchte}
        readOnly={readOnly}
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
      onAddTab={showCreationStandortTab ? handleAddLeuchteTab : undefined}
      onCreateRelatedDraft={() =>
        createFeatureDraft(
          "leuchte",
          isCreation && draftValues
            ? { seedValues: draftValues }
            : { seedFromSelection: true }
        )
      }
      generalTabLabel={
        isCreation ? `Leuchte ${bestandOffset + 1}` : undefined
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
      {/* Creation only: wrap Leuchte 1 in its own ChangedFieldsProvider so it
       * diffs against the shared `leuchteDefaultsForDiff` memory — the same
       * cross-draft "last values" record every extra tab uses. Without this,
       * Leuchte 1 would fall back to the outer FeaturesFormsWrapper provider
       * and could stay green even when its values no longer match that record.
       * On an existing feature this provider is skipped: its hardcoded empty
       * `originalValues` would mark every field as changed (gray), and the
       * outer FeaturesFormsWrapper provider already supplies the right diff. */}
      {isCreation ? (
        <ChangedFieldsProvider
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
