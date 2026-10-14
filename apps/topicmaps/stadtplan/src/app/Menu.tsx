import { useContext, useEffect, useState } from "react";
import CustomizationContextProvider from "react-cismap/contexts/CustomizationContextProvider";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import { addSVGToProps } from "react-cismap/tools/svgHelper";
import { getSymbolSVGGetter } from "react-cismap/tools/uiHelper";
import DefaultSettingsPanel from "@carma-commons/cismap/settings-panel";
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
  symbolColor?: string;
}

// The Leaflet Stadtplan previews the signature of its first POI (Amtsgericht)
const SETTINGS_SYMBOL_URL =
  "https://wupp-digitaltwin-assets.cismet.de/v2/poi-signaturen/";
const SETTINGS_SYMBOL_SIGNATUR = "Icon_Behoerde_farbig.svg";

type SymbolSVGGetter = ReturnType<typeof getSymbolSVGGetter>;

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
  symbolColor,
}: MenuProps) => {
  const { setAppMenuActiveMenuSection } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);
  const [getSymbolSVG, setGetSymbolSVG] = useState<SymbolSVGGetter>();

  useEffect(() => {
    addSVGToProps({}, () => SETTINGS_SYMBOL_SIGNATUR, SETTINGS_SYMBOL_URL).then(
      (props: any) => {
        setGetSymbolSVG(() =>
          getSymbolSVGGetter(props.svgBadge, props.svgBadgeDimension)
        );
      }
    );
  }, []);

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
            getSymbolSVG={
              getSymbolSVG &&
              ((size: number, color: string) =>
                getSymbolSVG(size, symbolColor ?? color))
            }
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
