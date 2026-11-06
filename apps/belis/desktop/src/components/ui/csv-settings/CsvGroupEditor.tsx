import { useState } from "react";
import type { ReactNode } from "react";
import { Button, Checkbox, Input, Select } from "antd";
import { HolderOutlined, PlusOutlined } from "@ant-design/icons";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragOverEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SidebarShell } from "../advanced-dialog/FieldSidebar";
import { DeleteIconButton } from "../advanced-dialog/Panel";
import ResetButton from "../advanced-dialog/ResetButton";
import type { CsvGroups } from "./csvSettingsData";

const GROUP_PREFIX = "group:";

interface FieldInfo {
  label: string;
  color: string;
  colorTitle: string;
}

interface CsvGroupEditorProps {
  groups: CsvGroups;
  onChange: (groups: CsvGroups) => void;
  onReset: () => void;
  isDefault: boolean;
  onDone: () => void;
  getField: (key: string) => FieldInfo;
}

const GroupFieldRow = ({
  id,
  field,
  checked,
  onCheckedChange,
}: {
  id: string;
  field: FieldInfo;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-2 text-sm text-gray-700 border rounded-lg px-2 py-1.5 bg-white cursor-grab select-none ${
        checked ? "border-blue-400 bg-blue-50" : "border-gray-200"
      }`}
    >
      <HolderOutlined className="text-gray-400" />
      <span onPointerDown={(e) => e.stopPropagation()}>
        <Checkbox
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
        />
      </span>
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: field.color }}
        title={field.colorTitle}
      />
      <span className="truncate">{field.label}</span>
    </div>
  );
};

// Drop target for a whole group, so empty groups can receive fields.
const GroupDropZone = ({
  groupKey,
  children,
}: {
  groupKey: string;
  children: ReactNode;
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: GROUP_PREFIX + groupKey });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-1.5 min-h-[36px] rounded-lg p-1 transition-colors ${
        isOver ? "bg-blue-50" : ""
      }`}
    >
      {children}
    </div>
  );
};

const CsvGroupEditor = ({
  groups,
  onChange,
  onReset,
  isDefault,
  onDone,
  getField,
}: CsvGroupEditorProps) => {
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const groupKeyOf = (id: string) =>
    id.startsWith(GROUP_PREFIX)
      ? id.slice(GROUP_PREFIX.length)
      : groups.find((g) => g.fields.includes(id))?.key;

  const moveFields = (keys: string[], toGroup: string, atIndex?: number) => {
    const moving = new Set(keys);
    onChange(
      groups.map((g) => {
        const kept = g.fields.filter((k) => !moving.has(k));
        if (g.key !== toGroup) return { ...g, fields: kept };
        kept.splice(atIndex ?? kept.length, 0, ...keys);
        return { ...g, fields: kept };
      })
    );
  };

  // Crossing into another group happens while dragging, so the target list
  // opens a gap; reordering within a group is finished on drop.
  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = groupKeyOf(String(active.id));
    const to = groupKeyOf(String(over.id));
    if (!from || !to || from === to) return;
    const target = groups.find((g) => g.key === to);
    const overIndex = target?.fields.indexOf(String(over.id)) ?? -1;
    moveFields(
      [String(active.id)],
      to,
      overIndex === -1 ? undefined : overIndex
    );
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const key = groupKeyOf(String(active.id));
    const group = groups.find((g) => g.key === key);
    if (!group || key !== groupKeyOf(String(over.id))) return;
    const from = group.fields.indexOf(String(active.id));
    const to = group.fields.indexOf(String(over.id));
    if (from === -1 || to === -1 || from === to) return;
    onChange(
      groups.map((g) =>
        g.key === key ? { ...g, fields: arrayMove(g.fields, from, to) } : g
      )
    );
  };

  const renameGroup = (key: string, label: string) =>
    onChange(groups.map((g) => (g.key === key ? { ...g, label } : g)));

  const addGroup = () =>
    onChange([
      ...groups,
      { key: `user-${Date.now()}`, label: "Neue Gruppe", fields: [] },
    ]);

  // Fields of a deleted group are not lost; resolveGroups puts them back
  // under "Weitere Felder".
  const deleteGroup = (key: string) =>
    onChange(groups.filter((g) => g.key !== key));

  const checkedKeys = groups
    .flatMap((g) => g.fields)
    .filter((k) => checked.has(k));

  const setFieldChecked = (key: string, value: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });

  return (
    <SidebarShell
      title="Gruppen bearbeiten"
      action={
        <div className="flex items-center gap-2">
          <ResetButton
            iconOnly
            label="Standardgruppen wiederherstellen"
            onReset={onReset}
            isDefault={isDefault}
            confirmTitle="Eigene Gruppen verwerfen?"
          />
          <Button size="small" type="primary" onClick={onDone}>
            Fertig
          </Button>
        </div>
      }
    >
      <div className="text-xs text-gray-400 mb-2">
        Felder zwischen Gruppen ziehen oder auswählen und verschieben
      </div>
      <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto pr-1">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {groups.map((group) => (
            <div
              key={group.key}
              className="border border-gray-200 rounded-xl bg-white p-2"
            >
              <div className="flex items-center gap-1 mb-1">
                <Input
                  size="small"
                  variant="borderless"
                  value={group.label}
                  onChange={(e) => renameGroup(group.key, e.target.value)}
                  className="font-semibold text-xs uppercase tracking-wide text-gray-500"
                  aria-label="Gruppenname"
                />
                <span className="text-xs text-gray-400">
                  {group.fields.length}
                </span>
                <DeleteIconButton
                  small
                  label="Gruppe löschen"
                  title="Gruppe löschen (Felder gehen nach „Weitere Felder“)"
                  onClick={() => deleteGroup(group.key)}
                />
              </div>
              <SortableContext
                id={group.key}
                items={group.fields}
                strategy={verticalListSortingStrategy}
              >
                <GroupDropZone groupKey={group.key}>
                  {group.fields.map((key) => (
                    <GroupFieldRow
                      key={key}
                      id={key}
                      field={getField(key)}
                      checked={checked.has(key)}
                      onCheckedChange={(value) => setFieldChecked(key, value)}
                    />
                  ))}
                  {group.fields.length === 0 && (
                    <div className="text-xs text-gray-400 text-center py-2">
                      Felder hierher ziehen
                    </div>
                  )}
                </GroupDropZone>
              </SortableContext>
            </div>
          ))}
        </DndContext>
        <button
          type="button"
          onClick={addGroup}
          className="w-full flex items-center justify-center gap-2 text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg py-2 bg-transparent hover:border-blue-400 hover:text-blue-500 cursor-pointer transition-colors"
        >
          <PlusOutlined />
          Neue Gruppe
        </button>
      </div>
      <Select
        className="mt-3"
        placeholder={
          checkedKeys.length > 0
            ? `${checkedKeys.length} Feld(er) verschieben nach…`
            : "Felder auswählen zum Verschieben"
        }
        disabled={checkedKeys.length === 0}
        value={null}
        options={groups.map((g) => ({ value: g.key, label: g.label }))}
        onChange={(to: string) => {
          moveFields(checkedKeys, to);
          setChecked(new Set());
        }}
      />
    </SidebarShell>
  );
};

export default CsvGroupEditor;
