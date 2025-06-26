export const stek = [
  "Wuppertals innovatives Technologieband",
  "Wuppertals lebendige Zentrenvielfalt",
  "Wuppertals neue grüne Stadtlandschaft",
  "Wuppertal – urbane Lebensader",
];

const itemFilterFunction = ({ filterState }) => {
  return (item) => {
    let result = false;
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    if (!item.veroeffentlicht) {
      result = false;
    } else if (!item.abgeschlossen) {
      result = true;
    } else if (item.abgeschlossen_am) {
      const doneDate = new Date(item.abgeschlossen_am);
      result = doneDate >= sixMonthsAgo;
    }

    if (item.stek) {
      console.log("xxx filter function");

      result = item.stek.some((s) => filterState.stek.includes(s));
    }

    return result;
  };
};
export default itemFilterFunction;
