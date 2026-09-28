import { useContext, useEffect, useState } from "react";
import { Badge } from "react-bootstrap";
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
import {
  PreviewLibreMap,
  useLibreContext,
} from "@carma-mapping/engines/maplibre";
import {
  AdvancedFilterPanel,
  type AdvancedFilterCategory,
  type AdvancedFilterState,
} from "@carma-mapping/components";
import { crossLinkApps } from "./crossLinkApps";

interface MenuProps {
  categories?: AdvancedFilterCategory[];
  filterState?: AdvancedFilterState;
  onFilterStateChange?: (state: AdvancedFilterState) => void;
  pieChartData?: [string, number][];
  pieChartColors?: string[];
  filteredFeatures?: any[];
}

const countFeaturesInBounds = (
  map: ReturnType<typeof useLibreContext>["map"],
  features: any[]
) => {
  if (!map) {
    return 0;
  }
  const bounds = map.getBounds();
  return features.filter((f) => {
    const coordinates = f.geometry?.coordinates;
    return (
      f.geometry?.type === "Point" &&
      bounds.contains(coordinates as [number, number])
    );
  }).length;
};

const CROSS_LINK_FOOTNOTES: Record<string, string> = Object.fromEntries(
  crossLinkApps.flatMap((app) => app.on.map((lebenslage) => [lebenslage, " *"]))
);

const CrossLinkAppBadges =({ positiv }: { positiv: string[] }) => {
  const apps = crossLinkApps.filter((app) =>
    app.on.some((lebenslage) => positiv.includes(lebenslage))
  );
  if (apps.length === 0) {
    return null;
  }
  return (
    <div>
      <hr />
      <strong>* Themenspezifische Karten:</strong>
      {"  "}
      <h4
        style={{
          lineHeight: 1.7,
          wordWrap: "break-word",
          wordBreak: "normal",
          lineBreak: "strict",
          hyphens: "none",
          overflowWrap: "break-word",
        }}
      >
        {apps.map((app) => (
          <a
            key={"appLink_" + app.name}
            style={{ textDecoration: "none" }}
            href={app.link}
            target={app.target}
            rel="noopener noreferrer"
          >
            <Badge
              variant={app.bsStyle}
              style={{
                backgroundColor: app.backgroundColor ?? undefined,
                marginRight: "5px",
                display: "inline-block",
                color: "white",
              }}
            >
              {app.name}
            </Badge>
          </a>
        ))}
      </h4>
    </div>
  );
};

const Menu = ({
  categories,
  filterState,
  onFilterStateChange,
  pieChartData,
  pieChartColors,
  filteredFeatures = [],
}: MenuProps) => {
  const { setAppMenuActiveMenuSection } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);
  const { map } = useLibreContext();
  const [shownCount, setShownCount] = useState(0);

  useEffect(() => {
    if (!map) {
      return;
    }
    const update = () =>
      setShownCount(countFeaturesInBounds(map, filteredFeatures));
    update();
    map.on("moveend", update);
    return () => {
      map.off("moveend", update);
    };
  }, [map, filteredFeatures]);

  const hasFilter = categories && filterState && onFilterStateChange;

  const count = filteredFeatures.length;
  const term = count === 1 ? "POI" : "POIs";
  const filterTitle = `Mein Themenstadtplan (${count} ${term} gefunden, davon ${shownCount} in der Karte)`;

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
                    <>
                      <AdvancedFilterPanel
                        categories={categories}
                        filterState={filterState}
                        onFilterStateChange={onFilterStateChange}
                        width={900}
                        pieChartData={pieChartData}
                        pieChartColors={pieChartColors}
                        categoryFootnotes={CROSS_LINK_FOOTNOTES}
                      />
                      <CrossLinkAppBadges positiv={filterState.positiv} />
                    </>
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
