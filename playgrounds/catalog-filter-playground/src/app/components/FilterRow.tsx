import { Button, Checkbox, Select } from "antd";
import { DeleteOutlined } from "@ant-design/icons";

import type { FilterDraft } from "../model";
import {
  FILTER_FIELD_OPTIONS,
  FIXED_VALUE_OPTIONS,
} from "../helper/filterFields";
import type {
  SelectOption,
  SelectOptionGroup,
} from "../hooks/useCatalogSuggestions";

const TAG_PLACEHOLDERS: Partial<Record<FilterDraft["field"], string>> = {
  id: "Items wählen oder Ids einfügen (Komma/Zeilenumbruch trennt)",
  category: "Kategorie-Ids wählen oder eintippen",
  keywords: "Schlüsselwörter wählen oder eintippen",
};

interface FilterRowProps {
  draft: FilterDraft;
  suggestions: {
    idOptions: SelectOptionGroup[];
    keywordOptions: SelectOption[];
    categoryOptions: SelectOptionGroup[];
  };
  onChange: (draft: FilterDraft) => void;
  onRemove: () => void;
}

const FilterRow = ({
  draft,
  suggestions,
  onChange,
  onRemove,
}: FilterRowProps) => {
  const meta = FILTER_FIELD_OPTIONS.find(
    (option) => option.value === draft.field
  );
  const fixedOptions = FIXED_VALUE_OPTIONS[draft.field];
  const tagOptions: Array<SelectOption | SelectOptionGroup> =
    draft.field === "id"
      ? suggestions.idOptions
      : draft.field === "category"
      ? suggestions.categoryOptions
      : suggestions.keywordOptions;

  return (
    <div className="border border-gray-200 rounded-lg p-3 flex flex-col gap-2 bg-gray-50">
      <div className="flex items-center gap-2">
        <Select
          className="flex-1"
          value={draft.field}
          options={FILTER_FIELD_OPTIONS}
          onChange={(field) => onChange({ ...draft, field, values: [] })}
        />
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={onRemove}
          aria-label="Filter entfernen"
        />
      </div>
      {fixedOptions ? (
        <Checkbox.Group
          options={fixedOptions}
          value={draft.values}
          onChange={(values) =>
            onChange({ ...draft, values: values as string[] })
          }
        />
      ) : (
        <Select
          mode="tags"
          className="w-full"
          placeholder={TAG_PLACEHOLDERS[draft.field]}
          value={draft.values}
          onChange={(values) => onChange({ ...draft, values })}
          options={tagOptions}
          tokenSeparators={[",", "\n"]}
          optionFilterProp="label"
          maxTagCount={8}
        />
      )}
      <p className="text-xs text-gray-400 mb-0">{meta?.hint}</p>
    </div>
  );
};

export default FilterRow;
