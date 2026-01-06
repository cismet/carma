import { useState } from "react";
import { Form, Input, Button, Space, message } from "antd";
import { useSelector } from "react-redux";
import { getJWT } from "../../store/slices/auth";
import { updateDataByClassName } from "../../helper/apiMethods";

interface KeyTableItemFormProps {
  item: Record<string, unknown>;
  tableName: string;
  onSave: (updatedItem: Record<string, unknown>) => void;
  onCancel: () => void;
}

const KeyTableItemForm = ({
  item,
  tableName,
  onSave,
  onCancel,
}: KeyTableItemFormProps) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const jwt = useSelector(getJWT);

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

  return (
    <Form
      form={form}
      initialValues={item}
      onFinish={handleSave}
      layout="vertical"
    >
      {Object.entries(item).map(([key, value]) =>
        key === "id" ? null : (
          <Form.Item key={key} name={key} label={formatLabel(key)}>
            <Input />
          </Form.Item>
        )
      )}
      <Space>
        <Button type="primary" htmlType="submit" loading={saving}>
          Speichern
        </Button>
        <Button onClick={onCancel}>Abbrechen</Button>
      </Space>
    </Form>
  );
};

export default KeyTableItemForm;
