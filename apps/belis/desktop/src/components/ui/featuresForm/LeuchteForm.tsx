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
  // Mirrors the Leuchte's strassenschluessel into the Mast form so the
  // read-only field on the Mast tab reflects the value the new Mast will
  // inherit on save. No-op when the Leuchte links to an existing Mast
  // (Path A) — that Mast's own values are loaded by MastFormFields.
  const syncStrassenschluesselToMast = useCallback(() => {
    if (linkedMastId != null) return;
    if (!mastFormRef.current) return;
    const leuchteDraft = draftValues?.leuchte as
      | Record<string, unknown>
      | undefined;
    const leuchteVals =
      leuchteDraft ?? leuchteFormRef.current?.getFieldsValue();
    if (!leuchteVals) return;
    mastFormRef.current.setFieldsValue({
      strassenschluessel_pk: leuchteVals.strassenschluessel_pk,
      strassenschluessel_strasse: leuchteVals.strassenschluessel_strasse,
    });
  }, [linkedMastId, draftValues]);
  const setMastForm = useCallback(
    (form: FormInstance) => {
      mastFormRef.current = form;
      syncStrassenschluesselToMast();
    },
    [syncStrassenschluesselToMast]
  );
  useEffect(() => {
    syncStrassenschluesselToMast();
  }, [syncStrassenschluesselToMast]);

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
      changedValues: Record<string, unknown>,
      allValues: Record<string, unknown>
    ) => {
      // Mirror the Leuchte's Strassenschluessel into the Mast form so the
      // read-only Strassenschluessel field on the Mast tab shows the value
      // the new Mast will inherit on save.
      if (
        "strassenschluessel_pk" in changedValues ||
        "strassenschluessel_strasse" in changedValues
      ) {
        mastFormRef.current?.setFieldsValue({
          strassenschluessel_pk: allValues.strassenschluessel_pk,
          strassenschluessel_strasse: allValues.strassenschluessel_strasse,
        });
      }
      onDraftChange?.({
        ...draftValues,
        leuchte: allValues,
      });
    },
    [onDraftChange, draftValues]
  );

  const handleMastValuesChange = useCallback(
    (_: Record<string, unknown>, allValues: Record<string, unknown>) => {
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
  // For brand-new Leuchten the Mast tab always appears:
  //   - if a Standort was selected (linkedMastId), show its data read-only,
  //     prefilled from the server; the existing Mast is reused on save.
  //   - otherwise show empty editable fields (without Strassenschluessel,
  //     which the new Mast inherits from the Leuchte) and a fresh Mast is
  //     created at save time from these values.
  // For existing Leuchten the Mast tab stays out of scope here (handled
  // separately by the Mast/Standort form).
  const showCreationMastTab = isCreation === true;
  const mastTabReadOnly = linkedMastId != null;
  const additionalTabs = showCreationMastTab
    ? [
        {
          key: "mast",
          label: "Mast",
          children: (
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
                  readOnlyStrassenschluessel
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
          ),
        },
      ]
    : [];

  return (
    <FeatureFormLayout
      title={isCreation ? "Neue Leuchte" : sidebarMain ? `Leuchte ${sidebarMain}` : "Leuchte"}
      cancelLabel={sidebarMain || ""}
      isCreation={isCreation}
      formHeaderContent={formHeaderContent}
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
