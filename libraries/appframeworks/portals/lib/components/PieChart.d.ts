type ChartDataItem = [string, number];
interface PieChartProps {
  data: ChartDataItem[];
  colors: (string | undefined)[];
  title?: string;
}
export declare const PieChart: ({
  data,
  colors,
  title,
}: PieChartProps) => import("react/jsx-runtime").JSX.Element;
export {};
