import { faStar as regularFaStar } from '@fortawesome/free-regular-svg-icons';
import {
  faCircleInfo,
  faCircleMinus,
  faCirclePlus,
  faExternalLinkAlt,
  faMinus,
  faPlus,
  faSquareUpRight,
  faStar,
  faTrash,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Button, Modal, Spin } from 'antd';
import { useEffect, useState } from 'react';
import { InfoOutlined } from '@ant-design/icons';
import { Item, Layer } from '../helper/types';

interface LayerItemProps {
  setAdditionalLayers: any;
  layer: Item;
  thumbnails: any;
  setThumbnail: any;
  activeLayers: Layer[];
}

const LibItem = ({
  setAdditionalLayers,
  layer,
  thumbnails,
  setThumbnail,
  activeLayers,
}: LayerItemProps) => {
  const [hovered, setHovered] = useState(false);
  const [isFavourite, setIsFavourite] = useState(false);
  const [isActiveLayer, setIsActiveLayer] = useState(false);
  const [thumbUrl, setThumbUrl] = useState('');
  const [collectionImages, setCollectionImages] = useState<string[]>([]);
  const [openDeleteModal, setOpenDeleteModal] = useState(false);
  const title = layer.title;
  const description = layer.description;
  const tags =
    layer.type === 'collection'
      ? layer.layers.map((l) => l.title)
      : layer.type === 'link'
      ? layer.tags
      : layer?.tags?.slice(1);

  const name = layer.name;
  // @ts-ignore
  const service = layer.service;

  const box = layer.pictureBoundingBox || [];

  const thumbnail = thumbnails?.find(
    (element) => element?.name === name + '_' + service?.name
  );

  const url = `${
    service?.url
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

  const handleLayerClick = () => {
    setAdditionalLayers(layer);
  };

  useEffect(() => {
    let setActive = false;
    if (activeLayers.find((activeLayer) => activeLayer.id === layer.id)) {
      setActive = true;
    }
    setIsActiveLayer(setActive);
  }, [activeLayers]);

  useEffect(() => {
    const getImgUrl = async (response, url, onFinish?) => {
      const blob = await response.blob();
      const imgUrl = URL.createObjectURL(blob);
      let reader = new FileReader();
      let data;

      reader.readAsDataURL(blob);

      reader.onloadend = () => {
        data = reader.result;
        if (blob.size > 757) {
          setThumbnail({ data, name: name + '_' + service.name });
        }
      };
      if (onFinish) {
        onFinish(imgUrl);
      } else {
        setThumbUrl(imgUrl);
      }
    };

    const getCollectionImages = async (collection) => {
      const layers = collection.layers;
      let urls = [];
      let imgUrls: string[] = [];
      if (layers.length > 3) {
        urls = layers.slice(0, 4).map((layer) => {
          const thumbnail = thumbnails.find(
            (element) =>
              element?.name ===
              layer.other.name + '_' + layer.other.service?.name
          );

          if (thumbnail?.data) {
            imgUrls.push(thumbnail.data);
            return null;
          }

          return `${layer.props.url.slice(
            0,
            -1
          )}?service=WMS&request=GetMap&layers=${encodeURIComponent(
            layer.props.name
          )}&styles=&format=image%2Fpng&transparent=true&version=1.1.1&tiled=true&type=wms&cssFilter=undefined&width=512&height=341&srs=EPSG%3A3857&bbox=800903.8186576363,6669199.149176236,802126.8111101991,6670013.681258901`;
        });
      } else {
        urls = layers.map((layer) => {
          const thumbnail = thumbnails.find(
            (element) =>
              element?.name ===
              layer.other.name + '_' + layer.other.service?.name
          );

          if (thumbnail?.data) {
            imgUrls.push(thumbnail.data);
            return null;
          }

          return `${layer.props.url.slice(
            0,
            -1
          )}?service=WMS&request=GetMap&layers=${encodeURIComponent(
            layer.props.name
          )}&styles=&format=image%2Fpng&transparent=true&version=1.1.1&tiled=true&type=wms&cssFilter=undefined&width=512&height=341&srs=EPSG%3A3857&bbox=800903.8186576363,6669199.149176236,802126.8111101991,6670013.681258901`;
        });
      }
      urls.forEach(async (url) => {
        if (url) {
          const response = await fetch(url);

          getImgUrl(response, url, (imgUrl) => {
            imgUrls.push(imgUrl);
          });
        }
      });
      setIsLoading(false);
      setCollectionImages(imgUrls);
    };

    if (!layer.thumbnail) {
      if (layer.pictureBoundingBox) {
        if (thumbnail?.data) {
          setThumbUrl(thumbnail.data);
        } else {
          fetch(bboxUrl).then((response) => {
            getImgUrl(response, bboxUrl);
          });
        }
      } else {
        if (layer.type === 'collection') {
          getCollectionImages(layer);
        } else {
          if (thumbnail?.data) {
            setThumbUrl(thumbnail.data);
          } else {
            fetch(url).then((response) => {
              getImgUrl(response, url);
            });
          }
        }
      }
    }
  }, [name, layer.id]);

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

        {(thumbUrl && layer.type !== 'collection') || layer.thumbnail ? (
          <img
            src={layer.thumbnail ? layer.thumbnail : thumbUrl}
            alt={title}
            loading="lazy"
            className={`object-cover relative h-full overflow-clip w-[calc(130%+7.2px)] ${
              hovered && 'scale-110'
            } transition-all duration-200`}
            onLoad={(e) => {
              setIsLoading(false);
            }}
          />
        ) : layer.type === 'collection' ? (
          <div
            className={`overflow-clip ${
              collectionImages.length > 3
                ? 'grid grid-cols-2'
                : 'flex flex-col h-full'
            }`}
          >
            {collectionImages.map((imgUrl, i) => {
              return (
                <img
                  key={`collection_img_${i}`}
                  src={imgUrl}
                  alt={title}
                  loading="lazy"
                  className={`object-cover relative overflow-clip w-[calc(130%+7.2px)] ${
                    hovered && 'scale-110'
                  } transition-all duration-200`}
                />
              );
            })}
          </div>
        ) : (
          <div className="object-cover relative h-full overflow-clip w-[calc(130%+7.2px)]" />
        )}

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
        {layer.type === 'link' ? (
          <a
            className="absolute left-1 top-1 text-3xl cursor-pointer z-50 text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,1)]"
            href={layer.url}
            target="topicMaps"
          >
            <FontAwesomeIcon icon={faExternalLinkAlt} />
          </a>
        ) : layer.type === 'collection' ? (
          <>
            <FontAwesomeIcon
              onClick={handleLayerClick}
              icon={faSquareUpRight}
              className="absolute left-1 top-1 text-3xl cursor-pointer text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,1)] z-50"
            />
            <FontAwesomeIcon
              onClick={() => setOpenDeleteModal(true)}
              icon={faTrash}
              className="absolute left-1 top-11 text-3xl cursor-pointer text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,1)] z-50"
            />
          </>
        ) : (
          <FontAwesomeIcon
            onClick={handleLayerClick}
            icon={isActiveLayer ? faMinus : faPlus}
            className="absolute left-1 top-1 text-3xl cursor-pointer text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,1)] z-50"
          />
        )}
        <InfoOutlined className="absolute right-1 bottom-1 text-3xl cursor-pointer text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,1)] z-50" />
        {hovered && (
          <div className="flex flex-col items-center gap-2 absolute top-0 w-full h-full justify-center p-8 px-10">
            {layer.type === 'link' ? (
              <a
                className="w-36 bg-gray-100 hover:no-underline text-black hover:text-neutral-600 hover:bg-gray-50 rounded-md py-2 flex text-center items-center px-2"
                href={layer.url}
                target="topicMaps"
              >
                <>
                  <FontAwesomeIcon
                    icon={faExternalLinkAlt}
                    className="text-lg mr-2"
                  />
                  Öffnen
                </>
              </a>
            ) : layer.type === 'collection' ? (
              <>
                <button
                  className="w-36 bg-gray-100 hover:bg-gray-50 rounded-md py-2 flex text-center items-center px-2"
                  onClick={handleLayerClick}
                >
                  <FontAwesomeIcon
                    icon={faSquareUpRight}
                    className="text-lg mr-2"
                  />{' '}
                  Anwenden
                </button>
                <button
                  className="w-36 bg-gray-100 hover:bg-gray-50 rounded-md py-2 flex text-center items-center px-2"
                  onClick={() => setOpenDeleteModal(true)}
                >
                  <FontAwesomeIcon icon={faTrash} className="text-lg mr-2" />{' '}
                  Löschen
                </button>
              </>
            ) : (
              <button
                className="w-36 bg-gray-100 hover:bg-gray-50 rounded-md py-2 flex text-center items-center px-2"
                onClick={handleLayerClick}
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
            )}
            <button
              disabled
              className="w-36 flex text-center items-center px-2 bg-gray-100 hover:bg-gray-50 rounded-md py-2 cursor-not-allowed"
            >
              <FontAwesomeIcon icon={faCircleInfo} className="mr-2 text-lg" />
              Informationen
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 p-4">
        <h3 className="text-lg truncate">
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
        <p
          style={{ color: 'rgba(0,0,0,0.5)', fontSize: '0.875rem' }}
          className="mb-0 h-10 line-clamp-2"
        >
          {tags?.map((tag, i) => (
            <span key={'tag_' + tag + '_' + i}>
              <span>{tag}</span>
              {i + 1 < tags.length && <span> · </span>}
            </span>
          ))}
        </p>
      </div>
      <Modal
        footer={null}
        open={openDeleteModal}
        onCancel={() => setOpenDeleteModal(false)}
      >
        <div className="flex flex-col gap-2 p-4">
          <h3 className="text-lg">
            Zusammenstellung {title} wirklich löschen?
          </h3>
          <p className="text-base line-clamp-3 h-[66px]">
            Diese Aktion kann nicht rückgängig gemacht werden.
          </p>
          <div className="flex gap-2 w-full justify-end items-center">
            <Button onClick={() => setOpenDeleteModal(false)}>Abbrechen</Button>
            <Button
              danger
              onClick={() => {
                setOpenDeleteModal(false);
                setAdditionalLayers(layer, true);
              }}
            >
              Löschen
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default LibItem;
