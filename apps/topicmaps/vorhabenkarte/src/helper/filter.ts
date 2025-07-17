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
