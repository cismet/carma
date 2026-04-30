import { useState, useEffect, useCallback } from "react";
import { message } from "antd";
import { useSelector } from "react-redux";
import type { DraftFile } from "../../../store/slices/featuresForms";
import { isCreationDraftKey } from "../../../store/slices/featuresForms";
import { getJWT } from "../../../store/slices/auth";
import { DokumentItem } from "../DocumentPreview";
import { getDocumentKey } from "../FilePreview";
import FeatureFormLayout from "./FeatureFormLayout";
import { uploadDraftFiles } from "../../../helper/uploadDraftFiles";
import { updateDataByClassName } from "../../../helper/apiMethods";

interface AbzweigdoseFormProps {
  data: Record<string, unknown> | null;
  rawFeature?: {
    id?: string | number;
    properties?: Record<string, unknown>;
  } | null;
  onClose?: () => void;
  readOnly?: boolean;
  loading?: boolean;
  draftFiles?: DraftFile[];
  hasDraft?: boolean;
  isCreation?: boolean;
  onDraftFilesChange?: (files: DraftFile[]) => void;
  onToggleReadOnly?: () => void;
  onCancel?: () => void;
  onSaveComplete?: () => void;
  removedDocumentKeys?: Set<string>;
  onRemovedDocumentKeysChange?: (keys: Set<string>) => void;
}

const AbzweigdoseForm = ({
  data,
  rawFeature,
  onClose,
  readOnly = true,
  loading,
  draftFiles,
  hasDraft,
  onDraftFilesChange,
  onToggleReadOnly,
  onCancel,
  onSaveComplete,
  removedDocumentKeys: removedDocumentKeysProp,
  onRemovedDocumentKeysChange,
}: AbzweigdoseFormProps) => {
  const removedDocumentKeys = removedDocumentKeysProp ?? new Set<string>();
  const [saving, setSaving] = useState(false);
  const [localDocuments, setLocalDocuments] = useState<DokumentItem[] | null>(
    null
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

  // Extract documents from abzweigdose[0].dokumenteArray
  const abzweigdoseData = data as Record<string, unknown>;
  const abzweigdoseArray = abzweigdoseData?.abzweigdose as
    | Array<Record<string, unknown>>
    | undefined;
  const serverDocuments: DokumentItem[] =
    (abzweigdoseArray?.[0]?.dokumenteArray as DokumentItem[]) || [];
  const documents = localDocuments ?? serverDocuments;

  const abzweigdoseId = abzweigdoseArray?.[0]?.id as number | undefined;

  // Extract subtitle
  const subtitle = "Nur Dokumente verfügbar";

  const rawProps = rawFeature?.properties;
  const idValue = rawFeature?.id || rawProps?.id;
  const isCreation =
    typeof idValue === "string" && isCreationDraftKey(idValue);
  const sidebarMain = isCreation
    ? "Neuer Entwurf"
    : idValue
    ? `ID-${idValue}`
    : "";

  const handleSave = async () => {
    if (!jwt) {
      message.error("Nicht authentifiziert");
      return;
    }

    if (!abzweigdoseId) {
      message.error("Keine Abzweigdose-ID gefunden");
      return;
    }

    setSaving(true);
    try {
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

      if (finalDokumenteArray !== undefined) {
        const dataToSave = {
          id: abzweigdoseId,
          dokumenteArray: finalDokumenteArray,
        };

        await updateDataByClassName(jwt, "abzweigdose", dataToSave);

        // Update local documents so changes appear immediately
        setLocalDocuments(finalDokumenteArray);
        onRemovedDocumentKeysChange?.(new Set());

        if (removedDocumentKeys.size > 0) {
          message.success(
            removedDocumentKeys.size === 1
              ? "1 Datei gelöscht"
              : `${removedDocumentKeys.size} Dateien gelöscht`
          );
        }
        message.success("Abzweigdose gespeichert");
      }

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
      title={
        sidebarMain
          ? `Abzweigdose / Zugkasten ${sidebarMain}`
          : "Abzweigdose / Zugkasten"
      }
      cancelLabel={sidebarMain || ""}
      isCreation={isCreation}
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
      singleColumn
    >
      {null}
    </FeatureFormLayout>
  );
};

export default AbzweigdoseForm;
