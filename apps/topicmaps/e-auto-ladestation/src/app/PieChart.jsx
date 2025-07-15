import { useContext } from "react";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import { getColorForProperties } from "./helper/styler";
import ReactChartkick, { PieChart } from "react-chartkick";
import { Chart } from "chart.js";

ReactChartkick.addAdapter(Chart);
const ChartComp = ({ visible = true }) => {
  const { filteredItems } = useContext(FeatureCollectionContext);

  const groupingFunction = (obj) => {
    if (obj.online === true) {
      return "online";
    } else {
      return "offline";
    }
  };

  if (visible && filteredItems) {
    let stats = {};
    let colormodel = {};
    let piechartData = [];
    let piechartColor = [];
    stats["P+R"] = 0;
    stats["B+R"] = 0;
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

    return (
      <td
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignContent: "center",
          justifyContent: "center",
        }}
      >
        <PieChart
          data={piechartData}
          donut={true}
          title="Verteilung"
          legend={false}
          colors={piechartColor}
        />
      </td>
    );
  } else {
    return null;
  }
};

export default ChartComp;
