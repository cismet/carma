import { useCallback } from "react";
import { TriStateFilterButton, type TriState } from "./TriStateFilterButton";
import { PieChart } from "./PieChart";

export interface AdvancedFilterCategory {
  key: string;
  label: string;
}

export interface AdvancedFilterState {
  positiv: string[];
  negativ: string[];
}

export interface AdvancedFilterPanelProps {
  categories: AdvancedFilterCategory[];
  filterState: AdvancedFilterState;
  onFilterStateChange: (state: AdvancedFilterState) => void;
  width?: number;
  pieChartData?: [string, number][];
  pieChartColors?: string[];
}

export const AdvancedFilterPanel = ({
  categories,
  filterState,
  onFilterStateChange,
  width = 500,
  pieChartData,
  pieChartColors,
}: AdvancedFilterPanelProps) => {
  const getTriState = useCallback(
    (key: string): TriState => {
      if (filterState.positiv.includes(key)) return "positiv";
      if (filterState.negativ.includes(key)) return "negativ";
      return "neutral";
    },
    [filterState]
  );

  const handleToggle = useCallback(
    (key: string, newState: TriState) => {
      const updated = {
        positiv: filterState.positiv.filter((k) => k !== key),
        negativ: filterState.negativ.filter((k) => k !== key),
      };

      if (newState === "positiv") {
        updated.positiv = [...updated.positiv, key].sort();
      } else if (newState === "negativ") {
        updated.negativ = [...updated.negativ, key].sort();
      }

      onFilterStateChange(updated);
    },
    [filterState, onFilterStateChange]
  );

  const handleSelectAll = useCallback(() => {
    onFilterStateChange({
      positiv: categories.map((c) => c.key),
      negativ: [],
    });
  }, [categories, onFilterStateChange]);

  const handleClearPositiv = useCallback(() => {
    onFilterStateChange({ ...filterState, positiv: [] });
  }, [filterState, onFilterStateChange]);

  const handleClearNegativ = useCallback(() => {
    onFilterStateChange({ ...filterState, negativ: [] });
  }, [filterState, onFilterStateChange]);

  const filterRows = (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      {categories.map((cat) => (
        <TriStateFilterButton
          key={cat.key}
          label={cat.label}
          state={getTriState(cat.key)}
          onChange={(newState) => handleToggle(cat.key, newState)}
        />
      ))}
    </div>
  );

  const pieChart =
    pieChartData && pieChartData.length > 0 && pieChartColors ? (
      <PieChart data={pieChartData} colors={pieChartColors} />
    ) : null;

  const isWide = width >= 600;

  const btnStyle: React.CSSProperties = {
    padding: "3px 8px",
    border: "1px solid #ccc",
    borderRadius: "4px",
    background: "#f8f9fa",
    cursor: "pointer",
    fontSize: "11px",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ fontSize: "13px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "4px",
          flexWrap: "wrap",
          marginBottom: "8px",
        }}
      >
        <button onClick={handleSelectAll} style={btnStyle}>
          alle Themen ausw&auml;hlen
        </button>
        <button onClick={handleClearPositiv} style={btnStyle}>
          keine Themen ausw&auml;hlen
        </button>
        <button onClick={handleClearNegativ} style={btnStyle}>
          keine Themen ausschlie&szlig;en
        </button>
      </div>

      {isWide && pieChart ? (
        <div style={{ display: "flex", gap: "12px" }}>
          <div style={{ flex: "0 0 auto" }}>{filterRows}</div>
          <div
            style={{ flex: "1 1 auto", minWidth: 0, alignContent: "center" }}
          >
            {pieChart}
          </div>
        </div>
      ) : (
        <>
          {filterRows}
          {pieChart && <div style={{ marginTop: "8px" }}>{pieChart}</div>}
        </>
      )}
    </div>
  );
};
