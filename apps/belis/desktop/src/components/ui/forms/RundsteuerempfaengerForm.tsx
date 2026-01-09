import { useEffect } from "react";
import { Form, Input, Row, Col, Select, List } from "antd";
import type { FormInstance } from "antd";
import { FilePdfOutlined } from "@ant-design/icons";
import { downloadDocument } from "../../../helper/documentHelper";

interface DmsUrlInner {
  id: number;
  description: string;
  name: string | null;
  typ: string | null;
  url: {
    id: number;
    object_name: string;
    url_base?: {
      id: number;
      prot_prefix: string;
      server: string;
      path: string;
    };
  };
}

interface RundsteuerempfaengerFormProps {
  item: Record<string, unknown>;
  tableName: string;
  onSave: (updatedItem: Record<string, unknown>) => void;
  onFormReady?: (form: FormInstance) => void;
  onValuesChange?: (hasChanges: boolean) => void;
  disabled?: boolean;
  jwt?: string;
}

const RundsteuerempfaengerForm = ({
  item,
  onSave,
  onFormReady,
  onValuesChange,
  disabled = false,
  jwt,
}: RundsteuerempfaengerFormProps) => {
  const [form] = Form.useForm();

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

  const handleSave = (values: Record<string, unknown>) => {
    onSave({ ...values, id: item.id });
  };

  const dmsUrl = item.dms_url as DmsUrlInner | undefined;

  return (
    <Form
      form={form}
      initialValues={item}
      onFinish={handleSave}
      onValuesChange={handleValuesChange}
      layout="vertical"
      style={{ padding: "8px 0" }}
      disabled={disabled}
    >
      <Row gutter={24}>
        <Col span={12}>
          <Form.Item
            name="herrsteller_rs"
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
            name="rs_typ"
            label={
              <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
                Typ
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
            name="anschlusswert"
            label={
              <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
                Anschlusswert
              </span>
            }
            style={{ marginBottom: 16 }}
          >
            <Input />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="programm"
            label={
              <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
                Programm
              </span>
            }
            style={{ marginBottom: 16 }}
          >
            <Select>
              <Select.Option value="A">A</Select.Option>
              <Select.Option value="B">B</Select.Option>
            </Select>
          </Form.Item>
        </Col>
      </Row>

      {dmsUrl && (
        <Form.Item
          label={
            <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
              Dokument
            </span>
          }
          style={{ marginBottom: 16 }}
        >
          <List
            size="small"
            bordered
            dataSource={[dmsUrl]}
            locale={{ emptyText: "Keine Dokumente" }}
            renderItem={(doc) => (
              <List.Item
                style={{ cursor: "pointer" }}
                className="hover:bg-gray-50"
                onClick={async () => {
                  const urlData = doc.url;
                  if (urlData?.object_name && jwt) {
                    try {
                      await downloadDocument(
                        jwt,
                        urlData.object_name,
                        doc.description || urlData.object_name
                      );
                    } catch (error) {
                      console.error("Download failed:", error);
                    }
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <FilePdfOutlined style={{ color: "#ff4d4f" }} />
                  <span>
                    {doc.description || doc.url?.object_name || "Dokument"}
                  </span>
                </div>
              </List.Item>
            )}
          />
        </Form.Item>
      )}
    </Form>
  );
};

export default RundsteuerempfaengerForm;
