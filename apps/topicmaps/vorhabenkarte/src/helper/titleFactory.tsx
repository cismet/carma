const factory = ({ featureCollectionContext }) => {
  const { filterState } = featureCollectionContext;
  let themenText;
  if (filterState.topics.length === 1) {
    themenText = filterState.topics.length + " Thema";
  } else {
    themenText = filterState.topics.length + " Themen";
  }

  if (filterState.citizen) {
    themenText += " (nur Vorhaben mit Bürgerbeteiligung)";
  }
  return (
    <div>
      <b>Meine Themenvorhaben: </b> {themenText}
    </div>
  );
};

export default factory;
