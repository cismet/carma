import { useState } from "react";
import { Button, Input, Tooltip, message } from "antd";
import { DownloadOutlined, TableOutlined } from "@ant-design/icons";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type {
  CollisionDetection,
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import type { ReactNode } from "react";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import AdvancedDialog, {
  FooterTextButton,
} from "../advanced-dialog/AdvancedDialog";
import FieldSidebar, {
  SIDEBAR_DRAG_PREFIX,
} from "../advanced-dialog/FieldSidebar";
import type { SidebarDragData } from "../advanced-dialog/FieldSidebar";
import ResetButton from "../advanced-dialog/ResetButton";
import Panel from "../advanced-dialog/Panel";
import CsvColumnRow, {
  CSV_GROUP_DRAG_PREFIX,
  CsvColumnGroup,
  CsvColumnGroupHeaderView,
  CsvColumnRowView,
} from "./CsvColumnRow";
import {
  CSV_LAYER_LABELS,
  CSV_SCOPE_LAYERS,
  getAvailableFields,
  getDefaultColumns,
  getFieldColor,
  getFieldLabel,
  getFieldGroups,
  getGroupOf,
} from "./csvSettingsData";
import type { CsvLayer, CsvTemplateScope } from "./csvSettingsData";
import type { SaveCsvTemplateInput } from "./useCsvTemplates";

const COLUMNS_DROP_ID = "columns";

const isSidebarDrag = (id: unknown) =>
  String(id).startsWith(SIDEBAR_DRAG_PREFIX);

const isGroupDrag = (id: unknown) =>
  String(id).startsWith(CSV_GROUP_DRAG_PREFIX);

// Sidebar items drop where the pointer is; columns sort by nearest center.
const collisionDetection: CollisionDetection = (args) => {
  const groupDrag = isGroupDrag(args.active.id);
  const droppableContainers = args.droppableContainers.filter(
    (c) => isGroupDrag(c.id) === groupDrag && c.id !== COLUMNS_DROP_ID
  );
  return isSidebarDrag(args.active.id)
    ? pointerWithin({
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (c) => !isGroupDrag(c.id)
        ),
      })
    : closestCenter({ ...args, droppableContainers });
};

// The column list as a target, so an empty list accepts drops too.
const ColumnsDropZone = ({ children }: { children: ReactNode }) => {
  const { setNodeRef, isOver } = useDroppable({ id: COLUMNS_DROP_ID });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-h-0 overflow-y-auto p-4 transition-colors ${
        isOver ? "bg-blue-50" : ""
      }`}
    >
      {children}
    </div>
  );
};

// Mount only while open: state is initialized from `initial`.
interface CsvTemplateEditorProps {
  scope: CsvTemplateScope;
  initial: SaveCsvTemplateInput;
  templates: { id: number; name: string }[];
  onSave: (
    input: SaveCsvTemplateInput,
    exportAfter: boolean
  ) => Promise<number | null>;
  onClose: () => void;
}

const CsvTemplateEditor = ({
  scope,
  initial,
  templates,
  onSave,
  onClose,
}: CsvTemplateEditorProps) => {
  const layers = CSV_SCOPE_LAYERS[scope];
  const [draft, setDraft] = useState(
    () =>
      Object.fromEntries(
        layers.map((l) => [l, initial.columns[l] ?? []])
      ) as Record<CsvLayer, string[]>
  );
  const [draftLayers, setDraftLayers] = useState(initial.includedLayers);
  const [name, setName] = useState(initial.name);
  const [beschreibung, setBeschreibung] = useState(initial.beschreibung ?? "");
  const [layer, setLayer] = useState<CsvLayer>(layers[0]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [id, setId] = useState(initial.id);
  const [saving, setSaving] = useState<"save" | "export" | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarDrag, setSidebarDrag] = useState<SidebarDragData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const columns = draft[layer];
  const layerIncluded = draftLayers.includes(layer);
  const setLayerIncluded = (tabLayer: CsvLayer, value: boolean) =>
    setDraftLayers((prev) =>
      layers.filter((l) => (l === tabLayer ? value : prev.includes(l)))
    );
  const setColumns = (update: (prev: string[]) => string[]) =>
    setDraft((prev) => ({ ...prev, [layer]: update(prev[layer]) }));

  const defaultColumns = getDefaultColumns(layer);
  const columnsAreDefault =
    JSON.stringify(columns) === JSON.stringify(defaultColumns);
  const fieldInfo = (key: string) => ({
    label: getFieldLabel(layer, key),
    color: getFieldColor(layer, key).color,
    colorTitle: getFieldColor(layer, key).label,
  });

  const used = new Set(columns);
  const sidebarGroups = getFieldGroups(layer).map((group) => ({
    key: group.key,
    label: group.label,
    fields: group.fields
      .filter((key) => !used.has(key))
      .map((key) => ({ key, ...fieldInfo(key) })),
  }));

  // A group repeats when its columns aren't adjacent; CSV order wins.
  const runs: {
    id: string;
    key: string;
    label: string;
    start: number;
    keys: string[];
  }[] = [];
  columns.forEach((key, index) => {
    const group = getGroupOf(layer, key);
    const groupKey = group?.key ?? "";
    const last = runs[runs.length - 1];
    if (last?.key === groupKey) last.keys.push(key);
    else
      runs.push({
        id: `${groupKey}:${index}`,
        key: groupKey,
        label: group?.label ?? "Weitere Felder",
        start: index,
        keys: [key],
      });
  });
  const activeRun = activeId
    ? runs.find((run) => CSV_GROUP_DRAG_PREFIX + run.id === activeId)
    : undefined;

  const toggleCollapsed = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const addColumns = (keys: string[]) =>
    setColumns((prev) => [...prev, ...keys.filter((k) => !prev.includes(k))]);

  const removeColumns = (keys: string[]) => {
    const drop = new Set(keys);
    setColumns((prev) => prev.filter((k) => !drop.has(k)));
  };

  const trimmedName = name.trim();
  const nameTaken = templates.some(
    (t) =>
      t.id !== id && t.name.trim().toLowerCase() === trimmedName.toLowerCase()
  );
  const saveBlocker = !trimmedName
    ? "Name fehlt"
    : nameTaken
    ? "Name ist bereits vergeben"
    : draftLayers.length === 0
    ? "Mindestens ein Fachobjekt auswählen"
    : undefined;

  const save = async (exportAfter: boolean) => {
    setSaving(exportAfter ? "export" : "save");
    try {
      const savedId = await onSave(
        {
          id,
          name: trimmedName,
          beschreibung,
          columns: draft,
          includedLayers: draftLayers,
        },
        exportAfter
      );
      if (savedId != null) setId(savedId);
      if (!exportAfter) void message.success("Vorlage gespeichert");
    } catch (err: unknown) {
      console.error("[CsvTemplateEditor] save failed:", err);
      void message.error("Vorlage konnte nicht gespeichert werden");
    } finally {
      setSaving(null);
    }
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    if (isSidebarDrag(active.id)) {
      setSidebarDrag(active.data.current as SidebarDragData);
    } else {
      setActiveId(String(active.id));
    }
  };

  const clearDrag = () => {
    setActiveId(null);
    setSidebarDrag(null);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    clearDrag();
    if (!over) return;
    if (isSidebarDrag(active.id)) {
      const { keys } = active.data.current as SidebarDragData;
      // Dropped on a column: insert before it; on the list: append.
      const at = columns.indexOf(String(over.id));
      const adding = keys.filter((k) => !columns.includes(k));
      setColumns((prev) =>
        at === -1
          ? [...prev, ...adding]
          : [...prev.slice(0, at), ...adding, ...prev.slice(at)]
      );
      return;
    }
    if (active.id === over.id) return;
    if (isGroupDrag(active.id)) {
      const byId = (id: unknown) =>
        runs.find((run) => CSV_GROUP_DRAG_PREFIX + run.id === id);
      const moving = byId(active.id);
      const target = byId(over.id);
      if (!moving || !target) return;
      const rest = columns.filter((k) => !moving.keys.includes(k));
      const at =
        target.start > moving.start
          ? rest.indexOf(target.keys[target.keys.length - 1]) + 1
          : rest.indexOf(target.keys[0]);
      setColumns(() => [
        ...rest.slice(0, at),
        ...moving.keys,
        ...rest.slice(at),
      ]);
      return;
    }
    const from = columns.indexOf(String(active.id));
    const to = columns.indexOf(String(over.id));
    if (from !== -1 && to !== -1) {
      setColumns((prev) => arrayMove(prev, from, to));
    }
  };

  return (
    <AdvancedDialog
      open
      onClose={onClose}
      icon={<DownloadOutlined />}
      title={
        <>
          {id == null ? "Neue CSV-Vorlage" : "CSV-Vorlage bearbeiten"}
          {layers.length === 1 && (
            <span className="ml-2 text-sm font-normal text-gray-400">
              {CSV_LAYER_LABELS[layers[0]]}
            </span>
          )}
        </>
      }
      tabs={
        layers.length > 1
          ? layers.map((tabLayer) => ({
              key: tabLayer,
              checked: draftLayers.includes(tabLayer),
              onCheckedChange: (value: boolean) =>
                setLayerIncluded(tabLayer, value),
              checkboxTitle: "Im Export enthalten",
              label: (
                <>
                  {CSV_LAYER_LABELS[tabLayer]}
                  <span className="text-xs text-gray-400">
                    {draft[tabLayer].length}
                  </span>
                </>
              ),
            }))
          : []
      }
      activeTab={layer}
      onTabChange={(key) => {
        setLayer(key as CsvLayer);
        setCollapsed(new Set());
      }}
      width={1100}
      flush
      footerLeft={
        <>
          <ResetButton
            label="Standardspalten wiederherstellen"
            onReset={() => setColumns(() => defaultColumns)}
            isDefault={columnsAreDefault}
          />
          <FooterTextButton
            onClick={() => removeColumns(columns)}
            disabled={columns.length === 0}
          >
            Alle entfernen
          </FooterTextButton>
        </>
      }
      footerRight={
        <div className="flex gap-2">
          <Button onClick={onClose} disabled={saving !== null}>
            Abbrechen
          </Button>
          <Tooltip title={saveBlocker}>
            <Button
              onClick={() => void save(false)}
              loading={saving === "save"}
              disabled={saveBlocker !== undefined || saving === "export"}
            >
              Vorlage speichern
            </Button>
          </Tooltip>
          <Tooltip
            title={
              saveBlocker ??
              "Vorlage speichern und für den CSV-Export verwenden"
            }
          >
            <Button
              type="primary"
              onClick={() => void save(true)}
              loading={saving === "export"}
              disabled={saveBlocker !== undefined || saving === "save"}
            >
              Export
            </Button>
          </Tooltip>
        </div>
      }
    >
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        modifiers={sidebarDrag ? [] : [restrictToVerticalAxis]}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={clearDrag}
      >
        <div className="flex h-full gap-6">
          <FieldSidebar
            key={layer}
            groups={sidebarGroups}
            onAdd={addColumns}
            draggable
            hint="Klicken oder in die Spalten ziehen; + fügt eine ganze Gruppe hinzu"
            emptyText="Alle Felder sind im Export"
          />

          <div className="flex-1 min-w-0 flex flex-col min-h-0 pr-6 pb-6">
            <div className="flex gap-3 mb-4">
              <div className="flex flex-col gap-1 w-1/3">
                <label
                  htmlFor="csv-template-name"
                  className="text-xs font-semibold tracking-wide uppercase text-gray-400"
                >
                  Name
                </label>
                <Input
                  id="csv-template-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name eingeben"
                  status={nameTaken ? "error" : undefined}
                />
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label
                  htmlFor="csv-template-beschreibung"
                  className="text-xs font-semibold tracking-wide uppercase text-gray-400"
                >
                  Beschreibung{" "}
                  <span className="font-normal normal-case tracking-normal">
                    (optional)
                  </span>
                </label>
                <Input.TextArea
                  id="csv-template-beschreibung"
                  value={beschreibung}
                  onChange={(e) => setBeschreibung(e.target.value)}
                  placeholder="Wofür ist die Vorlage?"
                  autoSize={{ minRows: 1, maxRows: 4 }}
                />
              </div>
            </div>
            <div className="text-xs text-gray-400 mb-3">
              <span className="font-semibold tracking-wide uppercase">
                Spalten
              </span>{" "}
              <span className="text-gray-500">
                {columns.length} von {getAvailableFields(layer).length}
              </span>
            </div>
            {!layerIncluded && (
              <div className="flex items-center justify-between gap-3 mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                {CSV_LAYER_LABELS[layer]} werden nicht exportiert.
                <Button
                  size="small"
                  onClick={() => setLayerIncluded(layer, true)}
                >
                  Einbeziehen
                </Button>
              </div>
            )}
            <Panel
              className="flex-1 min-h-0"
              icon={<TableOutlined />}
              title="Spalten im Export"
            >
              <ColumnsDropZone>
                <div className="text-xs text-gray-400 mb-3">
                  {layer === "arbeitsauftraege"
                    ? "Aktion-Spalten, Leuchtennummer und Mastnummer erscheinen nur, wenn sie im Export Werte haben."
                    : "Die Spalte „Typ“ steht immer an erster Stelle."}
                </div>
                <SortableContext
                  items={runs.map((run) => CSV_GROUP_DRAG_PREFIX + run.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="flex flex-col gap-4">
                    {runs.map((run) => (
                      <CsvColumnGroup
                        key={run.id}
                        id={run.id}
                        items={run.keys}
                        label={run.label}
                        collapsed={collapsed.has(run.key)}
                        onToggle={() => toggleCollapsed(run.key)}
                        onRemove={() => removeColumns(run.keys)}
                      >
                        {run.keys.map((key, i) => (
                          <CsvColumnRow
                            key={key}
                            id={key}
                            index={run.start + i}
                            {...fieldInfo(key)}
                            onRemove={() => removeColumns([key])}
                          />
                        ))}
                      </CsvColumnGroup>
                    ))}
                  </div>
                </SortableContext>
                {columns.length === 0 && (
                  <div className="h-full min-h-[160px] flex flex-col gap-1 items-center justify-center border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-400">
                    Felder oder Gruppen hierher ziehen oder links anklicken
                    <span className="text-xs">
                      Ohne Auswahl werden alle Spalten exportiert.
                    </span>
                  </div>
                )}
              </ColumnsDropZone>
            </Panel>
          </div>
        </div>
        <DragOverlay>
          {activeRun && (
            <CsvColumnGroupHeaderView
              label={activeRun.label}
              count={activeRun.keys.length}
              collapsed
              dragging
            />
          )}
          {activeId && !activeRun && (
            <CsvColumnRowView
              index={columns.indexOf(activeId)}
              {...fieldInfo(activeId)}
              dragging
            />
          )}
          {sidebarDrag && (
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-500 bg-white shadow-lg text-sm text-gray-700 cursor-grabbing">
              {sidebarDrag.label}
              {sidebarDrag.keys.length > 1 && (
                <span className="text-xs text-gray-400">
                  {sidebarDrag.keys.length} Felder
                </span>
              )}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </AdvancedDialog>
  );
};

export default CsvTemplateEditor;
