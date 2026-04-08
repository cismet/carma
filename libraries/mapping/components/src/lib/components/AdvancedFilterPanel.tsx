import { useCallback } from "react";
import { Button } from "react-bootstrap";
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
  categoryFootnotes?: Record<string, string>;
}

export const AdvancedFilterPanel = ({
  categories,
  filterState,
  onFilterStateChange,
  width = 500,
  pieChartData,
  pieChartColors,
  categoryFootnotes,
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
    <div style={{ display: "flex", flexDirection: "column" }}>
      {categories.map((cat) => (
        <TriStateFilterButton
          key={cat.key}
          label={cat.label}
          state={getTriState(cat.key)}
          onChange={(newState) => handleToggle(cat.key, newState)}
          footnote={categoryFootnotes?.[cat.key]}
        />
      ))}
    </div>
  );

  const hasPieChartProps =
    pieChartData !== undefined && pieChartColors !== undefined;

  const isWide = width >= 600;

  return (
    <div>
      <div style={{ textAlign: "center" }}>
        <Button
          variant="light"
          style={{ margin: 4, marginLeft: 0 }}
          onClick={handleSelectAll}
        >
          alle Themen ausw&auml;hlen
        </Button>
        <Button
          variant="light"
          style={{ margin: 4 }}
          onClick={handleClearPositiv}
        >
          keine Themen ausw&auml;hlen
        </Button>
        <Button
          variant="light"
          style={{ margin: 4 }}
          onClick={handleClearNegativ}
        >
          keine Themen ausschlie&szlig;en
        </Button>
      </div>
      <br />

      {isWide && hasPieChartProps ? (
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "row",
            flexWrap: "nowrap",
          }}
        >
          <div style={{ flexGrow: 0, flexShrink: 1 }}>{filterRows}</div>
          <div
            style={{
              flexGrow: 1,
              flexShrink: 1,
              alignContent: "center",
            }}
          >
            <PieChart data={pieChartData!} colors={pieChartColors!} />
          </div>
        </div>
      ) : (
        <>
          {filterRows}
          {hasPieChartProps && (
            <div style={{ marginTop: "8px" }}>
              <PieChart data={pieChartData!} colors={pieChartColors!} />
            </div>
          )}
        </>
      )}
    </div>
  );
};
