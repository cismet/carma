import { useEffect } from "react";
import { Form, Input, Row, Col, List } from "antd";
import type { FormInstance } from "antd";
import { FilePdfOutlined } from "@ant-design/icons";

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

interface DokumentItem {
  dms_url: DmsUrlInner;
}

interface MasttypFormProps {
  item: Record<string, unknown>;
  tableName: string;
  onSave: (updatedItem: Record<string, unknown>) => void;
  onFormReady?: (form: FormInstance) => void;
  onValuesChange?: (hasChanges: boolean) => void;
  disabled?: boolean;
}

const MasttypForm = ({
  item,
  onSave,
  onFormReady,
  onValuesChange,
  disabled = false,
}: MasttypFormProps) => {
  const [form] = Form.useForm();
  console.log("xxx form item", item);

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

  const dokumenteArray = item.dokumenteArray as DokumentItem[] | undefined;

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
            name="masttyp"
            label={
              <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
                Masttyp
              </span>
            }
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
            <Input />
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
            <Input />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item
        label={
          <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
            Dokumente
          </span>
        }
        style={{ marginBottom: 16 }}
      >
        <List
          size="small"
          bordered
          dataSource={dokumenteArray || []}
          locale={{ emptyText: "Keine Dokumente" }}
            renderItem={(doc) => (
              <List.Item
                style={{ cursor: "pointer" }}
                className="hover:bg-gray-50"
                onClick={async () => {
                  const urlData = doc.dms_url?.url;
                  if (urlData?.object_name && urlData?.url_base) {
                    const { prot_prefix, server, path } = urlData.url_base;
                    const fullUrl = `${prot_prefix}${server}${path}${urlData.object_name}`;
                    try {
                      const response = await fetch(fullUrl);
                      const blob = await response.blob();
                      const downloadUrl = window.URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.href = downloadUrl;
                      link.download =
                        doc.dms_url?.description || urlData.object_name;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      window.URL.revokeObjectURL(downloadUrl);
                    } catch (error) {
                      console.error("Download failed:", error);
                    }
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <FilePdfOutlined style={{ color: "#ff4d4f" }} />
                  <span>
                    {doc.dms_url?.description ||
                      doc.dms_url?.url?.object_name ||
                      "Dokument"}
                  </span>
                </div>
              </List.Item>
            )}
          />
        </Form.Item>
    </Form>
  );
};

export default MasttypForm;
