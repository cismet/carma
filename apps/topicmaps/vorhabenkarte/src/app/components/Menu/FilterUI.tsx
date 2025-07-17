import { useContext } from "react";
import { Form } from "react-bootstrap";

import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";

import "url-search-params-polyfill";
import VorhabenkartePieChart from "./VorhabenkartePieChart";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTag, faUser } from "@fortawesome/free-solid-svg-icons";
import Icon from "react-cismap/commons/Icon";
import { Topic } from "../../App";

interface FilterUIProps {
  topicsWitColors: Topic[];
}
const FilterUI = ({ topicsWitColors }: FilterUIProps) => {
  const { filterState } = useContext<typeof FeatureCollectionContext>(
    FeatureCollectionContext
  );

  const { setFilterState } = useContext<
    typeof FeatureCollectionDispatchContext
  >(FeatureCollectionDispatchContext);
  const { windowSize } = useContext<typeof ResponsiveTopicMapContext>(
    ResponsiveTopicMapContext
  );
  const { additionalStylingInfo } = useContext<typeof TopicMapStylingContext>(
    TopicMapStylingContext
  );

  const width = windowSize?.width || 500;
  const isShowHint = filterState.topics.length === 0;

  let widePieChartPlaceholder: any = null;
  let narrowPieChartPlaceholder: any = null;

  let pieChart = <VorhabenkartePieChart />;

  if (width < 995) {
    narrowPieChartPlaceholder = (
      <div>
        <br /> {pieChart}
      </div>
    );
  } else {
    widePieChartPlaceholder = pieChart;
  }

  const setFilterValue = (kind, item, value) => {
    const newFilterState = JSON.parse(JSON.stringify(filterState));

    if (value) {
      if (newFilterState[kind].indexOf(item) === -1) {
        newFilterState[kind].push(item);
      }
    } else {
      if (newFilterState[kind].indexOf(item) !== -1) {
        let filterStateSet = new Set(newFilterState[kind]);
        filterStateSet.delete(item);
        newFilterState[kind] = Array.from(filterStateSet);
      }
    }
    setFilterState(newFilterState);
  };

  const clearFilter = (kind) => {
    const newFilterState = { ...filterState };
    newFilterState[kind] = [];
    setFilterState(newFilterState);
  };

  const setAllFilter = (kind) => {
    const newFilterState = { ...filterState };
    newFilterState["topics"] = topicsWitColors.map((t) => t.name);
    setFilterState(newFilterState);
  };

  return (
    <div>
      <table border={0} width="100%">
        <tbody>
          <tr>
            <td style={{ width: "330px", verticalAlign: "top" }}>
              <h4 className="mb-6">Filtern nach</h4>
              <Form>
                <label
                  style={{
                    display: "inline-block",
                    maxWidth: "100%",
                    marginBottom: "5px",
                    fontWeight: 700,
                  }}
                >
                  Thema des Vorhabens
                  {"  "}
                  <FontAwesomeIcon
                    icon={faTag}
                    size="2x"
                    style={{
                      color: "grey",
                      width: "30px",
                      textAlign: "center",
                    }}
                  />{" "}
                </label>
                <div className="flex gap-5 mb-2 mt-1 text-[#0175ff]">
                  <a onClick={() => setAllFilter("topics")}>alle</a>{" "}
                  <a onClick={() => clearFilter("topics")}>keine</a>
                </div>
                <div className="mb-3">
                  {topicsWitColors.map((item, idx) => {
                    return (
                      <>
                        <Form.Check
                          readOnly={true}
                          key={"filter.vorhabenkarte.topic." + idx}
                          onClick={(e) => {
                            setFilterValue(
                              "topics",
                              item.name,
                              // @ts-expect-error legacy codebase exception
                              e.target.checked
                            );
                          }}
                          checked={
                            filterState["topics"]?.indexOf(item.name) !== -1
                          }
                          inline
                          label={
                            <>
                              {item.name}
                              <Icon
                                style={{
                                  color: item.farbe,
                                  width: "30px",
                                  textAlign: "center",
                                }}
                                name={"circle"}
                              />
                            </>
                          }
                        />

                        <br />
                      </>
                    );
                  })}
                  {isShowHint && (
                    <div className="mt-2 text-gray-600">
                      Wenn kein Thema selektiert ist, dann wird auch nichts
                      angezeigt
                    </div>
                  )}
                </div>
                <label
                  style={{
                    display: "inline-block",
                    maxWidth: "100%",
                    marginBottom: "5px",
                    fontWeight: 700,
                  }}
                >
                  Bürgerbeteiligung
                  {"  "}
                  <FontAwesomeIcon
                    icon={faUser}
                    size="2x"
                    style={{
                      color: "grey",
                      width: "30px",
                      textAlign: "center",
                    }}
                  />{" "}
                </label>
                <Form.Check
                  type="switch"
                  onClick={(e) => {
                    const newFilterState = { ...filterState };
                    // @ts-expect-error legacy codebase exception
                    newFilterState.citizen = e.target.checked;
                    setFilterState(newFilterState);
                  }}
                  id="custom-switch"
                  label="nur Vorhaben mit Bürgerbeteiligung"
                  checked={filterState.citizen}
                />
              </Form>
              <br />
              <br />
            </td>
            {widePieChartPlaceholder}
          </tr>
        </tbody>
      </table>
      {narrowPieChartPlaceholder}
    </div>
  );
};
export default FilterUI;
