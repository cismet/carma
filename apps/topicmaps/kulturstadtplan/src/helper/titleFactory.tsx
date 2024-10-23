import { getAllEinrichtungen, textConversion } from './styler';

const factory = ({ featureCollectionContext }) => {
  const { filterState, itemsDictionary } = featureCollectionContext;
  let maxFilterCount;
  let einrichtungsEinschub;
  let themenstadtplanDesc = '';
  const filterMode = filterState.mode;
  const veranstaltungen = itemsDictionary?.veranstaltungsarten?.map(
    (veranstaltung) => veranstaltung
  );

  if (filterMode === 'einrichtungen') {
    maxFilterCount = getAllEinrichtungen().length;
    einrichtungsEinschub = '';

    if (filterState['einrichtung'] && filterState['einrichtung'].length === 1) {
      themenstadtplanDesc =
        'alle ' + einrichtungsEinschub + filterState['einrichtung'][0];
    } else if (
      filterState['einrichtung'] &&
      filterState['einrichtung'].length > 0 &&
      filterState['einrichtung'].length < 3
    ) {
      themenstadtplanDesc =
        'alle ' +
        einrichtungsEinschub +
        filterState['einrichtung'][0] +
        ' und ' +
        filterState['einrichtung'][1];
      if (themenstadtplanDesc.split(' und ').length - 1 > 1) {
        themenstadtplanDesc = themenstadtplanDesc.replace(' und ', ', ');
      }
    } else if (
      filterState['einrichtung'].length > 0 &&
      filterState['einrichtung'].length < maxFilterCount
    ) {
      themenstadtplanDesc =
        filterState['einrichtung'].length +
        ' ' +
        textConversion('einrichtungen');
    }
  } else {
    einrichtungsEinschub = 'Orte für ';
    maxFilterCount = veranstaltungen.length;
    if (
      filterState['veranstaltung'] &&
      filterState['veranstaltung'].length === 1
    ) {
      themenstadtplanDesc =
        'alle ' + einrichtungsEinschub + filterState['veranstaltung'][0];
    } else if (
      filterState['veranstaltung'] &&
      filterState['veranstaltung'].length > 0 &&
      filterState['veranstaltung'].length < 3
    ) {
      themenstadtplanDesc =
        'alle ' +
        einrichtungsEinschub +
        filterState['veranstaltung'][0] +
        ' und ' +
        filterState['veranstaltung'][1];
      if (themenstadtplanDesc.split(' und ').length - 1 > 1) {
        themenstadtplanDesc = themenstadtplanDesc.replace(' und ', ', ');
      }
    } else if (
      filterState['veranstaltung'].length > 0 &&
      filterState['veranstaltung'].length < maxFilterCount
    ) {
      themenstadtplanDesc =
        filterState['veranstaltung'].length +
        ' ' +
        textConversion('veranstaltungen');
    }
  }

  if (themenstadtplanDesc === '') {
    return null;
  }

  return (
    <div>
      <b>Mein Kulturstadtplan: </b> {themenstadtplanDesc}
    </div>
  );
};

export default factory;
