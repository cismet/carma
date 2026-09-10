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
import { PreviewLibreMap } from "@carma-mapping/engines/maplibre";

/**
 * The filter still reads the react-cismap FeatureCollection, which the MapLibre
 * map no longer fills. Until the filter is driven by the vector style's
 * carmaConf.filterConfig it would render an empty topic list, so the section is
 * switched off rather than removed: FilterUI stays the reference for the
 * behaviour that has to be reproduced one to one.
 */
const FILTER_SECTION_ENABLED = false;

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
          ...(FILTER_SECTION_ENABLED
            ? [
                <Section
                  key="filter"
                  sectionKey="filter"
                  sectionTitle={getFilterHeader(
                    filteredItems?.length,
                    shownFeatures?.length || 0
                  )}
                  sectionBsStyle={FilterStyle}
                  sectionContent={<FilterUI />}
                />,
              ]
            : []),
          <DefaultSettingsPanel
            key="settings"
            skipFilterTitleSettings={false}
            skipClusteringSettings={true}
            itemFilterFunction={() => true}
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
