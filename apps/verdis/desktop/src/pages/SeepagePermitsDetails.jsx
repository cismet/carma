import React, { useEffect } from 'react';
import Map from '../components/commons/Map';
import { Checkbox } from 'antd';
import Chat from '../components/commons/Chat';
import Details from '../components/seepagePermits/Details';
import { exemptionExtractor, mappingExtractor } from '../tools/extractors';
import TableCard from '../components/ui/TableCard';
import { compare, formatDate } from '../tools/helper';
import SubNav from '../components/seepagePermits/SubNav';
import { useDispatch, useSelector } from 'react-redux';
import {
  getKassenzeichen,
  getSeepageId,
  searchForKassenzeichenWithPoint,
  storeSeepage,
  storeSeepageId,
} from '../store/slices/search';
import {
  getBefreiungErlaubnisCollection,
  getFlaechenCollection,
  getFrontenCollection,
  getGeneralGeometryCollection,
} from '../store/slices/mapping';
import { setShowSeepageDetails } from '../store/slices/settings';
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
  const seepageId = useSelector(getSeepageId);

  const cardStylePermits = { width: '100%', height: '50%', minHeight: 0 };
  const cardStyleDetails = { width: '100%', height: '100%', minHeight: 0 };

  const kassenzeichen = useSelector(getKassenzeichen);
  const flaechenArray = useSelector(getFlaechenCollection);
  const frontenArray = useSelector(getFrontenCollection);
  const generalGeomArray = useSelector(getGeneralGeometryCollection);
  const befreiungErlaubnisseArray = useSelector(
    getBefreiungErlaubnisCollection
  );

  useEffect(() => {
    dispatch(setShowSeepageDetails(true));
  }, []);
  useFitBoundsIfUnlocked();
  return (
    <div
      style={{ ...storyStyle, width, height }}
      className="flex flex-col items-center relative h-full max-h-[calc(100vh-73px)]"
    >
      <div className="flex flex-col gap-2 w-full bg-zinc-100 h-full overflow-clip p-2">
        <SubNav />
        <div className="flex flex-col gap-2 h-full max-h-[calc(100%-40px)]">
          <TableCard
            width={cardStylePermits.width}
            height={cardStylePermits.height}
            style={cardStylePermits}
            title="Befreiung/Erlaubnis"
            columns={[
              {
                title: 'Aktenzeichen',
                dataIndex: 'name',
                key: 'name',
                sorter: (a, b) => compare(a.name, b.name),
              },
              {
                title: 'Antrag vom',
                dataIndex: 'seepageFrom',
                key: 'seepageFrom',
                sorter: (a, b) => compare(a.seepageFrom, b.seepageFrom),
                render: (date) => <>{formatDate(date)}</>,
              },
              {
                title: 'gültig bis',
                dataIndex: 'seepageUntil',
                key: 'seepageUntil',
                sorter: (a, b) => compare(a.seepageUntil, b.seepageUntil),
                render: (date) => <>{formatDate(date)}</>,
              },
              {
                title: 'Nutzung',
                dataIndex: 'useCase',
                key: 'useCase',
                sorter: (a, b) => compare(a.useCase, b.useCase),
              },
              {
                title: 'Typ',
                dataIndex: 'type',
                key: 'type',
                sorter: (a, b) => compare(a.type, b.type),
              },
              {
                title: 'Q[l/s]',
                dataIndex: 'seepage',
                key: 'seepage',
                sorter: (a, b) => compare(a.seepage, b.seepage),
              },
              {
                title: 'G-Verh',
                dataIndex: 'gVerh',
                key: 'gVerh',
                sorter: (a, b) => compare(a.gVerh, b.gVerh),
                render: (gVerth) => (
                  <Checkbox checked={gVerth} className="flex justify-center" />
                ),
              },
            ]}
            id={seepageId}
            onRowClick={(record) => (
              dispatch(storeSeepage(record)),
              dispatch(storeSeepageId(record.id))
            )}
            extractor={exemptionExtractor}
          />
          <div className="flex gap-2 h-[50%]">
            <Map
              shownIn="seepagePermits.details"
              key={'seepagePermitsDetails.map'}
              width={'100%'}
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
            <Details
              width={cardStyleDetails.width}
              height={cardStyleDetails.height}
              style={cardStyleDetails}
            />
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
