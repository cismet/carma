const factory = ({ featureCollectionContext }) => {
  const { filterState, itemsDictionary } = featureCollectionContext;
  let themenText;
  if (filterState.topics.length === 1) {
    themenText = filterState.topics.length + " Thema";
  } else {
    themenText = filterState.topics.length + " Themen";
  }

  if (filterState.citizen) {
    themenText += " (nur Vorhaben mit Bürgerbeteiligung)";
  }

  if (
    (itemsDictionary?.topics.length &&
      filterState.topics?.length !== itemsDictionary?.topics.length) ||
    filterState.citizen
  ) {
    return (
      <div>
        <b>Meine Themenvorhaben: </b> {themenText}
      </div>
    );
  }
};

export default factory;
