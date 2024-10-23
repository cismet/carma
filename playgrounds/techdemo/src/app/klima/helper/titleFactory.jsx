const factory = ({ featureCollectionContext }) => {
  const getThemaById = (id) => {
    const result = featureCollectionContext?.items?.find((item) => item?.thema?.id === id);
    return result?.thema?.name;
  };

  let themenstadtplanDesc = "?";
  if (featureCollectionContext?.filteredItems?.length === featureCollectionContext?.items?.length) {
    themenstadtplanDesc = undefined;
  } else if (featureCollectionContext?.filterMode === "themen") {
    if (featureCollectionContext?.filterState?.themen?.length <= 2) {
      const themenIds = featureCollectionContext?.filterState?.themen;
      const themen = [];
      for (const id of themenIds) {
        themen.push(getThemaById(id));
      }

      themenstadtplanDesc = "nach Themen gefiltert (nur " + themen.join(", ") + ")";
    } else {
      themenstadtplanDesc =
        "nach Themen gefiltert (" +
        featureCollectionContext?.filterState?.themen?.length +
        " Themen)";
    }
  } else if (featureCollectionContext?.filterMode === "kategorien") {
    if (featureCollectionContext?.filterState?.kategorien?.length <= 3) {
      themenstadtplanDesc =
        "nach Kategorien gefiltert (nur " +
        featureCollectionContext?.filterState?.kategorien?.join(", ") +
        ")";
    } else {
      themenstadtplanDesc =
        "nach Kategorien gefiltert (" +
        featureCollectionContext?.filterState?.kategorien?.length +
        " Kategorien)";
    }
  }

  if (featureCollectionContext?.filteredItems?.length === 0) {
    return (
      <div>
        <b>Keine Klimaorte gefunden!</b> Bitte überprüfen Sie Ihre Filtereinstellungen.
      </div>
    );
  }

  if (themenstadtplanDesc) {
    return (
      <div>
        <b>Meine Klimaorte:</b> {themenstadtplanDesc}
      </div>
    );
  } else {
    return undefined;
  }
};

export default factory;
