import { useContext } from "react";
import { Button, Form } from "react-bootstrap";

import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { constants as kitasConstants } from "./helper/constants";
import Icon from "react-cismap/commons/Icon";

import "url-search-params-polyfill";
import KitasTraegertypMapVisSymbol from "./helper/KitasTraegertypMapVisSymbol";
import KitasProfileMapVisSymbol from "./helper/KitasProfileMapVisSymbol";
import KitasPieChart from "./KitasPieChart";
import { traegertypMap } from "./helper/filter";
import { useSelector } from "react-redux";
import { getFeatureRenderingOption } from "./store/slices/ui";

const FilterUI = () => {
  const { filterState } = useContext(FeatureCollectionContext);
  const { setFilterState } = useContext(FeatureCollectionDispatchContext);
  const { windowSize } = useContext(ResponsiveTopicMapContext);

  const featureRenderingOption = useSelector(getFeatureRenderingOption);

  const width = windowSize?.width || 500;

  let widePieChartPlaceholder = null;
  let narrowPieChartPlaceholder = null;

  let pieChart = <KitasPieChart />;

  if (width < 995) {
    narrowPieChartPlaceholder = (
      <div>
        <br /> {pieChart}
      </div>
    );
  } else {
    widePieChartPlaceholder = pieChart;
  }

  return (
    <div>
      <table border={0} width="100%">
        <tbody>
          <tr>
            <td valign="center" style={{ width: "330px" }}>
              <Form>
                <label
                  style={{
                    display: "inline-block",
                    maxWidth: "100%",
                    marginBottom: "5px",
                    fontWeight: 700,
                  }}
                >
                  Trägertyp
                  {"  "}
                  <Icon
                    style={{
                      color: "grey",
                      width: "30px",
                      textAlign: "center",
                    }}
                    size="2x"
                    name={"home"}
                  />
                </label>
                {traegertypMap.map((item) => {
                  return (
                    <div key={"filter.kita.traeger.div." + item.c}>
                      <Form.Check
                        readOnly={true}
                        key={"filter.kita.traeger." + item.c}
                        onClick={(e) => {
                          const newFilterState = { ...filterState };
                          if (e.target.checked) {
                            newFilterState[item.text] = true;
                          } else {
                            newFilterState[item.text] = false;
                          }

                          setFilterState(newFilterState);
                        }}
                        checked={filterState[item.text]}
                        id={"filter.kita.traeger.div." + item.c}
                        label={
                          <>
                            {item.text}{" "}
                            <KitasTraegertypMapVisSymbol
                              visible={
                                featureRenderingOption ===
                                kitasConstants.FEATURE_RENDERING_BY_TRAEGERTYP
                              }
                              traegertyp={kitasConstants.TRAEGERTYP.indexOf(
                                item.c,
                              )}
                            />
                          </>
                        }
                      />
                    </div>
                  );
                })}
              </Form>
              <br />
              <Form>
                <label
                  style={{
                    display: "inline-block",
                    maxWidth: "100%",
                    marginBottom: "5px",
                    fontWeight: 700,
                  }}
                >
                  Profil
                  {"  "}
                  <Icon
                    style={{
                      color: "grey",
                      width: "30px",
                      textAlign: "center",
                    }}
                    size="2x"
                    name={"child"}
                  />
                </label>
                <br />
                <Form.Check
                  readOnly={true}
                  key={"filter.kita.inklusion.checkbox"}
                  onClick={(e) => {
                    const newFilterState = { ...filterState };
                    if (e.target.checked) {
                      newFilterState.inklusion = true;
                    } else {
                      newFilterState.inklusion = false;
                    }

                    setFilterState(newFilterState);
                  }}
                  checked={filterState.inklusion}
                  inline
                  label="Schwerpunkt Inklusion"
                  id="filter.kita.inklusion.checkbox"
                />

                {"  "}
                <KitasProfileMapVisSymbol
                  inklusion={true}
                  visible={
                    featureRenderingOption ===
                    kitasConstants.FEATURE_RENDERING_BY_PROFIL
                  }
                />
                <br />
                <Form.Check
                  readOnly={true}
                  key={"filter.kita.normal.checkbox"}
                  onClick={(e) => {
                    const newFilterState = { ...filterState };
                    if (e.target.checked) {
                      newFilterState.normal = true;
                    } else {
                      newFilterState.normal = false;
                    }

                    setFilterState(newFilterState);
                  }}
                  checked={filterState.normal}
                  inline
                  label="ohne Schwerpunkt Inklusion"
                  id="filter.kita.normal.checkbox"
                />
                {"  "}
                <KitasProfileMapVisSymbol
                  inklusion={false}
                  visible={
                    featureRenderingOption ===
                    kitasConstants.FEATURE_RENDERING_BY_PROFIL
                  }
                />
              </Form>
              <Form>
                <br />
                <label
                  style={{
                    display: "inline-block",
                    maxWidth: "100%",
                    marginBottom: "5px",
                    fontWeight: 700,
                  }}
                >
                  Kindesalter{" "}
                  <Icon
                    style={{
                      color: "grey",
                      width: "30px",
                      textAlign: "center",
                    }}
                    size="2x"
                    name={"user"}
                  />
                </label>
                <br />
                <Form.Check
                  type="radio"
                  readOnly={true}
                  key={"filter.kita.alter.unter2"}
                  onClick={(e) => {
                    const newFilterState = { ...filterState };
                    if (e.target.checked) {
                      newFilterState.alter = "unter2";
                    }

                    setFilterState(newFilterState);
                  }}
                  checked={filterState.alter === "unter2" || !filterState.alter}
                  inline
                  label="unter 2 Jahre"
                  id="filter.kita.alter.unter2"
                />

                <br />
                <Form.Check
                  type="radio"
                  readOnly={true}
                  key={"filter.kita.alter.ab2"}
                  onClick={(e) => {
                    const newFilterState = { ...filterState };
                    if (e.target.checked) {
                      newFilterState.alter = "ab2";
                    }

                    setFilterState(newFilterState);
                  }}
                  checked={filterState.alter === "ab2"}
                  inline
                  label="2 bis 3 Jahre"
                  id="filter.kita.alter.ab2"
                />
                <br />
                <Form.Check
                  type="radio"
                  readOnly={true}
                  key={"filter.kita.alter.ab3"}
                  onClick={(e) => {
                    const newFilterState = { ...filterState };
                    if (e.target.checked) {
                      newFilterState.alter = "ab3";
                    }

                    setFilterState(newFilterState);
                  }}
                  checked={filterState.alter === "ab3"}
                  inline
                  label="ab 3 Jahre"
                  id="filter.kita.alter.ab3"
                />
              </Form>

              <Form>
                <br />
                <label
                  style={{
                    display: "inline-block",
                    maxWidth: "100%",
                    marginBottom: "5px",
                    fontWeight: 700,
                  }}
                >
                  Betreuungsumfang{" "}
                  <Icon
                    style={{
                      color: "grey",
                      width: "40px",
                      textAlign: "center",
                    }}
                    size="2x"
                    name={"calendar"}
                  />
                </label>
                <br />
                <Form.Check
                  key="filter.kita.umfang.35h"
                  readOnly={true}
                  onClick={(e) => {
                    const newFilterState = { ...filterState };
                    if (e.target.checked) {
                      newFilterState.umfang_35 = true;
                    } else {
                      newFilterState.umfang_35 = false;
                    }

                    setFilterState(newFilterState);
                  }}
                  checked={filterState.umfang_35}
                  name="mapBackground"
                  inline
                  label="35 Stunden pro Woche"
                  id="filter.kita.umfang.35h"
                />

                <br />
                <Form.Check
                  key="filter.kita.umfang.45h"
                  readOnly={true}
                  onClick={(e) => {
                    const newFilterState = { ...filterState };
                    if (e.target.checked) {
                      newFilterState.umfang_45 = true;
                    } else {
                      newFilterState.umfang_45 = false;
                    }

                    setFilterState(newFilterState);
                  }}
                  name="mapBackground"
                  checked={filterState.umfang_45}
                  inline
                  label="45 Stunden pro Woche"
                  id="filter.kita.umfang.45h"
                />
              </Form>
              <br />
              <br />
              <p>
                <Button
                  bsSize="small"
                  onClick={() => {
                    const newFilterState = {};
                    traegertypMap.forEach((traeger) => {
                      newFilterState[traeger.text] = true;
                    });

                    setFilterState({
                      umfang_45: true,
                      umfang_35: true,
                      alter: "ab3",
                      normal: true,
                      inklusion: true,
                      ...newFilterState,
                    });
                  }}
                >
                  Filter zurücksetzen (Alle Kitas anzeigen)
                </Button>
              </p>
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
