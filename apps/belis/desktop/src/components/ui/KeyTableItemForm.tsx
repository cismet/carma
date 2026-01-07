import { useEffect } from "react";
import { Form, Input, message, FormInstance, Row, Col } from "antd";
import { useSelector } from "react-redux";
import { getJWT } from "../../store/slices/auth";

interface KeyTableItemFormProps {
  item: Record<string, unknown>;
  tableName: string;
  onSave: (updatedItem: Record<string, unknown>) => void;
  onFormReady?: (form: FormInstance) => void;
  onValuesChange?: (hasChanges: boolean) => void;
}

const KeyTableItemForm = ({
  item,
  tableName,
  onSave,
  onFormReady,
  onValuesChange,
}: KeyTableItemFormProps) => {
  const [form] = Form.useForm();
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

  const handleSave = async (values: Record<string, unknown>) => {
    if (!jwt) {
      message.error("Nicht authentifiziert");
      return;
    }

    console.log("xxx form value", values);

    //   setSaving(true);
    //   try {
    //     const dataToSave = { ...values, id: item.id };
    //     await updateDataByClassName(jwt, tableName, dataToSave);
    //     message.success("Gespeichert");
    //     onSave(dataToSave);
    //   } catch (error) {
    //     console.error("Save error:", error);
    //     message.error("Fehler beim Speichern");
    //   } finally {
    //     setSaving(false);
    //   }
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
                    {formatLabel(key)}
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
              <span
                style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}
              >
                {formatLabel(key)}
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
