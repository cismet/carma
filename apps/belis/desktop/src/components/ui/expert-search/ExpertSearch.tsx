import { Fragment, useState } from "react";
import { Input, AutoComplete } from "antd";
import { SearchOutlined, PlusOutlined } from "@ant-design/icons";
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
  const { groups, sorts, limit, selectedGroupId } = useSelector(
    getExpertTypeState(objectType)
  );
  const [fieldFilter, setFieldFilter] = useState("");

  // A new sort defaults to the first field not already sorted on (so it never
  // duplicates an existing row), ascending.
  const handleAddSort = () => {
    const used = new Set(sorts.map((s) => s.field));
    const nextField = fields.find((f) => !used.has(f.key))?.key;
    if (!nextField) return;
    dispatch(addSort({ objectType, field: nextField }));
  };

  // Every field is already used → no more sorts can be added without duplicating.
  const allFieldsSorted = sorts.length >= fields.length;

  // Clicking a field in the sidebar adds a rule (prefilled) to the currently
  // selected group, falling back to the last group if none is selected.
  const handleFieldClick = (fieldKey: string) => {
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
          Klick fügt zur letzten Gruppe hinzu
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
          <div className="flex items-center gap-4">
            {/* LIMIT */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wide uppercase text-gray-400">
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
            {/* SORTIERUNG */}
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold tracking-wide uppercase text-gray-400">
                Sortierung
              </span>
              <button
                type="button"
                onClick={handleAddSort}
                disabled={allFieldsSorted}
                aria-label="Sortierung hinzufügen"
                className="flex items-center justify-center text-gray-400 hover:text-blue-500 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-400"
              >
                <PlusOutlined />
              </button>
            </div>
          </div>
        </div>
        {sorts.length > 0 && (
          <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 mb-4">
            <div className="flex flex-col gap-2">
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
                  selected={groups.length > 1 && group.id === selectedGroupId}
                  onSelect={
                    groups.length > 1
                      ? () =>
                          dispatch(
                            selectGroup({ objectType, groupId: group.id })
                          )
                      : undefined
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
              aria-label="Gruppe hinzufügen"
              title="Gruppe hinzufügen"
              className="self-start w-9 h-9 flex items-center justify-center text-gray-700 border border-gray-200 rounded-lg bg-white hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-colors"
            >
              <PlusOutlined />
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
