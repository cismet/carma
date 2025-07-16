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
    let themaResult;
    let citizenResult;

    if (item.thema.name) {
      themaResult = filterState.topics.includes(item.thema.name);

      if (filterState.citizen && themaResult) {
        citizenResult = item.buergerbeteiligung;
      } else {
        citizenResult = true;
      }
    }

    return themaResult && citizenResult;
  };
};
export default itemFilterFunction;
