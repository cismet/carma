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
import { useSelector, useDispatch } from "react-redux";
import dayjs from "dayjs";
import type { DraftFile } from "../../../store/slices/featuresForms";
import { getJWT } from "../../../store/slices/auth";
import { getTabFocusRequest } from "../../../store/slices/featuresForms";
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
import MastFormFields from "./MastFormFields";
import LeuchteFormFields from "./LeuchteFormFields";
import { ChangedFieldsProvider, FieldPrefix } from "./DraftFieldHighlight";
import { updateDataByClassName } from "../../../helper/apiMethods";
import { uploadDraftFiles } from "../../../helper/uploadDraftFiles";
import toTitleCase from "../../../helper/toTitleCase";

const transformDatesForBackend = (
  values: Record<string, unknown>
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (dayjs.isDayjs(value)) {
      result[key] = value.toISOString();
    } else {
      result[key] = value;
    }
  }
  return result;
};

// Strassenschluessel/Kennziffer/Laufende-Nr. live on the Standort (Allgemein)
// tab and are only mirrored into each Leuchte tab by LeuchteFormFields'
// subscription effects. A Leuchte values-change touching *only* these is a
// programmatic sync (it also fires when the user merely switches drafts), not a
// genuine edit, so it must not mark the tab as the one to remember. Mirrors the
// same guard in LeuchteForm.
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

interface StandortFormProps {
  data: Record<string, unknown> | null;
  rawFeature?: { properties?: Record<string, unknown> } | null;
  onClose?: () => void;
  readOnly?: boolean;
  loading?: boolean;
  draftValues?: Record<string, unknown>;
  draftFiles?: DraftFile[];
  hasDraft?: boolean;
  isCreation?: boolean;
  featureId?: string;
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

const StandortForm = ({
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
  formHeaderContent,
  onDraftChange,
  onDraftFilesChange,
  onOriginalValues,
  onToggleReadOnly,
  onCancel,
  onSaveComplete,
  removedDocumentKeys: removedDocumentKeysProp,
  onRemovedDocumentKeysChange,
}: StandortFormProps) => {
  const removedDocumentKeys = removedDocumentKeysProp ?? new Set<string>();
  const [saving, setSaving] = useState(false);
  const [localDocuments, setLocalDocuments] = useState<DokumentItem[] | null>(
    null
  );
  const mastFormRef = useRef<FormInstance | null>(null);
  const jwt = useSelector(getJWT);
  const dispatch = useDispatch();
  const createFeatureDraft = useCreateFeatureDraft();

  const setMastForm = useCallback((form: FormInstance) => {
    mastFormRef.current = form;
  }, []);

  // Extra "+ Leuchte" tabs (creation flow only) are persisted in the Redux
  // draft alongside the flat Mast fields, under `values.leuchten[]`. Each entry
  // carries a stable `_tabId` so React keys survive edits; the array order
  // matches the visible tab order. Stripped from the Mast save payload and
  // turned into linked tdta_leuchten rows in saveCreationDraft.
  const extraLeuchten = (draftValues?.leuchten ?? []) as Array<
    Record<string, unknown>
  >;
  // The flat Mast slice = the whole draft minus the leuchten sibling. Fed to
  // each Leuchte tab as `mastDraftValues` so Strassenschluessel/Kennziffer/
  // Laufende-Nr. mirror down (those keys live flat on the Standort draft).
  const mastSlice = useMemo(() => {
    const { leuchten: _leuchten, ...rest } = (draftValues ?? {}) as Record<
      string,
      unknown
    >;
    void _leuchten;
    return rest;
  }, [draftValues]);

  // Tracks which Leuchte tab the user touched most recently (its `_tabId`), or
  // null when none. Its values become the "reference" the cross-draft memory is
  // refreshed from. Reset on draft identity change.
  const [lastEditedLeuchteTabId, setLastEditedLeuchteTabId] = useState<
    string | null
  >(null);
  useEffect(() => {
    setLastEditedLeuchteTabId(null);
  }, [featureId]);

  // Mirrors the tab currently displayed in FeatureFormLayout ("general" for the
  // Allgemein/Mast tab; an extra Leuchte tab uses its `_tabId`). Drives "+"-tab
  // seeding from the open tab.
  const [activeFormTabKey, setActiveFormTabKey] = useState<string>("general");

  // featureId of the draft whose Leuchte tab the user actually edited. The
  // recordDefaults effect below only refreshes the shared cross-draft memory
  // when this matches the draft on screen — so merely switching drafts never
  // re-asserts stale values over a newer edit elsewhere.
  const editedDraftIdRef = useRef<string | undefined>(undefined);

  // The single cross-draft "last values" record for Leuchten — the same memory
  // LeuchteForm reads/writes. Every Leuchte tab here diffs its fields against
  // it for the green/gray highlight. Deserialized because it stores serialized
  // (`__dayjs:`) dates while the live draft holds real dayjs objects.
  const leuchteCreationDefaults = useSelector((state: RootState) =>
    getCreationDefaults(state, "leuchte")
  );
  const leuchteDefaultsForDiff = useMemo(
    () => ({
      leuchte: deserializeValues(
        (leuchteCreationDefaults?.leuchte as Record<string, unknown>) ?? {}
      ),
    }),
    [leuchteCreationDefaults]
  );
  const leuchteAllowlistedPaths = useMemo(
    () => getAllowlistedPaths("leuchte"),
    []
  );
  // Bare leuchte-subtree field names (no "leuchte." prefix), used to seed a new
  // "+" tab from the remembered template.
  const leuchteAllowlistedFields = useMemo(
    () =>
      [...leuchteAllowlistedPaths]
        .filter((p) => p.startsWith("leuchte."))
        .map((p) => p.slice("leuchte.".length)),
    [leuchteAllowlistedPaths]
  );

  // Values from the most recently edited Leuchte tab — mirrored into the shared
  // memory below. Empty when no tab has been touched yet.
  const referenceLeuchteValues = useMemo(() => {
    if (lastEditedLeuchteTabId) {
      const entry = extraLeuchten.find(
        (e) => e._tabId === lastEditedLeuchteTabId
      );
      if (entry) {
        const { _tabId: _unused, ...rest } = entry;
        void _unused;
        return rest as Record<string, unknown>;
      }
    }
    return {} as Record<string, unknown>;
  }, [lastEditedLeuchteTabId, extraLeuchten]);

  // Refresh the cross-draft `creationDefaults.leuchte` memory from the most
  // recently edited Leuchte tab + the Standort Mast slice. The slice's own
  // setDraft listener never records the "leuchte" type (LeuchteForm owns it),
  // so without this a lamp edited on a Standort draft wouldn't update the
  // remembered template. useLayoutEffect so the highlight diff sees the write
  // before paint. Mirrors LeuchteForm.
  useLayoutEffect(() => {
    if (!isCreation) return;
    if (editedDraftIdRef.current == null) return;
    if (editedDraftIdRef.current !== featureId) return;
    editedDraftIdRef.current = undefined;
    const recordPayload = {
      featureType: "leuchte",
      values: {
        leuchte: serializeValues(referenceLeuchteValues),
        mast: serializeValues(mastSlice),
      },
    };
    dispatch(recordDefaults(recordPayload));
    dispatch(recordSelectionDefaults(recordPayload));
  }, [isCreation, referenceLeuchteValues, mastSlice, dispatch, featureId]);

  const handleAddLeuchteTab = useCallback(() => {
    const current = (draftValues?.leuchten ?? []) as Array<
      Record<string, unknown>
    >;
    // Seed the new tab from the Leuchte tab the user is currently looking at;
    // otherwise from the remembered cross-draft template. Only allowlisted
    // fields carry over; leuchtennummer is always auto-assigned below.
    let sourceSlice: Record<string, unknown>;
    if (activeFormTabKey?.startsWith("extra-")) {
      const entry = current.find((e) => e._tabId === activeFormTabKey);
      if (entry) {
        const { _tabId: _unused, ...rest } = entry;
        void _unused;
        sourceSlice = rest as Record<string, unknown>;
      } else {
        sourceSlice = (leuchteDefaultsForDiff.leuchte ?? {}) as Record<
          string,
          unknown
        >;
      }
    } else {
      sourceSlice = (leuchteDefaultsForDiff.leuchte ?? {}) as Record<
        string,
        unknown
      >;
    }
    // Mirror LeuchteForm's "+": besides seeding the tab, push the source values
    // and the Mast slice into the cross-draft memory so the next new feature
    // and the "Gemerkte Felder" reset reflect what is on screen.
    const recordPayload = {
      featureType: "leuchte",
      values: {
        leuchte: serializeValues(sourceSlice),
        mast: serializeValues(mastSlice),
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
    // Date fields can lose their dayjs prototype across redux-persist; rewrap
    // them before handing to the form (DatePicker calls `.isValid()`).
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
      // Lamps on a Mast are 0-indexed (matches "L-0 / L-1" rows): the next free
      // number equals how many lamps already exist on this draft.
      leuchtennummer: current.length,
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
    leuchteDefaultsForDiff,
    mastSlice,
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
      // Skip the programmatic Strassenschluessel/Kennziffer/Laufende-Nr. syncs.
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

  const handleMastValuesChange = useCallback(
    (_: Record<string, unknown>, allValues: Record<string, unknown>) => {
      // The Mast form holds only the flat Mast fields. Merge the leuchten
      // sibling back so editing an Allgemein field never drops the lamps.
      const current = draftValues?.leuchten as
        | Array<Record<string, unknown>>
        | undefined;
      onDraftChange?.({
        ...allValues,
        ...(current ? { leuchten: current } : {}),
      });
    },
    [onDraftChange, draftValues]
  );

  // Sidebar-driven tab focus: clicking a nested Leuchte row in the "Entwürfe"
  // list raises a focus request. Forward it to FeatureFormLayout only when it
  // targets this very draft.
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

  // Extract documents from tdta_standort_mast[0].dokumenteArray
  const mastData = data as Record<string, unknown>;
  const mastArray = mastData?.tdta_standort_mast as
    | Array<Record<string, unknown>>
    | undefined;
  const serverDocuments: DokumentItem[] =
    (mastArray?.[0]?.dokumenteArray as DokumentItem[]) || [];
  const documents = localDocuments ?? serverDocuments;

  // Extract mast object for the form
  const mast = mastArray?.[0] || null;
  const mastId = mast?.id as number | undefined;

  // Extra document sections from related entities
  const mastTyp = mast?.tkey_masttyp as Record<string, unknown> | undefined;
  const mastTypDocuments = (mastTyp?.dokumenteArray as DokumentItem[]) ?? [];
  const mastTypTitle = mastTyp?.masttyp
    ? `Masttyp (${mastTyp.masttyp as string})`
    : "Masttyp";

  const extraDocumentSections = [
    { title: mastTypTitle, documents: mastTypDocuments },
  ];

  // Extract subtitle - use rawFeature (vector tile) to match list display
  const rawProps = rawFeature?.properties as
    | Record<string, unknown>
    | undefined;
  const strassenschluessel = rawProps?.fk_strassenschluessel as
    | { strasse?: string }
    | undefined;
  const subtitle =
    toTitleCase(strassenschluessel?.strasse || "") ||
    toTitleCase((rawProps?.strasse as string) || "") ||
    toTitleCase((rawProps?.standortangabe as string) || "") ||
    "-ohne Straße-";

  // Header title comes from the shared sidebar extractor, so the sticky header
  // reads identically to the sidebar row — drafts included. The `standorte`
  // extractor already yields "Standort <lfd>", so no prefix is added below.
  const sidebarMain = extractListItem("standorte", rawFeature).main;

  const handleSave = async () => {
    if (!jwt) {
      message.error("Nicht authentifiziert");
      return;
    }

    if (!mastId) {
      message.error("Keine Standort-ID gefunden");
      return;
    }

    if (!mastFormRef.current) {
      return;
    }

    setSaving(true);
    try {
      const formValues = mastFormRef.current.getFieldsValue();

      // Remove display-only fields that the backend doesn't expect
      const { strassenschluessel_pk, strassenschluessel_strasse, ...rest } =
        formValues;

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
        id: mastId,
        ...rest,
        // Include updated documents array when changed
        ...(finalDokumenteArray !== undefined
          ? { dokumenteArray: finalDokumenteArray }
          : {}),
      });

      await updateDataByClassName(jwt, "tdta_standort_mast", dataToSave);

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
      message.success("Standort gespeichert");
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

  if (!data) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400">
        Keine Daten ausgewählt
      </div>
    );
  }

  // "+ Leuchte" tabs (creation flow only). Each renders the same
  // LeuchteFormFields as the Leuchte form, with its own Antd Form instance.
  // Strassenschluessel + Kennziffer + Laufende Nr. arrive via the standard
  // `mastDraftValues` subscription from the flat Mast slice. The nested
  // ChangedFieldsProvider scopes the green/gray highlight to *this* tab's slice
  // against the shared leuchte memory. Labels are a 1-based sequence
  // ("Leuchte 1", "Leuchte 2", …) that sits after the Allgemein tab.
  const extraGeneralTabs = isCreation
    ? extraLeuchten.map((entry, idx) => {
        const tabId = entry._tabId as string;
        const { _tabId: _unusedTabId, ...entryFields } = entry;
        void _unusedTabId;
        const tabNumber = idx + 1;
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
                  // Antd Tabs routes label clicks to onChange; stop propagation
                  // so the close icon doesn't also activate the tab.
                  e.stopPropagation();
                  handleRemoveLeuchteTab(tabId);
                }}
              />
            </span>
          ),
          children: (
            <ChangedFieldsProvider
              originalValues={{}}
              draftValues={{ leuchte: entryFields }}
              allowlistedPaths={leuchteAllowlistedPaths}
              currentDefaults={leuchteDefaultsForDiff}
            >
              <FieldPrefix name="leuchte">
                <LeuchteFormFields
                  leuchte={null}
                  readOnly={readOnly}
                  isCreation={isCreation}
                  featureId={`${featureId ?? ""}#${tabId}`}
                  hideStrassenschluessel={isCreation}
                  draftValues={entryFields}
                  mastDraftValues={mastSlice}
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

  return (
    <FeatureFormLayout
      tabsResetKey={featureId}
      tabFocusRequest={layoutTabFocus}
      title={sidebarMain}
      cancelLabel={sidebarMain}
      isCreation={isCreation}
      formHeaderContent={formHeaderContent}
      subtitle={subtitle}
      documents={documents}
      mainDocumentsTitle="Standort"
      extraDocumentSections={extraDocumentSections}
      jwt={jwt}
      draftFiles={draftFiles}
      onDraftFilesChange={onDraftFilesChange}
      removedDocumentKeys={removedDocumentKeys}
      onToggleRemoveDocument={handleToggleRemoveDocument}
      debugData={data}
      rawFeatureData={rawFeature}
      extraGeneralTabs={extraGeneralTabs}
      onAddTab={isCreation ? handleAddLeuchteTab : undefined}
      onActiveTabChange={setActiveFormTabKey}
      loading={loading}
      saving={saving}
      readOnly={readOnly}
      hasDraft={hasDraft || removedDocumentKeys.size > 0}
      onToggleReadOnly={onToggleReadOnly}
      onCancel={onCancel}
      onSave={handleSave}
      onCreateRelatedDraft={() =>
        createFeatureDraft(
          "standort",
          isCreation && draftValues
            ? { seedValues: draftValues }
            : { seedFromSelection: true }
        )
      }
    >
      <MastFormFields
        mast={mast}
        readOnly={readOnly}
        isCreation={isCreation}
        featureId={featureId}
        onFormInstance={setMastForm}
        draftValues={mastSlice}
        onValuesChange={handleMastValuesChange}
        onOriginalValues={onOriginalValues}
      />
    </FeatureFormLayout>
  );
};

export default StandortForm;
