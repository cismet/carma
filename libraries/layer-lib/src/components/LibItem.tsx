import { faStar as regularFaStar } from '@fortawesome/free-regular-svg-icons';
import {
  faCircleInfo,
  faCircleMinus,
  faCirclePlus,
  faMinus,
  faPlus,
  faStar,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Button, Spin } from 'antd';
import { useContext, useEffect, useState } from 'react';
// @ts-ignore
import { TopicMapStylingContext } from 'react-cismap/contexts/TopicMapStylingContextProvider';
import { InfoOutlined } from '@ant-design/icons';

interface LayerItemProps {
  setAdditionalLayers: any;
  layer: any;
}

const LibItem = ({ setAdditionalLayers, layer }: LayerItemProps) => {
  const [hovered, setHovered] = useState(false);
  const [isFavourite, setIsFavourite] = useState(false);
  const [isActiveLayer, setIsActiveLayer] = useState(false);
  // @ts-ignore
  const { additionalLayerConfiguration } = useContext(TopicMapStylingContext);
  const title = layer.Title;
  const description = layer.Abstract;
  const tags = layer.tags.slice(1);
  const name = layer.Name;
  const bbox = layer.BoundingBox;
  const getMapUrl = layer.url;
  const highlight = layer.highlight;
  const service = layer.service;

  const box = layer.pictureBoundingBox;

  const url = `${
    service.url
  }?service=WMS&request=GetMap&layers=${encodeURIComponent(
    name
  )}&styles=&format=image%2Fpng&transparent=true&version=1.1.1&tiled=true&type=wms&cssFilter=undefined&width=512&height=341&srs=EPSG%3A3857&bbox=800903.8186576363,6669199.149176236,802126.8111101991,6670013.681258901`;
  let bboxUrl = '';
  if (layer.pictureBoundingBox) {
    bboxUrl = `${
      service.url
    }?service=WMS&request=GetMap&layers=${encodeURIComponent(
      name
    )}&styles=&format=image%2Fpng&transparent=true&version=1.1.1&tiled=true&type=wms&cssFilter=undefined&width=512&height=341&srs=EPSG%3A3857&bbox=${
      box[0]
    },${box[1]},${box[2]},${box[3]}`;
  }

  const regex = /Inhalt:(.*?)Sichtbarkeit:/s;

  const match = description?.match(regex);

  const [isLoading, setIsLoading] = useState(true);

  const hightlightTextIndexes = undefined;

  useEffect(() => {
    let setActive = false;
    for (let keys in additionalLayerConfiguration) {
      if (
        keys === name &&
        additionalLayerConfiguration[keys].url === service.url
      ) {
        setActive = true;
      }
    }
    setIsActiveLayer(setActive);
  }, [additionalLayerConfiguration]);

  return (
    <div
      className="flex flex-col rounded-lg w-full shadow-sm h-fit hover:!shadow-lg bg-white"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative overflow-hidden isolate rounded-md flex justify-center items-center w-full aspect-[1.7777/1]">
        {isLoading && (
          <div style={{ position: 'absolute', left: '50%' }}>
            <Spin />
          </div>
        )}

        <img
          src={
            layer.thumbnail
              ? layer.thumbnail
              : layer.pictureBoundingBox
              ? bboxUrl
              : url
          }
          alt={title}
          loading="lazy"
          className={`object-cover relative h-full overflow-clip w-[calc(130%+7.2px)] ${
            hovered && 'scale-110'
          } transition-all duration-200`}
          onLoad={(e) => {
            setIsLoading(false);
          }}
        />

        {isFavourite ? (
          <FontAwesomeIcon
            className="absolute right-1 top-1 text-3xl text-yellow-200 cursor-pointer z-50"
            icon={faStar}
            onClick={() => setIsFavourite(false)}
          />
        ) : (
          <FontAwesomeIcon
            className="absolute right-1 top-1 text-3xl cursor-pointer z-50 text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,1)]"
            icon={regularFaStar}
            onClick={() => setIsFavourite(true)}
          />
          // <StarOutlined className="absolute right-1 top-1 text-3xl text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,0.9)]" />
        )}
        <FontAwesomeIcon
          onClick={() => {
            setAdditionalLayers({
              name,
              title,
              url: service.url,
            });
          }}
          icon={isActiveLayer ? faMinus : faPlus}
          className="absolute left-1 top-1 text-3xl cursor-pointer text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,1)] z-50"
        />
        <InfoOutlined className="absolute right-1 bottom-1 text-3xl cursor-pointer text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,1)] z-50" />
        {hovered && (
          <div className="flex flex-col items-center gap-2 absolute top-0 w-full h-full justify-center p-8 px-10">
            <button
              className="w-1/3 bg-gray-100 hover:bg-gray-50 rounded-md py-2 flex text-center items-center px-2"
              onClick={() => {
                setAdditionalLayers({
                  name,
                  title,
                  url: service.url,
                });
              }}
            >
              {isActiveLayer ? (
                <>
                  <FontAwesomeIcon
                    icon={faCircleMinus}
                    className="text-lg mr-2"
                  />{' '}
                  Entfernen
                </>
              ) : (
                <>
                  <FontAwesomeIcon
                    icon={faCirclePlus}
                    className="text-lg mr-2"
                  />{' '}
                  Hinzufügen
                </>
              )}
            </button>
            <button
              disabled
              className="w-1/3 flex text-center items-center px-2 bg-gray-100 hover:bg-gray-50 rounded-md py-2 cursor-not-allowed"
            >
              <FontAwesomeIcon icon={faCircleInfo} className="mr-2 text-lg" />
              Informationen
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 p-4">
        <h3 className="text-lg">
          {hightlightTextIndexes ? (
            <>
              {title.substring(0, hightlightTextIndexes[0])}
              <span
                style={{
                  backgroundColor: 'rgba(240, 215, 139, 0.8)',
                  padding: '0 0.08em',
                }}
              >
                {title.substring(
                  hightlightTextIndexes[0],
                  hightlightTextIndexes[1] + 1
                )}
              </span>

              {title.substring(hightlightTextIndexes[1] + 1)}
            </>
          ) : (
            title
          )}
        </h3>
        <p
          className="text-base line-clamp-3 h-[66px]"
          style={{ color: 'rgba(0,0,0,0.7)' }}
        >
          {match && match.length > 1 ? match[1].trim() : description}
        </p>
        <p style={{ color: 'rgba(0,0,0,0.5)', fontSize: '0.875rem' }}>
          {tags?.map((tag, i) => (
            <span key={'tag_' + tag + '_' + i}>
              <span>{tag}</span>
              {i + 1 < tags.length && <span> · </span>}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
};

export default LibItem;
