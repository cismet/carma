import { useContext } from "react";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import {
  getColorForFilter,
  getColorForProperties,
} from "../../../helper/styler";
import { Doughnut } from "react-chartjs-2";
import "chart.js/auto";

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
      if (obj.stek) {
        obj.stek.forEach((group) => {
          if (stats[group] === undefined) {
            stats[group] = 1;
            colormodel[group] = getColorForFilter(group);
          } else {
            stats[group] += 1;
          }
        });
      }
      // if (stats[group] === undefined) {
      //   stats[group] = 1;
      // } else {
      //   stats[group] += 1;
      // }
    }

    for (let key in stats) {
      piechartData.push([key, stats[key]]);
      piechartColor.push(colormodel[key]);
    }

    const labels = piechartData.map((data) => {
      return data[0];
    });

    const tmpData = piechartData.map((data) => {
      return data[1];
    });

    const data = {
      labels: labels,
      datasets: [
        {
          data: tmpData,
          backgroundColor: piechartColor,
        },
      ],
    };
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
        <div style={{ width: "40%" }}>
          <Doughnut
            data={data}
            options={{
              plugins: {
                legend: {
                  display: false,
                },
                title: {
                  display: true,
                  text: "Verteilung",
                  font: {
                    weight: "bold",
                    size: 20,
                  },
                  color: "black",
                },
              },
            }}
          />
        </div>
      </td>
    );
  } else {
    return null;
  }
};

export default VorhabenkartePieChart;
