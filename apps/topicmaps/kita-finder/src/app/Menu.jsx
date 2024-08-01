import { useContext } from "react";
import CustomizationContextProvider from "react-cismap/contexts/CustomizationContextProvider";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import DefaultSettingsPanel from "react-cismap/topicmaps/menu/DefaultSettingsPanel";
import ModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import Section from "react-cismap/topicmaps/menu/Section";
import { GenericDigitalTwinReferenceTextComponent } from "@carma-collab/wuppertal/commons";
import FilterUI from "./FilterUI";
import {
  MenuTitle,
  MenuFooter,
  MenuIntroduction,
  KompaktanleitungSection,
} from "@carma-collab/wuppertal/kita-finder";

const getDefaultFilterConfiguration = (lebenslagen) => {
  const positiv = [...lebenslagen];
  const negativ = [];
  return { positiv, negativ };
};

const Menu = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);
  const {
    filterState,
    filterMode,
    filteredItems,
    shownFeatures,
    itemsDictionary,
  } = useContext(FeatureCollectionContext);
  const { setFilterState, setFilterMode } = useContext(
    FeatureCollectionDispatchContext,
  );

  const { items } = useContext(FeatureCollectionContext);

  if ((filterState === undefined) & (items !== undefined)) {
    setFilterState(getDefaultFilterConfiguration(itemsDictionary?.lebenslagen));
  }

  const getFilterHeader = () => {
    const count = filteredItems?.length || 0;

    let term;
    if (count === 1) {
      term = "Kita";
    } else {
      term = "Kitas";
    }

    return `Filtern (${count} ${term} gefunden, davon ${
      shownFeatures?.length || "0"
    } in der Karte)`;
  };

  return (
    <CustomizationContextProvider customizations={{}}>
      <ModalApplicationMenu
        menuIcon={"bars"}
        menuTitle={<MenuTitle />}
        menuFooter={
          <MenuFooter
            title="Kita-Finder Wuppertal"
            version={"xyz"}
            setAppMenuActiveMenuSection={setAppMenuActiveMenuSection}
          />
        }
        menuIntroduction={
          <MenuIntroduction
            setAppMenuActiveMenuSection={setAppMenuActiveMenuSection}
          />
        }
        menuSections={[
          <Section
            key="filter"
            sectionKey="filter"
            sectionTitle={getFilterHeader()}
            sectionBsStyle="primary"
            sectionContent={<FilterUI />}
          />,
          <DefaultSettingsPanel key="settings" />,
          <KompaktanleitungSection />,
          <Section
            key="digiTal"
            sectionKey="digiTal"
            sectionTitle={"DigiTal Zwilling"}
            sectionBsStyle="warning"
            sectionContent={<GenericDigitalTwinReferenceTextComponent />}
          ></Section>,
        ]}
      />
    </CustomizationContextProvider>
  );
};
export default Menu;
const NW = (props) => {
  return <span style={{ whiteSpace: "nowrap" }}>{props.children}</span>;
};
