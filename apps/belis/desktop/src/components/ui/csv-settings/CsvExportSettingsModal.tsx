import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, Tooltip } from "antd";
import {
  DeleteOutlined,
  DownloadOutlined,
  StarOutlined,
  TableOutlined,
} from "@ant-design/icons";
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
import Panel, { PanelActionButton } from "../advanced-dialog/Panel";
import PanelToolbar, { PanelToggle } from "../advanced-dialog/PanelToolbar";
import TemplatePanel from "../advanced-dialog/TemplatePanel";
import CsvColumnRow, { CsvColumnRowView } from "./CsvColumnRow";
import { useCsvTemplates } from "./useCsvTemplates";
import {
  CSV_LAYER_LABELS,
  FACHOBJEKT_LAYERS,
  getAvailableFields,
  getDefaultColumns,
  getFieldColor,
  getFieldLabel,
  getFieldGroups,
  getGroupLabelOf,
} from "./csvSettingsData";
import type { CsvColumnSettings, CsvLayer } from "./csvSettingsData";
import {
  getCsvExportSettings,
  saveCsvExportSettings,
} from "../../../store/slices/csvExportSettings";

const COLUMNS_DROP_ID = "columns";

const isSidebarDrag = (id: unknown) =>
  String(id).startsWith(SIDEBAR_DRAG_PREFIX);

// Sidebar items drop where the pointer is; columns sort by nearest center.
const collisionDetection: CollisionDetection = (args) =>
  isSidebarDrag(args.active.id)
    ? pointerWithin(args)
    : // The list itself would compete with its rows when sorting.
      closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (c) => c.id !== COLUMNS_DROP_ID
        ),
      });

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

interface CsvExportSettingsModalProps {
  layers?: CsvLayer[];
  // "small" matches the antd size="small" buttons of the AA toolbar.
  buttonVariant?: "square" | "small";
}

const CsvExportSettingsModal = ({
  layers = FACHOBJEKT_LAYERS,
  buttonVariant = "square",
}: CsvExportSettingsModalProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const dispatch = useDispatch();
  const saved = useSelector(getCsvExportSettings);
  // A layer without saved columns starts empty and exports its defaults.
  const toDraft = (): CsvColumnSettings =>
    Object.fromEntries(
      (Object.keys(CSV_LAYER_LABELS) as CsvLayer[]).map((l) => [
        l,
        saved.columns[l] ?? [],
      ])
    ) as CsvColumnSettings;
  const [draft, setDraft] = useState<CsvColumnSettings>(toDraft);
  const [layer, setLayer] = useState<CsvLayer>(layers[0]);
  // Which map features the export includes.
  const includedLayers = () =>
    layers.filter((l) => !saved.excludedLayers.includes(l));
  const [draftLayers, setDraftLayers] = useState<CsvLayer[]>(includedLayers);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [templatesOpen, setTemplatesOpen] = useState(true);
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
  const templates = useCsvTemplates(layer, columns, (cols) =>
    setColumns(() => cols)
  );

  const columnsAreDefault =
    JSON.stringify(columns) === JSON.stringify(getDefaultColumns(layer));
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
  const rowProps = (key: string) => ({
    ...fieldInfo(key),
    groupLabel: getGroupLabelOf(layer, key),
  });

  const checkedColumns = columns.filter((key) => checked.has(key));

  const addColumns = (keys: string[]) =>
    setColumns((prev) => [...prev, ...keys.filter((k) => !prev.includes(k))]);

  const removeColumns = (keys: string[]) => {
    const drop = new Set(keys);
    setColumns((prev) => prev.filter((k) => !drop.has(k)));
    setChecked((prev) => new Set([...prev].filter((k) => !drop.has(k))));
  };

  const toggleChecked = (key: string, value: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });

  const open = () => {
    setDraft(toDraft());
    setDraftLayers(includedLayers());
    setChecked(new Set());
    setIsOpen(true);
  };

  const save = () => {
    dispatch(
      saveCsvExportSettings({
        layers,
        columns: draft,
        includedLayers: draftLayers,
      })
    );
    setIsOpen(false);
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
    const from = columns.indexOf(String(active.id));
    const to = columns.indexOf(String(over.id));
    if (from !== -1 && to !== -1) {
      setColumns((prev) => arrayMove(prev, from, to));
    }
  };

  return (
    <>
      <Tooltip title="CSV-Export Einstellungen">
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
            CSV-Export Einstellungen
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
          setChecked(new Set());
        }}
        width={1100}
        flush
        footerLeft={
          <>
            <ResetButton
              label="Standardspalten wiederherstellen"
              onReset={templates.selectDefault}
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
            <Button onClick={() => setIsOpen(false)}>Abbrechen</Button>
            <Tooltip
              title={
                draftLayers.length === 0
                  ? "Mindestens ein Fachobjekt auswählen"
                  : undefined
              }
            >
              <Button
                type="primary"
                onClick={save}
                disabled={draftLayers.length === 0}
              >
                Speichern
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
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs text-gray-400">
                  <span className="font-semibold tracking-wide uppercase">
                    Spalten
                  </span>{" "}
                  <span className="text-gray-500">
                    {columns.length} von {getAvailableFields(layer).length}
                  </span>
                </div>
                <PanelToolbar>
                  <PanelToggle
                    icon={<StarOutlined />}
                    label="Vorlagen"
                    count={templates.items.length}
                    open={templatesOpen}
                    onToggle={() => setTemplatesOpen(!templatesOpen)}
                  />
                </PanelToolbar>
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
              {templatesOpen && (
                <TemplatePanel
                  {...templates}
                  saveLabel="Aktuelle Spalten speichern"
                  deleteHint="Die Vorlage wird gelöscht."
                  lockedHint={(item) =>
                    item.isDefault
                      ? "Die Standardvorlage kann nicht gelöscht werden"
                      : "Nur der Ersteller kann die Vorlage löschen"
                  }
                  droppedMessage={(n) =>
                    `${n} unbekannte Spalte(n) wurden entfernt`
                  }
                />
              )}
              <Panel
                className="flex-1 min-h-0"
                icon={<TableOutlined />}
                title="Spalten im Export"
                actions={
                  <PanelActionButton
                    icon={<DeleteOutlined />}
                    danger
                    disabled={checkedColumns.length === 0}
                    onClick={() => removeColumns(checkedColumns)}
                  >
                    Entfernen
                    {checkedColumns.length > 0 && ` (${checkedColumns.length})`}
                  </PanelActionButton>
                }
              >
                <ColumnsDropZone>
                  <div className="text-xs text-gray-400 mb-3">
                    {layer === "arbeitsauftraege"
                      ? "Aktion-Spalten, Leuchtennummer und Mastnummer erscheinen nur, wenn sie im Export Werte haben."
                      : "Die Spalte „Typ“ steht immer an erster Stelle."}
                  </div>
                  <SortableContext
                    items={columns}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="flex flex-col gap-2">
                      {columns.map((key, index) => (
                        <CsvColumnRow
                          key={key}
                          id={key}
                          index={index}
                          {...rowProps(key)}
                          checked={checked.has(key)}
                          onCheckedChange={(value) => toggleChecked(key, value)}
                          onRemove={() => removeColumns([key])}
                        />
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
            {activeId && (
              <CsvColumnRowView
                index={columns.indexOf(activeId)}
                {...rowProps(activeId)}
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
