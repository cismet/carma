import { useEffect } from "react";
import { Form, Row, Col, Select } from "antd";
import { useSelector } from "react-redux";
import type { DraftFile } from "../../../store/slices/featuresForms";
import { getKeyTablesData } from "../../../store/slices/keyTables";
import { getJWT } from "../../../store/slices/auth";
import { DokumentItem } from "../DocumentPreview";
import FeatureFormLayout from "./FeatureFormLayout";
import { getFormClassName, getPlaceholder } from "./readOnlyFormUtils";
import { FormItem } from "./DraftFieldHighlight";

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
}

interface KeyTableItem {
  id: number;
  bezeichnung?: string;
  groesse?: string;
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
  onDraftChange,
  onDraftFilesChange,
  onOriginalValues,
  onToggleReadOnly,
  onCancel,
  onSaveComplete,
}: LeitungFormProps) => {
  const [form] = Form.useForm();

  const handleSave = () => {
    console.log("Leitung form values:", form.getFieldsValue());
    onSaveComplete?.();
  };
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

  // Extract documents from leitung[0].dokumenteArray
  const leitungData = data as Record<string, unknown>;
  const leitungArray = leitungData?.leitung as
    | Array<Record<string, unknown>>
    | undefined;
  const documents: DokumentItem[] =
    (leitungArray?.[0]?.dokumenteArray as DokumentItem[]) || [];

  // Extract subtitle - use rawFeature (vector tile) to match list display
  const rawProps = rawFeature?.properties;
  const subtitle =
    (rawProps?.leitungstyp_bezeichnung as string) ||
    (rawProps?.bezeichnung as string) ||
    "-ohne Bezeichnung-";

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

  if (!data) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400">
        Keine Daten ausgewählt
      </div>
    );
  }

  const FormLabel = ({ children }: { children: React.ReactNode }) => (
    <span className="text-sm font-medium text-gray-700">{children}</span>
  );

  return (
    <FeatureFormLayout
      title="Leitung"
      subtitle={subtitle}
      documents={documents}
      jwt={jwt}
      draftFiles={draftFiles}
      onDraftFilesChange={onDraftFilesChange}
      debugData={data}
      loading={loading}
      readOnly={readOnly}
      hasDraft={hasDraft}
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
