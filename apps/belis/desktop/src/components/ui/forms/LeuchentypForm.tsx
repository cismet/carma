import { useEffect } from "react";
import { Form, Input, Row, Col } from "antd";
import type { FormInstance } from "antd";
import DocumentPreview, { DokumentItem } from "../DocumentPreview";

interface LeuchentypFormProps {
  item: Record<string, unknown>;
  tableName: string;
  onSave: (updatedItem: Record<string, unknown>) => void;
  onFormReady?: (form: FormInstance) => void;
  onValuesChange?: (hasChanges: boolean) => void;
  disabled?: boolean;
  jwt?: string;
}

const LeuchentypForm = ({
  item,
  onSave,
  onFormReady,
  onValuesChange,
  disabled = false,
  jwt,
}: LeuchentypFormProps) => {
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

      <Form.Item
        label={
          <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
            Dokumente
          </span>
        }
        style={{ marginBottom: 16 }}
      >
        <DocumentPreview documents={dokumenteArray || []} jwt={jwt} />
      </Form.Item>
    </Form>
  );
};

export default LeuchentypForm;
