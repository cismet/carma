import { useState } from "react";
import { Button, Checkbox, Tooltip } from "antd";
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
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
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
import FieldSidebar from "../advanced-dialog/FieldSidebar";
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
  getDefaultSettings,
  getFieldColor,
  getFieldLabel,
  getFieldGroups,
  getGroupLabelOf,
} from "./csvSettingsData";
import type { CsvColumnSettings, CsvLayer } from "./csvSettingsData";

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
  const [saved, setSaved] = useState<CsvColumnSettings>(getDefaultSettings);
  const [draft, setDraft] = useState<CsvColumnSettings>(saved);
  const [layer, setLayer] = useState<CsvLayer>(layers[0]);
  // Which map features the export includes.
  const [savedLayers, setSavedLayers] = useState<CsvLayer[]>(layers);
  const [draftLayers, setDraftLayers] = useState<CsvLayer[]>(layers);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

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
  const allChecked =
    columns.length > 0 && checkedColumns.length === columns.length;

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
    setDraft(saved);
    setDraftLayers(savedLayers);
    setChecked(new Set());
    setIsOpen(true);
  };

  const save = () => {
    setSaved(draft);
    setSavedLayers(draftLayers);
    setIsOpen(false);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
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
              onReset={() => setColumns(() => getDefaultColumns(layer))}
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
        <div className="flex h-full gap-6">
          <FieldSidebar
            key={layer}
            groups={sidebarGroups}
            onAdd={addColumns}
            multiSelect
            hint="Klick fügt ein Feld hinzu, + eine ganze Gruppe"
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
                droppedMessage={(n) =>
                  `${n} unbekannte Spalte(n) wurden entfernt`
                }
              />
            )}
            <Panel
              className="flex-1 min-h-0"
              icon={<TableOutlined />}
              title={
                <>
                  <Checkbox
                    checked={allChecked}
                    indeterminate={checkedColumns.length > 0 && !allChecked}
                    disabled={columns.length === 0}
                    onChange={(e) =>
                      setChecked(
                        e.target.checked ? new Set(columns) : new Set()
                      )
                    }
                  />
                  Spalten im Export
                </>
              }
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
              <div className="flex-1 min-h-0 overflow-y-auto p-4">
                <div className="text-xs text-gray-400 mb-3">
                  {layer === "arbeitsauftraege"
                    ? "Aktion-Spalten, Leuchtennummer und Mastnummer erscheinen nur, wenn sie im Export Werte haben."
                    : "Die Spalte „Typ“ steht immer an erster Stelle."}
                </div>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  modifiers={[restrictToVerticalAxis]}
                  onDragStart={({ active }) => setActiveId(String(active.id))}
                  onDragEnd={handleDragEnd}
                  onDragCancel={() => setActiveId(null)}
                >
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
                  <DragOverlay>
                    {activeId && (
                      <CsvColumnRowView
                        index={columns.indexOf(activeId)}
                        {...rowProps(activeId)}
                        dragging
                      />
                    )}
                  </DragOverlay>
                </DndContext>
                {columns.length === 0 && (
                  <div className="h-full min-h-[160px] flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-400">
                    Felder links anklicken oder auswählen und hinzufügen
                  </div>
                )}
              </div>
            </Panel>
          </div>
        </div>
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
