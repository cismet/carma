import { PieChart } from "@carma-appframeworks/portals";

import { useVorhabenItems } from "../../../data/vorhabenItems";

const VorhabenkartePieChart = ({ visible = true }) => {
  const { filteredItems } = useVorhabenItems();

  if (!visible) {
    return null;
  }

  const counts = new Map<string, { count: number; color: string }>();
  for (const { properties } of filteredItems) {
    const entry = counts.get(properties.thema_name);
    if (entry) {
      entry.count += 1;
    } else {
      counts.set(properties.thema_name, {
        count: 1,
        color: properties.thema_farbe || "#FF0000",
      });
    }
  }

  const data: [string, number][] = [];
  const colors: string[] = [];
  for (const [name, { count, color }] of counts) {
    data.push([name, count]);
    colors.push(color);
  }

  return <PieChart data={data} colors={colors} />;
};

export default VorhabenkartePieChart;
