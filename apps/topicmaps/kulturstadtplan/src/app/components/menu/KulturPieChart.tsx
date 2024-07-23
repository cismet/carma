import { useContext } from 'react';
import { FeatureCollectionContext } from 'react-cismap/contexts/FeatureCollectionContextProvider';
import {
  classifyMainlocationTypeName,
  getColorForProperties,
  getColorFromMainlocationTypeName,
  textConversion,
} from '../../../helper/styler';
import { Doughnut } from 'react-chartjs-2';
import 'chart.js/auto';

const KulturPieChart = ({ visible = true }) => {
  const { filteredItems } = useContext(FeatureCollectionContext);

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
          width: '100%',
          height: '100%',
          display: 'flex',
          alignContent: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: '40%' }}>
          <Doughnut
            data={data}
            options={{
              plugins: {
                legend: {
                  display: false,
                },
                title: {
                  display: true,
                  text: 'Verteilung',
                  font: {
                    weight: 'bold',
                    size: 20,
                  },
                  color: 'black',
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

export default KulturPieChart;
