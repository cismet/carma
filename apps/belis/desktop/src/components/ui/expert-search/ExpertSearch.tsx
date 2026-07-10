import { Fragment, useState } from "react";
import { Input, AutoComplete } from "antd";
import {
  SearchOutlined,
  PlusOutlined,
  DashboardOutlined,
  SortAscendingOutlined,
  DownOutlined,
} from "@ant-design/icons";
import { useDispatch, useSelector } from "react-redux";
import FilterGroup from "./FilterGroup";
import GroupConjunction from "./GroupConjunction";
import FilterEmptyState from "./FilterEmptyState";
import SortRow from "./SortRow";
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
  const { groups, sorts, limit, selectedGroupId, sortSelected } = useSelector(
    getExpertTypeState(objectType)
  );
  const [fieldFilter, setFieldFilter] = useState("");
  // Whether the sort panel is expanded. Opening it also makes sorting the
  // target for sidebar field clicks (selectSort).
  const [sortOpen, setSortOpen] = useState(sorts.length > 0);

  const toggleSortPanel = () => {
    const next = !sortOpen;
    setSortOpen(next);
    if (next) dispatch(selectSort(objectType));
  };

  // A new sort defaults to the first field not already sorted on (so it never
  // duplicates an existing row), ascending.
  const handleAddSort = () => {
    const used = new Set(sorts.map((s) => s.field));
    const nextField = fields.find((f) => !used.has(f.key))?.key;
    if (!nextField) return;
    dispatch(addSort({ objectType, field: nextField }));
    setSortOpen(true);
  };

  // Every field is already used → no more sorts can be added without duplicating.
  const allFieldsSorted = sorts.length >= fields.length;

  // Clicking a field in the sidebar targets whatever is currently selected:
  // the sort list (add a sort on that field) or a filter group (add a rule).
  const handleFieldClick = (fieldKey: string) => {
    if (sortSelected) {
      // Skip fields already sorted on — no duplicate order_by entries.
      if (!sorts.some((s) => s.field === fieldKey)) {
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
  const filteredFields = fields
    .filter((field) =>
      field.label.toLowerCase().includes(fieldFilter.toLowerCase())
    )
    .slice()
    .sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type));

  return (
    <div className="flex h-full gap-6">
      {/* Sidebar: fields */}
      <div className="w-[310px] flex-shrink-0 flex flex-col bg-slate-50 border-r border-gray-200 pl-6 pr-4 pb-6 -mt-4 pt-4">
        <div className="text-xs font-semibold tracking-wide text-gray-400 uppercase mt-2 mb-2">
          Felder
        </div>
        <Input
          allowClear
          value={fieldFilter}
          onChange={(e) => setFieldFilter(e.target.value)}
          prefix={<SearchOutlined className="text-gray-400" />}
          placeholder="Feld suchen…"
        />
        <div className="text-xs text-gray-400 mt-3 mb-2">
          {sortSelected
            ? "Klick fügt zur Sortierung hinzu"
            : "Klick fügt zur ausgewählten Gruppe hinzu"}
        </div>
        <div className="flex flex-col gap-2 overflow-y-auto pr-1">
          {filteredFields.map((field) => (
            <button
              key={field.key}
              type="button"
              onClick={() => handleFieldClick(field.key)}
              className="flex items-center gap-2 w-full text-left text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2 bg-white hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-colors"
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: TYPE_META[field.type].color }}
                title={TYPE_META[field.type].label}
              />
              {field.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content: filter groups (empty state) */}
      <div className="flex-1 min-w-0 flex flex-col pr-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-gray-400">
            <span className="font-semibold tracking-wide uppercase">
              Filter
            </span>{" "}
            <span className="text-gray-500">{totalRules} Bedingungen</span>
          </div>
          <div className="flex items-center gap-4 border border-gray-200 rounded-lg bg-gray-50 px-3 py-1.5">
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
            <div className="w-px h-5 bg-gray-200" />
            {/* SORTIERUNG — toggles the sort panel below */}
            <button
              type="button"
              onClick={toggleSortPanel}
              aria-expanded={sortOpen}
              className="flex items-center gap-2 cursor-pointer group"
            >
              <SortAscendingOutlined className="text-gray-400 text-xs group-hover:text-blue-500" />
              <span className="text-xs font-semibold tracking-wide uppercase text-gray-500 group-hover:text-blue-500">
                Sortierung
              </span>
              {sorts.length > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-blue-600 text-white text-[11px] font-semibold">
                  {sorts.length}
                </span>
              )}
              <DownOutlined
                className={`text-gray-400 text-[10px] transition-transform group-hover:text-blue-500 ${
                  sortOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>
        </div>
        {sortOpen && (
          // Selectable like a group: click it, then sidebar fields add sorts.
          // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
          <div
            onClick={() => dispatch(selectSort(objectType))}
            className={`border rounded-xl bg-gray-50 mb-4 cursor-pointer transition-colors overflow-hidden ${
              sortSelected ? "border-blue-500" : "border-gray-200"
            }`}
          >
            {/* Panel header: title + add-rule button */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-gray-100/60">
              <div className="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase text-gray-500">
                <SortAscendingOutlined className="text-gray-400" />
                Sortierung
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddSort();
                }}
                disabled={allFieldsSorted}
                className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-200 rounded-md px-2.5 py-1 bg-white hover:border-blue-400 hover:text-blue-500 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:text-gray-600"
              >
                <PlusOutlined className="text-[10px]" />
                Regel
              </button>
            </div>
            {sorts.length > 0 ? (
              <div className="flex flex-col gap-2 p-4">
                {sorts.map((sort, index) => (
                  <SortRow
                    key={sort.id}
                    objectType={objectType}
                    sort={sort}
                    index={index}
                    fields={fields}
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
          </div>
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
