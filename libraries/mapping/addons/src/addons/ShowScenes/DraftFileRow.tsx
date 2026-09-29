import { useRef } from "react";

import { Button } from "antd";
import { faDownload, faUpload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { scenesText } from "./scenes-text";
import type { DraftFile } from "./useDraftFile";

/** the "Datei" row of the panel, see `useDraftFile` */
export const DraftFileRow = ({
  state,
  sceneCount,
  save,
  load,
  confirm,
  cancel,
}: DraftFile) => {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="w-24 text-gray-600">Datei</span>
        <Button icon={<FontAwesomeIcon icon={faDownload} />} onClick={save}>
          Als JSON speichern
        </Button>
        <Button
          icon={<FontAwesomeIcon icon={faUpload} />}
          onClick={() => input.current?.click()}
        >
          JSON laden
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            // the same file can be picked again after a cancel
            event.target.value = "";
            if (file) {
              load(file);
            }
          }}
        />
      </div>
      {state.kind === "pending" && (
        <div className="flex items-center gap-2 rounded bg-amber-50 px-3 py-2">
          <span className="flex-1 text-gray-700">
            „{state.draft.title}“ ({scenesText(state.draft.scenes.length)}) aus
            „{state.fileName}“ ersetzt die {scenesText(sceneCount)} der Liste.
          </span>
          <Button size="small" onClick={cancel}>
            Abbrechen
          </Button>
          <Button size="small" type="primary" danger onClick={confirm}>
            Ersetzen
          </Button>
        </div>
      )}
      {state.kind === "error" && (
        <p className="m-0 text-red-600">{state.text}</p>
      )}
      {state.kind === "loaded" && (
        <p className="m-0 text-gray-600">„{state.fileName}“ geladen.</p>
      )}
    </div>
  );
};
