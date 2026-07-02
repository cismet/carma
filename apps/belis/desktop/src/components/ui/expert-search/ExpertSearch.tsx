import { Fragment, useState } from "react";
import { Input } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useDispatch, useSelector } from "react-redux";
import FilterGroup from "./FilterGroup";
import GroupConjunction from "./GroupConjunction";
import FilterEmptyState from "./FilterEmptyState";
import { TYPE_META, REGISTRY } from "./fieldRegistry";
import type { ObjectType } from "./fieldRegistry";
import {
  addGroup,
  addRule,
  removeGroup,
  getExpertTypeState,
} from "../../../store/slices/expertSearch";

interface ExpertSearchProps {
  objectType: ObjectType;
}

const ExpertSearch = ({ objectType }: ExpertSearchProps) => {
  const dispatch = useDispatch();
  const fields = REGISTRY[objectType];
  const { groups } = useSelector(getExpertTypeState(objectType));
  const [fieldFilter, setFieldFilter] = useState("");

  // Clicking a field in the sidebar adds a rule (prefilled) to the last group
  const handleFieldClick = (fieldKey: string) => {
    const lastGroup = groups[groups.length - 1];
    if (!lastGroup) return;
    dispatch(addRule({ objectType, groupId: lastGroup.id, field: fieldKey }));
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
          <button
            type="button"
            onClick={() => dispatch(addGroup(objectType))}
            className="text-sm text-gray-700 border border-gray-200 rounded-lg px-5 py-1.5 bg-white hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-colors"
          >
            + Gruppe
          </button>
        </div>
        <div className="flex-1 overflow-y-auto flex flex-col border border-dashed border-gray-200 rounded-xl bg-gray-50 p-3 text-gray-500 mt-2 mb-5">
          {totalRules === 0 && groups.length === 1 && (
            <div className="flex-1 flex items-center justify-center">
              <FilterEmptyState />
            </div>
          )}
          <div className="flex flex-col gap-4">
            {groups.map((group, index) => (
              <Fragment key={group.id}>
                {index > 0 && <GroupConjunction objectType={objectType} />}
                <FilterGroup
                  objectType={objectType}
                  group={group}
                  title={`Gruppe ${index + 1}`}
                  fields={fields}
                  onDelete={
                    groups.length > 1
                      ? () => dispatch(removeGroup({ objectType, groupId: group.id }))
                      : undefined
                  }
                />
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExpertSearch;
