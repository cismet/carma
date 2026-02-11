import { useEffect, useState } from "react";
import { Form, Row, Col, Select } from "antd";
import type { UploadFile } from "antd";
import { useSelector } from "react-redux";
import { getKeyTablesData } from "../../../store/slices/keyTables";
import { getJWT } from "../../../store/slices/auth";
import { DokumentItem } from "../DocumentPreview";
import FeatureFormLayout from "./FeatureFormLayout";

interface LeitungFormProps {
  data: Record<string, unknown> | null;
  onClose?: () => void;
}

interface KeyTableItem {
  id: number;
  bezeichnung?: string;
  groesse?: string;
}

const LeitungForm = ({ data, onClose }: LeitungFormProps) => {
  const [form] = Form.useForm();
  const [pendingFiles, setPendingFiles] = useState<UploadFile[]>([]);
  const keyTablesData = useSelector(getKeyTablesData);
  const jwt = useSelector(getJWT);

  const leitungstypOptions = (keyTablesData.leitungstyp ||
    []) as KeyTableItem[];
  const materialOptions = (keyTablesData.materialLeitung ||
    []) as KeyTableItem[];
  const querschnittOptions = (keyTablesData.querschnitt ||
    []) as KeyTableItem[];

  // Extract documents from data
  const documents: DokumentItem[] = (data?.dokumente as DokumentItem[]) || [];

  useEffect(() => {
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
      title="Leitung bearbeiten"
      subtitle="Füllen Sie die folgenden Informationen aus"
      documents={documents}
      jwt={jwt}
      pendingFiles={pendingFiles}
      onFilesChange={setPendingFiles}
      debugData={data}
    >
      <Form form={form} layout="vertical" requiredMark={false} className="pr-2">
        {/* Leitungstyp - Full Width */}
        <Form.Item
          name="fk_leitungstyp"
          label={<FormLabel>Leitungstyp</FormLabel>}
          className="mb-4"
        >
          <Select
            placeholder="Leitungstyp auswählen"
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
                placeholder="Material auswählen"
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
                placeholder="Querschnitt auswählen"
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
