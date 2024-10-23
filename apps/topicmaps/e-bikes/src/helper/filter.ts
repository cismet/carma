const itemFilterFunction = ({ filterState }) => {
  return (item) => {
    let result = false;
    const all = ['Ladestation', 'Verleihstation'];

    if (filterState.stationsart) {
      result = (filterState.stationsart || all).includes(item.typ);
    }

    if (result && item.typ === 'Ladestation') {
      if (filterState.nur_online) {
        result = item.online;
      } else {
        result = true;
      }
      if (result) {
        if (filterState.immer_offen) {
          result = !item.halb_oeffentlich;
        } else {
          result = true;
        }
      }
      if (result && filterState.gruener_strom) {
        result = item.gruener_strom === true;
      }

      if (result && filterState.ladebox_zu) {
        result = item.ladebox_zu;
      }
    }

    return result;
  };
};
export default itemFilterFunction;
