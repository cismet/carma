import { useState, type FormEvent } from "react";

import {
  FADE_CHOICES,
  normalizeShowKey,
  type RemoteSettings,
} from "./settings";
import version from "../version.json";

const fadeLabel = (ms: number): string =>
  ms === 0 ? "Schnitt" : `${(ms / 1000).toLocaleString("de-DE")} s`;

type Props = {
  settings: RemoteSettings;
  onSave: (settings: RemoteSettings) => void;
  onCancel?: () => void;
};

const Field = ({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
  inputMode,
  autoCapitalize,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: "text" | "url";
  autoCapitalize?: "off" | "characters";
}) => (
  <div className="flex flex-col gap-1">
    <label htmlFor={id} className="text-sm font-medium text-neutral-300">
      {label}
    </label>
    <input
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      autoCapitalize={autoCapitalize ?? "off"}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      className="min-h-[48px] rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-base text-neutral-100 outline-none focus:border-amber-400"
    />
    <span className="text-xs text-neutral-500">{hint}</span>
  </div>
);

export const SettingsPanel = ({ settings, onSave, onCancel }: Props) => {
  const [relayBaseUrl, setRelayBaseUrl] = useState(settings.relayBaseUrl);
  const [code, setCode] = useState(settings.code);
  const [showKey, setShowKey] = useState(settings.showKey);
  const [fadeMs, setFadeMs] = useState(settings.fadeMs);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave({
      relayBaseUrl: relayBaseUrl.trim(),
      code: code.trim().toUpperCase(),
      showKey: normalizeShowKey(showKey),
      fadeMs,
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 p-4">
      <h1 className="m-0 text-xl font-semibold">Einstellungen</h1>
      <Field
        id="pm-remote-code"
        label="Sitzungscode"
        hint="Der Code, mit dem die Projektion gestartet wurde (?relay= im Outlet)."
        value={code}
        onChange={setCode}
        autoCapitalize="characters"
      />
      <Field
        id="pm-remote-show"
        label="Show"
        hint="Schlüssel oder Link aus „Veröffentlichen“ in pm-show."
        value={showKey}
        onChange={setShowKey}
        inputMode="url"
      />
      <Field
        id="pm-remote-relay"
        label="Relay"
        hint="Nur ändern, wenn die Projektion ein anderes Relay nutzt."
        value={relayBaseUrl}
        onChange={setRelayBaseUrl}
        inputMode="url"
        placeholder="https://…"
      />
      <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
        <legend className="mb-1 p-0 text-sm font-medium text-neutral-300">
          Übergang
        </legend>
        <div className="grid grid-cols-4 gap-2">
          {FADE_CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={fadeMs === choice}
              onClick={() => setFadeMs(choice)}
              className={`min-h-[48px] rounded-xl text-sm ${
                fadeMs === choice
                  ? "bg-neutral-100 font-semibold text-neutral-950"
                  : "bg-neutral-800 text-neutral-200 active:bg-neutral-700"
              }`}
            >
              {fadeLabel(choice)}
            </button>
          ))}
        </div>
        <span className="text-xs text-neutral-500">
          Wie lange der Wechsel zur nächsten Szene überblendet.
        </span>
      </fieldset>
      <div className="flex gap-3">
        <button
          type="submit"
          className="min-h-[52px] flex-1 rounded-xl bg-amber-400 text-base font-semibold text-neutral-950 active:bg-amber-300"
        >
          Übernehmen
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[52px] flex-1 rounded-xl bg-neutral-800 text-base text-neutral-100 active:bg-neutral-700"
          >
            Abbrechen
          </button>
        )}
      </div>
      <p className="m-0 text-xs text-neutral-600">Version {version.version}</p>
    </form>
  );
};
