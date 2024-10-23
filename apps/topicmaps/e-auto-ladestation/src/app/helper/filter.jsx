import React from 'react';

import MultiToggleButton from '../MultiToggleButton';

const itemFilterFunction = ({ filterState }) => {
  return (item) => {
    let result = true;

    if (filterState.nur_online) {
      result = item.online;
    }

    if (filterState.oeffnungszeiten) {
      if (filterState.oeffnungszeiten === '24') {
        if (item.oeffnungszeiten !== '24 Stunden / 7 Tage') {
          result = false;
        }
      }
    }

    if (filterState.nur_gruener_strom) {
      result = item.gruener_strom;
    }

    if (filterState.nur_schnelllader) {
      if (!item.schnellladestation) {
        result = false;
      }
    }

    for (let stecker of item.steckerverbindungen) {
      if (filterState?.stecker?.indexOf(stecker.steckdosentyp) === -1) {
        result = false;
      }
    }

    return result;
  };
};
export default itemFilterFunction;

export const createFilterRows = (section, filterState, setFilterState) => {
  let rows = [];

  for (let item of section) {
    let buttonValue = 'two';

    if (filterState?.positiv?.indexOf(item) !== -1) {
      buttonValue = 'one';
    } else if (filterState?.negativ?.indexOf(item) !== -1) {
      buttonValue = 'three';
    }

    let cb = (
      <tr key={'tr.for.mtbutton.' + section + '.' + item}>
        <td
          key={'td1.for.mtbutton.' + section + '.' + item}
          style={{
            textAlign: 'left',
            verticalAlign: 'top',
            padding: '5px',
          }}
        >
          {item}
        </td>
        <td
          key={'td2.for.mtbutton.' + section + '.' + item}
          style={{
            textAlign: 'left',
            verticalAlign: 'top',
            padding: '5px',
          }}
        >
          <MultiToggleButton
            style={{
              flex: '50%',
            }}
            key={'mtbutton.lebenslagen.' + item}
            value={buttonValue}
            valueChanged={(selectedValue) => {
              if (selectedValue === 'one') {
                toggleFilter('positiv', item, filterState, setFilterState);
              } else if (selectedValue === 'three') {
                toggleFilter('negativ', item, filterState, setFilterState);
              } else {
                //deselect existing selection
                if (buttonValue === 'one') {
                  toggleFilter('positiv', item, setFilterState);
                } else if (buttonValue === 'three') {
                  toggleFilter('negativ', item, filterState, setFilterState);
                }
              }
            }}
          />
        </td>
      </tr>
    );
    rows.push(cb);
  }

  return rows;
};

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

export const setAllLebenslagenToFilter = (
  kind,
  lebenslagen,
  filterState,
  setFilterState
) => {
  const newFilterState = { ...filterState };
  newFilterState[kind] = lebenslagen;
  setFilterState(newFilterState);
  return newFilterState;
};
