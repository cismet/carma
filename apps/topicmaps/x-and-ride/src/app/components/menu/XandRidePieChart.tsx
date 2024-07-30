import { useContext } from 'react';
import { FeatureCollectionContext } from 'react-cismap/contexts/FeatureCollectionContextProvider';
import { Doughnut } from 'react-chartjs-2';
import 'chart.js/auto';
import { getColorForProperties } from '../../../helper/styler';

const XandRidePieChart = ({ visible = true }) => {
  const { filteredItems } = useContext<FeatureCollectionContext>(FeatureCollectionContext);

  const groupingFunction = (obj) => {
    if (obj.schluessel === 'P') {
      return 'P+R';
    } else {
      return 'B+R';
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

export default XandRidePieChart;
