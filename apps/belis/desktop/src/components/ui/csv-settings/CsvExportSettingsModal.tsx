import { useState } from "react";
import { Button, Modal, Tooltip, message } from "antd";
import {
  DownloadOutlined,
  PlusOutlined,
  TableOutlined,
} from "@ant-design/icons";
import AdvancedDialog from "../advanced-dialog/AdvancedDialog";
import CsvTemplateCard from "./CsvTemplateCard";
import CsvTemplateEditor from "./CsvTemplateEditor";
import { useCsvTemplates } from "./useCsvTemplates";
import type { SaveCsvTemplateInput } from "./useCsvTemplates";
import { CSV_LAYER_LABELS, CSV_SCOPE_LAYERS } from "./csvSettingsData";
import type { CsvTemplateScope } from "./csvSettingsData";
import type {
  CsvTemplate,
  CsvTemplateDefinition,
} from "../../../store/slices/csvTemplates";

interface CsvExportSettingsModalProps {
  scope?: CsvTemplateScope;
  // "small" matches the antd size="small" buttons of the AA toolbar.
  buttonVariant?: "square" | "small";
}

const CsvExportSettingsModal = ({
  scope = "fachobjekte",
  buttonVariant = "square",
}: CsvExportSettingsModalProps) => {
  const layers = CSV_SCOPE_LAYERS[scope];
  const templates = useCsvTemplates(scope);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<SaveCsvTemplateInput | null>(null);

  const standard = templates.items[0];
  const selected = templates.items.find((t) => t.id === selectedId) ?? standard;
  const byDate = templates.items
    .slice(1)
    .sort((a, b) => (b.changedAt ?? "").localeCompare(a.changedAt ?? ""));
  const shown = [
    standard,
    ...byDate.filter((t) => templates.isFavorite(t.id)),
    ...byDate.filter((t) => !templates.isFavorite(t.id)),
  ];

  const open = () => {
    setSelectedId(templates.current?.id ?? standard.id);
    setIsOpen(true);
  };

  const apply = (template: CsvTemplate) => {
    templates.apply(template);
    void message.success(`Vorlage ${template.name} übernommen`);
    setIsOpen(false);
  };

  const exportUnsaved = (definition: CsvTemplateDefinition) => {
    templates.apply({ ...definition, id: null });
    void message.success("Export-Einstellungen übernommen");
    setEditing(null);
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

  const create = () =>
    setEditing({
      name: "",
      beschreibung: "",
      columns: {},
      includedLayers: layers,
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
    return id;
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
        width={1000}
        maxBodyHeight={610}
        footerLeft={
          <span className="text-xs text-gray-400">
            Doppelklick auf eine Vorlage exportiert direkt.
          </span>
        }
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
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">
                Vorlage auswählen
              </span>
              <span className="text-xs text-gray-400 tabular-nums">
                {shown.length}
              </span>
            </div>
            <Tooltip title="Neue Vorlage">
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={create}
                aria-label="Neue Vorlage"
                className="ml-auto"
              />
            </Tooltip>
          </div>
          <div className="grid grid-cols-3 gap-4 p-1">
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
        </div>
      </AdvancedDialog>

      {editing && (
        <CsvTemplateEditor
          scope={scope}
          initial={editing}
          templates={templates.items}
          onSave={saveTemplate}
          onExport={exportUnsaved}
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
