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

    if (item.thema.name) {
      result = filterState.topics.includes(item.thema.name);

      if (filterState.stek.length > 0 && result) {
        if (item?.stek) {
          result = item.stek.some((s) => filterState.stek.includes(s));
        } else {
          result = false;
        }
        if (filterState.citizen && result) {
          result = item.buergerbeteiligung;
        }
      }

      if (result && filterState.stek.length === 0 && filterState.citizen) {
        result = item.buergerbeteiligung;
      }
    }

    return result;
  };
};
export default itemFilterFunction;
