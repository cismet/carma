import React from 'react';
const factory = ({ featureCollectionContext }) => {
  const { itemsDictionary, filteredItems, filterState } =
    featureCollectionContext;
  const lebenslagen = itemsDictionary?.lebenslagen || [];

  let themenstadtplanDesc = 'alle Kitas | unter 2 + ab 2 Jahre | 35h pro Woche';
  if (filterState) {
    if (
      filterState.positiv.length > 0 &&
      filterState.positiv.length < lebenslagen.length
    ) {
      if (filterState.positiv.length <= 4) {
        themenstadtplanDesc += filterState.positiv.join(', ');
      } else {
        themenstadtplanDesc += filterState.positiv.length + ' Themen';
      }
      if (filterState.negativ.length > 0) {
        if (filterState.negativ.length <= 3) {
          themenstadtplanDesc += ' ohne ';
          themenstadtplanDesc += filterState.negativ.join(', ');
        } else {
          themenstadtplanDesc +=
            ' (' + filterState.negativ.length + ' Themen ausgeschlossen)';
        }
      }
    }
    return (
      <div>
        <b>Mein Kita-Finder:</b> {themenstadtplanDesc}
      </div>
    );
  }
};

export default factory;
