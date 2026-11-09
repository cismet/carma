import { useState } from "react";
import { Button, Modal, Segmented, Tooltip, message } from "antd";
import { DownloadOutlined, TableOutlined } from "@ant-design/icons";
import AdvancedDialog from "../advanced-dialog/AdvancedDialog";
import CsvTemplateCard from "./CsvTemplateCard";
import CsvTemplateEditor from "./CsvTemplateEditor";
import { useCsvTemplates } from "./useCsvTemplates";
import type { SaveCsvTemplateInput } from "./useCsvTemplates";
import { CSV_LAYER_LABELS, CSV_SCOPE_LAYERS } from "./csvSettingsData";
import type { CsvTemplateScope } from "./csvSettingsData";
import type { CsvTemplate } from "../../../store/slices/csvTemplates";

interface CsvExportSettingsModalProps {
  scope?: CsvTemplateScope;
  // "small" matches the antd size="small" buttons of the AA toolbar.
  buttonVariant?: "square" | "small";
}

type Filter = "alle" | "favoriten";

const CsvExportSettingsModal = ({
  scope = "fachobjekte",
  buttonVariant = "square",
}: CsvExportSettingsModalProps) => {
  const layers = CSV_SCOPE_LAYERS[scope];
  const templates = useCsvTemplates(scope);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("alle");
  const [editing, setEditing] = useState<SaveCsvTemplateInput | null>(null);

  const standard = templates.items[0];
  const selected = templates.items.find((t) => t.id === selectedId) ?? standard;
  const sorted = [
    ...templates.items.filter((t) => templates.isFavorite(t.id)),
    ...templates.items.filter((t) => !templates.isFavorite(t.id)),
  ];
  const shown =
    filter === "favoriten"
      ? sorted.filter((t) => templates.isFavorite(t.id))
      : sorted;

  const open = () => {
    setSelectedId(templates.current?.id ?? standard.id);
    setIsOpen(true);
  };

  const apply = (template: CsvTemplate) => {
    templates.apply(template);
    void message.success(`Vorlage ${template.name} übernommen`);
    setIsOpen(false);
  };

  const edit = (template: CsvTemplate) =>
    setEditing({
      id: template.id,
      name: template.name,
      beschreibung: template.beschreibung ?? "",
      columns: template.columns,
      includedLayers: template.includedLayers,
    });

  const duplicate = (template: CsvTemplate) =>
    setEditing({
      name: `${template.name} (Kopie)`,
      beschreibung: template.beschreibung ?? "",
      columns: template.columns,
      includedLayers: template.includedLayers,
    });

  const confirmDelete = (template: CsvTemplate) =>
    Modal.confirm({
      title: `Vorlage ${template.name} löschen?`,
      content: "Die Vorlage wird für alle Benutzer gelöscht.",
      okText: "Löschen",
      okButtonProps: { danger: true },
      cancelText: "Abbrechen",
      onOk: async () => {
        try {
          await templates.remove(template.id);
          if (template.id === selectedId) setSelectedId(standard.id);
          void message.success(`${template.name} gelöscht`);
        } catch (err: unknown) {
          console.error("[CsvExportSettingsModal] delete failed:", err);
          void message.error("Vorlage konnte nicht gelöscht werden");
        }
      },
    });

  const saveTemplate = async (input: SaveCsvTemplateInput) => {
    const id = await templates.save(input);
    if (id != null) setSelectedId(id);
    setEditing(null);
  };

  return (
    <>
      <Tooltip title="CSV-Export Vorlagen">
        {buttonVariant === "small" ? (
          <Button icon={<CsvSettingsIcon />} size="small" onClick={open} />
        ) : (
          <button
            type="button"
            onClick={open}
            className="flex items-center justify-center w-8 h-8 rounded border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 cursor-pointer"
          >
            <CsvSettingsIcon />
          </button>
        )}
      </Tooltip>

      <AdvancedDialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        icon={<DownloadOutlined />}
        title={
          <>
            CSV-Export
            {layers.length === 1 && (
              <span className="ml-2 text-sm font-normal text-gray-400">
                {CSV_LAYER_LABELS[layers[0]]}
              </span>
            )}
          </>
        }
        width={960}
        maxBodyHeight={560}
        footerRight={
          <div className="flex gap-2">
            <Button onClick={() => setIsOpen(false)}>Abbrechen</Button>
            <Tooltip title="Ausgewählte Vorlage für den CSV-Export verwenden">
              <Button type="primary" onClick={() => apply(selected)}>
                Export
              </Button>
            </Tooltip>
          </div>
        }
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs text-gray-400">
            <span className="font-semibold tracking-wide uppercase">
              Vorlagen
            </span>{" "}
            <span className="text-gray-500">{templates.items.length}</span>
            <span className="ml-3">
              Doppelklick übernimmt die Vorlage direkt.
            </span>
          </div>
          <Segmented<Filter>
            size="small"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "alle", label: "Alle" },
              { value: "favoriten", label: "Favoriten" },
            ]}
          />
        </div>
        {shown.length > 0 ? (
          <div className="grid grid-cols-4 gap-4 pb-6">
            {shown.map((template) => (
              <CsvTemplateCard
                key={template.id}
                template={template}
                layers={layers}
                selected={template.id === selected.id}
                active={template.id === templates.current?.id}
                favorite={templates.isFavorite(template.id)}
                canEdit={templates.canEdit(template)}
                onSelect={() => setSelectedId(template.id)}
                onApply={() => apply(template)}
                onToggleFavorite={() => templates.toggleFavorite(template.id)}
                onEdit={() => edit(template)}
                onDuplicate={() => duplicate(template)}
                onDelete={() => confirmDelete(template)}
              />
            ))}
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
            Noch keine Favoriten. Mit dem Stern eine Vorlage markieren.
          </div>
        )}
      </AdvancedDialog>

      {editing && (
        <CsvTemplateEditor
          scope={scope}
          initial={editing}
          takenNames={templates.items
            .filter((t) => t.id !== editing.id)
            .map((t) => t.name)}
          onSave={saveTemplate}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
};

// Download arrow with a small table badge: "configure the CSV download".
const CsvSettingsIcon = () => (
  <span className="relative inline-flex">
    <DownloadOutlined />
    <TableOutlined className="absolute -right-1.5 -bottom-1 text-[8px] bg-white rounded-sm" />
  </span>
);

export default CsvExportSettingsModal;
