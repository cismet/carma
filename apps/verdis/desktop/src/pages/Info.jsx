import React from 'react';
import Map from '../components/commons/Map';
import InfoTable from '../components/info/InfoTable';
import Chat from '../components/commons/Chat';
import InfoBar from '../components/commons/InfoBar';
import { useDispatch, useSelector } from 'react-redux';
import {
  getAlkisLandparcel,
  getKassenzeichen,
  searchForKassenzeichenWithPoint,
} from '../store/slices/search';

import {
  alkisLandparcelExtractor,
  geometryExtractor,
  mappingExtractor,
} from '../tools/extractors';
import {
  getBefreiungErlaubnisCollection,
  getFlaechenCollection,
  getFrontenCollection,
  getGeneralGeometryCollection,
} from '../store/slices/mapping';
import FeatureMapLayer from '../components/commons/FeatureMapLayer';
import { convertLatLngToXY } from '../tools/mappingTools';
import { useSearchParams } from 'react-router-dom';

const Page = ({
  width = '100%',
  height = '100%',
  inStory = false,
  showChat = false,
}) => {
  let storyStyle = {};
  if (inStory) {
    storyStyle = {
      borderStyle: 'dotted',
      borderWidth: '1px solid',
      padding: '10px',
    };
  }

  const cardStyle = { width: '100%', height: '100%', minHeight: 0 };
  const kassenzeichen = useSelector(getKassenzeichen);
  const alkisLandparcel = useSelector(getAlkisLandparcel);
  const flaechenArray = useSelector(getFlaechenCollection);
  const frontenArray = useSelector(getFrontenCollection);
  const generalGeomArray = useSelector(getGeneralGeometryCollection);

  const dispatch = useDispatch();
  const [urlParams, setUrlParams] = useSearchParams();

  const befreiungErlaubnisseArray = useSelector(
    getBefreiungErlaubnisCollection
  );

  return (
    <div
      style={{ ...storyStyle, width, height }}
      className="flex flex-col items-center relative h-full max-h-[calc(100vh-73px)]"
    >
      <div className="flex flex-col gap-2 w-full bg-zinc-100 h-full overflow-clip p-2">
        <InfoBar title="Info" className="py-1" />
        <div className="flex flex-col gap-2 h-full max-h-[calc(100%-40px)] overflow-clip">
          <div className="flex gap-2 h-[50%]">
            <InfoTable
              width={cardStyle.width}
              height={cardStyle.height}
              style={cardStyle}
              extractor={geometryExtractor}
            />
            <InfoTable
              width={cardStyle.width}
              height={cardStyle.height}
              style={cardStyle}
              title="Alkis Flurstücke"
              extractor={alkisLandparcelExtractor}
              dataIn={alkisLandparcel}
            />
          </div>

          <Map
            shownIn="info"
            width="100%"
            height="50%"
            dataIn={{
              kassenzeichen,
              flaechenArray,
              frontenArray,
              generalGeomArray,
              befreiungErlaubnisseArray,
              shownFeatureTypes: ['general'],
              ondblclick: (event) => {
                const xy = convertLatLngToXY(event.latlng);
                dispatch(
                  searchForKassenzeichenWithPoint(
                    xy[0],
                    xy[1],
                    urlParams,
                    setUrlParams
                  )
                );
              },
            }}
            extractor={mappingExtractor}
          >
            <FeatureMapLayer featureTypes={['general']} />
          </Map>
        </div>
      </div>
      {showChat && (
        <Chat
          style={{
            position: 'absolute',
            bottom: '10px',
            right: '10px',
            zIndex: 99999,
          }}
          height={height * 0.45}
          width={width * 0.2}
        />
      )}
    </div>
  );
};

export default Page;
