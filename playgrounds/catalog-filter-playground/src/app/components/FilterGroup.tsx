import { Button } from "antd";
import { CloseOutlined, PlusOutlined } from "@ant-design/icons";

import type { FilterDraft, FilterGroupDraft } from "../model";
import type {
  SelectOption,
  SelectOptionGroup,
} from "../hooks/useCatalogSuggestions";
import FilterRow from "./FilterRow";

interface FilterGroupProps {
  group: FilterGroupDraft;
  /** label shown in the group header, e.g. "Gruppe 2" */
  label: string;
  /** the last remaining group cannot be removed */
  removable: boolean;
  suggestions: {
    idOptions: SelectOptionGroup[];
    keywordOptions: SelectOption[];
    categoryOptions: SelectOptionGroup[];
  };
  onChange: (group: FilterGroupDraft) => void;
  onRemove: () => void;
}

const FilterGroup = ({
  group,
  label,
  removable,
  suggestions,
  onChange,
  onRemove,
}: FilterGroupProps) => {
  const handleAddFilter = () => {
    const nextKey =
      group.filters.reduce((max, draft) => Math.max(max, draft.key), -1) + 1;
    onChange({
      ...group,
      filters: [
        ...group.filters,
        { key: nextKey, field: "keywords", values: [] },
      ],
    });
  };

  const handleRowChange = (changed: FilterDraft) => {
    onChange({
      ...group,
      filters: group.filters.map((entry) =>
        entry.key === changed.key ? changed : entry
      ),
    });
  };

  return (
    <div className="border border-gray-300 rounded-lg p-2 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          {label}
        </span>
        {removable && (
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={onRemove}
            aria-label="Gruppe entfernen"
          />
        )}
      </div>
      {group.filters.map((draft) => (
        <FilterRow
          key={draft.key}
          draft={draft}
          suggestions={suggestions}
          onChange={handleRowChange}
          onRemove={() =>
            onChange({
              ...group,
              filters: group.filters.filter((entry) => entry.key !== draft.key),
            })
          }
        />
      ))}
      <Button size="small" icon={<PlusOutlined />} onClick={handleAddFilter}>
        Filter hinzufügen (UND)
      </Button>
    </div>
  );
};

export default FilterGroup;
