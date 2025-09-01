import { useContext } from "react";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import { PieChart } from "@carma-appframeworks/portals";

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
      if (stats[topicName] === undefined) {
        stats[topicName] = 1;
        colormodel[topicName] = obj.thema?.farbe || "#FF0000";
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
