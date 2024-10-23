import React from 'react';
import Map from '../components/commons/Map';
import SewerConnection from '../components/seepagePermits/SewerConnection';
import FileNumber from '../components/seepagePermits/FileNumber';
import Chat from '../components/commons/Chat';
import {
  fileNumberExtractor,
  mappingExtractor,
  sewerConnectionExtractor,
} from '../tools/extractors';
import SubNav from '../components/seepagePermits/SubNav';
import {
  getKassenzeichen,
  searchForKassenzeichenWithPoint,
} from '../store/slices/search';
import { useDispatch, useSelector } from 'react-redux';
import {
  getBefreiungErlaubnisCollection,
  getFlaechenCollection,
  getFrontenCollection,
  getGeneralGeometryCollection,
} from '../store/slices/mapping';
import FeatureMapLayer from '../components/commons/FeatureMapLayer';
import { useFitBoundsIfUnlocked } from '../hooks/useFitBoundsIfUnlocked';
import { useSearchParams } from 'react-router-dom';
import { convertLatLngToXY } from '../tools/mappingTools';

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

  const cardStyleConnection = { width: '100%', height: '65%', minHeight: 0 };
  const cardStyleFileNumber = { width: '100%', height: '100%', minHeight: 0 };

  const kassenzeichen = useSelector(getKassenzeichen);
  const flaechenArray = useSelector(getFlaechenCollection);
  const frontenArray = useSelector(getFrontenCollection);
  const generalGeomArray = useSelector(getGeneralGeometryCollection);
  const befreiungErlaubnisseArray = useSelector(
    getBefreiungErlaubnisCollection
  );

  const dispatch = useDispatch();
  const [urlParams, setUrlParams] = useSearchParams();

  useFitBoundsIfUnlocked();
  return (
    <div
      style={{ ...storyStyle, width, height }}
      className="flex flex-col items-center relative h-full max-h-[calc(100vh-73px)]"
    >
      <div className="flex flex-col gap-2 w-full bg-zinc-100 h-full overflow-clip p-2">
        <SubNav />
        <div className="flex gap-2 h-full max-h-[calc(100%-40px)]">
          <div className="flex flex-col gap-2 h-full w-[30%]">
            <SewerConnection
              width={cardStyleConnection.width}
              height={cardStyleConnection.height}
              style={cardStyleConnection}
              extractor={sewerConnectionExtractor}
            />
            <FileNumber
              width={cardStyleFileNumber.width}
              height={cardStyleFileNumber.height}
              style={cardStyleFileNumber}
              extractor={fileNumberExtractor}
            />
          </div>
          <Map
            shownIn="seepagePermits"
            key={'seepagePermits.map'}
            width={'80%'}
            height={'100%'}
            dataIn={{
              kassenzeichen,
              flaechenArray,
              frontenArray,
              generalGeomArray,
              befreiungErlaubnisseArray,
              shownFeatureTypes: ['befreiung'],
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
