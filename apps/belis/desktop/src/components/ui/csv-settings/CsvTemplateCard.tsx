import { Dropdown } from "antd";
import type { MenuProps } from "antd";
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EllipsisOutlined,
  StarFilled,
  StarOutlined,
} from "@ant-design/icons";
import {
  CSV_LAYER_LABELS,
  getDefaultColumns,
  getFieldLabel,
} from "./csvSettingsData";
import type { CsvLayer } from "./csvSettingsData";
import type { CsvTemplate } from "../../../store/slices/csvTemplates";

const PREVIEW_ROWS = 5;

interface PreviewRow {
  label: string;
  value?: string;
  muted?: boolean;
}

const previewRows = (template: CsvTemplate, layers: CsvLayer[]) => {
  if (layers.length === 1) {
    const layer = layers[0];
    const cols = template.columns[layer]?.length
      ? template.columns[layer]
      : getDefaultColumns(layer);
    const rows: PreviewRow[] = cols
      .slice(0, PREVIEW_ROWS - 1)
      .map((key) => ({ label: getFieldLabel(layer, key) }));
    const rest = cols.length - rows.length;
    return rest > 0
      ? [...rows, { label: `+ ${rest} weitere`, muted: true }]
      : rows;
  }
  return layers.map((layer): PreviewRow => {
    const included = template.includedLayers.includes(layer);
    const count =
      template.columns[layer]?.length || getDefaultColumns(layer).length;
    return {
      label: CSV_LAYER_LABELS[layer],
      value: included ? String(count) : "–",
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
      className={`flex flex-col rounded-lg border bg-white cursor-pointer select-none transition-[border-color,box-shadow] ${
        selected
          ? "border-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.15)]"
          : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
      }`}
    >
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-gray-900 truncate">
            {template.name}
          </span>
          {active && (
            <span className="flex-shrink-0 px-1.5 py-px rounded text-[10px] font-semibold uppercase tracking-wide bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20">
              Aktiv
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            aria-label={
              favorite ? "Favorit entfernen" : "Als Favorit markieren"
            }
            title={favorite ? "Favorit entfernen" : "Als Favorit markieren"}
            className={`flex-shrink-0 w-6 h-6 ml-auto -mr-1 flex items-center justify-center rounded border-none bg-transparent cursor-pointer transition-colors hover:bg-gray-100 ${
              favorite ? "text-amber-400" : "text-gray-300 hover:text-gray-500"
            }`}
          >
            {favorite ? <StarFilled /> : <StarOutlined />}
          </button>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-3 h-4 text-xs">
          <span className="text-gray-500 truncate">
            {template.beschreibung}
          </span>
          {template.changedAt && (
            <span className="flex-shrink-0 text-gray-400 tabular-nums">
              {new Date(template.changedAt).toLocaleDateString("de-DE", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 mx-4 border-t border-gray-100 py-2.5">
        {previewRows(template, layers).map((row, i) => (
          <div
            key={i}
            className={`flex items-center justify-between gap-3 h-6 text-[13px] ${
              row.muted ? "text-gray-300" : "text-gray-600"
            }`}
          >
            <span className="truncate">{row.label}</span>
            {row.value && (
              <span
                className={`text-xs tabular-nums ${
                  row.muted ? "" : "text-gray-400"
                }`}
              >
                {row.value}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-gray-100 bg-gray-50 rounded-b-lg">
        <span className="text-xs text-gray-400 truncate">
          {template.angelegt_von}
        </span>
        <Dropdown menu={{ items: menu }} trigger={["click"]}>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            aria-label="Vorlagenaktionen"
            className="w-6 h-6 -mr-1 flex items-center justify-center rounded border-none bg-transparent text-gray-500 cursor-pointer hover:bg-gray-200 hover:text-gray-700 transition-colors"
          >
            <EllipsisOutlined />
          </button>
        </Dropdown>
      </div>
    </div>
  );
};

export default CsvTemplateCard;
