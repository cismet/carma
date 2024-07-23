import { useContext } from 'react';
import { FeatureCollectionContext } from 'react-cismap/contexts/FeatureCollectionContextProvider';
import { getColorForProperties } from '../../../helper/styler';
import { Doughnut } from 'react-chartjs-2';
import 'chart.js/auto';

const EBikesPieChart = ({ visible = true }) => {
  const { filteredItems } = useContext(FeatureCollectionContext);

  const groupingFunction = (obj) => {
    let groupString = obj.typ;
    if (groupString === 'Ladestation') {
      if (obj.online === true) {
        groupString = groupString + ' (online)';
      } else {
        groupString = groupString + ' (offline)';
      }
    }
    return groupString;
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

export default EBikesPieChart;
