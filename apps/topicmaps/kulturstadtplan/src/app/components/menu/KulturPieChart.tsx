import { useContext } from "react";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import {
  classifyMainlocationTypeName,
  getColorForProperties,
  getColorFromMainlocationTypeName,
  textConversion,
} from "../../../helper/styler";
import ReactChartkick, { PieChart } from "react-chartkick";
import { Chart } from "chart.js";

ReactChartkick.addAdapter(Chart);

const KulturPieChart = ({ visible = true }) => {
  const { filteredItems } = useContext<typeof FeatureCollectionContext>(
    FeatureCollectionContext
  );

  if (visible && filteredItems) {
    let stats = {};
    let piechartData: any = [];
    let piechartColor: any = [];

    for (let poi of filteredItems) {
      const mltn = classifyMainlocationTypeName(poi.mainlocationtype.name);
      const mltnGUI = textConversion(mltn);

      if (stats[mltnGUI] === undefined) {
        stats[mltnGUI] = 1;
      } else {
        stats[mltnGUI] = stats[mltnGUI] + 1;
      }
    }

    for (let key in stats) {
      piechartData.push([key, stats[key]]);
      piechartColor.push(getColorFromMainlocationTypeName(key));
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

export default KulturPieChart;
