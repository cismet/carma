import { Button, Spin } from 'antd';
import { useState } from 'react';

interface LayerItemProps {
  setAdditionalLayers: any;
  layer: any;
}

const LibItem = ({ setAdditionalLayers, layer }: LayerItemProps) => {
  const [hovered, setHovered] = useState(false);
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

  return (
    <div
      className="flex flex-col rounded-lg w-full h-fit hover:shadow-md p-1"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onDoubleClick={(e) => {
          setAdditionalLayers({
            name,
            title,
            getMapUrl,
          });
          console.log(name);
        }}
        className="relative overflow-hidden isolate rounded-md flex justify-center items-center w-full aspect-[1.7777/1]"
      >
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
          className="object-cover h-full overflow-clip w-[calc(130%+7.2px)] hover:blur-sm"
          onLoad={(e) => {
            setIsLoading(false);
          }}
        />
        {/* <div className="absolute inset-0 bg-gray-200 opacity-0 hover:opacity-50 transition duration-150"></div> */}
        {hovered && (
          <div className="flex flex-col gap-2 absolute top-0 w-full">
            <Button>Add</Button>
            <Button>Delete</Button>
          </div>
        )}
      </button>
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
      <p className="text-md line-clamp-3" style={{ color: 'rgba(0,0,0,0.7)' }}>
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
  );
};

export default LibItem;
