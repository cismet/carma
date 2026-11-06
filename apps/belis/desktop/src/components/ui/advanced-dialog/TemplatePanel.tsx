import { useState } from "react";
import { Button, Checkbox, Form, Input, Modal, message } from "antd";
import { PlusOutlined, StarOutlined } from "@ant-design/icons";
import Panel, { DeleteIconButton, PanelActionButton } from "./Panel";

const FormLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-gray-700">{children}</span>
);

export interface TemplateItem {
  id: number;
  name: string;
  beschreibung?: string | null;
  angelegt_von?: string | null;
}

export interface SaveTemplateInput {
  name: string;
  beschreibung?: string;
  overwrite: boolean;
}

// save/remove reject on failure; select returns null for an unreadable
// template and otherwise how many entries it had to drop.
export interface TemplateStore<T extends TemplateItem = TemplateItem> {
  items: T[];
  current: T | null;
  canEdit: (item: T | null) => boolean;
  select: (id: number) => { dropped: number } | null;
  save: (input: SaveTemplateInput) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

interface TemplatePanelProps<T extends TemplateItem> extends TemplateStore<T> {
  saveLabel: string;
  deleteHint: string;
  droppedMessage: (count: number) => string;
}

const TemplatePanel = <T extends TemplateItem>({
  items,
  current,
  canEdit,
  select,
  save,
  remove,
  saveLabel,
  deleteHint,
  droppedMessage,
}: TemplatePanelProps<T>) => {
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<SaveTemplateInput>();
  const watchedName = Form.useWatch("name", form);
  const watchedOverwrite = Form.useWatch("overwrite", form);

  const handleSelect = (id: number) => {
    const result = select(id);
    if (!result) {
      void message.error("Vorlage konnte nicht gelesen werden");
    } else if (result.dropped > 0) {
      void message.warning(droppedMessage(result.dropped));
    }
  };

  // The form outlives tab switches, so fill it on every open.
  const openSaveDialog = () => {
    form.setFieldsValue({
      name: current?.name ?? "",
      beschreibung: current?.beschreibung ?? "",
      overwrite: canEdit(current),
    });
    setSaveOpen(true);
  };

  const isNameTaken = (value: string | undefined, overwrite: boolean) => {
    const name = (value ?? "").trim().toLowerCase();
    const overwriteId = overwrite && current ? current.id : null;
    return items.some(
      (i) => i.id !== overwriteId && i.name.trim().toLowerCase() === name
    );
  };

  const validateUniqueName = (_: unknown, value: string | undefined) =>
    isNameTaken(value, Boolean(form.getFieldValue("overwrite")))
      ? Promise.reject(new Error("Name ist bereits vergeben"))
      : Promise.resolve();

  const saveDisabled =
    !watchedName?.trim() || isNameTaken(watchedName, Boolean(watchedOverwrite));

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await save(values);
      void message.success("Vorlage gespeichert");
      setSaveOpen(false);
    } catch (err: unknown) {
      console.error("[TemplatePanel] save failed:", err);
      void message.error("Vorlage konnte nicht gespeichert werden");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (id: number, name: string) => {
    Modal.confirm({
      title: `Vorlage ${name} löschen?`,
      content: deleteHint,
      okText: "Löschen",
      cancelText: "Abbrechen",
      onOk: () => handleDelete(id, name),
    });
  };

  const handleDelete = async (id: number, name: string) => {
    try {
      await remove(id);
      void message.success(`${name} gelöscht`);
    } catch (err: unknown) {
      console.error("[TemplatePanel] delete failed:", err);
      void message.error("Vorlage konnte nicht gelöscht werden");
    }
  };

  return (
    <Panel
      icon={<StarOutlined />}
      title="Vorlagen"
      actions={
        <PanelActionButton icon={<PlusOutlined />} onClick={openSaveDialog}>
          {saveLabel}
        </PanelActionButton>
      }
    >
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
              <DeleteIconButton
                onClick={() => confirmDelete(item.id, item.name)}
                disabled={!canEdit(item)}
                label="Vorlage löschen"
                title={
                  canEdit(item)
                    ? undefined
                    : "Nur der Ersteller kann die Vorlage löschen"
                }
              />
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
        forceRender
        footer={
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
            <span className="text-sm text-gray-400">
              {current && !canEdit(current)
                ? `Autor: ${current.angelegt_von ?? "unbekannt"}`
                : null}
            </span>
            <div className="flex gap-2">
              <Button onClick={() => setSaveOpen(false)} disabled={saving}>
                Abbrechen
              </Button>
              <Button
                type="primary"
                onClick={() => void handleSave()}
                loading={saving}
                disabled={saveDisabled}
              >
                Speichern
              </Button>
            </div>
          </div>
        }
        styles={{
          body: { paddingTop: 16 },
          header: { borderBottom: "1px solid #f3f4f6", paddingBottom: 16 },
        }}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            name="name"
            label={<FormLabel>Name</FormLabel>}
            className="mb-4"
            dependencies={["overwrite"]}
            rules={[
              { required: true, whitespace: true, message: "Name fehlt" },
              { validator: validateUniqueName },
            ]}
          >
            <Input size="large" placeholder="Name eingeben" />
          </Form.Item>
          <Form.Item
            name="beschreibung"
            label={<FormLabel>Beschreibung</FormLabel>}
            className="mb-2"
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
              <Checkbox disabled={!canEdit(current)}>
                {current.name} überschreiben
              </Checkbox>
            </Form.Item>
          )}
        </Form>
      </Modal>
    </Panel>
  );
};

export default TemplatePanel;
