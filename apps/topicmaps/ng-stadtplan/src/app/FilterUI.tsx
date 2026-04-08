import { useMemo } from "react";
import { Badge } from "react-bootstrap";
import {
  AdvancedFilterPanel,
  type AdvancedFilterCategory,
  type AdvancedFilterState,
} from "@carma-mapping/components";
import { crossLinkApps } from "./helper/constants";

interface FilterUIProps {
  categories: AdvancedFilterCategory[];
  filterState: AdvancedFilterState;
  onFilterStateChange: (state: AdvancedFilterState) => void;
  width?: number;
  pieChartData?: [string, number][];
  pieChartColors?: string[];
}

const FilterUI = ({
  categories,
  filterState,
  onFilterStateChange,
  width = 900,
  pieChartData,
  pieChartColors,
}: FilterUIProps) => {
  const additionalAppArray = useMemo(() => {
    if (!filterState?.positiv) return [];
    const usedApps: string[] = [];
    const result: JSX.Element[] = [];

    for (const app of crossLinkApps) {
      for (const appLebenslage of app.on) {
        if (
          filterState.positiv.indexOf(appLebenslage) !== -1 &&
          usedApps.indexOf(app.name) === -1
        ) {
          usedApps.push(app.name);
          result.push(
            <a
              key={"appLink_" + app.name}
              style={{
                textDecoration: "none",
              }}
              href={app.link}
              target={app.target}
              rel="noopener noreferrer"
            >
              <Badge
                variant={app.bsStyle}
                style={{
                  backgroundColor: app.backgroundColor,
                  marginRight: "5px",
                  display: "inline-block",
                  color: "white",
                }}
              >
                {app.name}
              </Badge>
            </a>
          );
        }
      }
    }

    return result;
  }, [filterState?.positiv]);

  return (
    <div>
      <AdvancedFilterPanel
        categories={categories}
        filterState={filterState}
        onFilterStateChange={onFilterStateChange}
        width={width}
        pieChartData={pieChartData}
        pieChartColors={pieChartColors}
      />
      {additionalAppArray.length > 0 && (
        <div>
          <hr />
          <strong>* Themenspezifische Karten:</strong>
          {"  "}
          <h4
            style={{
              lineHeight: 1.7,
              fontSize: "1.5rem",
              wordWrap: "break-word",
              wordBreak: "normal",
              lineBreak: "strict",
              hyphens: "none",
              overflowWrap: "break-word",
              WebkitHyphens: "none",
              MozHyphens: "none",
            }}
          >
            {additionalAppArray}
          </h4>
        </div>
      )}
    </div>
  );
};

export default FilterUI;
