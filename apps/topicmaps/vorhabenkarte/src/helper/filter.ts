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
    // const sixMonthsAgo = new Date();
    // sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // if (!item.veroeffentlicht) {
    //   return false;
    // } else if (item.abgeschlossen) {
    //   if (item.abgeschlossen_am) {
    //     const doneDate = new Date(item.abgeschlossen_am);

    //     if (doneDate < sixMonthsAgo) {
    //       return false;
    //     }
    //   } else {
    //     return false;
    //   }
    // }

    let themaResult;
    let citizenResult;

    if (item.thema.name) {
      themaResult = filterState.topics.includes(item.thema.name);

      if (filterState.citizen && result) {
        citizenResult = item.buergerbeteiligung;
      } else {
        citizenResult = true;
      }
    }

    return themaResult && citizenResult;
  };
};
export default itemFilterFunction;
