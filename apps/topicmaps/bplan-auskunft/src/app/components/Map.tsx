import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { FeatureCollectionDisplayWithTooltipLabels } from "react-cismap";
import BPlanInfo from "./BPlanInfo";
import { bplanFeatureStyler, bplanLabeler } from "../../utils/styler";
import { useContext, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  getLoading,
  getPlanFeatureByTitle,
  getPlanFeatures,
  loadBPlaene,
} from "../../store/slices/bplaene";
import proj4 from "proj4";
import { proj4crs25832def } from "react-cismap/constants/gis";
import { Modal } from "@carma-collab/wuppertal/bplan-auskunft";
import { useSearchParams } from "react-router-dom";
import L from "leaflet";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import type { UnknownAction } from "redux";
import versionData from "../../version.json";
import {
  getApplicationVersion,
  TAILWIND_CLASSNAMES_FULLSCREEN_FIXED,
} from "@carma-commons/utils";
import { Layer } from "leaflet";
import { TopicMapSelectionContent } from "@carma-apps/portals";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import FuzzySearchWrapper from "./FuzzySearchWrapper";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import {
  FullscreenControl,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";

const Map = () => {
  const dispatch = useDispatch();
  const isLoading = useSelector(getLoading);
  const [features, setFeatures] = useState<MapFeature[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [boundingBox, setBoundingBox] = useState(null);
  // const [gazData, setGazData] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  let refRoutedMap = useRef(null);
  const zoom = searchParams.get("zoom");
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);

  interface MapFeature extends Layer {
    id: string;
    selected: boolean;
    feature?: {
      id: string;
      selected: boolean;
    };
  }

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
        (element) => element?.id === event.target.feature.id
      );
      if (index !== -1) {
        features.forEach((element) => {
          if (element) {
            element.selected = false;
          }
        });
        event.target.feature.selected = true;
        setSelectedIndex(index);
      }
    }
  };

  const mapClick = (event) => {
    if (event.target.feature === undefined) {
      const projectedFC = new L.FeatureGroup();
      features.forEach((feature) => {
        projectedFC.addLayer(feature);
      });

      const bounds = projectedFC.getBounds();
      const map = routedMapRef?.leafletMap?.leafletElement;
      if (map === undefined) {
        return;
      }
      map.fitBounds(bounds);
    } else {
      console.log("features", features, event.target.feature);

      const index = features.findIndex(
        (element) => element.feature?.id === event.target.feature.id
      );
      if (index !== -1) {
        setSelectedIndex(index);
        features.forEach((element) => {
          if (element.feature) {
            element.feature.selected = false;
          }
        });
        event.target.feature.selected = true;
      }
    }
  };

  const doubleMapClick = (event) => {
    const pos = proj4(
      proj4.defs("EPSG:4326") as unknown as string,
      proj4crs25832def,
      [event.latlng.lng, event.latlng.lat]
    );

    dispatch(
      getPlanFeatures({
        point: { x: pos[0], y: pos[1] },
        done: (hits) => {
          if (hits?.length > 0) {
            hits[0].selected = true;
            setFeatures(hits);
            setSelectedIndex(0);
          } else {
            setFeatures([]);
          }
        },
      }) as unknown as UnknownAction
    );
  };

  const bplanSearchButtonHit = () => {
    dispatch(
      getPlanFeatures({
        boundingBox: boundingBox,
        done: (hits) => {
          hits[0].selected = true;
          setFeatures(hits);
          setSelectedIndex(0);
        },
      }) as unknown as UnknownAction
    );
  };

  useEffect(() => {
    dispatch(loadBPlaene() as unknown as UnknownAction);
    // getGazData(setGazData);
    document.title = `B-Plan-Auskunft Wuppertal`;
  }, []);

  function paramsToObject(entries) {
    const result = {};
    for (const [key, value] of entries) {
      // each 'entry' is a [key, value] tupple
      result[key] = value;
    }
    return result;
  }

  return (
    <div className={TAILWIND_CLASSNAMES_FULLSCREEN_FIXED}>
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
        <Control position="bottomleft" order={10}>
          <div title="B-Pläne suchen" style={{ marginTop: "4px" }}>
            <FuzzySearchWrapper
              mapSearchAllowed={zoom === null || Number(zoom) >= 12}
              setFeatures={setFeatures}
              setSelectedIndex={setSelectedIndex}
              onIconClick={bplanSearchButtonHit}
            />
          </div>
        </Control>
        <TopicMapComponent
          initialLoadingText="Laden der B-Plan-Daten"
          pendingLoader={isLoading ? 1 : 0}
          locatorControl={false}
          fullScreenControl={false}
          zoomControls={false}
          ref={refRoutedMap}
          gazetteerSearchControl={true}
          gazetteerSearchComponent={EmptySearchComponent}
          backgroundlayers={"uwBPlan|rvrGrundriss@20"}
          // backgroundlayers={"bplan_abkg|rvrGrundriss@20"}
          modalMenu={<Modal version={getApplicationVersion(versionData)} />}
          locationChangedHandler={(location) => {
            const newParams = {
              ...paramsToObject(searchParams),
              ...location,
            };
            setSearchParams(newParams);
          }}
          infoBox={
            <BPlanInfo
              pixelwidth={350}
              features={features}
              selectedIndex={selectedIndex}
              setSelectedIndex={setSelectedIndex}
              setFeatures={setFeatures}
            />
          }
          applicationMenuTooltipString="Kompaktanleitung anzeigen"
          ondblclick={doubleMapClick}
          homeZoom={16}
          applicationMenuIconname="info"
          mappingBoundsChanged={(bbox) => {
            setBoundingBox(bbox);
          }}
        >
          <TopicMapSelectionContent />

          <FeatureCollectionDisplayWithTooltipLabels
            key={"fc" + selectedIndex}
            featureCollection={features}
            style={bplanFeatureStyler}
            labeler={bplanLabeler}
            featureClickHandler={featureClick}
          />
        </TopicMapComponent>
      </ControlLayout>
    </div>
  );
};

export default Map;
