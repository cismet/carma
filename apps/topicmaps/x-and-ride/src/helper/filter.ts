const itemFilterFunction = ({ filterState }) => {
  return (item) => {
    let result = false;

    if (filterState.envZoneWithin === true && item.inUZ === true) {
      result = true;
    }
    if (filterState.envZoneOutside === true && item.inUZ === false) {
      result = true;
    }

    if (result === true) {
      result = false;
      if (item.schluessel === 'P' && filterState.pandr === true) {
        result = true;
      }
      if (item.schluessel === 'B' && filterState.bandr === true) {
        result = true;
      }
    }

    return result;
  };
};
export default itemFilterFunction;
