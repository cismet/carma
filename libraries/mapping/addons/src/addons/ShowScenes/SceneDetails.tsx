import type { DragEvent } from "react";

import { Button, Checkbox, Popconfirm, Select } from "antd";
import { faGripVertical, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { MappingConfigLayer } from "@carma-api";

import {
  layerTitle,
  type ShowScene,
  type ShowStory,
} from "@carma-mapping/show-remote";

import { DraftTextArea } from "./DraftInput";
import { IconButton } from "./IconButton";
import { sceneLayers } from "./scene-edit";

/**
 * What opens under a scene row: the story it is in, the text for the
 * presenter and its layers, ticked when the display gets them and draggable
 * to other scenes and stories. The highlights are one of the layers, see
 * `SpotHighlights`. Keeps no state of its
 * own; the panel's `Control` registers its children anew on every render.
 */
export const SceneDetails = ({
  scene,
  excluded,
  canApplyToAll,
  stories,
  onStory,
  onText,
  onExclude,
  onExclusionToAll,
  onRemoveLayer,
  onLayerDragStart,
  onLayerDragEnd,
}: {
  scene: ShowScene;
  excluded: ReadonlySet<string>;
  canApplyToAll: boolean;
  stories: readonly ShowStory[];
  /** into another story, as its last scene */
  onStory: (storyId: string) => void;
  onText: (text: string) => void;
  onExclude: (layerId: string, excluded: boolean) => void;
  onExclusionToAll: () => void;
  onRemoveLayer: (layerId: string) => void;
  /** a layer picked up, to be copied to where it is dropped */
  onLayerDragStart: (layer: MappingConfigLayer, event: DragEvent) => void;
  onLayerDragEnd: () => void;
}) => {
  const layers = sceneLayers(scene);

  return (
    <div className="mb-2 ml-8 flex flex-col gap-3 rounded bg-gray-50 p-3">
      {stories.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-600">
            Geschichte
          </span>
          <Select
            size="small"
            value={scene.story}
            options={stories.map(({ id, title }) => ({
              value: id,
              label: title || "(ohne Titel)",
            }))}
            onChange={onStory}
            className="flex-1"
          />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-gray-600">
          Text zur Szene
        </span>
        <DraftTextArea
          value={scene.text ?? ""}
          onValue={onText}
          autoSize={{ minRows: 2, maxRows: 8 }}
          placeholder="Was auf dem Handy zu dieser Szene steht"
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center">
          <span className="flex-1 text-xs font-semibold text-gray-600">
            Ebenen der Szene
          </span>
          <Popconfirm
            title="Diese Auswahl für alle Szenen übernehmen?"
            description="Gilt für die Ebenen dieser Szene, andere Ebenen bleiben, wie sie sind."
            okText="Übertragen"
            cancelText="Abbrechen"
            onConfirm={onExclusionToAll}
            disabled={!canApplyToAll}
          >
            <Button size="small" type="link" disabled={!canApplyToAll}>
              Auf alle Szenen übertragen
            </Button>
          </Popconfirm>
        </div>
        {layers.length === 0 ? (
          <span className="text-xs text-gray-500">
            Die Szene hat keine Ebenen.
          </span>
        ) : (
          <>
            <span className="text-xs text-gray-500">
              Angehakte Ebenen bekommt die Anzeige, die anderen bleiben nur am
              Desktop. Zum Kopieren auf eine andere Szene ziehen, auf den Kopf
              einer Geschichte (alle ihre Szenen) oder auf ihre Basisebenen.
            </span>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {layers.map((layer) => (
                // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- dragging is a pointer-only shortcut for copying
                <li
                  key={layer.id}
                  draggable
                  onDragStart={(event) => onLayerDragStart(layer, event)}
                  onDragEnd={onLayerDragEnd}
                  title="Ziehen, um die Ebene zu kopieren"
                  className="flex cursor-grab items-center gap-2"
                >
                  <FontAwesomeIcon
                    icon={faGripVertical}
                    className="text-gray-400"
                  />
                  <Checkbox
                    checked={!excluded.has(layer.id)}
                    onChange={(event) =>
                      onExclude(layer.id, !event.target.checked)
                    }
                  >
                    {layerTitle(layer)}
                  </Checkbox>
                  <span className="ml-auto">
                    <IconButton
                      title="Ebene aus der Szene entfernen"
                      icon={faXmark}
                      danger
                      onClick={() => onRemoveLayer(layer.id)}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
};
