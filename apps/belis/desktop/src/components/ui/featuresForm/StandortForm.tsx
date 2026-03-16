import { useState, useEffect, useCallback, useRef } from "react";
import type { FormInstance } from "antd";
import { message } from "antd";
import { useSelector } from "react-redux";
import dayjs from "dayjs";
import type { DraftFile } from "../../../store/slices/featuresForms";
import { getJWT } from "../../../store/slices/auth";
import { DokumentItem } from "../DocumentPreview";
import { getDocumentKey } from "../FilePreview";
import FeatureFormLayout from "./FeatureFormLayout";
import MastFormFields from "./MastFormFields";
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

interface StandortFormProps {
  data: Record<string, unknown> | null;
  rawFeature?: { properties?: Record<string, unknown> } | null;
  onClose?: () => void;
  readOnly?: boolean;
  loading?: boolean;
  draftValues?: Record<string, unknown>;
  draftFiles?: DraftFile[];
  hasDraft?: boolean;
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

  const setMastForm = useCallback((form: FormInstance) => {
    mastFormRef.current = form;
  }, []);

  const handleMastValuesChange = useCallback(
    (_: Record<string, unknown>, allValues: Record<string, unknown>) => {
      onDraftChange?.(allValues);
    },
    [onDraftChange]
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

  // Compute sidebar main title to display in form header
  const sidebarMain = rawProps?.lfd_nummer
    ? `${rawProps.lfd_nummer}`
    : "Standort";

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
      const {
        strassenschluessel_pk,
        strassenschluessel_strasse,
        fk_bezirk,
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
        id: mastId,
        ...rest,
        // Include updated documents array when changed
        ...(finalDokumenteArray !== undefined
          ? { dokumenteArray: finalDokumenteArray }
          : {}),
      });

      console.log("xxx saving standort:", JSON.stringify(dataToSave, null, 2));
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

  return (
    <FeatureFormLayout
      title={sidebarMain ? `Standort ${sidebarMain}` : "Standort"}
      cancelLabel={
        rawProps?.lfd_nummer ? `Standort ${sidebarMain}` : "Standort"
      }
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
      loading={loading}
      saving={saving}
      readOnly={readOnly}
      hasDraft={hasDraft || removedDocumentKeys.size > 0}
      onToggleReadOnly={onToggleReadOnly}
      onCancel={onCancel}
      onSave={handleSave}
    >
      <MastFormFields
        mast={mast}
        readOnly={readOnly}
        onFormInstance={setMastForm}
        draftValues={draftValues}
        onValuesChange={handleMastValuesChange}
        onOriginalValues={onOriginalValues}
      />
    </FeatureFormLayout>
  );
};

export default StandortForm;
