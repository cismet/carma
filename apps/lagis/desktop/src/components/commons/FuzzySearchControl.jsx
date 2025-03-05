import {
  useGazData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { isAreaType } from "@carma-commons/resources";

const FuzzySearchControl = ({ map }) => {
  const { gazData } = useGazData();
  const { setSelection } = useSelection();

  useSelectionTopicMap();

  const onGazetteerSelection = (selection) => {
    if (!selection) {
      setSelection(null);
      return;
    }
    const selectionMetaData = {
      selectedFrom: "gazetteer",
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaType(selection.type),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));

    setTimeout(() => {
      const pos = proj4(proj4crs3857def, proj4.defs("EPSG:4326"), [
        selection.x,
        selection.y,
      ]);
      console.log("xxx refRoutedMap", map);
      map.panTo([pos[1], pos[0]], {
        animate: false,
      });

      let hitObject = { ...selection };

      //Change the Zoomlevel of the map
      if (hitObject.more.zl) {
        map.setZoom(hitObject.more.zl, {
          animate: false,
        });
      }
    }, 100);
  };
  return (
    <div className="custom-left-control">
      <LibFuzzySearch
        gazData={gazData}
        onSelection={onGazetteerSelection}
        pixelwidth="500px"
        placeholder="Wohin?"
      />
    </div>
  );
};

export default FuzzySearchControl;
