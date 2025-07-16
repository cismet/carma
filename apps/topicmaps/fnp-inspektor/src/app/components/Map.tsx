import { useContext, useEffect, useRef, useState } from "react";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import {
  FeatureCollectionDisplayWithTooltipLabels,
  TransitiveReactLeaflet,
} from "react-cismap";
import StyledWMSTileLayer from "react-cismap/StyledWMSTileLayer";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faShuffle } from "@fortawesome/free-solid-svg-icons";
import AEVInfo from "./infos/AEVInfo";
import HNInfo from "./infos/HNInfo";
import HN9999Info from "./infos/HN9999Info";
import EmptyAEVInfo from "./infos/EmptyAEVInfo";
import EmptyHNInfo from "./infos/EmptyHNInfo";
import { useDispatch, useSelector } from "react-redux";
import {
  loadHauptnutzungen,
  searchForHauptnutzungen,
} from "../../store/slices/hauptnutzungen";
import proj4 from "proj4";
import { proj4crs25832def } from "react-cismap/constants/gis";
import {
  getData,
  loadAEVs,
  searchForAEVs,
} from "../../store/slices/aenderungsverfahren";
import {
  getFeatureCollection,
  getSelectedFeatureIndex,
  setFeatureCollection,
  setSelectedFeatureIndex,
} from "../../store/slices/mapping";
import ShowAEVModeButton from "./ShowAEVModeButton";
import {
  aevFeatureStyler,
  aevLabeler,
  hnFeatureStyler,
  hnLabeler,
} from "../../utils/Styler";
import Modal from "./help/Modal";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import L from "leaflet";
import {
  MenuTooltip,
  searchTextPlaceholder,
  loadingText,
} from "@carma-collab/wuppertal/fnp-inspektor";
import type { UnknownAction } from "redux";
import { TopicMapSelectionContent } from "@carma-apps/portals";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import FuzzySearchWrapper from "./FuzzySearchWrapper";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import {
  FullscreenControl,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";
import CustomScaleControl from "./CustomScaleControl";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { TAILWIND_CLASSNAMES_FULLSCREEN_FIXED } from "@carma-commons/utils";

const { ScaleControl } = TransitiveReactLeaflet;

const Map = () => {
  const searchMinZoom = 7;

  const baseURL = window.location.origin + window.location.pathname;
  const [boundingBox, setBoundingBox] = useState(null);
  const features = useSelector(getFeatureCollection);
  const selectedFeatureIndex = useSelector(getSelectedFeatureIndex);
  // const [gazData, setGazData] = useState([]);
  const [mapMode, setMapMode] = useState({ mode: "rechtsplan" });
  let { mode } = useParams();
  const navigate = useNavigate();
  let [searchParams, setSearchParams] = useSearchParams();
  const zoom = searchParams.get("zoom");
  let aevVisible = searchParams.get("aevVisible") !== null;
  const dispatch = useDispatch();
  const aevFeatures = useSelector(getData);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(0);
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const { responsiveState } = useContext<typeof ResponsiveTopicMapContext>(
    ResponsiveTopicMapContext
  );

  const isMobile = responsiveState === "normal" ? false : true;

  const setAevVisible = (visible) => {
    if (visible && !aevVisible) {
      searchParams.set("aevVisible", "true");
      setSearchParams(searchParams);
    } else if (!visible && aevVisible) {
      searchParams.delete("aevVisible");
      setSearchParams(searchParams);
    }
  };

  useEffect(() => {
    document.title = `FNP-Inspektor Wuppertal`;
    dispatch(loadHauptnutzungen() as unknown as UnknownAction);
    dispatch(loadAEVs() as unknown as UnknownAction);
    // getGazData(setGazData);
  }, []);

  useEffect(() => {
    if (mode !== "arbeitskarte" && mode !== "rechtsplan") {
      navigate("/rechtsplan");
      setMapMode({ mode: "rechtsplan" });
    } else if (mode === "arbeitskarte") {
      setMapMode({ mode: "arbeitskarte" });
    } else {
      setMapMode({ mode: "rechtsplan" });
    }
  }, [mode]);

  let info;
  let showAEVButton = (
    <ShowAEVModeButton
      searchParams={searchParams}
      setSearchParams={setSearchParams}
    />
  );
  if (features.length > 0 && (aevVisible || mapMode.mode === "arbeitskarte")) {
    if (mapMode.mode === "rechtsplan") {
      info = <AEVInfo secondaryInfoBoxElements={[showAEVButton]} />;
    } else if (mapMode.mode === "arbeitskarte") {
      if (features[selectedFeatureIndex].properties.os !== "9999") {
        info = <HNInfo />;
      } else {
        info = <HN9999Info />;
      }
    }
  } else {
    if (mapMode.mode === "rechtsplan") {
      info = <EmptyAEVInfo secondaryInfoBoxElements={[showAEVButton]} />;
    } else if (mapMode.mode === "arbeitskarte") {
      info = <EmptyHNInfo />;
    }
  }

  let titleContent;
  let backgrounds;
  if (mapMode.mode === "arbeitskarte") {
    titleContent = (
      <div>
        <b>Arbeitskarte: </b> fortgeschriebene Hauptnutzungen (informeller
        FNP-Auszug)
        <div style={{ float: "right", paddingRight: 10 }}>
          <a
            href={baseURL + "#/rechtsplan?" + searchParams}
            onClick={() => {
              dispatch(setFeatureCollection([]));
            }}
          >
            <FontAwesomeIcon icon={faShuffle} style={{ marginRight: 5 }} />
            zum Rechtsplan
          </a>
        </div>
      </div>
    );

    backgrounds = [
      <StyledWMSTileLayer
        key={"Hauptnutzungen.flaeche:aevVisible:" + aevVisible}
        url="https://maps.wuppertal.de/planung"
        layers={"r102_fnp_haupt_fl"}
        version="1.1.1"
        transparent="true"
        format="image/png"
        tiled="false"
        styles="default"
        maxZoom={19}
        opacity={0.4}
        caching={true}
      />,
    ];
  } else if (mapMode.mode === "rechtsplan") {
    titleContent = (
      <div>
        <b>Rechtsplan: </b> Flächennutzungsplan (FNP){" "}
        {aevVisible === true ? "mit Änderungsverfahren (ÄV)" : ""}
        <div style={{ float: "right", paddingRight: 10 }}>
          <a
            href={baseURL + "#/arbeitskarte?" + searchParams}
            onClick={() => {
              dispatch(setFeatureCollection([]));
            }}
          >
            <FontAwesomeIcon icon={faShuffle} style={{ marginRight: 5 }} /> zur
            Arbeitskarte
          </a>
        </div>
      </div>
    );

    backgrounds = [
      <StyledWMSTileLayer
        key={"rechtsplan:aevVisible:"}
        url="https://maps.wuppertal.de/planung?SRS=EPSG:25832"
        layers={"r102:fnp_clip"}
        version="1.1.1"
        transparent="true"
        format="image/png"
        tiled="true"
        styles="default"
        maxZoom={19}
        opacity={aevVisible ? 0.5 : 1.0}
        caching={true}
      />,
    ];
  }

  let title = <></>;
  title = (
    <table
      className="mode-container-switcher"
      style={{
        width: width - 54 - 12 - 38 - 12 + "px",
        height: "30px",
        position: "absolute",
        left: 54,
        top: 12,
        zIndex: 555,
      }}
    >
      <tbody>
        <tr>
          <td
            style={{
              textAlign: "center",
              verticalAlign: "middle",
              background: "#ffffff",
              color: "black",
              opacity: "0.9",
              paddingLeft: "10px",
            }}
          >
            {titleContent}
          </td>
        </tr>
      </tbody>
    </table>
  );

  function paramsToObject(entries) {
    const result = {};
    for (const [key, value] of entries) {
      // each 'entry' is a [key, value] tupple
      result[key] = value;
    }
    return result;
  }

  const doubleMapClick = (event) => {
    // @ts-expect-error legacy codebase exception
    const pos = proj4(proj4.defs("EPSG:4326"), proj4crs25832def, [
      event.latlng.lng,
      event.latlng.lat,
    ]);

    if (mapMode.mode === "rechtsplan" && aevVisible) {
      dispatch(
        // @ts-expect-error legacy codebase exception
        searchForAEVs({
          point: { x: pos[0], y: pos[1] },
        })
      );
    } else if (mapMode.mode === "arbeitskarte") {
      dispatch(
        // @ts-expect-error legacy codebase exception
        searchForHauptnutzungen({
          point: { x: pos[0], y: pos[1] },
        })
      );
    }
  };

  const featureClick = (event) => {
    if (event.target.feature.selected) {
      const projectedFC = L.Proj.geoJson(event.target.feature);
      const bounds = projectedFC.getBounds();
      const map = routedMapRef?.leafletMap?.leafletElement;
      if (map === undefined) {
        return;
      }
      map.fitBounds(bounds);
    } else {
      const index = features.findIndex(
        (element) => element.id === event.target.feature.id
      );
      if (index !== -1) {
        dispatch(setSelectedFeatureIndex(index));
      }
    }
  };

  const aevSearchButtonHit = () => {
    setAevVisible(true);
    dispatch(
      // @ts-expect-error legacy codebase exception
      searchForAEVs({
        boundingBox: boundingBox,
      })
    );
  };

  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (wrapperRef.current) {
          setWidth(wrapperRef.current?.offsetWidth);
        }
      }
    });

    if (wrapperRef.current) {
      resizeObserver.observe(wrapperRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [wrapperRef]);

  return (
    <div className={TAILWIND_CLASSNAMES_FULLSCREEN_FIXED}>
      <div style={{ position: "relative" }} ref={wrapperRef}>
        {title}
        <ControlLayout ifStorybook={false}>
          <Control position="topleft" order={10}>
            <ZoomControl />
          </Control>

          <Control position="topleft" order={50}>
            <FullscreenControl />
          </Control>
          <Control position="topleft" order={60} title="Mein Standort">
            <RoutedMapLocateControl
              tourRefLabels={null}
              disabled={false}
              nativeTooltip={true}
            />
          </Control>
          {isMobile && (
            <Control position="topleft" order={60}>
              <CustomScaleControl />
            </Control>
          )}
          <Control position="bottomleft" order={10}>
            <div style={{ marginTop: "4px" }}>
              <div
                title={
                  mode === "rechtsplan"
                    ? "Änderungsverfahren suchen"
                    : undefined
                }
              >
                {!isMobile && <CustomScaleControl marginBottom={15} />}
                <FuzzySearchWrapper
                  mapSearchAllowed={
                    mode === "rechtsplan" &&
                    (zoom === null || Number(zoom) >= 7)
                  }
                  mode={mapMode.mode}
                  searchTextPlaceholder={searchTextPlaceholder}
                  onIconClick={aevSearchButtonHit}
                />
              </div>
            </div>
          </Control>
          <TopicMapComponent
            initialLoadingText={loadingText}
            //   pendingLoader={isLoading ? 1 : 0}
            locatorControl={false}
            fullScreenControl={false}
            zoomControls={false}
            gazetteerSearchControl={true}
            gazetteerSearchComponent={EmptySearchComponent}
            backgroundlayers={"wupp-plan-live"}
            modalMenu={<Modal />}
            infoBox={info}
            applicationMenuTooltipString={<MenuTooltip />}
            applicationMenuIconname="info"
            homeZoom={12}
            mappingBoundsChanged={(bbox) => {
              setBoundingBox(bbox);
            }}
            locationChangedHandler={(location) => {
              const newParams = {
                ...paramsToObject(searchParams),
                ...location,
              };
              setSearchParams(newParams);
            }}
            ondblclick={doubleMapClick}
          >
            {/* <ScaleControl
          maxWidth={100}
          metric={true}
          imperial={false}
          updateWhenIdle={false}
          position="topleft"
        /> */}

            {(aevVisible || mapMode.mode === "arbeitskarte") && (
              <FeatureCollectionDisplayWithTooltipLabels
                appMode={mapMode.mode}
                key={
                  `map_` + JSON.stringify(features) + "." + selectedFeatureIndex
                }
                featureCollection={features}
                featureClickHandler={featureClick}
                style={
                  mapMode.mode === "arbeitskarte"
                    ? hnFeatureStyler
                    : aevFeatureStyler
                }
                labeler={
                  mapMode.mode === "arbeitskarte" ? hnLabeler : aevLabeler
                }
              />
            )}
            <TopicMapSelectionContent />

            {aevVisible && mapMode.mode === "rechtsplan" && (
              <FeatureCollectionDisplayWithTooltipLabels
                key={
                  `map_` + selectedFeatureIndex + JSON.stringify(aevFeatures)
                }
                appMode={mapMode.mode}
                featureCollection={aevFeatures}
                featureClickHandler={featureClick}
                style={(feature) => {
                  const style = {
                    color: "#155317",
                    weight: 3,
                    opacity: 0.8,
                    fillColor: "#ffffff",
                    fillOpacity: 0.6,
                  };
                  if (10 >= searchMinZoom) {
                    if (feature.properties.status === "r") {
                      style.color = "#155317";
                    } else {
                      style.color = "#9F111B";
                    }
                  } else {
                    if (feature.properties.status === "r") {
                      style.color = "#155317";
                      style.fillColor = "#155317";
                      style.opacity = 0.0;
                    } else {
                      style.color = "#9F111B";
                      style.fillColor = "#9F111B";
                      style.opacity = 0.0;
                    }
                  }

                  return style;
                }}
              />
            )}
            {backgrounds}
          </TopicMapComponent>
        </ControlLayout>
      </div>
    </div>
  );
};

export default Map;
