import React, { useEffect } from 'react';
import Map from '../components/commons/Map';
import Chat from '../components/commons/Chat';
import Details from '../components/streetCleaning/Details';
import { frontsExtractor, mappingExtractor } from '../tools/extractors';
import TableCard from '../components/ui/TableCard';
import { compare } from '../tools/helper';
import {
  getFrontenId,
  getKassenzeichen,
  searchForKassenzeichenWithPoint,
  storeFront,
  storeFrontenId,
} from '../store/slices/search';
import { useDispatch, useSelector } from 'react-redux';
import SubNav from '../components/streetCleaning/SubNav';
import {
  getBefreiungErlaubnisCollection,
  getFlaechenCollection,
  getFrontenCollection,
  getGeneralGeometryCollection,
  setFrontenSelected,
} from '../store/slices/mapping';
import { setShowFrontDetails } from '../store/slices/settings';
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
  const dispatch = useDispatch();
  const [urlParams, setUrlParams] = useSearchParams();
  const frontenId = useSelector(getFrontenId);

  const cardStyleFronts = { width: '50%', height: '100%', minHeight: 0 };
  const cardStyleDetails = { width: '100%', height: '50%', minHeight: 0 };
  const kassenzeichen = useSelector(getKassenzeichen);
  const flaechenArray = useSelector(getFlaechenCollection);
  const frontenArray = useSelector(getFrontenCollection);
  const generalGeomArray = useSelector(getGeneralGeometryCollection);

  const befreiungErlaubnisseArray = useSelector(
    getBefreiungErlaubnisCollection
  );
  useEffect(() => {
    dispatch(setShowFrontDetails(true));
  }, []);
  useFitBoundsIfUnlocked();
  return (
    <div
      style={{ ...storyStyle, width, height }}
      className="flex flex-col items-center relative h-full max-h-[calc(100vh-73px)]"
    >
      <div className="flex flex-col gap-2 w-full bg-zinc-100 h-full overflow-clip p-2">
        <SubNav />
        <div className="flex gap-2 h-full max-h-[calc(100%-40px)]">
          <TableCard
            width={cardStyleFronts.width}
            height={cardStyleFronts.height}
            style={cardStyleFronts}
            title="Fronten"
            columns={[
              {
                title: 'Nummer',
                dataIndex: 'nummer',
                key: 'nummer',
                sorter: (a, b) => compare(a.nummer, b.nummer),
                defaultSortOrder: 'ascend',
              },
              {
                title: 'Länge in m',
                dataIndex: 'laengeKorrektur',
                key: 'laengeKorrektur',
                sorter: (a, b) => compare(a.laengeKorrektur, b.laengeKorrektur),
              },
              {
                title: 'Klasse',
                dataIndex: 'klasse',
                key: 'klasse',
                sorter: (a, b) => compare(a.klasse, b.klasse),
              },
            ]}
            id={frontenId}
            onRowClick={(record) => (
              dispatch(storeFront(record)),
              dispatch(storeFrontenId(record.id)),
              dispatch(setFrontenSelected({ id: record.id }))
            )}
            extractor={frontsExtractor}
          />
          <div className="flex flex-col gap-2 h-full w-[60%]">
            <Details
              width={cardStyleDetails.width}
              height={cardStyleDetails.height}
              style={cardStyleDetails}
              extractor={frontsExtractor}
            />

            <Map
              shownIn="streetCleaning.details"
              key="streetCleaningDetails.map"
              width={'100%'}
              height={'50%'}
              dataIn={{
                kassenzeichen,
                flaechenArray,
                frontenArray,
                generalGeomArray,
                befreiungErlaubnisseArray,
                shownFeatureTypes: ['front'],
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
              <FeatureMapLayer featureTypes={['front']} />
            </Map>
          </div>
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
