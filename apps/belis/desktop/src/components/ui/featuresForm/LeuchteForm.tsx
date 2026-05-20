import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { FormInstance } from "antd";
import { message } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import type { DraftFile } from "../../../store/slices/featuresForms";
import { useSelector } from "react-redux";
import { getJWT } from "../../../store/slices/auth";
import { getAllowlistedPaths } from "../../../store/slices/creationDefaults";
import { DokumentItem } from "../DocumentPreview";
import { getDocumentKey } from "../FilePreview";
import FeatureFormLayout from "./FeatureFormLayout";
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
      _changedValues: Record<string, unknown>,
      allValues: Record<string, unknown>
    ) => {
      setLastEditedLeuchteTabId("main");
      onDraftChange?.({
        ...draftValues,
        leuchte: allValues,
      });
    },
    [onDraftChange, draftValues]
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
      onDraftChange?.({
        ...draftValues,
        mast: allValues,
      });
    },
    [onDraftChange, draftValues]
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
  // Values from the most recently edited Leuchte tab, used as the "leuchte"
  // currentDefaults for every tab's diff. This is what makes the edited tab
  // stay green and pushes other tabs (with stale values) to gray — matching
  // Schaltstelle's single-record behavior across multiple Leuchte tabs.
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
    // Seed the new tab from the most recently edited Leuchte tab's allowlisted
    // fields (Leuchtentyp, Energielieferant, Doppelkommando, …). Sourcing from
    // the live reference tab — rather than the creationDefaults snapshot —
    // means values entered on an *extra* tab are carried over too: extra-tab
    // edits live in `values.leuchten[]`, which never reaches creationDefaults,
    // so that snapshot only ever reflected Leuchte 1 and dropped fields like
    // Doppelkommando/Anzahl.
    const rehydratedSeed: Record<string, unknown> = {};
    for (const f of leuchteAllowlistedFields) {
      const v = referenceLeuchteValues[f];
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
    referenceLeuchteValues,
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
      _changedValues: Record<string, unknown>,
      allValues: Record<string, unknown>
    ) => {
      const current = (draftValues?.leuchten ?? []) as Array<
        Record<string, unknown>
      >;
      const idx = current.findIndex((entry) => entry._tabId === tabId);
      if (idx < 0) return;
      const next = [...current];
      next[idx] = { ...allValues, _tabId: tabId };
      setLastEditedLeuchteTabId(tabId);
      onDraftChange?.({
        ...draftValues,
        leuchten: next,
      });
    },
    [draftValues, onDraftChange]
  );
  const jwt = useSelector(getJWT);

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

  // When creating a Leuchte linked to an existing Mast, hydrate the Mast
  // Redux slice from the server-fetched mastData. From there the standard
  // subscription path inside LeuchteFormFields picks up Strassenschluessel
  // and Kennziffer for every tab (including those added later). One-shot
  // write keyed on the mastData identity so re-renders don't re-dispatch.
  const linkedMastHydratedForRef = useRef<unknown>(undefined);
  useEffect(() => {
    if (linkedMastId == null) return;
    if (!mastData) return;
    if (linkedMastHydratedForRef.current === mastData) return;
    const ssel = mastData.tkey_strassenschluessel as
      | Record<string, unknown>
      | undefined;
    const kennziffer = mastData.tkey_kennziffer as
      | Record<string, unknown>
      | undefined;
    const existingMast = (draftValues?.mast ?? {}) as Record<string, unknown>;
    const next: Record<string, unknown> = { ...existingMast };
    if (ssel) {
      next.strassenschluessel_pk = ssel.pk;
      next.strassenschluessel_strasse = ssel.strasse;
      next.fk_strassenschluessel = ssel.id;
    }
    if (kennziffer?.id != null) {
      next.fk_kennziffer = kennziffer.id;
    }
    linkedMastHydratedForRef.current = mastData;
    onDraftChange?.({
      ...draftValues,
      mast: next,
    });
  }, [linkedMastId, mastData, draftValues, onDraftChange]);

  // Extract fabrikat for subtitle - use rawFeature (vector tile) to match list display
  const rawProps = rawFeature?.properties;
  const subtitle =
    (rawProps?.fabrikat as string) ||
    (rawProps?.leuchttyp_fabrikat as string) ||
    "-ohne Fabrikat-";

  // Compute sidebar main title to display in form header
  const sidebarMain = rawProps
    ? `${rawProps.leuchtentyp || rawProps.leuchttyp || "L"}-${
        rawProps.leuchtennummer || "0"
      }${rawProps.lfd_nummer ? `, ${rawProps.lfd_nummer}` : ""}`
    : "";

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
  // Only the creation flow exposes the multi-Leuchte "+" affordance. Extras
  // live in the Redux draft under `values.leuchten[]`; each entry's `_tabId`
  // is the React key. The seeded `leuchtennummer` is frozen at "+"-click time
  // (LeuchteForm.handleAddLeuchteTab) so it doesn't drift if the user later
  // edits Leuchte 1's number.
  const extraGeneralTabs = showCreationStandortTab
    ? extraLeuchten.map((entry, idx) => {
        const tabId = entry._tabId as string;
        const { _tabId: _unusedTabId, ...entryFields } = entry;
        void _unusedTabId;
        return {
          key: tabId,
          label: (
            <span>
              Leuchte {idx + 2}{" "}
              <CloseOutlined
                role="button"
                aria-label={`Leuchte ${idx + 2} entfernen`}
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
              allowlistedPaths={leuchteAllowlistedPaths}
              currentDefaults={{ leuchte: referenceLeuchteValues }}
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
      ]
    : [];

  return (
    <FeatureFormLayout
      tabsResetKey={featureId}
      title={isCreation ? "Neue Leuchte" : sidebarMain ? `Leuchte ${sidebarMain}` : "Leuchte"}
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
      generalTabLabel={isCreation ? "Leuchte 1" : undefined}
      additionalTabsPosition={isCreation ? "before" : undefined}
      loading={loading}
      saving={saving}
      readOnly={readOnly}
      hasDraft={hasDraft || removedDocumentKeys.size > 0}
      onToggleReadOnly={onToggleReadOnly}
      onCancel={onCancel}
      onSave={handleSave}
    >
      {/* Wrapping Leuchte 1's content in its own ChangedFieldsProvider lets it
       * diff against `referenceLeuchteValues` — the same per-tab "last edited"
       * reference the extras use — instead of the outer wrapper's
       * `leuchteCreationDefaults`. Without this, editing Leuchte 2 would
       * correctly turn it green but leave Leuchte 1 stuck on the old default's
       * green even though its values now disagree with the live reference. */}
      <ChangedFieldsProvider
        originalValues={{}}
        draftValues={{
          leuchte: (draftValues?.leuchte ?? {}) as Record<string, unknown>,
        }}
        allowlistedPaths={leuchteAllowlistedPaths}
        currentDefaults={{ leuchte: referenceLeuchteValues }}
      >
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
      </ChangedFieldsProvider>
    </FeatureFormLayout>
  );
};

export default LeuchteForm;
