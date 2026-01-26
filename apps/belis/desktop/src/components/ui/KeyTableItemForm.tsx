import { useEffect, useState } from "react";
import { Form, Input, message, Row, Col } from "antd";
import FormActionButtons from "./FormActionButtons";
import type { FormInstance, Rule } from "antd/es/form";
import { useSelector } from "react-redux";
import { getJWT } from "../../store/slices/auth";
import { keyTableDisplayConfig } from "../../config/keyTableDisplayConfig";
import { useSyncOptional } from "@carma-providers/syncing";
import { saveKeyTableItem } from "../../helper/syncHelper";

interface KeyTableItemFormProps {
  item: Record<string, unknown>;
  tableName: string;
  onSave: (updatedItem: Record<string, unknown>) => void;
  onIdUpdated?: (oldId: number, newId: number, tableName: string) => void;
  onFormReady?: (form: FormInstance) => void;
  onValuesChange?: (hasChanges: boolean) => void;
  disabled?: boolean;
  formHasChanges?: boolean;
  onReset?: () => void;
  hideButtons?: boolean;
  onSaveError?: () => void;
  onValidationChange?: (hasErrors: boolean) => void;
}

const KeyTableItemForm = ({
  item,
  tableName,
  onSave,
  onIdUpdated,
  onFormReady,
  onValuesChange,
  disabled = false,
  formHasChanges = false,
  onReset,
  hideButtons = false,
  onSaveError,
  onValidationChange,
}: KeyTableItemFormProps) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [hasValidationErrors, setHasValidationErrors] = useState(false);
  const jwt = useSelector(getJWT);
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

  const formatLabel = (key: string) => {
    return key
      .replace(/_/g, " ")
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  };

  const getLabel = (key: string) => {
    const fieldLabels = keyTableDisplayConfig[tableName]?.fieldLabels;
    return fieldLabels?.[key] ?? formatLabel(key);
  };

  const getRules = (key: string): Rule[] => {
    const fieldRules = keyTableDisplayConfig[tableName]?.fieldRules;
    return fieldRules?.[key] ?? [];
  };

  const handleSave = async (values: Record<string, unknown>) => {
    if (!jwt) {
      message.error("Nicht authentifiziert");
      return;
    }

    setSaving(true);
    try {
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
    } catch (error) {
      console.error("Save error:", error);
      message.error("Fehler beim Speichern");
      onSaveError?.();
    } finally {
      setSaving(false);
    }
  };

  const fieldOrder = keyTableDisplayConfig[tableName]?.fieldOrder;
  const fields = Object.entries(item)
    .filter(([key]) => key !== "id")
    .sort((a, b) => {
      if (!fieldOrder) return 0;
      const indexA = fieldOrder.indexOf(a[0]);
      const indexB = fieldOrder.indexOf(b[0]);
      // Fields not in fieldOrder go to the end
      const orderA = indexA === -1 ? Infinity : indexA;
      const orderB = indexB === -1 ? Infinity : indexB;
      return orderA - orderB;
    });
  const ifTwoColumns = fields.length > 2;

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
      {ifTwoColumns ? (
        <Row gutter={24}>
          {fields.map(([key]) => (
            <Col span={12} key={key}>
              <Form.Item
                name={key}
                label={
                  <span
                    style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}
                  >
                    {getLabel(key)}
                  </span>
                }
                rules={getRules(key)}
                style={{ marginBottom: 16 }}
              >
                <Input />
              </Form.Item>
            </Col>
          ))}
        </Row>
      ) : (
        fields.map(([key]) => (
          <Form.Item
            key={key}
            name={key}
            label={
              <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
                {getLabel(key)}
              </span>
            }
            rules={getRules(key)}
            style={{ marginBottom: 16 }}
          >
            <Input />
          </Form.Item>
        ))
      )}
      {!disabled && !pendingConfirmation && !hideButtons && (
        <FormActionButtons
          formHasChanges={formHasChanges}
          onReset={onReset}
          hasValidationErrors={hasValidationErrors}
        />
      )}
    </Form>
  );
};

export default KeyTableItemForm;
