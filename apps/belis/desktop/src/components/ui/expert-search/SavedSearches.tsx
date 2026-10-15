import { useState } from "react";
import {
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  message,
} from "antd";
import { DeleteOutlined, SaveOutlined } from "@ant-design/icons";
import type { ObjectType } from "./fieldRegistry";
import { useSavedSearches } from "./useSavedSearches";
import type { SaveSearchInput } from "./useSavedSearches";

const SavedSearches = ({ objectType }: { objectType: ObjectType }) => {
  const { items, loading, current, select, save, remove } =
    useSavedSearches(objectType);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<SaveSearchInput>();

  const handleSelect = (id: number | undefined) => {
    const result = select(id);
    if (!result) {
      void message.error("Gespeicherte Suche konnte nicht gelesen werden");
    } else if (result.dropped > 0) {
      void message.warning(
        `${result.dropped} Bedingung(en) mit unbekannten Feldern wurden entfernt`
      );
    }
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await save(values);
      void message.success("Suche gespeichert");
      setSaveOpen(false);
    } catch (err: unknown) {
      console.error("[SavedSearches] save failed:", err);
      void message.error("Suche konnte nicht gespeichert werden");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const name = current?.name;
    try {
      await remove();
      void message.success(`„${name}“ gelöscht`);
    } catch (err: unknown) {
      console.error("[SavedSearches] delete failed:", err);
      void message.error("Suche konnte nicht gelöscht werden");
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select
        size="small"
        className="w-64"
        placeholder="Gespeicherte Suche laden…"
        allowClear
        showSearch
        optionFilterProp="label"
        loading={loading}
        value={current?.id}
        onChange={handleSelect}
        options={items.map((i) => ({
          value: i.id,
          label: i.name,
          title: [i.beschreibung, i.angelegt_von].filter(Boolean).join(" · "),
        }))}
        notFoundContent="Keine gespeicherten Suchen"
      />
      <Button
        size="small"
        icon={<SaveOutlined />}
        onClick={() => setSaveOpen(true)}
      >
        Speichern
      </Button>
      {current && (
        <Popconfirm
          title={`„${current.name}“ für alle Nutzer löschen?`}
          okText="Löschen"
          cancelText="Abbrechen"
          okButtonProps={{ danger: true }}
          onConfirm={handleDelete}
        >
          <Button size="small" icon={<DeleteOutlined />} title="Löschen" />
        </Popconfirm>
      )}

      <Modal
        title="Suche speichern"
        open={saveOpen}
        onCancel={() => setSaveOpen(false)}
        onOk={() => void handleSave()}
        okText="Speichern"
        cancelText="Abbrechen"
        confirmLoading={saving}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          preserve={false}
          initialValues={{
            name: current?.name ?? "",
            beschreibung: current?.beschreibung ?? "",
            overwrite: current != null,
          }}
        >
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, whitespace: true, message: "Name fehlt" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="beschreibung" label="Beschreibung">
            <Input.TextArea rows={2} />
          </Form.Item>
          {current && (
            <Form.Item name="overwrite" valuePropName="checked">
              <Checkbox>„{current.name}“ überschreiben</Checkbox>
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default SavedSearches;
