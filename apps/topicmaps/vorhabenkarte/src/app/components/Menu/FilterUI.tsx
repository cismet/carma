import { useContext } from "react";
import { Form } from "react-bootstrap";

import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";

import "url-search-params-polyfill";
import VorhabenkartePieChart from "./VorhabenkartePieChart";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTag, faUser } from "@fortawesome/free-solid-svg-icons";
import Icon from "react-cismap/commons/Icon";
import { useVorhabenItems } from "../../../data/vorhabenItems";

const FilterUI = () => {
  const {
    filterState,
    itemsDictionary: { topics },
    setFilterState,
  } = useVorhabenItems();
  const { windowSize } = useContext<typeof ResponsiveTopicMapContext>(
    ResponsiveTopicMapContext
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

  const setTopicSelected = (name: string, selected: boolean) => {
    const current = new Set(filterState.topics);
    if (selected) {
      current.add(name);
    } else {
      current.delete(name);
    }
    setFilterState({ ...filterState, topics: Array.from(current) });
  };

  const clearTopics = () => {
    setFilterState({ ...filterState, topics: [] });
  };

  const selectAllTopics = () => {
    setFilterState({ ...filterState, topics: topics.map((t) => t.name) });
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
                  <a onClick={selectAllTopics}>alle</a>{" "}
                  <a onClick={clearTopics}>keine</a>
                </div>
                <div className="mb-3">
                  {topics.map((item, idx) => {
                    return (
                      <div key={"filter.vorhabenkarte.topic." + idx}>
                        <Form.Check
                          id={"filter.vorhabenkarte.topic." + idx}
                          onChange={(e) => {
                            setTopicSelected(item.name, e.target.checked);
                          }}
                          checked={filterState.topics.includes(item.name)}
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
                      </div>
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
                  onChange={(e) => {
                    setFilterState({
                      ...filterState,
                      citizen: e.target.checked,
                    });
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
