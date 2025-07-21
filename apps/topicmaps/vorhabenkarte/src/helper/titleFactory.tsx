const factory = ({ featureCollectionContext }) => {
  const { filterState } = featureCollectionContext;
  let themenstadtplanDesc;
  console.log("xxx filterState", filterState.topics.length);
  return (
    <div>
      <b>Meine Themenvorhaben: </b> {filterState.topics.length}{" "}
      {filterState.topics.length === 1 ? "Thema" : "Themen"}
    </div>
  );
};

export default factory;
