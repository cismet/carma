import { PieChart } from "@carma-appframeworks/portals";

export const FilterPieChart = ({
  filteredItems,
  itemGetClassKey = () => "noclassavailable",
  getColor = (item) => "red",
  visible = true,
}) => {
  if (visible) {
    let stats = {};
    let colormodel = {};
    let piechartData = [];
    let piechartColor = [];
    if (filteredItems) {
      for (let item of filteredItems) {
        const itemClassKey = itemGetClassKey(item);

        if (stats[itemClassKey] === undefined) {
          stats[itemClassKey] = 1;
          colormodel[itemClassKey] = getColor(item);
        } else {
          stats[itemClassKey] += 1;
        }
      }

      for (let key in stats) {
        piechartData.push([key, stats[key]]);
        piechartColor.push(colormodel[key]);
      }
    }
    return <PieChart data={piechartData} colors={piechartColor} />;
  } else {
    return null;
  }
};

export default FilterPieChart;
