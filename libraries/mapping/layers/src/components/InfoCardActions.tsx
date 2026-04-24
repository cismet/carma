import { Button } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBan,
  faCircleMinus,
  faCirclePlus,
  faEdit,
  faExternalLink,
  faMap,
  faSave,
  faSquareUpRight,
  faStar,
  faTrash,
  faUpload,
} from "@fortawesome/free-solid-svg-icons";
import type { MouseEvent } from "react";

import { useAuth } from "@carma-providers/auth";

import type { Item } from "../lib/contracts/carma-layers.d";
import { resolveInfoCardActionState } from "../helper/info-card-actions";

interface InfoCardActionsProps {
  layer: Item;
  isActiveLayer: boolean;
  isFavorite: boolean;
  editCollection: boolean;
  loading: boolean;
  handleAddClick: (
    e: MouseEvent<HTMLElement, globalThis.MouseEvent>,
    preview?: boolean
  ) => void;
  handleFavoriteClick: (
    e: MouseEvent<HTMLButtonElement, globalThis.MouseEvent>
  ) => void;
  deleteCollection: () => void;
  setPreview: (preview: boolean) => void;
  onPublish: () => void;
  onEditOrSave: () => void;
  onCancelEdit: () => void;
}

const InfoCardActions = ({
  layer,
  isActiveLayer,
  isFavorite,
  editCollection,
  loading,
  handleAddClick,
  handleFavoriteClick,
  deleteCollection,
  setPreview,
  onPublish,
  onEditOrSave,
  onCancelEdit,
}: InfoCardActionsProps) => {
  const { jwt, userGroups } = useAuth();
  const { allowPublishing, canFavoriteItem, isDiscoverItem } =
    resolveInfoCardActionState({
      jwt,
      layer,
      userGroups,
    });

  return (
    <div className="flex flex-wrap items-center gap-4">
      {(layer.type === "layer" || layer.type === "object") && (
        <Button
          onClick={handleAddClick}
          icon={
            <FontAwesomeIcon
              icon={isActiveLayer ? faCircleMinus : faCirclePlus}
            />
          }
        >
          <span className="!hidden sm:!inline-block">
            {isActiveLayer ? "Entfernen" : "Hinzufügen"}
          </span>
        </Button>
      )}
      {layer.type === "collection" && (
        <>
          <Button
            onClick={handleAddClick}
            icon={<FontAwesomeIcon icon={faSquareUpRight} />}
          >
            <span className="!hidden sm:!inline-block">Laden</span>
          </Button>
          {!layer.serviceName.includes("discover") && (
            <Button
              onClick={deleteCollection}
              icon={<FontAwesomeIcon icon={faTrash} />}
            >
              <span className="!hidden sm:!inline-block">Löschen</span>
            </Button>
          )}
        </>
      )}
      {layer.serviceName === "measurements" && (
        <Button
          onClick={deleteCollection}
          icon={<FontAwesomeIcon icon={faTrash} />}
        >
          <span className="!hidden sm:!inline-block">Löschen</span>
        </Button>
      )}
      {layer.type === "link" && (
        <Button
          href={layer.url}
          target="_topicMaps"
          icon={<FontAwesomeIcon icon={faExternalLink} />}
        >
          <span className="!hidden sm:!inline-block">Öffnen</span>
        </Button>
      )}
      {canFavoriteItem && (
        <Button
          onClick={handleFavoriteClick}
          icon={<FontAwesomeIcon icon={faStar} />}
        >
          <span className="!hidden sm:!inline-block">
            {isFavorite ? "Favorit entfernen" : "Favorisieren"}
          </span>
        </Button>
      )}
      {allowPublishing && isDiscoverItem && (
        <>
          {layer.isDraft && (
            <Button
              icon={<FontAwesomeIcon icon={faUpload} />}
              onClick={onPublish}
            >
              Publizieren
            </Button>
          )}
          <Button
            onClick={onEditOrSave}
            icon={<FontAwesomeIcon icon={editCollection ? faSave : faEdit} />}
            loading={loading}
          >
            <span className="!hidden sm:!inline-block">
              {editCollection ? "Speichern" : "Bearbeiten"}
            </span>
          </Button>
          {editCollection ? (
            <Button
              icon={<FontAwesomeIcon icon={faBan} />}
              onClick={onCancelEdit}
            >
              Abbrechen
            </Button>
          ) : (
            <Button
              type="primary"
              danger
              icon={<FontAwesomeIcon icon={faTrash} />}
              onClick={() => deleteCollection()}
            >
              Löschen
            </Button>
          )}
        </>
      )}
      {layer.type === "layer" && (
        <Button
          onClick={(e) => {
            setPreview(true);
            handleAddClick(e, true);
          }}
          icon={<FontAwesomeIcon icon={faMap} />}
        >
          <span className="!hidden sm:!inline-block">Vorschau</span>
        </Button>
      )}
    </div>
  );
};

export default InfoCardActions;
