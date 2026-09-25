import { Button, Input } from "antd";

import type { OpenShow } from "./useOpenShow";

const scenesText = (count: number): string =>
  `${count} ${count === 1 ? "Szene" : "Szenen"}`;

/** the "Show öffnen" field of the panel, see `useOpenShow` */
export const OpenShowRow = ({
  input,
  setInput,
  canOpen,
  state,
  sceneCount,
  open,
  confirm,
  cancel,
}: OpenShow) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-center gap-2">
      <label htmlFor="show-scenes-open" className="w-24 text-gray-600">
        Show öffnen
      </label>
      <Input
        id="show-scenes-open"
        value={input}
        placeholder="Schlüssel oder Link der Show"
        onChange={(event) => setInput(event.target.value)}
        onPressEnter={open}
        allowClear
      />
      <Button
        onClick={open}
        disabled={!canOpen}
        loading={state.kind === "busy"}
      >
        Öffnen
      </Button>
    </div>
    {state.kind === "pending" && (
      <div className="flex items-center gap-2 rounded bg-amber-50 px-3 py-2">
        <span className="flex-1 text-gray-700">
          „{state.show.title}“ ({scenesText(state.show.scenes.length)}) ersetzt
          die {scenesText(sceneCount)} der Liste.
        </span>
        <Button size="small" onClick={cancel}>
          Abbrechen
        </Button>
        <Button size="small" type="primary" danger onClick={confirm}>
          Ersetzen
        </Button>
      </div>
    )}
    {state.kind === "error" && <p className="m-0 text-red-600">{state.text}</p>}
    {state.kind === "opened" && !state.canReplace && (
      <p className="m-0 text-gray-600">
        Geöffnet. Den bisherigen Link kann nur der Browser aktualisieren, der
        die Show veröffentlicht hat; von hier aus erzeugt „Veröffentlichen“
        einen neuen.
      </p>
    )}
  </div>
);
