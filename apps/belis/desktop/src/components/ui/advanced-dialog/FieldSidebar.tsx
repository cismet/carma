import { useState } from "react";
import type { ReactNode } from "react";
import { Button, Checkbox, Input } from "antd";
import { PlusOutlined, RightOutlined, SearchOutlined } from "@ant-design/icons";

export interface SidebarField {
  key: string;
  label: string;
  color?: string;
  colorTitle?: string;
}

export interface SidebarFieldGroup {
  key: string;
  label: string;
  fields: SidebarField[];
}

interface FieldSidebarProps {
  // Flat list, or `groups` for a collapsible tree.
  fields?: SidebarField[];
  groups?: SidebarFieldGroup[];
  onAdd: (keys: string[]) => void;
  hint?: ReactNode;
  // Checkboxes on fields and groups plus an "add selected" button.
  multiSelect?: boolean;
  emptyText?: string;
}

const matches = (field: SidebarField, filter: string) =>
  field.label.toLowerCase().includes(filter);

const FieldSidebar = ({
  fields,
  groups,
  onAdd,
  hint,
  multiSelect = false,
  emptyText = "Keine passenden Felder",
}: FieldSidebarProps) => {
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const needle = filter.trim().toLowerCase();
  const visibleGroups = (
    groups ?? [{ key: "", label: "", fields: fields ?? [] }]
  )
    .map((g) => ({ ...g, fields: g.fields.filter((f) => matches(f, needle)) }))
    .filter((g) => g.fields.length > 0);
  const visibleKeys = new Set(
    visibleGroups.flatMap((g) => g.fields.map((f) => f.key))
  );
  // Fields that left the list (e.g. were added) drop out of the selection.
  const selectedKeys = [...selected].filter((k) => visibleKeys.has(k));

  const setChecked = (keys: string[], checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (checked ? next.add(k) : next.delete(k)));
      return next;
    });

  const toggleCollapsed = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const addSelected = () => {
    onAdd(
      visibleGroups.flatMap((g) =>
        g.fields.filter((f) => selected.has(f.key)).map((f) => f.key)
      )
    );
    setSelected(new Set());
  };

  const renderField = (field: SidebarField) => (
    <div
      key={field.key}
      className="flex items-center gap-2 w-full text-sm text-gray-700 border border-gray-200 rounded-lg px-3 bg-white hover:border-blue-400 hover:bg-blue-50 transition-colors"
    >
      {multiSelect && (
        <Checkbox
          checked={selected.has(field.key)}
          onChange={(e) => setChecked([field.key], e.target.checked)}
        />
      )}
      <button
        type="button"
        onClick={() => onAdd([field.key])}
        className="flex-1 min-w-0 flex items-center gap-2 py-2 text-left bg-transparent border-none p-0 cursor-pointer"
      >
        {field.color && (
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: field.color }}
            title={field.colorTitle}
          />
        )}
        <span className="truncate">{field.label}</span>
      </button>
    </div>
  );

  const renderGroup = (group: SidebarFieldGroup) => {
    const keys = group.fields.map((f) => f.key);
    const checkedCount = keys.filter((k) => selected.has(k)).length;
    // A search expands every group so matches are never hidden.
    const isCollapsed = !needle && collapsed.has(group.key);
    return (
      <div key={group.key} className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase text-gray-500">
          <button
            type="button"
            onClick={() => toggleCollapsed(group.key)}
            aria-expanded={!isCollapsed}
            className="flex-1 min-w-0 flex items-center gap-2 bg-transparent border-none p-0 cursor-pointer text-left hover:text-blue-500"
          >
            <RightOutlined
              className={`text-[10px] text-gray-400 transition-transform ${
                isCollapsed ? "" : "rotate-90"
              }`}
            />
            <span className="truncate">{group.label}</span>
            <span className="font-normal text-gray-400">
              {group.fields.length}
            </span>
          </button>
          {multiSelect && (
            <Checkbox
              checked={checkedCount === keys.length}
              indeterminate={checkedCount > 0 && checkedCount < keys.length}
              onChange={(e) => setChecked(keys, e.target.checked)}
              aria-label={`${group.label} auswählen`}
            />
          )}
          <button
            type="button"
            onClick={() => onAdd(keys)}
            title="Ganze Gruppe hinzufügen"
            aria-label={`${group.label} hinzufügen`}
            className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 bg-transparent border-none cursor-pointer hover:text-blue-500 hover:bg-blue-50"
          >
            <PlusOutlined className="text-[10px]" />
          </button>
        </div>
        {!isCollapsed && (
          <div className="flex flex-col gap-2 pl-4">
            {group.fields.map(renderField)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-[310px] flex-shrink-0 flex flex-col min-h-0 bg-slate-50 border-r border-gray-200 pl-6 pr-4 pb-6 -mt-4 pt-4">
      <div className="text-xs font-semibold tracking-wide text-gray-400 uppercase mt-2 mb-2">
        Felder
      </div>
      <Input
        allowClear
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        prefix={<SearchOutlined className="text-gray-400" />}
        placeholder="Feld suchen…"
      />
      {hint && <div className="text-xs text-gray-400 mt-3 mb-2">{hint}</div>}
      <div
        className={`flex-1 min-h-0 flex flex-col overflow-y-auto pr-1 ${
          groups ? "gap-4" : "gap-2"
        }`}
      >
        {groups
          ? visibleGroups.map(renderGroup)
          : visibleGroups.flatMap((g) => g.fields.map(renderField))}
        {visibleGroups.length === 0 && (
          <div className="text-sm text-gray-400 text-center py-6">
            {emptyText}
          </div>
        )}
      </div>
      {multiSelect && (
        <Button
          className="mt-3"
          type="primary"
          icon={<PlusOutlined />}
          disabled={selectedKeys.length === 0}
          onClick={addSelected}
        >
          Ausgewählte hinzufügen
          {selectedKeys.length > 0 && ` (${selectedKeys.length})`}
        </Button>
      )}
    </div>
  );
};

export default FieldSidebar;
