import { Fragment, useState } from "react";
import { AutoComplete } from "antd";
import {
  PlusOutlined,
  DashboardOutlined,
  SortAscendingOutlined,
  StarOutlined,
} from "@ant-design/icons";
import { useDispatch, useSelector } from "react-redux";
import FilterGroup from "./FilterGroup";
import GroupConjunction from "./GroupConjunction";
import FilterEmptyState from "./FilterEmptyState";
import SortRow from "./SortRow";
import FieldSidebar from "../advanced-dialog/FieldSidebar";
import Panel, { PanelActionButton } from "../advanced-dialog/Panel";
import PanelToolbar, { PanelToggle } from "../advanced-dialog/PanelToolbar";
import TemplatePanel from "../advanced-dialog/TemplatePanel";
import { useSavedSearches } from "./useSavedSearches";
import { TYPE_META, REGISTRY, defaultOperatorForType } from "./fieldRegistry";
import type { ObjectType } from "./fieldRegistry";
import {
  addGroup,
  addRule,
  removeGroup,
  selectGroup,
  selectSort,
  addSort,
  setLimit,
  getExpertTypeState,
} from "../../../store/slices/expertSearch";

interface ExpertSearchProps {
  objectType: ObjectType;
}

// Preset row limits offered in the LIMIT dropdown; a custom value can still be
// typed in.
const LIMIT_PRESETS = [10, 20, 50, 100, 500];
const LIMIT_OPTIONS = LIMIT_PRESETS.map((n) => ({ value: String(n) }));

const ExpertSearch = ({ objectType }: ExpertSearchProps) => {
  const dispatch = useDispatch();
  const fields = REGISTRY[objectType];
  const sortableFields = fields.filter((f) => f.sortable !== false);
  const { groups, sorts, limit, selectedGroupId, sortSelected } = useSelector(
    getExpertTypeState(objectType)
  );
  // Whether the sort panel is expanded. Opening it also makes sorting the
  // target for sidebar field clicks (selectSort).
  const [sortOpen, setSortOpen] = useState(sorts.length > 0);
  const savedSearches = useSavedSearches(objectType);
  const [savedOpen, setSavedOpen] = useState(false);

  const toggleSortPanel = () => {
    const next = !sortOpen;
    setSortOpen(next);
    if (next) dispatch(selectSort(objectType));
  };

  // A new sort defaults to the first field not already sorted on (so it never
  // duplicates an existing row), ascending.
  const handleAddSort = () => {
    const used = new Set(sorts.map((s) => s.field));
    const nextField = sortableFields.find((f) => !used.has(f.key))?.key;
    if (!nextField) return;
    dispatch(addSort({ objectType, field: nextField }));
    setSortOpen(true);
  };

  // Every field is already used → no more sorts can be added without duplicating.
  const allFieldsSorted = sorts.length >= sortableFields.length;

  // Clicking a field in the sidebar targets whatever is currently selected:
  // the sort list (add a sort on that field) or a filter group (add a rule).
  const handleFieldClick = (fieldKey: string) => {
    if (sortSelected) {
      // Skip fields already sorted on — no duplicate order_by entries.
      if (
        sortableFields.some((f) => f.key === fieldKey) &&
        !sorts.some((s) => s.field === fieldKey)
      ) {
        dispatch(addSort({ objectType, field: fieldKey }));
      }
      return;
    }
    const targetGroup =
      groups.find((g) => g.id === selectedGroupId) ?? groups[groups.length - 1];
    if (!targetGroup) return;
    const fieldType = fields.find((f) => f.key === fieldKey)?.type ?? "text";
    dispatch(
      addRule({
        objectType,
        groupId: targetGroup.id,
        field: fieldKey,
        operator: defaultOperatorForType(fieldType),
      })
    );
  };

  const totalRules = groups.reduce((sum, g) => sum + g.rules.length, 0);

  // Group the sidebar by field type (the colored tag), keeping registry order
  // within each type. Object.keys(TYPE_META) defines the type ordering.
  const typeOrder = Object.keys(TYPE_META);
  const sidebarFields = fields
    .slice()
    .sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type))
    .map((field) => ({
      key: field.key,
      label: field.label,
      color: TYPE_META[field.type].color,
      colorTitle: TYPE_META[field.type].label,
    }));

  return (
    <div className="flex h-full gap-6">
      <FieldSidebar
        fields={sidebarFields}
        onAdd={(keys) => keys.forEach(handleFieldClick)}
        hint={
          sortSelected
            ? "Klick fügt zur Sortierung hinzu"
            : "Klick fügt zur ausgewählten Gruppe hinzu"
        }
      />

      {/* Content: filter groups (empty state) */}
      <div className="flex-1 min-w-0 flex flex-col pr-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-gray-400">
            <span className="font-semibold tracking-wide uppercase">
              Filter
            </span>{" "}
            <span className="text-gray-500">{totalRules} Bedingungen</span>
          </div>
          <PanelToolbar>
            {/* LIMIT */}
            <div className="flex items-center gap-2">
              <DashboardOutlined className="text-gray-400 text-xs" />
              <span className="text-xs font-semibold tracking-wide uppercase text-gray-500">
                Limit
              </span>
              <AutoComplete
                size="small"
                className="w-16"
                placeholder="Alle"
                value={limit == null ? "" : String(limit)}
                options={LIMIT_OPTIONS}
                // Show only presets that begin with what's typed.
                filterOption={(input, option) =>
                  option?.value.startsWith(input) ?? false
                }
                // Accept digits only; empty clears the limit (= all rows).
                onChange={(value) => {
                  const digits = value.replace(/\D/g, "");
                  dispatch(
                    setLimit({
                      objectType,
                      limit: digits === "" ? null : Number(digits),
                    })
                  );
                }}
              />
            </div>
            <PanelToggle
              icon={<SortAscendingOutlined />}
              label="Sortierung"
              count={sorts.length}
              open={sortOpen}
              onToggle={toggleSortPanel}
            />
            <PanelToggle
              icon={<StarOutlined />}
              label="Vorlagen"
              count={savedSearches.items.length}
              open={savedOpen}
              onToggle={() => setSavedOpen(!savedOpen)}
            />
          </PanelToolbar>
        </div>
        {savedOpen && (
          <TemplatePanel
            {...savedSearches}
            saveLabel="Aktuelle Suche speichern"
            deleteHint="Die Vorlage wird für alle Nutzer gelöscht."
            droppedMessage={(n) =>
              `${n} Bedingung(en) mit unbekannten Feldern wurden entfernt`
            }
          />
        )}
        {sortOpen && (
          // Selectable like a group: click it, then sidebar fields add sorts.
          <Panel
            icon={<SortAscendingOutlined />}
            title="Sortierung"
            selected={sortSelected}
            onClick={() => dispatch(selectSort(objectType))}
            actions={
              <PanelActionButton
                icon={<PlusOutlined />}
                onClick={handleAddSort}
                disabled={allFieldsSorted}
              >
                Regel
              </PanelActionButton>
            }
          >
            {sorts.length > 0 ? (
              <div className="flex flex-col gap-2 p-4">
                {sorts.map((sort, index) => (
                  <SortRow
                    key={sort.id}
                    objectType={objectType}
                    sort={sort}
                    index={index}
                    fields={sortableFields}
                    usedFieldKeys={sorts
                      .filter((s) => s.id !== sort.id)
                      .map((s) => s.field)}
                  />
                ))}
              </div>
            ) : (
              <div className="px-4 py-3 text-sm text-gray-400">
                Noch keine Sortierung — Feld links anklicken oder „Regel“
                hinzufügen.
              </div>
            )}
          </Panel>
        )}
        <div className="flex-1 overflow-y-auto flex flex-col border border-dashed border-gray-200 rounded-xl bg-gray-50 p-3 text-gray-500 mt-2 mb-5">
          <div className="flex flex-col gap-4">
            {groups.map((group, index) => (
              <Fragment key={group.id}>
                {index > 0 && <GroupConjunction objectType={objectType} />}
                <FilterGroup
                  objectType={objectType}
                  group={group}
                  title={`Gruppe ${index + 1}`}
                  fields={fields}
                  selected={
                    !sortSelected &&
                    group.id === selectedGroupId &&
                    // Highlight when there's something to disambiguate against:
                    // multiple groups, or an open sort panel competing for the
                    // target.
                    (groups.length > 1 || sortOpen)
                  }
                  onSelect={() =>
                    dispatch(selectGroup({ objectType, groupId: group.id }))
                  }
                  onDelete={
                    groups.length > 1
                      ? () =>
                          dispatch(
                            removeGroup({ objectType, groupId: group.id })
                          )
                      : undefined
                  }
                />
              </Fragment>
            ))}
            <button
              type="button"
              onClick={() => dispatch(addGroup(objectType))}
              className="w-full flex items-center justify-center gap-2 text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg py-2.5 bg-transparent hover:border-blue-400 hover:text-blue-500 cursor-pointer transition-colors"
            >
              <PlusOutlined />
              Weitere Gruppe
            </button>
          </div>
          {totalRules === 0 && groups.length === 1 && (
            <div className="flex-1 flex items-center justify-center">
              <FilterEmptyState />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExpertSearch;
