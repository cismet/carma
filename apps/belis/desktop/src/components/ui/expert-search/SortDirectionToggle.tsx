import type { SortDirection } from "../../../store/slices/expertSearch";

interface SortDirectionToggleProps {
  value: SortDirection;
  onChange: (value: SortDirection) => void;
}

const OPTIONS: { value: SortDirection; label: string }[] = [
  { value: "asc", label: "ASC" },
  { value: "desc", label: "DESC" },
];

// ASC / DESC selector for a single sort row. Uses the same segmented look as the
// UND/ODER ConjunctionToggle: one bordered container, active option filled blue.
const SortDirectionToggle = ({ value, onChange }: SortDirectionToggleProps) => (
  <div className="flex items-center rounded-md border border-gray-200 overflow-hidden bg-white">
    {OPTIONS.map((op) => (
      <button
        key={op.value}
        type="button"
        onClick={() => onChange(op.value)}
        className={`text-xs font-semibold px-3 py-1 cursor-pointer transition-colors ${
          value === op.value
            ? "bg-blue-50 text-blue-600"
            : "bg-white text-gray-400 hover:text-gray-600"
        }`}
      >
        {op.label}
      </button>
    ))}
  </div>
);

export default SortDirectionToggle;
