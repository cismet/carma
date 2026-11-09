import { Dropdown } from "antd";
import type { MenuProps } from "antd";
import {
  CheckCircleFilled,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EllipsisOutlined,
  StarFilled,
  StarOutlined,
} from "@ant-design/icons";
import { CSV_LAYER_LABELS, getFieldLabel } from "./csvSettingsData";
import type { CsvLayer } from "./csvSettingsData";
import type { CsvTemplate } from "../../../store/slices/csvTemplates";

const PREVIEW_ROWS = 5;

const previewLines = (template: CsvTemplate, layers: CsvLayer[]) => {
  if (layers.length === 1) {
    const layer = layers[0];
    const cols = template.columns[layer] ?? [];
    if (cols.length === 0) return [{ text: "Alle Spalten", muted: false }];
    const shown = cols.slice(0, PREVIEW_ROWS - 1).map((key) => ({
      text: getFieldLabel(layer, key),
      muted: false,
    }));
    const rest = cols.length - shown.length;
    return rest > 0
      ? [...shown, { text: `+ ${rest} weitere`, muted: true }]
      : shown;
  }
  return layers.map((layer) => {
    const included = template.includedLayers.includes(layer);
    const count = template.columns[layer]?.length ?? 0;
    return {
      text: `${CSV_LAYER_LABELS[layer]} · ${
        !included ? "kein Export" : count > 0 ? `${count} Spalten` : "alle"
      }`,
      muted: !included,
    };
  });
};

interface CsvTemplateCardProps {
  template: CsvTemplate;
  layers: CsvLayer[];
  selected: boolean;
  active: boolean;
  favorite: boolean;
  canEdit: boolean;
  onSelect: () => void;
  onApply: () => void;
  onToggleFavorite: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const CsvTemplateCard = ({
  template,
  layers,
  selected,
  active,
  favorite,
  canEdit,
  onSelect,
  onApply,
  onToggleFavorite,
  onEdit,
  onDuplicate,
  onDelete,
}: CsvTemplateCardProps) => {
  const lockedHint = template.isDefault
    ? "Die Standardvorlage ist fest"
    : "Nur der Ersteller kann die Vorlage ändern";
  const menu: MenuProps["items"] = [
    {
      key: "edit",
      icon: <EditOutlined />,
      label: canEdit ? (
        "Bearbeiten"
      ) : (
        <span title={lockedHint}>Bearbeiten</span>
      ),
      disabled: !canEdit,
      onClick: onEdit,
    },
    {
      key: "duplicate",
      icon: <CopyOutlined />,
      label: "Duplizieren",
      onClick: onDuplicate,
    },
    { type: "divider" },
    {
      key: "delete",
      icon: <DeleteOutlined />,
      label: canEdit ? "Löschen" : <span title={lockedHint}>Löschen</span>,
      danger: true,
      disabled: !canEdit,
      onClick: onDelete,
    },
  ];

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      onClick={onSelect}
      onDoubleClick={onApply}
      className={`relative flex flex-col h-56 rounded-xl border bg-white p-4 cursor-pointer transition-all ${
        selected
          ? "border-blue-500 ring-2 ring-blue-100 shadow-sm"
          : "border-gray-200 hover:border-blue-300 hover:shadow-sm"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-800 truncate">
            {template.name}
          </div>
          <div className="text-xs text-gray-400 truncate h-4">
            {template.beschreibung}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          aria-label={favorite ? "Favorit entfernen" : "Als Favorit markieren"}
          title={favorite ? "Favorit entfernen" : "Als Favorit markieren"}
          className={`flex-shrink-0 w-7 h-7 -mr-1 -mt-1 flex items-center justify-center rounded-md border-none bg-transparent cursor-pointer transition-colors hover:bg-amber-50 ${
            favorite ? "text-amber-400" : "text-gray-300 hover:text-amber-400"
          }`}
        >
          {favorite ? <StarFilled /> : <StarOutlined />}
        </button>
      </div>

      <div className="flex-1 min-h-0 mt-3 flex flex-col gap-1.5 border-t border-gray-100 pt-3">
        {previewLines(template, layers).map((line, i) => (
          <div
            key={i}
            className={`text-xs truncate ${
              line.muted ? "text-gray-300" : "text-gray-500"
            }`}
          >
            {line.text}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        <span className="text-xs text-gray-400 truncate">
          {active ? (
            <span className="text-green-600">
              <CheckCircleFilled className="mr-1" />
              Aktiv
            </span>
          ) : (
            template.angelegt_von
          )}
        </span>
        <Dropdown menu={{ items: menu }} trigger={["click"]}>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            aria-label="Vorlagenaktionen"
            className="w-8 h-7 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 cursor-pointer hover:border-blue-400 hover:text-blue-500 transition-colors"
          >
            <EllipsisOutlined />
          </button>
        </Dropdown>
      </div>
    </div>
  );
};

export default CsvTemplateCard;
