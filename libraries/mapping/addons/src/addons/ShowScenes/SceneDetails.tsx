import type { DragEvent } from "react";

import { Button, Checkbox, Popconfirm, Select } from "antd";
import {
  faGripVertical,
  faMinus,
  faPlus,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { MappingConfigLayer } from "@carma-api";

import {
  HIGHLIGHT_DIM_RANGE,
  HIGHLIGHT_RADIUS_RANGE_METERS,
  layerTitle,
  type ShowHighlight,
  type ShowScene,
  type ShowStory,
} from "@carma-mapping/show-remote";

import { DraftInput, DraftSlider, DraftTextArea } from "./DraftInput";
import { IconButton } from "./IconButton";
import { sceneLayers } from "./scene-edit";

/**
 * The scene's stored highlights: one row per spot with the name its button
 * gets on the phone, its size and how dark the rest goes. "+" waits for a
 * click on the map, where the new spot goes.
 */
const HighlightList = ({
  highlights,
  isPlacing,
  onStartPlacing,
  onCancelPlacing,
  onChange,
  onRemove,
}: {
  highlights: readonly ShowHighlight[];
  isPlacing: boolean;
  onStartPlacing: () => void;
  onCancelPlacing: () => void;
  onChange: (id: string, change: Partial<ShowHighlight>) => void;
  onRemove: (id: string) => void;
}) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center gap-2">
      <span className="flex-1 text-xs font-semibold text-gray-600">
        Hervorhebungen
      </span>
      {isPlacing ? (
        <Button size="small" onClick={onCancelPlacing}>
          Abbrechen
        </Button>
      ) : (
        <Button
          size="small"
          icon={<FontAwesomeIcon icon={faPlus} />}
          onClick={onStartPlacing}
        >
          Setzen
        </Button>
      )}
    </div>
    <span
      className={`text-xs ${isPlacing ? "text-amber-700" : "text-gray-500"}`}
    >
      {isPlacing
        ? "Klick in die Karte setzt die Hervorhebung dorthin. Esc bricht ab."
        : highlights.length === 0
        ? "Lichtkegel wie beim Zeiger, fest an einer Stelle. Auf dem Handy bekommt jede einen eigenen Knopf."
        : "Auf dem Handy bekommt jede einen eigenen Knopf; beim Szenenwechsel sind alle aus."}
    </span>
    {highlights.map((highlight) => (
      <div
        key={highlight.id}
        className="flex flex-col gap-1 rounded border border-solid border-gray-200 bg-white p-2"
      >
        <div className="flex items-center gap-2">
          <DraftInput
            size="small"
            value={highlight.title}
            onValue={(title) => onChange(highlight.id, { title })}
            placeholder="Name des Knopfs"
            className="flex-1"
          />
          <IconButton
            title="Hervorhebung entfernen"
            icon={faMinus}
            danger
            onClick={() => onRemove(highlight.id)}
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span className="w-16">Größe</span>
          <DraftSlider
            min={HIGHLIGHT_RADIUS_RANGE_METERS[0]}
            max={HIGHLIGHT_RADIUS_RANGE_METERS[1]}
            step={5}
            value={highlight.radiusMeters}
            onValue={(radiusMeters) => onChange(highlight.id, { radiusMeters })}
            tooltip={{ formatter: (value) => `${value ?? ""} m` }}
            className="m-0 flex-1"
          />
          <span className="w-12 text-right tabular-nums">
            {Math.round(highlight.radiusMeters)} m
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span className="w-16">Abdunkeln</span>
          <DraftSlider
            min={HIGHLIGHT_DIM_RANGE[0]}
            max={HIGHLIGHT_DIM_RANGE[1]}
            step={0.05}
            value={highlight.dim}
            onValue={(dim) => onChange(highlight.id, { dim })}
            tooltip={{
              formatter: (value) => `${Math.round((value ?? 0) * 100)} %`,
            }}
            className="m-0 flex-1"
          />
          <span className="w-12 text-right tabular-nums">
            {Math.round(highlight.dim * 100)} %
          </span>
        </div>
      </div>
    ))}
  </div>
);

/**
 * What opens under a scene row: the story it is in, the text for the
 * presenter, its stored highlights and its layers, ticked when the display
 * gets them and draggable to other scenes and stories. Keeps no state of its
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
  highlights,
  isPlacingHighlight,
  onStartPlacingHighlight,
  onCancelPlacingHighlight,
  onHighlightChange,
  onHighlightRemove,
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
  highlights: readonly ShowHighlight[];
  isPlacingHighlight: boolean;
  onStartPlacingHighlight: () => void;
  onCancelPlacingHighlight: () => void;
  onHighlightChange: (id: string, change: Partial<ShowHighlight>) => void;
  onHighlightRemove: (id: string) => void;
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

      <HighlightList
        highlights={highlights}
        isPlacing={isPlacingHighlight}
        onStartPlacing={onStartPlacingHighlight}
        onCancelPlacing={onCancelPlacingHighlight}
        onChange={onHighlightChange}
        onRemove={onHighlightRemove}
      />

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
