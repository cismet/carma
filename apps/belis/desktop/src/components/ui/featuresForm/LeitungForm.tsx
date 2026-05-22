import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import type { FormInstance } from "antd";
import { message } from "antd";
import { useSelector } from "react-redux";
import type { DraftFile } from "../../../store/slices/featuresForms";
import { isCreationDraftKey } from "../../../store/slices/featuresForms";
import { getJWT } from "../../../store/slices/auth";
import { DokumentItem } from "../DocumentPreview";
import { getDocumentKey } from "../FilePreview";
import FeatureFormLayout from "./FeatureFormLayout";
import { useCreateFeatureDraft } from "../useCreateFeatureDraft";
import { extractListItem } from "../BelisSidebar";
import LeitungFormFields from "./LeitungFormFields";
import { updateDataByClassName } from "../../../helper/apiMethods";
import { uploadDraftFiles } from "../../../helper/uploadDraftFiles";

interface LeitungFormProps {
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

const LeitungForm = ({
  data,
  rawFeature,
  onClose,
  readOnly = true,
  loading,
  draftValues,
  draftFiles,
  hasDraft,
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
}: LeitungFormProps) => {
  const removedDocumentKeys = removedDocumentKeysProp ?? new Set<string>();
  const formRef = useRef<FormInstance | null>(null);
  const [saving, setSaving] = useState(false);
  const [localDocuments, setLocalDocuments] = useState<DokumentItem[] | null>(
    null
  );
  const jwt = useSelector(getJWT);
  const createFeatureDraft = useCreateFeatureDraft();

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

  // Extract documents from leitung[0].dokumenteArray
  const leitungData = data as Record<string, unknown>;
  const leitungArray = leitungData?.leitung as
    | Array<Record<string, unknown>>
    | undefined;
  const serverDocuments: DokumentItem[] =
    (leitungArray?.[0]?.dokumenteArray as DokumentItem[]) || [];
  const documents = localDocuments ?? serverDocuments;

  // Extract leitung object and ID
  const lt = leitungArray?.[0] || null;
  const leitungId = lt?.id as number | undefined;

  // Extract subtitle - use rawFeature (vector tile) to match list display
  const rawProps = rawFeature?.properties;
  const subtitle =
    (rawProps?.leitungstyp_bezeichnung as string) ||
    (rawProps?.bezeichnung as string) ||
    "-ohne Bezeichnung-";

  // Compute sidebar main title to display in form header
  const isCreation =
    typeof rawProps?.id === "string" && isCreationDraftKey(rawProps.id);
  // Header identifier comes from the shared sidebar extractor, so the sticky
  // header reads identically to the sidebar row — drafts included.
  const sidebarMain = extractListItem("leitungen", rawFeature).main;

  const handleSave = async () => {
    if (!jwt) {
      message.error("Nicht authentifiziert");
      return;
    }

    if (!leitungId) {
      message.error("Keine Leitungs-ID gefunden");
      return;
    }

    if (!formRef.current) {
      return;
    }

    setSaving(true);
    try {
      const rawValues = formRef.current.getFieldsValue();
      // Ensure cleared fields are sent as null instead of being omitted
      const formValues = {
        fk_leitungstyp: rawValues.fk_leitungstyp ?? null,
        fk_material: rawValues.fk_material ?? null,
        fk_querschnitt: rawValues.fk_querschnitt ?? null,
      };

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

      const dataToSave = {
        id: leitungId,
        ...formValues,
        // Include updated documents array when changed
        ...(finalDokumenteArray !== undefined
          ? { dokumenteArray: finalDokumenteArray }
          : {}),
      };

      console.log("xxx saving leitung:", JSON.stringify(dataToSave, null, 2));
      await updateDataByClassName(jwt, "leitung", dataToSave);

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
      message.success("Leitung gespeichert");
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
      title={`Leitung ${sidebarMain}`}
      cancelLabel={sidebarMain || ""}
      isCreation={isCreation}
      formHeaderContent={formHeaderContent}
      subtitle={subtitle}
      documents={documents}
      jwt={jwt}
      draftFiles={draftFiles}
      onDraftFilesChange={onDraftFilesChange}
      removedDocumentKeys={removedDocumentKeys}
      onToggleRemoveDocument={handleToggleRemoveDocument}
      debugData={data}
      rawFeatureData={rawFeature}
      loading={loading}
      saving={saving}
      readOnly={readOnly}
      hasDraft={hasDraft || removedDocumentKeys.size > 0}
      onToggleReadOnly={onToggleReadOnly}
      onCancel={onCancel}
      onSave={handleSave}
      onCreateRelatedDraft={() => createFeatureDraft("leitung")}
      featureType="leitung"
    >
      <LeitungFormFields
        leitung={lt}
        readOnly={readOnly}
        featureId={featureId}
        onFormInstance={setFormInstance}
        draftValues={draftValues}
        onValuesChange={handleValuesChange}
        onOriginalValues={onOriginalValues}
      />
    </FeatureFormLayout>
  );
};

export default LeitungForm;
