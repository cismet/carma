import { Button } from "antd";
import { parseDescription } from "../helper/layerHelper";
import { Item } from "../helper/types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleMinus,
  faCirclePlus,
  faImage,
  faMap,
  faStar,
  faX,
} from "@fortawesome/free-solid-svg-icons";

interface InfoCardProps {
  layer: Item;
  isFavorite: boolean;
  isActiveLayer: boolean;
  handleAddClick: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  handleFavoriteClick: (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => void;
  closeInfoCard: () => void;
}

const InfoCard = ({
  layer,
  isFavorite,
  isActiveLayer,
  handleAddClick,
  handleFavoriteClick,
  closeInfoCard,
}: InfoCardProps) => {
  const { title, description, tags } = layer;
  const legends = layer.props.Style[0].LegendURL;
  const parsedDescription = parseDescription(description);

  return (
    <div className="w-full h-[400px] p-6 shadow-sm hover:!shadow-lg rounded-lg bg-blue-50 col-span-full">
      <div className="flex h-full flex-col justify-between">
        <div className="flex pb-4 gap-4 items-center w-full justify-between">
          <div className="flex w-max overflow-hidden gap-4 items-center">
            <h3 className="mb-0 truncate leading-10">{title}</h3>
            <div className="flex items-center gap-4">
              <Button
                onClick={handleAddClick}
                icon={
                  <FontAwesomeIcon
                    icon={isActiveLayer ? faCircleMinus : faCirclePlus}
                  />
                }
              >
                {isActiveLayer ? "Entfernen" : "Hinzufügen"}
              </Button>
              <Button
                onClick={handleFavoriteClick}
                icon={<FontAwesomeIcon icon={faStar} />}
              >
                {isFavorite ? "Favorit entfernen" : "Favorisieren"}
              </Button>
              <Button icon={<FontAwesomeIcon icon={faMap} />}>Vorschau</Button>
            </div>
          </div>
          <button
            onClick={closeInfoCard}
            className="text-gray-600 hover:text-gray-500 flex items-center justify-center py-0.5 px-1"
          >
            <FontAwesomeIcon icon={faX} />
          </button>
        </div>
        <div className="flex gap-2 w-full h-full overflow-hidden">
          <div className="w-full flex flex-col justify-between overflow-auto">
            <div>
              <h5 className="font-semibold text-lg">Inhalt</h5>
              <p className="text-base text-gray-600">
                {parsedDescription.inhalt}
              </p>
              <h5 className="font-semibold text-lg">Sichtbarkeit</h5>
              <p className="text-base text-gray-600">
                {parsedDescription.sichtbarkeit.slice(0, -1)}
              </p>
              <h5 className="font-semibold text-lg">Nutzung</h5>
              <p className="text-base text-gray-600">
                {parsedDescription.nutzung}
              </p>
            </div>
            <p
              style={{ color: "rgba(0,0,0,0.5)", fontSize: "0.875rem" }}
              className="mb-0"
            >
              {tags?.map((tag, i) => (
                <span key={"tag_" + tag + "_" + i}>
                  <span>{tag}</span>
                  {i + 1 < tags.length && <span> · </span>}
                </span>
              ))}
            </p>
          </div>
          <div className="h-full w-0 border-r border-gray-300 my-0" />
          <div className="flex flex-col gap-0 w-1/4">
            <h5 className="font-semibold text-lg">Links:</h5>
            <a
              href="https://maps.wuppertal.de/karten?service=WMS&request=GetCapabilities&version=1.1.1"
              target="_blank"
              className="pb-2"
            >
              GetCapabilities
            </a>
            <a
              href={
                "https://offenedaten-wuppertal.de/dataset/interessante-orte-poi-wuppertal"
              }
              target="_blank"
            >
              Open Data
            </a>
          </div>
          <div className="h-full w-0 border-r border-gray-300 my-0" />
          <div className="flex flex-col gap-0 w-1/4">
            <h5 className="font-semibold text-lg">Legende:</h5>
            <div className="h-full overflow-auto">
              {legends?.map((legend, i) => (
                <img
                  key={`legend_${i}`}
                  src={legend.OnlineResource}
                  alt="Legende"
                  className="h-fit"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InfoCard;
