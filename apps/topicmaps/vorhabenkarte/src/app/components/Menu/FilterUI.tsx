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
  faChargingStation,
  faClock,
  faLeaf,
  faToggleOn,
} from "@fortawesome/free-solid-svg-icons";

const FilterUI = () => {
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

  return (
    <div>
      <table border={0} width="100%">
        <tbody>
          <tr>
            <td valign="middle" style={{ width: "330px" }}>
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
