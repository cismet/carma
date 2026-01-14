import { useEffect, useState } from "react";
import { Form, Input, message, Row, Col } from "antd";
import FormActionButtons from "./FormActionButtons";
import type { FormInstance, Rule } from "antd/es/form";
import { useSelector } from "react-redux";
import { getJWT } from "../../store/slices/auth";
import { keyTableDisplayConfig } from "../../config/keyTableDisplayConfig";
import { useSyncOptional } from "@carma-providers/syncing";

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
}: KeyTableItemFormProps) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
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
      // Check if this is a temporary unsaved item (created with -Date.now())
      // Temporary IDs are very large negative numbers (like -1736441234567)
      const isNewItem = !item.id || (item.id as number) < -1000000000;
      const dataToSave = { ...values, id: isNewItem ? -1 : item.id };
      // Use apiClassName from config if it differs from tableName (e.g., "teams" -> "team")
      const apiClassName =
        keyTableDisplayConfig[tableName]?.apiClassName || tableName;

      // Use syncedAction to queue the save operation for offline sync
      if (sync?.syncedAction) {
        // Capture the original item ID (large negative number like -1736441234567)
        // This is the ID stored in Redux, not the -1 sent to the server
        const originalItemId = item.id as number;

        const onComplete = isNewItem
          ? (action: { result?: string }) => {
              console.log("New object created, server response:", action.result);
              if (action.result && onIdUpdated) {
                try {
                  const result = JSON.parse(action.result);
                  const newId = parseInt(result.id, 10);
                  if (!isNaN(newId)) {
                    onIdUpdated(originalItemId, newId, tableName);
                  }
                } catch (e) {
                  console.error("Failed to parse server response:", e);
                }
              }
            }
          : undefined;

        sync.syncedAction(
          "SaveObject",
          {
            className: apiClassName,
            data: JSON.stringify(dataToSave),
            status: "open",
          },
          onComplete
        );
        message.success("Aktion zur Synchronisation hinzugefügt");

        // Keep the original item.id (the callback will update it when server responds)
        const savedItem = { ...values, id: item.id };
        onSave(savedItem);

        // For new items, disable the form until server confirms with real ID
        if (isNewItem) {
          setPendingConfirmation(true);
        }

        // Reset form change state
        onValuesChange?.(false);
      } else {
        // Fallback: sync not available, show error
        message.error("Synchronisation nicht verfügbar");
      }
    } catch (error) {
      console.error("Save error:", error);
      message.error("Fehler beim Speichern");
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
      {!disabled && !pendingConfirmation && (
        <FormActionButtons formHasChanges={formHasChanges} onReset={onReset} />
      )}
    </Form>
  );
};

export default KeyTableItemForm;
