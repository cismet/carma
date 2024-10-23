const factory = ({ featureCollectionContext }) => {
  const { filterState } = featureCollectionContext;
  let filterDescriptions: any = [];
  if (filterState.stationsart?.includes('Ladestation')) {
    if (
      filterState.stationsart.includes('Ladestation') &&
      !filterState.stationsart.includes('Verleihstation')
    ) {
      filterDescriptions.push('nur Ladestationen');
    } else {
      filterDescriptions.push('Verleih- und Ladestationen');
    }

    if (filterState.nur_online === true) {
      filterDescriptions.push('verfügbar');
    }
    if (filterState.immer_offen === true) {
      filterDescriptions.push('24/7');
    }
    if (filterState.gruener_strom === true) {
      filterDescriptions.push('Ökostrom');
    }
    if (filterState.ladebox_zu === true) {
      filterDescriptions.push('Ladebox');
    }
  }
  if (
    !filterState.stationsart?.includes('Ladestation') &&
    filterState.stationsart?.includes('Verleihstation')
  ) {
    filterDescriptions.push('nur Verleihstationen');
  }
  return (
    <div>
      <b>Meine Stationen: </b> {filterDescriptions.join(' | ')}
    </div>
  );
};

export default factory;
