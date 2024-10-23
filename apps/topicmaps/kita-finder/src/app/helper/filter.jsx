import { constants as kitasConstants } from './constants';

export const traegertypMap = [
  { text: 'städtisch', c: kitasConstants.TRAEGERTYP_STAEDTISCH },
  { text: 'evangelisch', c: kitasConstants.TRAEGERTYP_EVANGELISCH },
  { text: 'katholisch', c: kitasConstants.TRAEGERTYP_KATHOLISCH },
  { text: 'Elterninitiative', c: kitasConstants.TRAEGERTYP_ELTERNINITIATIVE },
  { text: 'Betrieb', c: kitasConstants.TRAEGERTYP_BETRIEBSKITA },
  { text: 'andere freie Träger', c: kitasConstants.TRAEGERTYP_ANDERE },
];

const itemFilterFunction = ({ filterState }) => {
  return (item) => {
    let result = false;

    if (filterState.inklusion) {
      if (item.plaetze_fuer_behinderte) {
        result = true;
      }
    }

    if (filterState.normal) {
      if (!item.plaetze_fuer_behinderte) {
        result = true;
      }
    }

    traegertypMap.forEach((traeger) => {
      if (!filterState[traeger.text]) {
        const kitaTraeger = kitasConstants.TRAEGERTYP[item.traegertyp];
        if (traeger.c === kitaTraeger) {
          result = false;
        }
      }
    });

    if (filterState.alter) {
      if (filterState.alter === 'unter2') {
        if (item.alter === 0) {
        } else {
          result = false;
        }
      } else if (filterState.alter === 'ab2') {
        if (item.alter === 0 || item.alter === 1) {
        } else {
          result = false;
        }
      } else if (filterState.alter === 'ab3') {
        if (item.alter < 3) {
        } else {
          result = false;
        }
      }
    }

    const chk45h = filterState.umfang_45;
    const chk35h = filterState.umfang_35;

    if (chk45h && chk35h) {
    } else if (chk45h) {
      if (item.stunden === 2 || item.stunden === 1) {
      } else {
        result = false;
      }
    } else if (chk35h) {
      if (item.stunden === 0 || item.stunden === 1) {
      } else {
        result = false;
      }
    } else if (!chk35h && !chk45h) {
      result = false;
    }

    return result;
  };
};
export default itemFilterFunction;

export const toggleFilter = (kind, filter, filterState, setFilterState) => {
  const newFilterState = { ...filterState };
  let filterGroupSet = new Set(filterState[kind]);
  if (filterGroupSet.has(filter)) {
    filterGroupSet.delete(filter);
  } else {
    filterGroupSet.add(filter);
    if (kind === 'positiv') {
      if (newFilterState.negativ.indexOf(filter) !== -1) {
        let otherFilterGroupSet = new Set(newFilterState['negativ']);
        otherFilterGroupSet.delete(filter);
        newFilterState['negativ'] = Array.from(otherFilterGroupSet);
      }
    } else {
      if (newFilterState.positiv.indexOf(filter) !== -1) {
        let otherFilterGroupSet = new Set(newFilterState['positiv']);
        otherFilterGroupSet.delete(filter);
        newFilterState['positiv'] = Array.from(otherFilterGroupSet);
      }
    }
  }
  newFilterState[kind] = Array.from(filterGroupSet);
  newFilterState[kind].sort();
  setFilterState(newFilterState);
  return newFilterState;
};

export const clearFilter = (kind, filterState, setFilterState) => {
  const newFilterState = { ...filterState };
  newFilterState[kind] = [];
  setFilterState(newFilterState);
  return newFilterState;
};
