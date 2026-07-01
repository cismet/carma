import { useState } from "react";
import { PlusOutlined } from "@ant-design/icons";

type Conjunction = "UND" | "ODER";

interface FilterGroupProps {
  title: string;
}

const FilterGroup = ({ title }: FilterGroupProps) => {
  const [conjunction, setConjunction] = useState<Conjunction>("UND");

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
          <span className="w-2 h-2 rounded-sm bg-gray-300 flex-shrink-0" />
          {title}
        </div>
        <div className="flex items-center rounded-md border border-gray-200 overflow-hidden">
          {(["UND", "ODER"] as const).map((op) => (
            <button
              key={op}
              type="button"
              onClick={() => setConjunction(op)}
              className={`text-xs font-semibold px-3 py-1 cursor-pointer transition-colors ${
                conjunction === op
                  ? "bg-blue-50 text-blue-600"
                  : "bg-white text-gray-400 hover:text-gray-600"
              }`}
            >
              {op}
            </button>
          ))}
        </div>
      </div>
      <div className="text-sm text-gray-400 mb-3">
        Noch keine Bedingung — Feld links anklicken oder unten hinzufügen.
      </div>
      <button
        type="button"
        aria-label="Bedingung hinzufügen"
        className="w-9 h-9 flex items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white text-gray-400 hover:border-blue-400 hover:text-blue-500 cursor-pointer transition-colors"
      >
        <PlusOutlined />
      </button>
    </div>
  );
};

export default FilterGroup;
