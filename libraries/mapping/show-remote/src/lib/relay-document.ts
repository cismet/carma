/**
 * What a relay session holds and who writes it.
 *
 * A writer puts what every display shows under `"*"` and what only some show
 * under their target tags: `{ "*": {...}, "outlet": {...}, "geoportal": {...} }`.
 * A display applies `"*"` and then each of its own tags (`resolveTargets`), so
 * displays never see the tags a writer resolved. Keys starting with `_` are the
 * writer's metadata, such as who presents (`_presenter`), and reach no display.
 *
 * One writer per session, since every write replaces the whole state: the
 * presenter (pm-remote) writes `<CODE>`, a geoportal following the show
 * writes `<CODE>-G`.
 */

import type { RelayTarget } from "./relay-client";

/** the section every display applies */
export const SHARED_TARGET = "*";

/** target tags pm-show offers per layer; displays may carry others */
export const KNOWN_TARGETS = ["outlet", "geoportal"] as const;
export type KnownTarget = (typeof KNOWN_TARGETS)[number];

/** lowercase letters, digits and `-`, which leaves out `*` and `_` keys */
export const isTargetTag = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9-]+$/.test(value);

/** the suffix of each writer's session behind the show's code */
export const RELAY_WRITERS = {
  presenter: "",
  geoportal: "-G",
} as const;
export type RelayWriter = keyof typeof RELAY_WRITERS;

export const isRelayWriter = (value: unknown): value is RelayWriter =>
  typeof value === "string" && Object.hasOwn(RELAY_WRITERS, value);

export const writerSessionCode = (code: string, writer: RelayWriter): string =>
  `${code.trim().toUpperCase()}${RELAY_WRITERS[writer]}`;

export const writerTarget = (
  target: RelayTarget,
  writer: RelayWriter
): RelayTarget => ({
  baseUrl: target.baseUrl,
  code: writerSessionCode(target.code, writer),
});

type Section = Record<string, unknown>;

const isSection = (value: unknown): value is Section =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isMetaKey = (key: string): boolean => key.startsWith("_");

/**
 * The state a display with `tags` applies: `"*"`, then each tag's section on
 * top of it, left to right. A section replaces whole top-level keys, so a
 * target's `config` replaces the shared one entirely, and `null` switches a
 * key off for that display. A document without `"*"` comes from a writer
 * that knows no targets and counts as entirely shared. `null` for a session
 * nobody wrote to, or one that holds no object.
 */
export const resolveTargets = (
  doc: unknown,
  tags: readonly string[]
): Section | null => {
  if (!isSection(doc)) {
    return null;
  }
  const resolved: Section = {};
  const apply = (section: unknown) => {
    if (!isSection(section)) {
      return;
    }
    for (const [key, value] of Object.entries(section)) {
      if (isMetaKey(key)) {
        continue;
      }
      if (value === null) {
        delete resolved[key];
      } else {
        resolved[key] = value;
      }
    }
  };
  if (!Object.hasOwn(doc, SHARED_TARGET)) {
    apply(doc);
    return resolved;
  }
  apply(doc[SHARED_TARGET]);
  for (const tag of tags) {
    if (isTargetTag(tag)) {
      apply(doc[tag]);
    }
  }
  return resolved;
};

/** whoever presents holds the show; pm-remote enforces it, the relay does not */
export const PRESENTER_KEY = "_presenter";

export type Presenter = {
  /** typed once on the phone */
  name: string;
  /** random per device, so two phones with one name stay apart */
  device: string;
};

export const isPresenter = (value: unknown): value is Presenter =>
  isSection(value) &&
  typeof value["name"] === "string" &&
  value["name"].trim() !== "" &&
  typeof value["device"] === "string" &&
  value["device"] !== "";

/** who presents according to a presenter session's document, if anybody */
export const presenterOf = (doc: unknown): Presenter | null => {
  const value = isSection(doc) ? doc[PRESENTER_KEY] : undefined;
  return isPresenter(value)
    ? { name: value.name.trim(), device: value.device }
    : null;
};

/** `free` while nobody presents, `self` for this device, `other` for anyone else */
export type PresenterRole = "free" | "self" | "other";

export const presenterRole = (doc: unknown, device: string): PresenterRole => {
  const presenter = presenterOf(doc);
  if (!presenter) {
    return "free";
  }
  return presenter.device === device ? "self" : "other";
};

/**
 * The document with `presenter` holding it. Taking over rewrites the current
 * document like this, so the state and who holds it change in one version.
 */
export const withPresenter = (doc: unknown, presenter: Presenter): Section => ({
  ...(isSection(doc) ? doc : { [SHARED_TARGET]: {} }),
  [PRESENTER_KEY]: { name: presenter.name.trim(), device: presenter.device },
});

export const newPresenterDevice = (): string => {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
};
