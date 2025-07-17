import { Doughnut } from "react-chartjs-2";
import "chart.js/auto";

type ChartDataItem = [string, number];

interface PieChartProps {
  data: ChartDataItem[];
  colors: (string | undefined)[];
  title?: string;
}

export const PieChart = ({
  data,
  colors,
  title = "Verteilung",
}: PieChartProps) => {
  const labels = data.map((data) => {
    return data[0];
  });

  const tmpData = data.map((data) => {
    return data[1];
  });

  const pieChartData = {
    labels: labels,
    datasets: [
      {
        data: tmpData,
        backgroundColor: colors,
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
          data={pieChartData}
          options={{
            plugins: {
              legend: {
                display: false,
              },
              title: {
                display: true,
                text: title,
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
};
