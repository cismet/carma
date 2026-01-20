import { useEffect, useState } from "react";
import { Form, Input, Row, Col, message } from "antd";
import type { FormInstance, UploadFile } from "antd";
import FormActionButtons from "../FormActionButtons";
import DocumentPreview, { DokumentItem } from "../DocumentPreview";
import { uploadBelisDocument, fileToBase64 } from "../../../helper/apiMethods";
import { useSyncOptional } from "@carma-providers/syncing";
import { saveKeyTableItem } from "../../../helper/syncHelper";

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

interface LeuchentypFormProps {
  item: Record<string, unknown>;
  tableName: string;
  onSave: (updatedItem: Record<string, unknown>) => void;
  onIdUpdated?: (oldId: number, newId: number, tableName: string) => void;
  onActionCreated?: (actionId: string) => void;
  onFormReady?: (form: FormInstance) => void;
  onValuesChange?: (hasChanges: boolean) => void;
  disabled?: boolean;
  jwt?: string;
  formHasChanges?: boolean;
  onReset?: () => void;
  hideButtons?: boolean;
}

const LeuchentypForm = ({
  item,
  tableName,
  onSave,
  onIdUpdated,
  onActionCreated,
  onFormReady,
  onValuesChange,
  disabled = false,
  jwt,
  formHasChanges = false,
  onReset,
  hideButtons = false,
}: LeuchentypFormProps) => {
  const [form] = Form.useForm();
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<UploadFile[]>([]);
  const [removedDocuments, setRemovedDocuments] = useState<DokumentItem[]>([]);
  const sync = useSyncOptional();

  // Reset pending state when ID becomes positive (server confirmed)
  useEffect(() => {
    if ((item.id as number) > 0) {
      setPendingConfirmation(false);
    }
  }, [item.id]);

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

  const handleSave = async (values: Record<string, unknown>) => {
    if (!jwt) {
      message.error("Nicht authentifiziert");
      return;
    }

    // Upload pending files first and get the new document items
    let newDocuments: DokumentItem[] = [];
    if (pendingFiles.length > 0) {
      newDocuments = await uploadPendingFiles();
    }

    // Combine existing documents with newly uploaded ones, excluding removed ones
    const existingDocuments = (item.dokumenteArray as DokumentItem[]) || [];
    const filteredExistingDocuments = existingDocuments.filter(
      (doc) => !removedDocuments.some((removed) => removed.dms_url?.id === doc.dms_url?.id)
    );
    const updatedDokumenteArray = [...filteredExistingDocuments, ...newDocuments];
    console.log("xxx updatedDokumenteArray", updatedDokumenteArray);

    // Save form data via sync system with updated documents
    const result = await saveKeyTableItem({
      item: {
        ...item,
        dokumenteArray: updatedDokumenteArray,
      },
      values: {
        ...values,
        dokumenteArray: updatedDokumenteArray,
      },
      tableName,
      sync,
      onIdUpdated,
    });

    if (result.success) {
      message.success("Aktion zur Synchronisation hinzugefügt");
      // Pass the complete updated item (not result.savedItem which only has form values)
      onSave({ ...item, ...values, dokumenteArray: updatedDokumenteArray });

      // Notify parent about the action ID for cross-tab sync tracking
      if (result.actionId) {
        onActionCreated?.(result.actionId);
      }

      if (result.isNewItem) {
        setPendingConfirmation(true);
      }

      // Reset removed documents after successful save
      setRemovedDocuments([]);
      onValuesChange?.(false);
    } else {
      message.error(result.error || "Fehler beim Speichern");
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
      disabled={disabled || pendingConfirmation}
    >
      <Row gutter={24}>
        <Col span={12}>
          <Form.Item
            name="leuchtentyp"
            label={
              <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
                Leuchtentyp
              </span>
            }
            style={{ marginBottom: 16 }}
          >
            <Input />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="fabrikat"
            label={
              <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
                Fabrikat
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
            name="typenbezeichnung"
            label={
              <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
                Typenbezeichnung
              </span>
            }
            style={{ marginBottom: 16 }}
          >
            <Input />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="bestueckung"
            label={
              <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
                Bestückung
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
            name="leistung"
            label={
              <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
                Leistung
              </span>
            }
            style={{ marginBottom: 16 }}
          >
            <Input />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="leistung_brutto"
            label={
              <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
                Leistung - Brutto
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
            name="leistung_reduziert"
            label={
              <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
                Leistung Reduziert
              </span>
            }
            style={{ marginBottom: 16 }}
          >
            <Input />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="leistung_brutto_reduziert"
            label={
              <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
                Leistung Brutto - Reduziert
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
            name="lampe"
            label={
              <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
                Lampe
              </span>
            }
            style={{ marginBottom: 16 }}
          >
            <Input />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="vorschaltgeraet"
            label={
              <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
                Vorschaltgerät
              </span>
            }
            style={{ marginBottom: 16 }}
          >
            <Input />
          </Form.Item>
        </Col>
      </Row>
      <DocumentPreview
        documents={(dokumenteArray || []).filter(
          (doc) => !removedDocuments.some((removed) => removed.dms_url?.id === doc.dms_url?.id)
        )}
        jwt={jwt}
        onFilesChange={handleFilesChange}
        pendingFiles={pendingFiles}
        onRemoveDocument={handleRemoveDocument}
      />
      {/* <DocumentUploader /> */}
      {!disabled && !hideButtons && (
        <FormActionButtons formHasChanges={formHasChanges} onReset={onReset} />
      )}
    </Form>
  );
};

export default LeuchentypForm;
