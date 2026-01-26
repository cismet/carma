import { useEffect, useState } from "react";
import { Form, Input, Row, Col, Select, List, message } from "antd";
import FormActionButtons from "../FormActionButtons";
import type { FormInstance } from "antd";
import { FilePdfOutlined } from "@ant-design/icons";
import { downloadDocument } from "../../../helper/documentHelper";
import { useSyncOptional } from "@carma-providers/syncing";
import { saveKeyTableItem } from "../../../helper/syncHelper";

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
  onIdUpdated?: (oldId: number, newId: number, tableName: string) => void;
  onFormReady?: (form: FormInstance) => void;
  onValuesChange?: (hasChanges: boolean) => void;
  disabled?: boolean;
  jwt?: string;
  formHasChanges?: boolean;
  onReset?: () => void;
  hideButtons?: boolean;
  onSaveError?: () => void;
  onValidationChange?: (hasErrors: boolean) => void;
}

const RundsteuerempfaengerForm = ({
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
  onSaveError,
  onValidationChange,
}: RundsteuerempfaengerFormProps) => {
  const [form] = Form.useForm();
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [hasValidationErrors, setHasValidationErrors] = useState(false);
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

    // Check for validation errors
    form
      .validateFields({ validateOnly: true })
      .then(() => {
        setHasValidationErrors(false);
        onValidationChange?.(false);
      })
      .catch((errorInfo) => {
        const hasErrors = errorInfo.errorFields?.length > 0;
        setHasValidationErrors(hasErrors);
        onValidationChange?.(hasErrors);
      });
  };

  const handleSave = (values: Record<string, unknown>) => {
    if (!jwt) {
      message.error("Nicht authentifiziert");
      onSaveError?.();
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
      onSaveError?.();
    }
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
      disabled={disabled || pendingConfirmation}
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
      {!disabled && !hideButtons && (
        <FormActionButtons
          formHasChanges={formHasChanges}
          onReset={onReset}
          hasValidationErrors={hasValidationErrors}
        />
      )}
    </Form>
  );
};

export default RundsteuerempfaengerForm;
