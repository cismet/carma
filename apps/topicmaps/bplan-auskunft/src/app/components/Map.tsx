import TopicMapComponent from 'react-cismap/topicmaps/TopicMapComponent';
import { FeatureCollectionDisplayWithTooltipLabels } from 'react-cismap';
import BPlanInfo from './BPlanInfo';
import { bplanFeatureStyler, bplanLabeler } from '../../utils/styler';
import { useContext, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  getLoading,
  getPlanFeatureByTitle,
  getPlanFeatures,
  loadBPlaene,
} from '../../store/slices/bplaene';
import proj4 from 'proj4';
import { proj4crs25832def } from 'react-cismap/constants/gis';
import { getGazData } from '../../utils/gazData';
import GazetteerSearchControl from 'react-cismap/GazetteerSearchControl';
import { faSearch } from '@fortawesome/free-solid-svg-icons';
import Modal from './Modal';
import { useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import { TopicMapContext } from 'react-cismap/contexts/TopicMapContextProvider';
import { UnknownAction } from 'redux';

const Map = () => {
  const dispatch = useDispatch();
  const isLoading = useSelector(getLoading);
  const [features, setFeatures] = useState<unknown[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [boundingBox, setBoundingBox] = useState(null);
  const [gazData, setGazData] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  let refRoutedMap = useRef(null);
  const zoom = searchParams.get('zoom');
  const { routedMapRef } = useContext(TopicMapContext);

  const doubleMapClick = (event) => {
    const pos = proj4(
      proj4.defs('EPSG:4326') as unknown as string,
      proj4crs25832def,
      [event.latlng.lng, event.latlng.lat],
    );

    dispatch(
      getPlanFeatures({
        point: { x: pos[0], y: pos[1] },
        done: (hits) => {
          hits[0].selected = true;
          setFeatures(hits);
          setSelectedIndex(0);
        },
      }) as unknown as UnknownAction,
    );
  };

  const bplanSearchButtonHit = (event) => {
    dispatch(
      getPlanFeatures({
        boundingBox: boundingBox,
        done: (hits) => {
          hits[0].selected = true;
          setFeatures(hits);
          setSelectedIndex(0);
        },
      }) as unknown as UnknownAction,
    );
  };

  useEffect(() => {
    dispatch(loadBPlaene() as unknown as UnknownAction);
    getGazData(setGazData);
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
    <TopicMapComponent
      initialLoadingText="Laden der B-Plan-Daten"
      fullScreenControl
      pendingLoader={isLoading ? 1 : 0}
      locatorControl
      ref={refRoutedMap}
      gazetteerSearchControl={true}
      backgroundlayers={'uwBPlan|wupp-plan-live@20'}
      modalMenu={<Modal />}
      locationChangedHandler={(location) => {
        const newParams = { ...paramsToObject(searchParams), ...location };
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
      gazetteerSearchControlProps={{
        tertiaryAction: bplanSearchButtonHit,
        tertiaryActionIcon: faSearch,
        tertiaryActionTooltip: 'B-Pläne Suchen',
        teriaryActionDisabled: Number(zoom) < 14,
      }}
      gazetteerSearchPlaceholder="B-Plan-Nr. | Adresse | POI"
      gazetteerHitTrigger={(hits) => {
        if (
          hits !== undefined &&
          hits.length === 1 &&
          hits[0].type === 'bplaene'
        ) {
          const gazObject = hits[0];

          dispatch(
            getPlanFeatureByTitle(gazObject.string, (hit) => {
              const tmpHit = { ...hit };
              tmpHit.selected = true;
              setFeatures([tmpHit]);
              setSelectedIndex(0);

              const projectedFC = L.Proj.geoJson([tmpHit]);
              const bounds = projectedFC.getBounds();
              const map = routedMapRef?.leafletMap?.leafletElement;
              if (map === undefined) {
                return;
              }
              map.fitBounds(bounds);
            }) as unknown as UnknownAction,
          );
        }
      }}
      gazData={gazData}
    >
      <FeatureCollectionDisplayWithTooltipLabels
        featureCollection={features}
        style={bplanFeatureStyler}
        labeler={bplanLabeler}
      />
    </TopicMapComponent>
  );
};

export default Map;
