import { useContext } from "react";
import Icon from "react-cismap/commons/Icon";
import Color from "color";
import { Form, Button, Badge, Tabs, Tab } from "react-bootstrap";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import FilterPieChart from "./FilterPieChart";
import md5 from "md5";

export const FilterPanel = ({ filterConfiguration }) => {
  const { windowSize } = useContext(ResponsiveTopicMapContext);
  const { setFilterState, setFilterMode } = useContext(
    FeatureCollectionDispatchContext
  );
  const {
    filterState,
    filterMode,
    filteredItems,
    classKeyFunction,
    getColorFromProperties,
  } = useContext(FeatureCollectionContext);

  const width = windowSize.width;
  const getColor =
    getColorFromProperties ||
    ((props) => {
      return props.color || "red";
    });
  const pieChart = (
    <FilterPieChart
      filteredItems={filteredItems}
      itemGetClassKey={classKeyFunction || ((item) => item.classKey)}
      getColor={getColor}
    ></FilterPieChart>
  );
  let widePieChartPlaceholder = null;
  let narrowPieChartPlaceholder = null;

  const resetFilter = () => {
    if (filterConfiguration?.resetedFilter) {
      setFilterState(filterConfiguration?.resetedFilter);
    }
  };
  if (width < 995) {
    narrowPieChartPlaceholder = (
      <div>
        <br />
        {pieChart}
      </div>
    );
  } else {
    widePieChartPlaceholder = <td>{pieChart}</td>;
  }

  //   let injectQueryParameter =
  //     "&inject=" + window.btoa(JSON.stringify([{ action: "setFilterAndApply", payload: filter }]));
  //   if (new URLSearchParams(window.location.href).get("getinjectorstring")) {
  //     console.log(injectQueryParameter);
  //   }
  const removeFilterFor = (filterKey, itemkey) => {
    const newFilterState = { ...filterState };
    newFilterState[filterKey] = filterState[filterKey].filter(
      (itemIn) => itemIn !== itemkey
    );
    setFilterState(newFilterState);
  };
  const addFilterFor = (filterKey, itemkey) => {
    const newFilterState = JSON.parse(JSON.stringify(filterState));
    newFilterState[filterKey].push(itemkey);
    setFilterState(newFilterState);
  };

  const removeFilterForKeys = (filterKey, itemkeys) => {
    const newFilterState = { ...filterState };
    for (const itemkey of itemkeys) {
      newFilterState[filterKey] = newFilterState[filterKey].filter(
        (itemIn) => itemIn !== itemkey
      );
    }
    setFilterState(newFilterState);
  };
  const addFilterForKeys = (filterKey, itemkeys) => {
    const newFilterState = JSON.parse(JSON.stringify(filterState));
    for (const itemkey of itemkeys) {
      if (!newFilterState[filterKey].includes(itemkey)) {
        newFilterState[filterKey].push(itemkey);
      }
    }
    setFilterState(newFilterState);
  };
  const isChecked = (filterConf, item, filterState) => {
    if (item.key !== undefined) {
      return (
        filterState !== undefined &&
        filterState[filterConf.key].includes(item.key)
      );
    } else if (item.keys !== undefined) {
      for (const key of item.keys) {
        if (!filterState[filterConf.key].includes(key)) {
          return false;
        }
      }
      return true;
    } else {
      return false;
    }
  };

  const getFilterElements = (filterConf) => {
    switch (filterConf.type) {
      case "tags":
        return (
          <div style={{ margin: 10 }}>
            {filterConf.values.map((item, index) => {
              let style;

              const isSelected = () => {
                return isChecked(filterConf, item, filterState);
              };

              let backgroundColorSelected,
                backgroundColorUnselected,
                backgroundColor,
                foregroundColor;
              if (item.color !== undefined) {
                backgroundColorSelected = item.color;
              } else {
                backgroundColorSelected = "#2664D8";
              }
              if (item.colorUnselected !== undefined) {
                backgroundColorUnselected = item.colorUnselected;
              } else {
                backgroundColorUnselected = "#eeeeee";
              }

              if (isSelected()) {
                backgroundColor = backgroundColorSelected;
              } else {
                backgroundColor = backgroundColorUnselected;
              }
              if (new Color(backgroundColor).isDark()) {
                foregroundColor = "white";
              } else {
                foregroundColor = "black";
              }

              style = { color: foregroundColor, backgroundColor };

              return (
                <span
                  key={"badgespan." + (item.title || item.key)}
                  style={{ cursor: "pointer" }}
                >
                  <Badge
                    onClick={() => {
                      if (isSelected()) {
                        if (item.key) {
                          removeFilterFor(filterConf.key, item.key);
                        } else if (item.keys) {
                          removeFilterForKeys(filterConf.key, item.keys);
                        }
                      } else {
                        if (item.key) {
                          addFilterFor(filterConf.key, item.key);
                        } else if (item.keys) {
                          addFilterForKeys(filterConf.key, item.keys);
                        }
                      }
                    }}
                    style={style}
                  >
                    {item.title || item.key}
                  </Badge>{" "}
                </span>
              );
            })}
          </div>
        );

      case "radioButtons":
        break;
      case "checkBoxes":
      default:
        return (
          <div style={{ margin: 10 }}>
            {filterConf.values.map((item, index) => {
              let iconPos = "post";
              iconPos = item.iconPos;
              return (
                <div
                  key={"div.chk." + filterConf.title + "." + index}
                  style={{ margin: 2 }}
                >
                  <Form.Group
                    controlId={"div.chk." + filterConf.title + "." + index}
                    style={{ marginLeft: item.indent || 0 }}
                  >
                    <Form.Check
                      type="checkbox"
                      readOnly={true}
                      key={"filter." + filterConf.key + index}
                      onClick={(e) => {
                        if (e.target.checked === false) {
                          if (item.key) {
                            removeFilterFor(filterConf.key, item.key);
                          } else if (item.keys) {
                            removeFilterForKeys(filterConf.key, item.keys);
                          }
                        } else {
                          if (item.key) {
                            addFilterFor(filterConf.key, item.key);
                          } else if (item.keys) {
                            addFilterForKeys(filterConf.key, item.keys);
                          }
                        }
                      }}
                      checked={isChecked(filterConf, item, filterState)}
                      inline
                      label={
                        <span>
                          {item.color !== undefined && iconPos === "pre" && (
                            <Icon
                              style={{
                                color: item.color,
                                width: "30px",
                                textAlign: "center",
                              }}
                              name={item.icon || "circle"}
                            />
                          )}
                          {item.title || item.key}
                          {item.color !== undefined && iconPos === "post" && (
                            <Icon
                              style={{
                                color: item.color,
                                width: "30px",
                                textAlign: "center",
                              }}
                              name={item.icon || "circle"}
                            />
                          )}
                        </span>
                      }
                    ></Form.Check>
                  </Form.Group>
                </div>
              );
            })}
          </div>
        );
        break;
    }
  };

  return (
    <div
      key={
        "refresh.on." +
        filterMode +
        ".and." +
        md5(JSON.stringify(filterState || {}))
      }
    >
      <table border={0} style={{ valign: "top" }} width="100%">
        <tbody>
          <tr style={{ verticalAlign: "top" }}>
            {filterConfiguration.mode === "tabs" && (
              <td style={{ width: "330px" }}>
                <div style={{ width: "100%" }}>
                  <div>
                    <h4> Filtern nach</h4>
                    <Tabs
                      style={{ width: "100%" }}
                      id="controlled-tab-example"
                      defaultActiveKey={filterMode}
                      onSelect={(key) => {
                        setFilterMode(key);
                      }}
                    >
                      {filterConfiguration.filters.map((filterConf, indexy) => {
                        return (
                          <Tab
                            key={"Tabfor." + filterConf.key}
                            eventKey={filterConf.key}
                            title={filterConf.title}
                            style={{ paddingTop: 10 }}
                          >
                            <table
                              border={0}
                              style={{ width: "100%", margin: 5 }}
                            >
                              <tbody>
                                <tr>
                                  <td align="center">
                                    <a
                                      className="showLinkColor"
                                      style={{
                                        margin: 4,
                                      }}
                                      onClick={() => {
                                        filterConf.setAll();
                                      }}
                                    >
                                      alle
                                    </a>
                                  </td>
                                  <td align="center">
                                    <a
                                      className="showLinkColor"
                                      style={{
                                        margin: 4,
                                      }}
                                      onClick={() => {
                                        filterConf.setNone();
                                      }}
                                    >
                                      keine
                                    </a>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                            {getFilterElements(filterConf)}
                          </Tab>
                        );
                      })}
                    </Tabs>
                  </div>
                </div>
              </td>
            )}
            {filterConfiguration.mode === "list" && (
              <td valign="center" style={{ width: "330px" }}>
                {filterConfiguration.filters.map((filterConf, index) => {
                  return (
                    <Form.Group>
                      <Form.Label>
                        {filterConf.title}
                        {"  "}
                        {filterConf.icon && (
                          <Icon
                            style={{
                              color: "grey",
                              width: "30px",
                              textAlign: "center",
                            }}
                            size="2x"
                            name={filterConf.icon}
                          />
                        )}
                      </Form.Label>
                      {getFilterElements(filterConf)}
                    </Form.Group>
                  );
                })}

                <br />
                <br />
                <p>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => resetFilter()}
                  >
                    Filter zurücksetzen
                  </Button>
                </p>
              </td>
            )}
            {widePieChartPlaceholder}
          </tr>
        </tbody>
      </table>
      {narrowPieChartPlaceholder}
    </div>
  );
};
