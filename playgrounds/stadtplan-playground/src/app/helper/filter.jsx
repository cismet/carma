import React from 'react';

import MultiToggleButton from '../MultiToggleButton';

const itemFilterFunction = ({ filterState, filterMode }) => {
  return (item) => {
    let result = false;
    //positive
    if (filterState?.positiv && filterState?.negativ) {
      for (let ll of item.mainlocationtype.lebenslagen) {
        result = result || filterState.positiv.indexOf(ll) !== -1;
        if (filterState.negativ.indexOf(ll) !== -1) {
          return false;
        }
      }
      return result;
    } else {
      console.log('no filterstate, no filtering');

      return true;
    }
  };
};
export default itemFilterFunction;

export const createFilterRows = (
  apps,
  lebenslagen,
  toggleFilter,
  filterState,
  setFilterState
) => {
  let appsMap = new Map();

  let llOptions = [];

  for (let ll of lebenslagen) {
    llOptions.push({ label: ll, cat: 'lebenslage', value: ll });
    for (const app of apps) {
      if (app.on.indexOf(ll) !== -1) {
        appsMap.set(ll, app);
      }
    }
  }
  let rows = [];
  for (let item of lebenslagen) {
    let buttonValue = 'two'; // neutral state

    if (filterState.positiv.indexOf(item) !== -1) {
      buttonValue = 'one';
    } else if (filterState.negativ.indexOf(item) !== -1) {
      buttonValue = 'three';
    }

    let footnote;
    if (appsMap.has(item)) {
      footnote = ' *'; //(<div title="Themenspezifische Karte verfügbar"> *</div>);
    }
    let cb = (
      <div key={'div1.' + item} style={{ display: 'flex' }}>
        <div
          key={'div2.' + item}
          style={{
            whiteSpace: 'nowrap',
            flex: '50%',
          }}
        >
          {item}
          {footnote}
        </div>

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
      </div>
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
