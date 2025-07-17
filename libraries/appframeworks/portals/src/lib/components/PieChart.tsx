import ReactChartkick, { PieChart as ReactPieChart } from "react-chartkick";
import { Chart } from "chart.js";

ReactChartkick.addAdapter(Chart);

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
      <ReactPieChart
        data={data}
        donut={true}
        title={title}
        legend={false}
        colors={colors}
      />
    </td>
  );
};
