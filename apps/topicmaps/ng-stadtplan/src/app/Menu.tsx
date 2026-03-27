import { useContext } from "react";
import CustomizationContextProvider from "react-cismap/contexts/CustomizationContextProvider";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import DefaultSettingsPanel from "react-cismap/topicmaps/menu/DefaultSettingsPanel";
import ModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import Section from "react-cismap/topicmaps/menu/Section";
import { GenericDigitalTwinReferenceSection } from "@carma-collab/wuppertal/commons";
import {
  KompaktanleitungSection,
  MenuTitle,
  MenuIntroduction,
  Footer,
} from "@carma-collab/wuppertal/stadtplan";
import versionData from "../version.json";
import { getApplicationVersion } from "@carma-commons/utils";
import { PreviewLibreMap } from "@carma-mapping/engines/maplibre";
import {
  AdvancedFilterPanel,
  type AdvancedFilterCategory,
  type AdvancedFilterState,
} from "@carma-mapping/components";

interface MenuProps {
  categories?: AdvancedFilterCategory[];
  filterState?: AdvancedFilterState;
  onFilterStateChange?: (state: AdvancedFilterState) => void;
  pieChartData?: [string, number][];
  pieChartColors?: string[];
}

const Menu = ({
  categories,
  filterState,
  onFilterStateChange,
  pieChartData,
  pieChartColors,
}: MenuProps) => {
  const { setAppMenuActiveMenuSection } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);

  const hasFilter = categories && filterState && onFilterStateChange;

  const filterTitle =
    filterState &&
    (filterState.positiv.length > 0 || filterState.negativ.length > 0)
      ? `Filter (${filterState.positiv.length} aktiv, ${filterState.negativ.length} ausgeschlossen)`
      : "Filter";

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
          ...(hasFilter
            ? [
                <Section
                  key="filter"
                  sectionKey="filter"
                  sectionTitle={filterTitle}
                  sectionBsStyle="primary"
                  sectionContent={
                    <AdvancedFilterPanel
                      categories={categories}
                      filterState={filterState}
                      onFilterStateChange={onFilterStateChange}
                      width={900}
                      pieChartData={pieChartData}
                      pieChartColors={pieChartColors}
                    />
                  }
                />,
              ]
            : []),
          <DefaultSettingsPanel
            key="settings"
            getSymbolSVG={(size: number, color: string) => {
              return (
                <img
                  width={size}
                  src={
                    "https://wupp-digitaltwin-assets.cismet.de/v2/poi-signaturen/Icon_Parkanlage_farbig.svg"
                  }
                  style={color ? { filter: `drop-shadow(0 0 0 ${color})` } : {}}
                  alt="symbol"
                />
              );
            }}
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
