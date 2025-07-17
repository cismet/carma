import { useContext } from "react";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import { getColorForProperties } from "../../../helper/styler";
import { PieChart } from "@carma-apps/portals";

const XandRidePieChart = ({ visible = true }) => {
  const { filteredItems } = useContext<typeof FeatureCollectionContext>(
    FeatureCollectionContext
  );

  const groupingFunction = (obj) => {
    if (obj.schluessel === "P") {
      return "P+R";
    } else {
      return "B+R";
    }
  };

  if (visible && filteredItems) {
    let stats = {};
    let colormodel = {};
    let piechartData: any = [];
    let piechartColor: any = [];

    for (let obj of filteredItems) {
      let group = groupingFunction(obj);
      if (stats[group] === undefined) {
        stats[group] = 1;
        colormodel[group] = getColorForProperties(obj);
      } else {
        stats[group] += 1;
      }
    }

    for (let key in stats) {
      piechartData.push([key, stats[key]]);
      piechartColor.push(colormodel[key]);
    }

    return <PieChart data={piechartData} colors={piechartColor} />;
  } else {
    return null;
  }
};

export default XandRidePieChart;
