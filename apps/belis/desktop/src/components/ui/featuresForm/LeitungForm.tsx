import { useEffect, useState } from "react";
import { Form, Row, Col, Select } from "antd";
import type { UploadFile } from "antd";
import { useSelector } from "react-redux";
import { getKeyTablesData } from "../../../store/slices/keyTables";
import { getJWT } from "../../../store/slices/auth";
import { DokumentItem } from "../DocumentPreview";
import FeatureFormLayout from "./FeatureFormLayout";
import { getFormClassName, getPlaceholder } from "./readOnlyFormUtils";

interface LeitungFormProps {
  data: Record<string, unknown> | null;
  rawFeature?: { properties?: Record<string, unknown> } | null;
  onClose?: () => void;
  readOnly?: boolean;
  loading?: boolean;
}

interface KeyTableItem {
  id: number;
  bezeichnung?: string;
  groesse?: string;
}

const LeitungForm = ({ data, rawFeature, onClose, readOnly = true, loading }: LeitungFormProps) => {
  const [form] = Form.useForm();
  const [pendingFiles, setPendingFiles] = useState<UploadFile[]>([]);
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
        form.setFieldsValue({
          fk_leitungstyp: leitungData.fk_leitungstyp,
          fk_material: leitungData.fk_material,
          fk_querschnitt: leitungData.fk_querschnitt,
        });
      }
    }
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
      pendingFiles={pendingFiles}
      onFilesChange={setPendingFiles}
      debugData={data}
      loading={loading}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        className={getFormClassName(readOnly, "pr-2")}
      >
        {/* Leitungstyp - Full Width */}
        <Form.Item
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
        </Form.Item>

        {/* Material and Querschnitt - Side by Side */}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
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
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
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
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </FeatureFormLayout>
  );
};

export default LeitungForm;
