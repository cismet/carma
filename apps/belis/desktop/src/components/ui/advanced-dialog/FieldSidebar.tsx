import { useState } from "react";
import type { ReactNode } from "react";
import { Input } from "antd";
import { PlusOutlined, RightOutlined, SearchOutlined } from "@ant-design/icons";
import { useDraggable } from "@dnd-kit/core";

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

// Fields and groups dragged out of the sidebar carry this data.
export const SIDEBAR_DRAG_PREFIX = "sidebar:";
export interface SidebarDragData {
  keys: string[];
  label: string;
}

// Needs a DndContext around the sidebar and the drop target.
const SidebarDraggable = ({
  id,
  data,
  children,
}: {
  id: string;
  data: SidebarDragData;
  children: ReactNode;
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: SIDEBAR_DRAG_PREFIX + id,
    data,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`cursor-grab ${isDragging ? "opacity-40" : ""}`}
    >
      {children}
    </div>
  );
};

interface FieldSidebarProps {
  // Flat list, or `groups` for a collapsible tree.
  fields?: SidebarField[];
  groups?: SidebarFieldGroup[];
  onAdd: (keys: string[]) => void;
  hint?: ReactNode;
  emptyText?: string;
  // Fields and group headers can be dragged (see SidebarDraggable).
  draggable?: boolean;
}

const matches = (field: SidebarField, filter: string) =>
  field.label.toLowerCase().includes(filter);

const FieldSidebar = ({
  fields,
  groups,
  onAdd,
  hint,
  emptyText = "Keine passenden Felder",
  draggable = false,
}: FieldSidebarProps) => {
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const needle = filter.trim().toLowerCase();
  const visibleGroups = (
    groups ?? [{ key: "", label: "", fields: fields ?? [] }]
  )
    .map((g) => ({ ...g, fields: g.fields.filter((f) => matches(f, needle)) }))
    .filter((g) => g.fields.length > 0);

  const toggleCollapsed = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const withDrag = (id: string, data: SidebarDragData, node: ReactNode) =>
    draggable ? (
      <SidebarDraggable key={id} id={id} data={data}>
        {node}
      </SidebarDraggable>
    ) : (
      node
    );

  const renderField = (field: SidebarField) =>
    withDrag(
      `field:${field.key}`,
      { keys: [field.key], label: field.label },
      <div
        key={field.key}
        className="flex items-center gap-2 w-full text-sm text-gray-700 border border-gray-200 rounded-lg px-3 bg-white hover:border-blue-400 hover:bg-blue-50 transition-colors"
      >
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
    // A search expands every group so matches are never hidden.
    const isCollapsed = !needle && collapsed.has(group.key);
    return (
      <div key={group.key} className="flex flex-col gap-2">
        {withDrag(
          `group:${group.key}`,
          { keys, label: group.label },
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
        )}
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
    </div>
  );
};

export default FieldSidebar;
