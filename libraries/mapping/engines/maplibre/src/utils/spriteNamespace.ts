/**
 * Sprite namespacing for vector sub-styles.
 *
 * Every vector style that is merged into the map gets its sprite(s) registered
 * under an id derived from the sprite URL, and every image reference in its
 * layers (`icon-image`, `fill-pattern`, `line-pattern`) is rewritten to
 * `<registeredId>:<name>` so styles never collide on image names.
 *
 * A style's `sprite` comes in three shapes:
 * - none: nothing is registered, image names are prefixed with a fallback id
 * - string (the tiling pipeline's `__SERVER_URL__/<layer>/sprites`): one sprite,
 *   every image name is prefixed with its id
 * - array (MapLibre >= 3): `[{ id, url }, ...]`. Unprefixed image names come from
 *   the entry with id `default`, all other names are written `<id>:<name>`.
 *   Every entry is registered on its own and the style-local `<id>:` prefix is
 *   rewritten to the registered id.
 */

import type { SpriteSpecification } from "maplibre-gl";
import slugify from "slugify";

export interface SpriteRegistration {
  id: string;
  url: string;
}

export interface SpriteNamespace {
  sprites: SpriteRegistration[];
  defaultId: string;
  aliases: Record<string, string>;
}

/** The entry an unprefixed image name resolves to in a MapLibre sprite array. */
const DEFAULT_SPRITE_ENTRY_ID = "default";

export const slugifySpriteUrl = (url: string): string =>
  slugify(url, { remove: /[^a-zA-Z0-9]/g, lower: true });

/**
 * Resolve a style's `sprite` into the sprites to register and how image names
 * map onto them. `fallbackId` is used as prefix when the style has no sprite
 * (or a sprite array without a `default` entry), which keeps the image names
 * namespaced even though they can't resolve.
 */
export const resolveSpriteNamespace = (
  sprite: SpriteSpecification | undefined | null,
  fallbackId: string
): SpriteNamespace => {
  if (typeof sprite === "string" && sprite.length > 0) {
    const id = slugifySpriteUrl(sprite);
    return { sprites: [{ id, url: sprite }], defaultId: id, aliases: {} };
  }
  if (Array.isArray(sprite) && sprite.length > 0) {
    const sprites: SpriteRegistration[] = [];
    const aliases: Record<string, string> = {};
    for (const entry of sprite) {
      if (!entry || typeof entry.url !== "string" || !entry.url) {
        continue;
      }
      const id = slugifySpriteUrl(entry.url);
      if (!sprites.some((s) => s.id === id)) {
        sprites.push({ id, url: entry.url });
      }
      if (typeof entry.id === "string" && entry.id) {
        aliases[entry.id] = id;
      }
    }
    return {
      sprites,
      defaultId: aliases[DEFAULT_SPRITE_ENTRY_ID] ?? fallbackId,
      aliases,
    };
  }
  return { sprites: [], defaultId: fallbackId, aliases: {} };
};

/** Rewrite one literal image name into the registered namespace. */
export const resolveImageName = (
  namespace: SpriteNamespace,
  name: string
): string => {
  const sep = name.indexOf(":");
  if (sep > 0) {
    const registered = namespace.aliases[name.slice(0, sep)];
    if (registered) {
      return `${registered}:${name.slice(sep + 1)}`;
    }
  }
  return `${namespace.defaultId}:${name}`;
};

/**
 * Wrap a dynamic image expression (feature-property driven, can't be resolved
 * at build time) so MapLibre applies the namespace at runtime.
 *
 * Without aliases this is a plain `concat`. With aliases the value may carry a
 * style-local `<id>:` prefix, so each alias is checked and rewritten first.
 */
const runtimeImageExpression = (
  namespace: SpriteNamespace,
  expr: unknown
): unknown => {
  const aliasEntries = Object.entries(namespace.aliases);
  if (aliasEntries.length === 0) {
    return ["concat", `${namespace.defaultId}:`, expr];
  }
  const img = ["var", "img"];
  const branches: unknown[] = [];
  for (const [alias, registered] of aliasEntries) {
    const prefix = `${alias}:`;
    branches.push(
      ["==", ["slice", img, 0, prefix.length], prefix],
      ["concat", `${registered}:`, ["slice", img, prefix.length]]
    );
  }
  return [
    "let",
    "img",
    ["to-string", expr],
    ["case", ...branches, ["concat", `${namespace.defaultId}:`, img]],
  ];
};

/**
 * Prefix the image names inside an image expression (`icon-image`,
 * `fill-pattern`, `line-pattern`) with the sprite namespace.
 *
 * Literal strings are rewritten directly. Zoom-dependent expressions
 * (`step`, `interpolate`) have to stay top-level, and `match`/`case`/`coalesce`
 * usually carry literal outputs, so these are walked and their outputs
 * rewritten. Anything else (`get`, `concat`, ...) is wrapped so MapLibre
 * resolves it at runtime.
 */
export const prefixImageExpression = (
  namespace: SpriteNamespace,
  expr: unknown
): unknown => {
  if (typeof expr === "string") {
    return resolveImageName(namespace, expr);
  }
  if (!Array.isArray(expr)) {
    return expr;
  }

  const walk = (v: unknown) => prefixImageExpression(namespace, v);
  const [op, ...rest] = expr;
  if (op === "step") {
    // ["step", input, defaultValue, stop1, value1, stop2, value2, ...]
    return [
      "step",
      rest[0],
      ...rest.slice(1).map((v, i) => (i % 2 === 0 ? walk(v) : v)),
    ];
  }
  if (op === "interpolate") {
    // ["interpolate", interpolation, input, stop1, value1, stop2, value2, ...]
    return [
      "interpolate",
      rest[0],
      rest[1],
      ...rest.slice(2).map((v, i) => (i % 2 === 1 ? walk(v) : v)),
    ];
  }
  if (op === "match") {
    // ["match", input, label1, output1, label2, output2, ..., fallback]
    const items = rest.slice(1);
    return [
      "match",
      rest[0],
      ...items.map((v, i) =>
        i % 2 === 1 || i === items.length - 1 ? walk(v) : v
      ),
    ];
  }
  if (op === "case") {
    // ["case", condition1, output1, condition2, output2, ..., fallback]
    return [
      "case",
      ...rest.map((v, i) =>
        i % 2 === 1 || i === rest.length - 1 ? walk(v) : v
      ),
    ];
  }
  if (op === "coalesce") {
    return ["coalesce", ...rest.map(walk)];
  }
  return runtimeImageExpression(namespace, expr);
};

/** The layer properties that reference sprite images. */
export const SPRITE_IMAGE_PAINT_PROPERTIES = [
  "fill-pattern",
  "line-pattern",
] as const;
export const SPRITE_IMAGE_LAYOUT_PROPERTIES = ["icon-image"] as const;

/**
 * The given image properties of a paint/layout object, rewritten into the
 * sprite namespace. Only properties that are present are returned, so the
 * result can be spread over the original object.
 */
export const prefixSpriteImages = (
  namespace: SpriteNamespace,
  props: Record<string, unknown> | undefined,
  keys: readonly string[]
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  if (!props) {
    return result;
  }
  for (const key of keys) {
    if (props[key] !== undefined) {
      result[key] = prefixImageExpression(namespace, props[key]);
    }
  }
  return result;
};
