import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import type { FormInstance } from "antd";
import { message } from "antd";
import type { DraftFile } from "../../../store/slices/featuresForms";
import { useSelector } from "react-redux";
import { getJWT } from "../../../store/slices/auth";
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
import { FieldPrefix } from "./DraftFieldHighlight";
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
  const leuchteFormRef = useRef<FormInstance | null>(null);
  const mastFormRef = useRef<FormInstance | null>(null);

  const setLeuchteForm = useCallback((form: FormInstance) => {
    leuchteFormRef.current = form;
  }, []);
  // Mirrors the Mast/Standort form's strassenschluessel into the Leuchte
  // form so the Leuchte's persisted fk_strassenschluessel matches what the
  // user picked on the Standort tab. No-op when the Leuchte links to an
  // existing Mast — the mastData-load effect below handles that case.
  const syncStrassenschluesselToLeuchte = useCallback(() => {
    if (linkedMastId != null) return;
    if (!leuchteFormRef.current) return;
    const mastDraft = draftValues?.mast as
      | Record<string, unknown>
      | undefined;
    const mastVals = mastDraft ?? mastFormRef.current?.getFieldsValue();
    if (!mastVals) return;
    leuchteFormRef.current.setFieldsValue({
      strassenschluessel_pk: mastVals.strassenschluessel_pk,
      strassenschluessel_strasse: mastVals.strassenschluessel_strasse,
      fk_strassenschluessel: mastVals.fk_strassenschluessel,
    });
  }, [linkedMastId, draftValues]);
  const setMastForm = useCallback(
    (form: FormInstance) => {
      mastFormRef.current = form;
      syncStrassenschluesselToLeuchte();
    },
    [syncStrassenschluesselToLeuchte]
  );
  useEffect(() => {
    syncStrassenschluesselToLeuchte();
  }, [syncStrassenschluesselToLeuchte]);

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

  const handleLeuchteValuesChange = useCallback(
    (
      _changedValues: Record<string, unknown>,
      allValues: Record<string, unknown>
    ) => {
      onDraftChange?.({
        ...draftValues,
        leuchte: allValues,
      });
    },
    [onDraftChange, draftValues]
  );

  const handleMastValuesChange = useCallback(
    (
      changedValues: Record<string, unknown>,
      allValues: Record<string, unknown>
    ) => {
      // Mirror Strassenschluessel from the Standort tab into the Leuchte form
      // so the Leuchte's persisted fk_strassenschluessel stays consistent.
      // Update both the form (if mounted — antd Tabs lazy-mount the inactive
      // tab) AND the leuchte draft slice directly so the save sees the value
      // even when the user has not yet visited the Leuchte tab.
      let leuchteValues: Record<string, unknown> | undefined;
      if (
        "strassenschluessel_pk" in changedValues ||
        "strassenschluessel_strasse" in changedValues ||
        "fk_strassenschluessel" in changedValues
      ) {
        const mirroredFields = {
          strassenschluessel_pk: allValues.strassenschluessel_pk,
          strassenschluessel_strasse: allValues.strassenschluessel_strasse,
          fk_strassenschluessel: allValues.fk_strassenschluessel,
        };
        leuchteFormRef.current?.setFieldsValue(mirroredFields);
        const existingLeuchte = (draftValues?.leuchte ?? {}) as Record<
          string,
          unknown
        >;
        leuchteValues = { ...existingLeuchte, ...mirroredFields };
      }
      onDraftChange?.({
        ...draftValues,
        mast: allValues,
        ...(leuchteValues ? { leuchte: leuchteValues } : {}),
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

    if (!leuchteFormRef.current) {
      return;
    }

    setSaving(true);
    try {
      const formValues = leuchteFormRef.current.getFieldsValue();

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

  // When creating a Leuchte linked to an existing Mast, inherit that Mast's
  // Strassenschlüssel into the Leuchte form. Reverse of the new-Mast path
  // handled by syncStrassenschluesselToMast above.
  useEffect(() => {
    if (linkedMastId == null) return;
    if (!mastData) return;
    if (!leuchteFormRef.current) return;
    const ssel = mastData.tkey_strassenschluessel as
      | Record<string, unknown>
      | undefined;
    if (!ssel) return;
    const current = leuchteFormRef.current.getFieldsValue() as Record<
      string,
      unknown
    >;
    if (
      current.strassenschluessel_pk === ssel.pk &&
      current.fk_strassenschluessel === ssel.id
    ) {
      return;
    }
    leuchteFormRef.current.setFieldsValue({
      strassenschluessel_pk: ssel.pk,
      strassenschluessel_strasse: ssel.strasse,
      fk_strassenschluessel: ssel.id,
    });
  }, [linkedMastId, mastData]);

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
                  <MastFormFields
                    mast={mastTabReadOnly ? mastData : null}
                    readOnly={mastTabReadOnly}
                    isCreation={!mastTabReadOnly}
                    featureId={featureId}
                    locked={mastTabReadOnly}
                    onFormInstance={setMastForm}
                    draftValues={
                      mastTabReadOnly
                        ? undefined
                        : (draftValues?.mast as
                            | Record<string, unknown>
                            | undefined)
                    }
                    onValuesChange={
                      mastTabReadOnly ? undefined : handleMastValuesChange
                    }
                    onOriginalValues={
                      mastTabReadOnly ? undefined : handleMastOriginalValues
                    }
                  />
                </FieldPrefix>
              </div>
            </>
          ),
        },
      ]
    : [];

  return (
    <FeatureFormLayout
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
      generalTabLabel={isCreation ? "Leuchte" : undefined}
      additionalTabsPosition={isCreation ? "before" : undefined}
      loading={loading}
      saving={saving}
      readOnly={readOnly}
      hasDraft={hasDraft || removedDocumentKeys.size > 0}
      onToggleReadOnly={onToggleReadOnly}
      onCancel={onCancel}
      onSave={handleSave}
    >
      <FieldPrefix name="leuchte">
        <LeuchteFormFields
          leuchte={leuchte}
          readOnly={readOnly}
          isCreation={isCreation}
          featureId={featureId}
          hideStrassenschluessel={isCreation}
          onFormInstance={setLeuchteForm}
          draftValues={
            draftValues?.leuchte as Record<string, unknown> | undefined
          }
          onValuesChange={handleLeuchteValuesChange}
          onOriginalValues={handleLeuchteOriginalValues}
        />
      </FieldPrefix>
    </FeatureFormLayout>
  );
};

export default LeuchteForm;
