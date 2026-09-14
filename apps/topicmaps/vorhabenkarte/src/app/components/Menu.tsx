import { useContext } from "react";
import CustomizationContextProvider from "react-cismap/contexts/CustomizationContextProvider";
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
import { PreviewLibreMap } from "@carma-mapping/engines/maplibre";
import { useShownFeatureCount } from "@carma-appframeworks/portals";
import { useVorhabenItems } from "../../data/vorhabenItems";
import { VORHABEN_SOURCE_ID } from "../../data/vorhabenGeoJson";
import { useVorhabenSymbolBadge } from "./Menu/useVorhabenSymbolBadge";

const Menu = () => {
  const { filteredItems } = useVorhabenItems();
  const shownCount = useShownFeatureCount(VORHABEN_SOURCE_ID, "fid");
  const getSymbolSVG = useVorhabenSymbolBadge();
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
            sectionTitle={getFilterHeader(filteredItems.length, shownCount)}
            sectionBsStyle={FilterStyle}
            sectionContent={<FilterUI />}
          />,
          <DefaultSettingsPanel
            key="settings"
            skipFilterTitleSettings={false}
            skipClusteringSettings={true}
            getSymbolSVG={getSymbolSVG}
            overridingMapPreview={<PreviewLibreMap />}
          />,
          <KompaktanleitungSection />,
          <GenericDigitalTwinReferenceSection />,
        ]}
      />
    </CustomizationContextProvider>
  );
};

export default Menu;
