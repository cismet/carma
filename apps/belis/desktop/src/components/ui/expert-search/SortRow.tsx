import { Select } from "antd";
import { useDispatch } from "react-redux";
import SortDirectionToggle from "./SortDirectionToggle";
import { DeleteIconButton } from "../advanced-dialog/Panel";
import type { Field, ObjectType } from "./fieldRegistry";
import {
  setSortField,
  setSortDirection,
  removeSort,
} from "../../../store/slices/expertSearch";
import type { ExpertSortState } from "./types";

interface SortRowProps {
  objectType: ObjectType;
  sort: ExpertSortState;
  index: number; // 0-based; shown as the 1-based order badge
  fields: Field[];
  usedFieldKeys: string[]; // fields already chosen in OTHER sort rows
}

// One sort condition: an order badge, the field to sort by, an ASC/DESC toggle
// and a delete button. Fields come from the same registry as the filter rules.
// A field already used by another sort row is disabled here, so the same column
// can never be sorted on twice.
const SortRow = ({
  objectType,
  sort,
  index,
  fields,
  usedFieldKeys,
}: SortRowProps) => {
  const dispatch = useDispatch();
  const usedElsewhere = new Set(usedFieldKeys);
  const fieldOptions = fields.map((f) => ({
    value: f.key,
    label: f.label,
    disabled: usedElsewhere.has(f.key),
  }));

  return (
    <div className="flex items-center gap-3">
      <span className="w-5 flex-shrink-0 text-center text-xs text-gray-400">
        {index + 1}
      </span>
      <Select
        className="flex-1 min-w-0"
        value={sort.field}
        onChange={(field) =>
          dispatch(setSortField({ objectType, sortId: sort.id, field }))
        }
        options={fieldOptions}
        showSearch
        optionFilterProp="label"
      />
      <SortDirectionToggle
        value={sort.direction}
        onChange={(direction) =>
          dispatch(setSortDirection({ objectType, sortId: sort.id, direction }))
        }
      />
      <DeleteIconButton
        onClick={() => dispatch(removeSort({ objectType, sortId: sort.id }))}
        label="Sortierung entfernen"
      />
    </div>
  );
};

export default SortRow;
