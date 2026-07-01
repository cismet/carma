export type Conjunction = "UND" | "ODER";

interface ConjunctionToggleProps {
  value: Conjunction;
  onChange: (value: Conjunction) => void;
}

const ConjunctionToggle = ({ value, onChange }: ConjunctionToggleProps) => (
  <div className="flex items-center rounded-md border border-gray-200 overflow-hidden bg-white">
    {(["UND", "ODER"] as const).map((op) => (
      <button
        key={op}
        type="button"
        onClick={() => onChange(op)}
        className={`text-xs font-semibold px-3 py-1 cursor-pointer transition-colors ${
          value === op
            ? "bg-blue-50 text-blue-600"
            : "bg-white text-gray-400 hover:text-gray-600"
        }`}
      >
        {op}
      </button>
    ))}
  </div>
);

export default ConjunctionToggle;
