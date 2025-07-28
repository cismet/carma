const factory = ({ featureCollectionContext }) => {
  const { filterState, itemsDictionary } = featureCollectionContext;

  let themenText;
  if (filterState?.topics && Array.isArray(itemsDictionary?.topics)) {
    themenText =
      filterState.topics.length +
      " von " +
      itemsDictionary.topics.length +
      " Themen";
  }

  if (filterState.citizen) {
    themenText += " (nur Vorhaben mit Bürgerbeteiligung)";
  }

  if (
    (filterState?.topics &&
      Array.isArray(filterState?.topics) &&
      Array.isArray(itemsDictionary?.topics) &&
      itemsDictionary?.topics.length &&
      filterState.topics.length !== itemsDictionary?.topics.length) ||
    filterState.citizen
  ) {
    return (
      <div>
        <b>Meine Vorhaben: </b> {themenText}
      </div>
    );
  }
};

export default factory;
