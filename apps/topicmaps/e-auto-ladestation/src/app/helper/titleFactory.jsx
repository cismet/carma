import React from 'react';
const factory = ({ featureCollectionContext }) => {
  const { itemsDictionary, filteredItems, filterState } =
    featureCollectionContext;

  if (filterState) {
    let filterDescriptions = [];
    if (filterState?.nur_online === true) {
      filterDescriptions.push('verfügbar');
    }
    if (filterState?.oeffnungszeiten === '24') {
      filterDescriptions.push('24/7');
    }
    if (filterState?.stecker?.length < 6) {
      filterDescriptions.push('passender Stecker');
    }
    if (filterState?.nur_gruener_strom === true) {
      filterDescriptions.push('Ökostrom');
    }
    if (filterState?.nur_schnelllader === true) {
      filterDescriptions.push('Schnelllader');
    }

    if (filterDescriptions.length === 0) {
      return null;
    }

    return (
      <div>
        <b>Meine Ladestationen:</b> {filterDescriptions.join(' | ')}
      </div>
    );
  }
};

export default factory;
