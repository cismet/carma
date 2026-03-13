import { useState, useEffect, useCallback } from "react";
import { Form, Row, Col, Select, message } from "antd";
import { useSelector } from "react-redux";
import type { DraftFile } from "../../../store/slices/featuresForms";
import { getKeyTablesData } from "../../../store/slices/keyTables";
import { getJWT } from "../../../store/slices/auth";
import { DokumentItem } from "../DocumentPreview";
import { getDocumentKey } from "../FilePreview";
import FeatureFormLayout from "./FeatureFormLayout";
import { getFormClassName, getPlaceholder } from "./readOnlyFormUtils";
import { FormItem } from "./DraftFieldHighlight";
import { updateDataByClassName } from "../../../helper/apiMethods";
import { uploadDraftFiles } from "../../../helper/uploadDraftFiles";

interface LeitungFormProps {
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

interface KeyTableItem {
  id: number;
  bezeichnung?: string;
  groesse?: string;
}

const FormLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-gray-700">{children}</span>
);

const LeitungForm = ({
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
}: LeitungFormProps) => {
  const removedDocumentKeys = removedDocumentKeysProp ?? new Set<string>();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [localDocuments, setLocalDocuments] = useState<DokumentItem[] | null>(
    null
  );
  const keyTablesData = useSelector(getKeyTablesData);
  const jwt = useSelector(getJWT);

  const leitungstypOptions = [
    ...((keyTablesData.leitungstyp || []) as KeyTableItem[]),
  ].sort((a, b) => (a.bezeichnung || "").localeCompare(b.bezeichnung || ""));
  const materialOptions = [
    ...((keyTablesData.materialLeitung || []) as KeyTableItem[]),
  ].sort((a, b) => (a.bezeichnung || "").localeCompare(b.bezeichnung || ""));
  const querschnittOptions = [
    ...((keyTablesData.querschnitt || []) as KeyTableItem[]),
  ].sort((a, b) => Number(a.groesse || 0) - Number(b.groesse || 0));

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
  const sidebarMain = rawProps?.id ? `L-${rawProps.id}` : "";

  useEffect(() => {
    // Reset form when data changes to clear old values
    form.resetFields();

    if (data) {
      const leitungData = data.leitung?.[0] as
        | Record<string, unknown>
        | undefined;
      if (leitungData) {
        const serverValues = {
          fk_leitungstyp: leitungData.fk_leitungstyp,
          fk_material: leitungData.fk_material,
          fk_querschnitt: leitungData.fk_querschnitt,
        };
        form.setFieldsValue(serverValues);
        onOriginalValues?.(form.getFieldsValue());
      }

      if (draftValues) {
        form.setFieldsValue(draftValues);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, form]);

  const handleSave = async () => {
    if (!jwt) {
      message.error("Nicht authentifiziert");
      return;
    }

    if (!leitungId) {
      message.error("Keine Leitungs-ID gefunden");
      return;
    }

    setSaving(true);
    try {
      const rawValues = form.getFieldsValue();
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

      console.log(
        "xxx saving leitung:",
        JSON.stringify(dataToSave, null, 2)
      );
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
      title={sidebarMain ? `Leitung ${sidebarMain}` : "Leitung"}
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
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        className={getFormClassName(readOnly, "pr-2")}
        onValuesChange={(_, allValues) => onDraftChange?.(allValues)}
      >
        {/* Leitungstyp - Full Width */}
        <FormItem
          name="fk_leitungstyp"
          label={<FormLabel>Leitungstyp</FormLabel>}
          className="mb-4"
        >
          <Select
            placeholder={getPlaceholder(readOnly, "Leitungstyp auswählen")}
            className="w-full"
            size="large"
            showSearch
            allowClear
            optionFilterProp="children"
          >
            {leitungstypOptions.map((item) => (
              <Select.Option key={item.id} value={item.id}>
                {item.bezeichnung}
              </Select.Option>
            ))}
          </Select>
        </FormItem>

        {/* Material and Querschnitt - Side by Side */}
        <Row gutter={16}>
          <Col span={12}>
            <FormItem
              name="fk_material"
              label={<FormLabel>Material</FormLabel>}
              className="mb-4"
            >
              <Select
                placeholder={getPlaceholder(readOnly, "Material auswählen")}
                className="w-full"
                size="large"
                showSearch
                allowClear
                optionFilterProp="children"
              >
                {materialOptions.map((item) => (
                  <Select.Option key={item.id} value={item.id}>
                    {item.bezeichnung}
                  </Select.Option>
                ))}
              </Select>
            </FormItem>
          </Col>
          <Col span={12}>
            <FormItem
              name="fk_querschnitt"
              label={<FormLabel>Querschnitt</FormLabel>}
              className="mb-4"
            >
              <Select
                placeholder={getPlaceholder(readOnly, "Querschnitt auswählen")}
                className="w-full"
                size="large"
                showSearch
                allowClear
                optionFilterProp="children"
              >
                {querschnittOptions.map((item) => (
                  <Select.Option key={item.id} value={item.id}>
                    {item.groesse}
                  </Select.Option>
                ))}
              </Select>
            </FormItem>
          </Col>
        </Row>
      </Form>
    </FeatureFormLayout>
  );
};

export default LeitungForm;
