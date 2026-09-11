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
import { createSymbolBadgeRenderer } from "@carma-commons/ui/components";

/**
 * The filter still reads the react-cismap FeatureCollection, which the MapLibre
 * map no longer fills. Until the filter is driven by the vector style's
 * carmaConf.filterConfig it would render an empty topic list, so the section is
 * switched off rather than removed: FilterUI stays the reference for the
 * behaviour that has to be reproduced one to one.
 */
const FILTER_SECTION_ENABLED = false;

/**
 * The signature the live Leaflet deployment shows next to the symbol size
 * slider, taken verbatim from allFeatures[0].properties.svgBadge. The `bg-fill`
 * and `fg-fill` classes are what getSymbolSVGGetter colours: it wraps this in a
 * sized <svg> and injects a stylesheet that paints `bg-fill` in the requested
 * symbol colour and `fg-fill` white.
 */
const VORHABEN_SYMBOL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <rect class="bg-fill" fill="#e2923b" x="0" y="0" rx="3.3" ry="3.3" width="24" height="24"></rect>
  <rect class="fg-fill" fill="#FFFFFF" x="3.9" y="7.94" width="16.19" height="1.02" rx=".5" ry=".5"></rect>
  <path class="fg-fill" fill="#FFFFFF" d="M11.87,2.38L2.64,6.64c-.28.13-.19.55.12.55h18.46c.31,0,.4-.42.12-.55L12.11,2.38c-.07-.04-.17-.04-.24,0Z"></path>
  <rect class="fg-fill" fill="#FFFFFF" x="4.92" y="9.66" width="1.86" height="7.84"></rect>
  <rect class="fg-fill" fill="#FFFFFF" x="13.14" y="9.67" width="1.86" height="7.84"></rect>
  <rect class="fg-fill" fill="#FFFFFF" x="9.02" y="9.66" width="1.86" height="7.84"></rect>
  <rect class="fg-fill" fill="#FFFFFF" x="17.41" y="9.67" width="1.86" height="7.84"></rect>
  <polygon class="fg-fill" fill="#FFFFFF" points="20.98 20.35 2.81 20.35 3.67 18.19 20.14 18.19 20.98 20.35"></polygon>
</svg>`;

const VORHABEN_SYMBOL_COLOR = "#e2923b";

const getSymbolSVG = createSymbolBadgeRenderer({
  svgMarkup: VORHABEN_SYMBOL_SVG,
  dimension: { width: 24, height: 24 },
  color: VORHABEN_SYMBOL_COLOR,
});

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
