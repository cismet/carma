import { Button, Checkbox, Input, Popconfirm, Select } from "antd";

import {
  layerTitle,
  type ShowScene,
  type ShowStory,
} from "@carma-mapping/show-remote";

import { sceneLayers } from "./scene-edit";

/**
 * What opens under a scene row: the story it is in, the text for the
 * presenter and the layers the display leaves out.
 * Keeps no state of its own; the panel's `Control` registers its children
 * anew on every render.
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
        <Input.TextArea
          value={scene.text ?? ""}
          onChange={(event) => onText(event.target.value)}
          autoSize={{ minRows: 2, maxRows: 8 }}
          placeholder="Was auf dem Handy zu dieser Szene steht"
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center">
          <span className="flex-1 text-xs font-semibold text-gray-600">
            Nicht in der Show
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
              Angehakte Ebenen bleiben am Desktop in der Szene, die Anzeige
              bekommt sie nicht.
            </span>
            {layers.map((layer) => (
              <Checkbox
                key={layer.id}
                checked={excluded.has(layer.id)}
                onChange={(event) => onExclude(layer.id, event.target.checked)}
              >
                {layerTitle(layer)}
              </Checkbox>
            ))}
          </>
        )}
      </div>
    </div>
  );
};
