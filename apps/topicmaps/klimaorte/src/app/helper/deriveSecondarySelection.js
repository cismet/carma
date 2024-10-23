const derive = (props) => {
  const {
    selectedFeature,

    secondarySelection,
  } = props;
  let newSecondarySelection;
  if (selectedFeature) {
    if (selectedFeature.properties.typ === "route") {
      newSecondarySelection = {
        typ: "route",
        id: selectedFeature.properties.id,
        name: selectedFeature.properties.name,
      };
    } else {
      if (
        selectedFeature.properties.routen &&
        selectedFeature.properties.routen.length === 1
      ) {
        newSecondarySelection = selectedFeature.properties.routen[0];
      } else if (
        selectedFeature.properties.routen &&
        selectedFeature.properties.routen.length > 1
      ) {
        //Check whether the current secondary selection is still in the list of routen
        //if so, keep it, otherwise select the first route

        if (secondarySelection && secondarySelection.typ === "route") {
          const secondaryRoutenId = secondarySelection.id;
          if (
            selectedFeature.properties.routen.filter(
              (r) => r.id === secondaryRoutenId
            ).length === 1
          ) {
            newSecondarySelection = secondarySelection;
          } else {
            newSecondarySelection = selectedFeature.properties.routen[0];
          }
        } else {
          newSecondarySelection = selectedFeature.properties.routen[0];
        }
      }
    }
  }

  return newSecondarySelection;
};

export default derive;
