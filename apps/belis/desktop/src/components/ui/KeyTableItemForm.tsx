import { useEffect, useState } from "react";
import { Form, Input, message, FormInstance, Row, Col } from "antd";
import { useSelector } from "react-redux";
import { getJWT } from "../../store/slices/auth";
import { keyTableDisplayConfig } from "../../config/keyTableDisplayConfig";
import { useSyncOptional } from "@carma-providers/syncing";

interface KeyTableItemFormProps {
  item: Record<string, unknown>;
  tableName: string;
  onSave: (updatedItem: Record<string, unknown>) => void;
  onFormReady?: (form: FormInstance) => void;
  onValuesChange?: (hasChanges: boolean) => void;
  disabled?: boolean;
}

const KeyTableItemForm = ({
  item,
  tableName,
  onSave,
  onFormReady,
  onValuesChange,
  disabled = false,
}: KeyTableItemFormProps) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const jwt = useSelector(getJWT);
  const sync = useSyncOptional();

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
        sync.syncedAction("SaveObject", {
          className: apiClassName,
          data: JSON.stringify(dataToSave),
          status: "open",
        });
        message.success("Aktion zur Synchronisation hinzugefügt");

        // For new items, we use a temporary ID until sync completes
        // The actual ID will be assigned by the server
        let savedItem: Record<string, unknown>;
        if (isNewItem) {
          // Use negative timestamp as temporary ID for new items
          savedItem = { ...values, id: -Date.now() };
        } else {
          savedItem = { ...values, id: item.id };
        }
        onSave(savedItem);
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
      disabled={disabled}
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
            style={{ marginBottom: 16 }}
          >
            <Input />
          </Form.Item>
        ))
      )}
    </Form>
  );
};

export default KeyTableItemForm;
