import { Fragment, useCallback, useRef, useState } from "react";
import { Input } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import FilterGroup from "./FilterGroup";
import GroupConjunction from "./GroupConjunction";
import FilterEmptyState from "./FilterEmptyState";

interface ExpertField {
  key: string;
  label: string;
  color: string;
}

// Temporary hardcoded demo fields for the expert search sidebar
const DEMO_FIELDS: ExpertField[] = [
  { key: "bemerkung", label: "Bemerkung", color: "#9ca3af" },
  { key: "dokumente", label: "Dokumente", color: "#9ca3af" },
  { key: "erstellungsjahr", label: "Erstellungsjahr", color: "#3b82f6" },
  { key: "geometrie", label: "Geometrie", color: "#9ca3af" },
  { key: "material", label: "Material", color: "#3b82f6" },
  { key: "montage", label: "Montage", color: "#3b82f6" },
  { key: "pruefdatum", label: "Prüfdatum", color: "#3b82f6" },
];

const ExpertSearch = () => {
  const [fieldFilter, setFieldFilter] = useState("");
  const [groupIds, setGroupIds] = useState<number[]>([1]);
  const [ruleCounts, setRuleCounts] = useState<Record<number, number>>({});
  const nextGroupId = useRef(2);

  const addGroup = () => {
    setGroupIds((ids) => [...ids, nextGroupId.current++]);
  };

  const removeGroup = (id: number) => {
    setGroupIds((ids) => ids.filter((groupId) => groupId !== id));
    setRuleCounts((counts) => {
      const { [id]: _removed, ...rest } = counts;
      return rest;
    });
  };

  const handleRuleCountChange = useCallback((id: number, count: number) => {
    setRuleCounts((counts) =>
      counts[id] === count ? counts : { ...counts, [id]: count }
    );
  }, []);

  const totalRules = Object.values(ruleCounts).reduce((sum, n) => sum + n, 0);

  const filteredFields = DEMO_FIELDS.filter((field) =>
    field.label.toLowerCase().includes(fieldFilter.toLowerCase())
  );

  return (
    <div className="flex h-full gap-6">
      {/* Sidebar: fields */}
      <div className="w-64 flex-shrink-0 flex flex-col">
        <div className="text-xs font-semibold tracking-wide text-gray-400 uppercase mb-2">
          Felder
        </div>
        <Input
          allowClear
          value={fieldFilter}
          onChange={(e) => setFieldFilter(e.target.value)}
          prefix={<SearchOutlined className="text-gray-400" />}
          placeholder="Feld suchen…"
        />
        <div className="text-xs text-gray-400 mt-2 mb-2">
          Klick fügt zur letzten Gruppe hinzu
        </div>
        <div className="flex flex-col gap-2 overflow-y-auto pr-1">
          {filteredFields.map((field) => (
            <button
              key={field.key}
              type="button"
              className="flex items-center gap-2 w-full text-left text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2 bg-white hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-colors"
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: field.color }}
              />
              {field.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content: filter groups (empty state) */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-gray-400">
            <span className="font-semibold tracking-wide uppercase">
              Filter
            </span>{" "}
            <span className="text-gray-500">{totalRules} Bedingungen</span>
          </div>
          <button
            type="button"
            onClick={addGroup}
            className="text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 bg-white hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-colors"
          >
            + Gruppe
          </button>
        </div>
        <div className="flex-1 overflow-y-auto border border-dashed border-gray-200 rounded-xl bg-gray-50 p-6 text-gray-500">
          {totalRules === 0 && groupIds.length === 1 && <FilterEmptyState />}
          <div className="flex flex-col gap-4">
            {groupIds.map((id, index) => (
              <Fragment key={id}>
                {index > 0 && <GroupConjunction />}
                <FilterGroup
                  groupId={id}
                  title={`Gruppe ${index + 1}`}
                  onDelete={
                    groupIds.length > 1 ? () => removeGroup(id) : undefined
                  }
                  onRuleCountChange={handleRuleCountChange}
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
