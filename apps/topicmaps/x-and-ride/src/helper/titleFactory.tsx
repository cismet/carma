const factory = ({ featureCollectionContext }) => {
  const { filterState } = featureCollectionContext;
  let filterDescription = '';

  if (filterState.bandr === true && filterState.pandr === true) {
    filterDescription = 'alle Anlagen';
  } else if (filterState.bandr === true) {
    filterDescription = 'nur B+R Anlagen';
  } else if (filterState.pandr === true) {
    filterDescription = 'nur P+R Anlagen';
  }

  if (
    filterState.envZoneWithin === false ||
    filterState.envZoneOutside === false
  ) {
    if (filterState.envZoneWithin === true) {
      filterDescription += ' innerhalb einer Umweltzone';
    } else if (filterState.envZoneOutside === true) {
      filterDescription += ' außerhalb einer Umweltzone';
    }
  }

  if (filterDescription === '') {
    return null;
  }

  return (
    <div>
      <b>Eingeschränkte Auswahl: </b> {filterDescription}
    </div>
  );
};

export default factory;
