import { useEffect, useState } from "react";
import { Form, Input, Row, Col, message } from "antd";
import FormActionButtons from "../FormActionButtons";
import type { FormInstance } from "antd";
import DocumentPreview, { DokumentItem } from "../DocumentPreview";
import { useSyncOptional } from "@carma-providers/syncing";
import { saveKeyTableItem } from "../../../helper/syncHelper";
import DocumentUploader from "../DocumentUploader";

interface LeuchentypFormProps {
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
}

const LeuchentypForm = ({
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
}: LeuchentypFormProps) => {
  const [form] = Form.useForm();
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
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

  const handleSave = (values: Record<string, unknown>) => {
    if (!jwt) {
      message.error("Nicht authentifiziert");
      return;
    }

    const result = saveKeyTableItem({
      item,
      values,
      tableName,
      sync,
      onIdUpdated,
    });

    if (result.success) {
      message.success("Aktion zur Synchronisation hinzugefügt");
      onSave(result.savedItem);

      if (result.isNewItem) {
        setPendingConfirmation(true);
      }

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
      <DocumentPreview documents={dokumenteArray || []} jwt={jwt} />
      {/* <DocumentUploader /> */}
      {!disabled && !hideButtons && (
        <FormActionButtons formHasChanges={formHasChanges} onReset={onReset} />
      )}
    </Form>
  );
};

export default LeuchentypForm;
