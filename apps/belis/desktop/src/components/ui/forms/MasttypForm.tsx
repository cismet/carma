import { useEffect } from "react";
import { Form, Input, Row, Col } from "antd";
import FormActionButtons from "../FormActionButtons";
import type { FormInstance } from "antd";
import DocumentPreview, { DokumentItem } from "../DocumentPreview";

interface MasttypFormProps {
  item: Record<string, unknown>;
  tableName: string;
  onSave: (updatedItem: Record<string, unknown>) => void;
  onFormReady?: (form: FormInstance) => void;
  onValuesChange?: (hasChanges: boolean) => void;
  disabled?: boolean;
  jwt?: string;
  formHasChanges?: boolean;
  onReset?: () => void;
  hideButtons?: boolean;
}

const MasttypForm = ({
  item,
  onSave,
  onFormReady,
  onValuesChange,
  disabled = false,
  jwt,
  formHasChanges = false,
  onReset,
  hideButtons = false,
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
      <DocumentPreview documents={dokumenteArray || []} jwt={jwt} />
      {!disabled && !hideButtons && (
        <FormActionButtons formHasChanges={formHasChanges} onReset={onReset} />
      )}
    </Form>
  );
};

export default MasttypForm;
