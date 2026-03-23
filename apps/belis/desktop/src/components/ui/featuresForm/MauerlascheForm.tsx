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
import MauerlascheFormFields from "./MauerlascheFormFields";
import toTitleCase from "../../../helper/toTitleCase";
import { updateDataByClassName } from "../../../helper/apiMethods";
import { uploadDraftFiles } from "../../../helper/uploadDraftFiles";

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

interface MauerlascheFormProps {
  data: Record<string, unknown> | null;
  rawFeature?: {
    id?: string | number;
    properties?: Record<string, unknown>;
  } | null;
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

const MauerlascheForm = ({
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
}: MauerlascheFormProps) => {
  const removedDocumentKeys = removedDocumentKeysProp ?? new Set<string>();
  const formRef = useRef<FormInstance | null>(null);
  const [saving, setSaving] = useState(false);
  const [localDocuments, setLocalDocuments] = useState<DokumentItem[] | null>(
    null
  );
  const jwt = useSelector(getJWT);

  const setFormInstance = useCallback((form: FormInstance) => {
    formRef.current = form;
  }, []);

  const handleValuesChange = useCallback(
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

  // Extract documents from mauerlasche[0].dokumenteArray
  const mauerlascheData = data as Record<string, unknown>;
  const mauerlascheArray = mauerlascheData?.mauerlasche as
    | Array<Record<string, unknown>>
    | undefined;
  const serverDocuments: DokumentItem[] =
    (mauerlascheArray?.[0]?.dokumenteArray as DokumentItem[]) || [];
  const documents = localDocuments ?? serverDocuments;

  // Extract mauerlasche object and ID
  const ml = mauerlascheArray?.[0] || null;
  const mauerlascheId = ml?.id as number | undefined;

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
    "-ohne Straße-";

  // Compute sidebar main title to display in form header
  const sidebarMain =
    rawProps?.laufende_nummer || rawProps?.id
      ? `M - ${rawProps?.laufende_nummer || rawProps?.id}`
      : "";

  const handleSave = async () => {
    if (!jwt) {
      message.error("Nicht authentifiziert");
      return;
    }

    if (!mauerlascheId) {
      message.error("Keine Mauerlaschen-ID gefunden");
      return;
    }

    if (!formRef.current) {
      return;
    }

    setSaving(true);
    try {
      const formValues = formRef.current.getFieldsValue();

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
        id: mauerlascheId,
        ...rest,
        // Include updated documents array when changed
        ...(finalDokumenteArray !== undefined
          ? { dokumenteArray: finalDokumenteArray }
          : {}),
      });

      console.log(
        "xxx saving mauerlasche:",
        JSON.stringify(dataToSave, null, 2)
      );
      await updateDataByClassName(jwt, "mauerlasche", dataToSave);

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
      message.success("Mauerlasche gespeichert");
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
      title={sidebarMain ? `Mauerlasche ${sidebarMain}` : "Mauerlasche"}
      cancelLabel={sidebarMain || ""}
      subtitle={subtitle}
      documents={documents}
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
      <MauerlascheFormFields
        mauerlasche={ml}
        readOnly={readOnly}
        onFormInstance={setFormInstance}
        draftValues={draftValues}
        onValuesChange={handleValuesChange}
        onOriginalValues={onOriginalValues}
      />
    </FeatureFormLayout>
  );
};

export default MauerlascheForm;
