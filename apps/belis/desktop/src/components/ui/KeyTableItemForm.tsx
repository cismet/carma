import { useEffect, useState } from "react";
import { Form, Input, message, FormInstance, Row, Col } from "antd";
import { useSelector } from "react-redux";
import { getJWT } from "../../store/slices/auth";
import { updateDataByClassName } from "../../helper/apiMethods";
import { keyTableDisplayConfig } from "../../config/keyTableDisplayConfig";

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
      const apiClassName = keyTableDisplayConfig[tableName]?.apiClassName || tableName;
      const apiResponse = await updateDataByClassName(jwt, apiClassName, dataToSave);
      message.success("Gespeichert");

      // API returns {contentType: '...', res: '{"id": "33"}'} for new items
      // We need to parse the nested JSON in the res property
      let savedItem: Record<string, unknown>;
      let newId: number | null = null;

      if (isNewItem && apiResponse && typeof apiResponse === "object") {
        const response = apiResponse as Record<string, unknown>;
        if ("res" in response && typeof response.res === "string") {
          // Parse the nested JSON string
          try {
            const parsed = JSON.parse(response.res);
            if (parsed && typeof parsed.id !== "undefined") {
              newId = Number(parsed.id);
            }
          } catch {
            // Parsing failed, newId stays null
          }
        } else if ("id" in response) {
          // Direct id property (fallback)
          newId = Number(response.id);
        }
      }

      if (isNewItem && newId !== null) {
        savedItem = { ...values, id: newId };
      } else {
        savedItem = { ...values, id: item.id };
      }

      onSave(savedItem);
    } catch (error) {
      console.error("Save error:", error);
      message.error("Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const fields = Object.entries(item).filter(([key]) => key !== "id");
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
