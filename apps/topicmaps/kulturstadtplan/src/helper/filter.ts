import { classifyMainlocationTypeName } from './styler';

const itemFilterFunction = ({ filterState }) => {
  return (item) => {
    let result = false;

    if (filterState.mode === 'einrichtungen') {
      const category = classifyMainlocationTypeName(item.mainlocationtype.name);
      if (filterState['einrichtung'].indexOf(category) !== -1) {
        result = true;
      }
    } else if (filterState.mode === 'veranstaltungen') {
      for (let veranstaltungsart of item.more.veranstaltungsarten) {
        if (filterState['veranstaltung']?.indexOf(veranstaltungsart) !== -1) {
          result = true;
        }
      }
    }

    return result;
  };
};
export default itemFilterFunction;
