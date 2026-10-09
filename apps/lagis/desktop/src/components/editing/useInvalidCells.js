import { useSelector } from "react-redux";
import { getOriginalSection } from "../../store/slices/editing";
import { touchedRows } from "../../core/editing/validation";

// invalid(record, field) for the red cells; like the save check, only new or
// changed rows are marked
const useInvalidCells = (section, rows, rules) => {
  const original = useSelector(getOriginalSection(section));
  const invalidById = new Map(
    touchedRows(original?.[rules.rows], rows, rules.idOf).map((row) => [
      row.id,
      rules.invalidFields(row),
    ])
  );
  return (record, field) => Boolean(invalidById.get(record.id)?.has(field));
};

export default useInvalidCells;
