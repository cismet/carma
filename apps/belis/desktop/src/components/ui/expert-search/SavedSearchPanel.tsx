import { useState } from "react";
import {
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Popconfirm,
  message,
} from "antd";
import { DeleteOutlined, PlusOutlined, StarOutlined } from "@ant-design/icons";
import type { useSavedSearches, SaveSearchInput } from "./useSavedSearches";

const FormLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-gray-700">{children}</span>
);

type SavedSearchPanelProps = ReturnType<typeof useSavedSearches>;

const SavedSearchPanel = ({
  items,
  current,
  select,
  save,
  remove,
}: SavedSearchPanelProps) => {
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<SaveSearchInput>();

  const handleSelect = (id: number) => {
    const result = select(id);
    if (!result) {
      void message.error("Vorlage konnte nicht gelesen werden");
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
      void message.success("Vorlage gespeichert");
      setSaveOpen(false);
    } catch (err: unknown) {
      console.error("[SavedSearchPanel] save failed:", err);
      void message.error("Vorlage konnte nicht gespeichert werden");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    try {
      await remove(id);
      void message.success(`${name} gelöscht`);
    } catch (err: unknown) {
      console.error("[SavedSearchPanel] delete failed:", err);
      void message.error("Vorlage konnte nicht gelöscht werden");
    }
  };

  return (
    <div className="border border-gray-200 rounded-xl bg-gray-50 mb-4 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-gray-100/60">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase text-gray-500">
          <StarOutlined className="text-gray-400" />
          Vorlagen
        </div>
        <button
          type="button"
          onClick={() => setSaveOpen(true)}
          className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-200 rounded-md px-2.5 py-1 bg-white hover:border-blue-400 hover:text-blue-500 cursor-pointer transition-colors"
        >
          <PlusOutlined className="text-[10px]" />
          Aktuelle Suche speichern
        </button>
      </div>
      {items.length > 0 ? (
        <div className="flex flex-col gap-2 p-4 max-h-56 overflow-y-auto">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`flex-1 min-w-0 flex items-baseline gap-2 text-left border rounded-lg px-3 py-2 bg-white cursor-pointer transition-colors ${
                  item.id === current?.id
                    ? "border-blue-500"
                    : "border-gray-200 hover:border-blue-400 hover:bg-blue-50"
                }`}
              >
                <span className="text-sm text-gray-700 truncate">
                  {item.name}
                </span>
                {(item.beschreibung || item.angelegt_von) && (
                  <span className="text-xs text-gray-400 truncate">
                    {item.beschreibung || item.angelegt_von}
                  </span>
                )}
              </button>
              <Popconfirm
                title={`${item.name} für alle Nutzer löschen?`}
                okText="Löschen"
                cancelText="Abbrechen"
                okButtonProps={{ danger: true }}
                onConfirm={() => handleDelete(item.id, item.name)}
              >
                <button
                  type="button"
                  aria-label="Vorlage löschen"
                  className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 cursor-pointer transition-colors"
                >
                  <DeleteOutlined />
                </button>
              </Popconfirm>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-3 text-sm text-gray-400">
          Noch keine Vorlagen gespeichert.
        </div>
      )}

      <Modal
        title="Vorlage speichern"
        open={saveOpen}
        onCancel={() => setSaveOpen(false)}
        centered
        width={600}
        destroyOnClose
        footer={
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button onClick={() => setSaveOpen(false)} disabled={saving}>
              Abbrechen
            </Button>
            <Button
              type="primary"
              onClick={() => void handleSave()}
              loading={saving}
            >
              Speichern
            </Button>
          </div>
        }
        styles={{
          body: { paddingTop: 16 },
          header: { borderBottom: "1px solid #f3f4f6", paddingBottom: 16 },
        }}
      >
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          preserve={false}
          initialValues={{
            name: current?.name ?? "",
            beschreibung: current?.beschreibung ?? "",
            overwrite: current != null,
          }}
        >
          <Form.Item
            name="name"
            label={<FormLabel>Name</FormLabel>}
            className="mb-4"
            rules={[
              { required: true, whitespace: true, message: "Name fehlt" },
            ]}
          >
            <Input size="large" placeholder="Name eingeben" />
          </Form.Item>
          <Form.Item
            name="beschreibung"
            label={<FormLabel>Beschreibung</FormLabel>}
            className="mb-4"
          >
            <Input.TextArea
              rows={3}
              style={{ resize: "vertical" }}
              placeholder="Beschreibung eingeben"
            />
          </Form.Item>
          {current && (
            <Form.Item
              name="overwrite"
              valuePropName="checked"
              className="mb-0"
            >
              <Checkbox>{current.name} überschreiben</Checkbox>
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default SavedSearchPanel;
