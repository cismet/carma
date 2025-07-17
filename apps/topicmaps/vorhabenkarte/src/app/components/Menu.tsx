import { useContext } from "react";
import CustomizationContextProvider from "react-cismap/contexts/CustomizationContextProvider";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import ModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import Section from "react-cismap/topicmaps/menu/Section";
import DefaultSettingsPanel from "react-cismap/topicmaps/menu/DefaultSettingsPanel";
import FilterUI from "./Menu/FilterUI";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import { GenericDigitalTwinReferenceSection } from "@carma-collab/wuppertal/commons";
import {
  KompaktanleitungSection,
  MenuIntroduction,
  Footer,
  getFilterHeader,
  FilterStyle,
  MenuTitle,
} from "@carma-collab/wuppertal/vorhabenkarte";
import versionData from "../../version.json";
import { getApplicationVersion } from "@carma-commons/utils";
import { Topic } from "../App";

interface MenuProps {
  topicsWitColors: Topic[];
}

const Menu = ({ topicsWitColors }: MenuProps) => {
  const { filteredItems, shownFeatures } = useContext<
    typeof FeatureCollectionContext
  >(FeatureCollectionContext);
  const { setAppMenuActiveMenuSection } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);

  return (
    <CustomizationContextProvider customizations={{}}>
      <ModalApplicationMenu
        menuIcon={"bars"}
        menuTitle={<MenuTitle />}
        menuFooter={
          <Footer
            version={getApplicationVersion(versionData)}
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
            sectionTitle={getFilterHeader(
              filteredItems?.length,
              shownFeatures?.length
            )}
            sectionBsStyle={FilterStyle}
            sectionContent={<FilterUI topicsWitColors={topicsWitColors} />}
          />,
          <DefaultSettingsPanel
            key="settings"
            skipFilterTitleSettings={false}
            itemFilterFunction={() => true}
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
