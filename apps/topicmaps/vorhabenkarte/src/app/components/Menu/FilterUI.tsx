import React, { useContext } from "react";
import { Button, Form } from "react-bootstrap";

import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";

import "url-search-params-polyfill";
import EBikesPieChart from "./EBikesPieChart";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBicycle,
  faBullseye,
  faChargingStation,
  faClock,
  faLeaf,
  faToggleOn,
} from "@fortawesome/free-solid-svg-icons";
import { stek } from "../../../helper/filter";

const FilterUI = () => {
  const { filterState } = useContext<typeof FeatureCollectionContext>(
    FeatureCollectionContext
  );

  console.log("xxx filterState", filterState);
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

  let widePieChartPlaceholder: any = null;
  let narrowPieChartPlaceholder: any = null;

  let pieChart = <EBikesPieChart />;

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

  return (
    <div>
      <table border={0} width="100%">
        <tbody>
          <tr>
            <td valign="middle" style={{ width: "330px" }}>
              <Form>
                <label
                  style={{
                    display: "inline-block",
                    maxWidth: "100%",
                    marginBottom: "5px",
                    fontWeight: 700,
                  }}
                >
                  Fokusraum(e) STEK
                  {"  "}
                  <FontAwesomeIcon
                    icon={faBullseye}
                    size="2x"
                    style={{
                      color: "grey",
                      width: "30px",
                      textAlign: "center",
                    }}
                  />{" "}
                </label>
                <br />
                {stek.map((item, idx) => {
                  return (
                    <>
                      <Form.Check
                        readOnly={true}
                        key={"filter.vorhabenkarte.stek." + idx}
                        onClick={(e) => {
                          setFilterValue(
                            "stek",
                            item,
                            // @ts-expect-error legacy codebase exception
                            e.target.checked
                          );
                        }}
                        checked={filterState["stek"]?.indexOf(item) !== -1}
                        inline
                        label={item}
                      />
                      <br />
                    </>
                  );
                })}
              </Form>
              <br />
              <br />
              <p>
                <Button
                  onClick={() => {
                    setFilterState({
                      stationsart: ["Ladestation", "Verleihstation"],
                      nur_online: false,
                      immer_offen: false,
                      gruener_strom: false,
                      ladebox_zu: false,
                    });
                  }}
                >
                  Filter zurücksetzen (alle Anlagen anzeigen)
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
