import { useEffect, useState } from "react";
import { Form, Input, InputNumber, Row, Col, message } from "antd";
import type { FormInstance, UploadFile } from "antd";
import FormActionButtons from "../FormActionButtons";
import DocumentPreview, { DokumentItem } from "../DocumentPreview";
import { uploadBelisDocument, fileToBase64 } from "../../../helper/apiMethods";
import { useSyncOptional } from "@carma-providers/syncing";
import { saveKeyTableItemWithCallback } from "../../../helper/syncHelper";

// Server response structure for uploaded documents
interface UploadedDocumentResponse {
  id: number;
  description: string;
  name: string | null;
  typ: string | null;
  url_id?: {
    id: number;
    object_name: string;
    url_base_id?: {
      id: number;
      prot_prefix: string;
      server: string;
      path: string;
    };
  };
}

// Numeric fields - lph is double precision, wandstaerke is integer
const DOUBLE_FIELDS = ["lph"];
const INTEGER_FIELDS = ["wandstaerke"];

// Helper to get unique identifier for a document (handles id: -1 case)
const getDocumentKey = (doc: DokumentItem) => {
  // Prefer url.object_name as it's unique, fallback to description or id
  return (
    doc.dms_url?.url?.object_name || doc.dms_url?.description || doc.dms_url?.id
  );
};

interface MasttypFormProps {
  item: Record<string, unknown>;
  tableName: string;
  onSave: (updatedItem: Record<string, unknown>) => void;
  onIdUpdated?: (oldId: number, newId: number, tableName: string) => void;
  onFormReady?: (form: FormInstance) => void;
  onValuesChange?: (hasChanges: boolean) => void;
  disabled?: boolean;
  jwt?: string;
  formHasChanges?: boolean;
  onReset?: () => void;
  hideButtons?: boolean;
  onSaveError?: () => void;
  isSaving?: boolean;
  onValidationChange?: (hasErrors: boolean) => void;
}

const MasttypForm = ({
  item,
  tableName,
  onSave,
  onIdUpdated,
  onFormReady,
  onValuesChange,
  disabled = false,
  jwt,
  formHasChanges = false,
  onReset,
  hideButtons = false,
  onSaveError,
  isSaving = false,
  onValidationChange,
}: MasttypFormProps) => {
  const [form] = Form.useForm();
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<UploadFile[]>([]);
  const [removedDocuments, setRemovedDocuments] = useState<DokumentItem[]>([]);
  const sync = useSyncOptional();

  // Reset pending state when item changes (server confirmed save or selecting different item)
  useEffect(() => {
    setPendingConfirmation(false);
    // Only reset removedDocuments if the item no longer contains the removed docs
    // This prevents the flash of all documents appearing before the updated item arrives
    setRemovedDocuments((prev) => {
      if (prev.length === 0) return prev;
      const currentDocs = (item.dokumenteArray as DokumentItem[]) || [];
      // Keep only removed docs that still exist in the current item
      const stillRelevant = prev.filter((removed) =>
        currentDocs.some(
          (doc) => getDocumentKey(doc) === getDocumentKey(removed)
        )
      );
      return stillRelevant;
    });
    setPendingFiles([]);
  }, [item]);

  // Reset removed documents when formHasChanges becomes false (e.g., after Abbrechen)
  // But NOT when we're pending confirmation (waiting for server response after save)
  useEffect(() => {
    if (
      !formHasChanges &&
      !pendingConfirmation &&
      (removedDocuments.length > 0 || pendingFiles.length > 0)
    ) {
      setRemovedDocuments([]);
      setPendingFiles([]);
    }
  }, [formHasChanges, pendingConfirmation]);

  useEffect(() => {
    if (onFormReady) {
      onFormReady(form);
    }
  }, [form, onFormReady]);

  const handleValuesChange = () => {
    if (onValuesChange) {
      const currentValues = form.getFieldsValue();
      const hasChanges = Object.keys(currentValues).some(
        (key) => currentValues[key] !== item[key]
      );
      onValuesChange(hasChanges);
    }

    // Check for validation errors
    form
      .validateFields({ validateOnly: true })
      .then(() => onValidationChange?.(false))
      .catch((errorInfo) => {
        const hasErrors = errorInfo.errorFields?.length > 0;
        onValidationChange?.(hasErrors);
      });
  };

  const handleFilesChange = (files: UploadFile[]) => {
    setPendingFiles(files);
    onValuesChange?.(files.length > 0 || removedDocuments.length > 0);
  };

  const handleRemoveDocument = (doc: DokumentItem) => {
    setRemovedDocuments((prev) => [...prev, doc]);
    onValuesChange?.(true);
  };

  const uploadPendingFiles = async (): Promise<DokumentItem[]> => {
    if (!jwt || pendingFiles.length === 0) return [];

    const uploadPromises = pendingFiles.map(async (uploadFile) => {
      const file = uploadFile.originFileObj;
      if (!file) return null;

      try {
        const data = await fileToBase64(file);

        const result = await uploadBelisDocument(jwt, {
          name: uploadFile.name,
          data,
        });

        return { name: uploadFile.name, result };
      } catch (error) {
        return {
          name: uploadFile.name,
          result: {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          },
        };
      }
    });

    const results = await Promise.all(uploadPromises);

    const successful = results.filter((r) => r?.result.success);
    const failed = results.filter((r) => r && !r.result.success);

    if (successful.length > 0) {
      message.success(`${successful.length} Dokument(e) hochgeladen`);
    }
    if (failed.length > 0) {
      message.error(`${failed.length} Dokument(e) fehlgeschlagen`);
    }

    setPendingFiles([]);

    // Transform successful uploads to DokumentItem format
    const newDocuments: DokumentItem[] = successful
      .filter((r) => r?.result.data)
      .map((r) => {
        // Server returns { contentType, res } where res is a JSON string
        const responseWrapper = r!.result.data as { res: string };
        const serverResponse = JSON.parse(
          responseWrapper.res
        ) as UploadedDocumentResponse;
        // Server returns url_id, but DokumentItem expects url
        return {
          dms_url: {
            id: serverResponse.id,
            description: serverResponse.description,
            name: serverResponse.name,
            typ: serverResponse.typ,
            url: {
              id: serverResponse.url_id?.id,
              object_name: serverResponse.url_id?.object_name,
              url_base: serverResponse.url_id?.url_base_id
                ? {
                    id: serverResponse.url_id.url_base_id.id,
                    prot_prefix: serverResponse.url_id.url_base_id.prot_prefix,
                    server: serverResponse.url_id.url_base_id.server,
                    path: serverResponse.url_id.url_base_id.path,
                  }
                : undefined,
            },
          },
        };
      });

    return newDocuments;
  };

  // Custom handler that updates item after server confirms save
  // Called for BOTH new items and updates (via saveKeyTableItemWithCallback)
  const handleIdUpdatedWithFetch = (
    oldId: number,
    newId: number,
    tableName: string,
    savedItem: Record<string, unknown>
  ) => {
    // For new items, also call the original onIdUpdated to update parent ID in Redux
    if (oldId !== newId && onIdUpdated) {
      onIdUpdated(oldId, newId, tableName);
    }

    // Update with the saved item data (includes updated dokumenteArray)
    onSave({ ...savedItem, id: newId });
  };

  const handleSave = async (values: Record<string, unknown>) => {
    if (!jwt) {
      message.error("Nicht authentifiziert");
      onSaveError?.();
      return;
    }

    // Convert empty numeric fields to null (not 0)
    const processedValues = { ...values };
    [...DOUBLE_FIELDS, ...INTEGER_FIELDS].forEach((field) => {
      const value = processedValues[field];
      // Convert empty string, undefined, or 0 to null for numeric fields
      if (value === "" || value === undefined || value === 0) {
        processedValues[field] = null;
      } else if (typeof value === "string" && value.trim() !== "") {
        // Convert string numbers to actual numbers
        const num = parseFloat(value);
        processedValues[field] = isNaN(num) ? null : num;
      }
    });

    // Upload pending files first and get the new document items
    let newDocuments: DokumentItem[] = [];
    if (pendingFiles.length > 0) {
      newDocuments = await uploadPendingFiles();
    }

    // Combine existing documents with newly uploaded ones, excluding removed ones
    const existingDocuments = (item.dokumenteArray as DokumentItem[]) || [];
    const filteredExistingDocuments = existingDocuments.filter(
      (doc) =>
        !removedDocuments.some(
          (removed) => getDocumentKey(removed) === getDocumentKey(doc)
        )
    );
    const updatedDokumenteArray = [
      ...filteredExistingDocuments,
      ...newDocuments,
    ];

    const updatedItem = {
      ...item,
      ...processedValues,
      dokumenteArray: updatedDokumenteArray,
    };

    // Save form data via sync system with updated documents
    const result = saveKeyTableItemWithCallback({
      item: updatedItem,
      values: {
        ...processedValues,
        dokumenteArray: updatedDokumenteArray,
      },
      tableName,
      sync,
      onIdUpdated: (oldId, newId, tableName) => {
        handleIdUpdatedWithFetch(oldId, newId, tableName, updatedItem);
      },
    });

    if (result.success) {
      message.success("Aktion zur Synchronisation hinzugefügt");

      // Always wait for callback (both new and updates)
      // Don't call onSave here - the callback will call it with confirmed data
      setPendingConfirmation(true);

      onValuesChange?.(false);
    } else {
      message.error(result.error || "Fehler beim Speichern");
      onSaveError?.();
    }
  };

  const dokumenteArray = item.dokumenteArray as DokumentItem[] | undefined;

  return (
    <Form
      form={form}
      initialValues={item}
      onFinish={handleSave}
      onValuesChange={handleValuesChange}
      layout="vertical"
      style={{ padding: "8px 0" }}
      disabled={disabled || pendingConfirmation || isSaving}
    >
      <Row gutter={24}>
        <Col span={12}>
          <Form.Item
            name="masttyp"
            label={
              <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
                Masttyp
              </span>
            }
            rules={[{ max: 5, message: "Maximal 5 Zeichen erlaubt" }]}
            style={{ marginBottom: 16 }}
          >
            <Input />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="bezeichnung"
            label={
              <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
                Bezeichnung
              </span>
            }
            style={{ marginBottom: 16 }}
          >
            <Input />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={24}>
        <Col span={12}>
          <Form.Item
            name="hersteller"
            label={
              <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
                Hersteller
              </span>
            }
            style={{ marginBottom: 16 }}
          >
            <Input />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="wandstaerke"
            label={
              <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
                Wandstärke (in mm)
              </span>
            }
            style={{ marginBottom: 16 }}
          >
            <InputNumber style={{ width: "100%" }} precision={0} />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={24}>
        <Col span={12}>
          <Form.Item
            name="lph"
            label={
              <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
                LPH (Lichtpunkthöhe in Meter)
              </span>
            }
            style={{ marginBottom: 16 }}
          >
            <InputNumber
              style={{ width: "100%" }}
              decimalSeparator=","
              precision={2}
            />
          </Form.Item>
        </Col>
      </Row>
      <DocumentPreview
        documents={(dokumenteArray || []).filter(
          (doc) =>
            !removedDocuments.some(
              (removed) => getDocumentKey(removed) === getDocumentKey(doc)
            )
        )}
        jwt={jwt}
        onFilesChange={handleFilesChange}
        pendingFiles={pendingFiles}
        onRemoveDocument={handleRemoveDocument}
        isSaving={isSaving}
      />
    </Form>
  );
};

export default MasttypForm;
