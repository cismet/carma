import { useContext } from "react";
import CustomizationContextProvider from "react-cismap/contexts/CustomizationContextProvider";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import ModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import Section from "react-cismap/topicmaps/menu/Section";
import DefaultSettingsPanel from "react-cismap/topicmaps/menu/DefaultSettingsPanel";
import FilterUI from "./Menu/FilterUI";
import { getFilterHeader, FilterStyle } from "@carma-collab/wuppertal/e-bikes";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import { GenericDigitalTwinReferenceSection } from "@carma-collab/wuppertal/commons";
import { MenuFooter } from "@carma-collab/wuppertal/commons";
import ConfigurableDocBlocks from "react-cismap/topicmaps/ConfigurableDocBlocks";
// @ts-ignore
import { getSimpleHelpForTM } from "react-cismap/tools/uiHelper";
import {
  KompaktanleitungSection,
  MenuIntroduction,
  Footer,
} from "@carma-collab/wuppertal/vorhabenkarte";

let simpleHelp = "";

const Menu = () => {
  const { filteredItems, shownFeatures } = useContext<
    typeof FeatureCollectionContext
  >(FeatureCollectionContext);
  const { setAppMenuActiveMenuSection } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);

  return (
    <CustomizationContextProvider customizations={{}}>
      <ModalApplicationMenu
        menuIcon={"bars"}
        // menuTitle={<MenuTitle />}
        menuFooter={
          <MenuFooter
            title="Vorhabenkarte Wuppertal"
            version={"0.0.1"}
            skipHintergrundkarten={false}
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
            sectionTitle={getFilterHeader(
              filteredItems?.length,
              shownFeatures?.length
            )}
            sectionBsStyle={FilterStyle}
            sectionContent={<FilterUI />}
          />,
          <DefaultSettingsPanel
            key="settings"
            // checkBoxSettingsSectionTitle="Einstellungen"
            checkBoxTextClustering="Vorhaben maßstabsabhängig zusammenfassen"
          />,
          <KompaktanleitungSection />,
          <GenericDigitalTwinReferenceSection />,
        ]}
      />
    </CustomizationContextProvider>
  );
};

export default Menu;
