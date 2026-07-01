import { useState } from "react";
import { Input } from "antd";
import { SearchOutlined, ControlOutlined } from "@ant-design/icons";
import FilterGroup from "./FilterGroup";

interface ExpertField {
  key: string;
  label: string;
  color: string;
}

interface FilterGroupItem {
  id: string;
  title: string;
}

// Temporary hardcoded demo groups for the filter content area
const DEMO_GROUPS: FilterGroupItem[] = [{ id: "1", title: "Gruppe 1" }];

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
            <span className="text-gray-500">0 Bedingungen</span>
          </div>
          <button
            type="button"
            className="text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 bg-white hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-colors"
          >
            + Gruppe
          </button>
        </div>
        <div className="flex-1 overflow-y-auto border border-dashed border-gray-200 rounded-xl bg-gray-50 p-6 text-gray-500">
          <div className="flex flex-col items-center justify-center text-center mb-6">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center mb-3 text-gray-400">
              <ControlOutlined className="text-lg" />
            </div>
            <p className="max-w-sm text-sm leading-relaxed">
              Klicke links auf ein <strong>Feld</strong>, um eine Bedingung zu
              erstellen. Mehrere Gruppen lassen sich mit <strong>UND</strong> /{" "}
              <strong>ODER</strong> verschachteln.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            {DEMO_GROUPS.map((group) => (
              <FilterGroup key={group.id} title={group.title} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExpertSearch;
