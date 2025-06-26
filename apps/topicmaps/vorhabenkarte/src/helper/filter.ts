export const stek = [
  "Wuppertals innovatives Technologieband",
  "Wuppertals lebendige Zentrenvielfalt",
  "Wuppertals neue grüne Stadtlandschaft",
  "Wuppertal – urbane Lebensader",
];

export const topics = [
  "Umwelt und Grünflächen",
  "Verkehr und Mobilität",
  "Bildung und Kultur",
  "Stadtentwicklung & Sicherheit",
  "Sonstiges",
  "Sport und Freizeit",
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
      result = item.stek.some((s) => filterState.stek.includes(s));
    }

    if (filterState.citizen) {
      result = item.buergerbeteiligung;
    }

    return result;
  };
};
export default itemFilterFunction;
