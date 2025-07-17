import { useContext } from "react";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import {
  getColorForFilter,
  getColorForProperties,
} from "../../../helper/styler";
import { PieChart } from "@carma-apps/portals";

const VorhabenkartePieChart = ({ visible = true }) => {
  const { filteredItems } = useContext<typeof FeatureCollectionContext>(
    FeatureCollectionContext
  );

  if (visible && filteredItems) {
    let stats = {};
    let colormodel = {};
    let piechartData: any = [];
    let piechartColor: any = [];

    for (let obj of filteredItems) {
      const topicName = obj.thema.name;
      // if (obj.stek) {
      //   obj.stek.forEach((group) => {
      //     if (stats[group] === undefined) {
      //       stats[group] = 1;
      //       colormodel[group] = getColorForFilter(group);
      //     } else {
      //       stats[group] += 1;
      //     }
      //   });
      // }
      if (stats[topicName] === undefined) {
        stats[topicName] = 1;
        colormodel[topicName] = getColorForFilter(topicName);
      } else {
        stats[topicName] += 1;
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

export default VorhabenkartePieChart;
