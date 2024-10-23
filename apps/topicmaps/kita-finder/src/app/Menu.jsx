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
import { GenericDigitalTwinReferenceSection } from "@carma-collab/wuppertal/commons";
import FilterUI from "./FilterUI";
import {
  MenuTitle,
  MenuIntroduction,
  KompaktanleitungSection,
  Footer,
  getFilterHeader,
  FilterStyle,
} from "@carma-collab/wuppertal/kita-finder";
import versionData from "../version.json";
import { getApplicationVersion } from "@carma-commons/utils";
import { Form } from "react-bootstrap";
import { useDispatch, useSelector } from "react-redux";
import {
  getFeatureRenderingOption,
  setFeatureRenderingOption,
} from "./store/slices/ui";
import { constants as kitasConstants } from "./helper/constants";
import {
  TopicMapStylingDispatchContext,
  TopicMapStylingContext,
} from "react-cismap/contexts/TopicMapStylingContextProvider";
import { getColorForProperties } from "./helper/styler";

const getDefaultFilterConfiguration = (lebenslagen) => {
  const positiv = [...lebenslagen];
  const negativ = [];
  return { positiv, negativ };
};

const Menu = ({ previewFeatureCollectionProps }) => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);
  const { setMarkerSymbolSize } = useContext(TopicMapStylingDispatchContext);
  const { markerSymbolSize } = useContext(TopicMapStylingContext);
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

  const { setAdditionalStylingInfo } = useContext(
    TopicMapStylingDispatchContext,
  );

  const { items } = useContext(FeatureCollectionContext);

  const dispatch = useDispatch();
  const featureRenderingOption = useSelector(getFeatureRenderingOption);

  if ((filterState === undefined) & (items !== undefined)) {
    setFilterState(getDefaultFilterConfiguration(itemsDictionary?.lebenslagen));
  }

  const previewFeatureCollectionDisplayProps = {};

  // since previewFeatureCollectionProps are props that are passed to the FeatureCollection component
  // but the DefaultSettingsPanel is using them in a FeatureCollectionDisplay we need to change it to
  // previewFeatureCollectionDisplayProps

  if (previewFeatureCollectionProps) {
    if (previewFeatureCollectionProps.clusteringOptions) {
      previewFeatureCollectionDisplayProps.clusterOptions =
        previewFeatureCollectionProps.clusteringOptions;
    }
    if (previewFeatureCollectionProps.styler) {
      previewFeatureCollectionDisplayProps.style =
        previewFeatureCollectionProps.styler(
          markerSymbolSize,
          getColorForProperties,
        );
    }
  }

  // const getFilterHeader = () => {
  //   const count = filteredItems?.length || 0;

  //   let term;
  //   if (count === 1) {
  //     term = "Kita";
  //   } else {
  //     term = "Kitas";
  //   }

  //   return `Filtern (${count} ${term} gefunden, davon ${
  //     shownFeatures?.length || "0"
  //   } in der Karte)`;
  // };

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
              shownFeatures?.length,
            )}
            sectionBsStyle={FilterStyle}
            sectionContent={<FilterUI />}
          />,
          <DefaultSettingsPanel
            key={"settings" + featureRenderingOption}
            previewMapPosition="lat=51.27486777766875&lng=7.213025708847476&zoom=10"
            previewFeatureCollectionDisplayProps={
              previewFeatureCollectionDisplayProps
            }
            sparseSettingsSectionsExtensions={[
              ,
              <Form>
                <label
                  style={{
                    display: "inline-block",
                    maxWidth: "100%",
                    marginBottom: "5px",
                    fontWeight: 700,
                  }}
                >
                  Zeichenvorschrift
                </label>
                <br />
                <Form.Check
                  type="radio"
                  readOnly={true}
                  id="radio_traegertyp"
                  onClick={(e) => {
                    setAdditionalStylingInfo({
                      featureRenderingOption:
                        kitasConstants.FEATURE_RENDERING_BY_TRAEGERTYP,
                    });
                    dispatch(
                      setFeatureRenderingOption(
                        kitasConstants.FEATURE_RENDERING_BY_TRAEGERTYP,
                      ),
                    );
                  }}
                  checked={
                    featureRenderingOption ===
                    kitasConstants.FEATURE_RENDERING_BY_TRAEGERTYP
                  }
                  inline
                  label="nach Trägertyp"
                />

                <br />
                <Form.Check
                  type="radio"
                  readOnly={true}
                  id="radio_profil"
                  onClick={(e) => {
                    setAdditionalStylingInfo({
                      featureRenderingOption:
                        kitasConstants.FEATURE_RENDERING_BY_PROFIL,
                    });

                    dispatch(
                      setFeatureRenderingOption(
                        kitasConstants.FEATURE_RENDERING_BY_PROFIL,
                      ),
                    );
                  }}
                  checked={
                    featureRenderingOption ===
                    kitasConstants.FEATURE_RENDERING_BY_PROFIL
                  }
                  inline
                  label="nach Profil (Inklusionsschwerpunkt j/n)"
                />
              </Form>,
            ]}
          />,
          <KompaktanleitungSection />,
          <GenericDigitalTwinReferenceSection />,
        ]}
      />
    </CustomizationContextProvider>
  );
};
export default Menu;
const NW = (props) => {
  return <span style={{ whiteSpace: "nowrap" }}>{props.children}</span>;
};
