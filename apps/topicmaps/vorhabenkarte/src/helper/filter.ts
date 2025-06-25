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

    return result;
  };
};
export default itemFilterFunction;
