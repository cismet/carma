import { useContext } from "react";
import CustomizationContextProvider from "react-cismap/contexts/CustomizationContextProvider";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import { DefaultSettingsPanel } from "@carma-commons/cismap";
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
import type {
  AdvancedFilterCategory,
  AdvancedFilterState,
} from "@carma-mapping/components";
import FilterUI from "./FilterUI";

interface MenuProps {
  categories?: AdvancedFilterCategory[];
  filterState?: AdvancedFilterState;
  onFilterStateChange?: (state: AdvancedFilterState) => void;
  pieChartData?: [string, number][];
  pieChartColors?: string[];
  filteredPoiCount?: number;
  visiblePoiCount?: number;
  totalPoiCount?: number;
  onTitleDisplayChange?: (show: boolean) => void;
}

const Menu = ({
  categories,
  filterState,
  onFilterStateChange,
  pieChartData,
  pieChartColors,
  filteredPoiCount = 0,
  visiblePoiCount = 0,
  totalPoiCount = 0,
  onTitleDisplayChange,
}: MenuProps) => {
  const { setAppMenuActiveMenuSection } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);

  const hasFilter = categories && filterState && onFilterStateChange;

  const getFilterHeader = () => {
    const term = filteredPoiCount === 1 ? "POI" : "POIs";
    return `Mein Themenstadtplan (${filteredPoiCount} ${term} gefunden, davon ${visiblePoiCount} in der Karte)`;
  };

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
                  sectionTitle={getFilterHeader()}
                  sectionBsStyle="primary"
                  sectionContent={
                    <FilterUI
                      categories={categories}
                      filterState={filterState}
                      onFilterStateChange={onFilterStateChange}
                      pieChartData={pieChartData}
                      pieChartColors={pieChartColors}
                    />
                  }
                />,
              ]
            : []),
          <DefaultSettingsPanel
            key="settings"
            hasFilter={!!hasFilter}
            onTitleDisplayChange={onTitleDisplayChange}
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
