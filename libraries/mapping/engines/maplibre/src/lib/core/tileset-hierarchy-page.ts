/** Static, native-compatible tileset descriptors. No renderer state is stored.
 * Decision: TILE-SPARSE-HIERARCHY-INDEX-20260909 in engines/maplibre/README.md.
 */
export const TILESET_HIERARCHY = {
  version: "sparse-hierarchy-v1-renderer-0.5.2",
  namespace: "tileset-hierarchy",
  missing: 0xffffffff,
  maximumNodes: 250_000,
  maximumPageBytes: 32 * 1024 ** 2,
} as const;

type Properties = Record<string, unknown>;
type Volume = Properties & {
  box?: number[];
  sphere?: number[];
  region?: number[];
};
export type TilesetDescriptor = Properties & {
  asset: Properties & { version: string };
  root: TileDescriptor;
};
type TileDescriptor = Properties & {
  boundingVolume: Volume;
  geometricError?: number;
  transform?: number[];
  content?: Properties & {
    uri?: string;
    url?: string;
    boundingVolume?: Volume;
  };
  children?: TileDescriptor[];
};
type Template = {
  properties: Properties;
  volumeProperties: Properties;
  contentProperties: Properties;
  contentVolumeProperties: Properties;
  hasChildren: boolean;
  hasError: boolean;
  hasContent: boolean;
  uriField: "uri" | "url";
};
export type TilesetHierarchyPage = {
  version: typeof TILESET_HIERARCHY.version;
  header: Omit<TilesetDescriptor, "root">;
  parents: Uint32Array;
  templateIds: Uint32Array;
  templates: Template[];
  errors: Float64Array;
  transformOffsets: Uint32Array;
  transforms: Float64Array;
  volumeIds: Uint32Array;
  contentVolumeIds: Uint32Array;
  volumeKinds: Uint8Array;
  volumeMasks: Uint16Array;
  volumeOffsets: Uint32Array;
  volumeValues: Float64Array;
  uriIds: Uint32Array;
  stringOffsets: Uint32Array;
  stringBytes: Uint8Array;
  bytes: number;
};

export const packTilesetHierarchyPage = (
  source: TilesetDescriptor
): TilesetHierarchyPage => {
  if (!source.asset || typeof source.asset.version !== "string")
    throw new Error("Missing tileset asset version");
  const nil = TILESET_HIERARCHY.missing;
  const rows: { tile: TileDescriptor; parent: number }[] = [];
  const stack = [{ tile: source.root, parent: nil as number }];
  while (stack.length) {
    const row = stack.pop()!;
    if (
      !row.tile?.boundingVolume ||
      rows.length >= TILESET_HIERARCHY.maximumNodes
    )
      throw new Error("Unsupported or oversized tileset hierarchy");
    const id = rows.length;
    rows.push(row);
    const children = row.tile.children ?? [];
    if (row.tile.children !== undefined && !Array.isArray(row.tile.children))
      throw new Error("Invalid tileset children");
    for (let i = children.length - 1; i >= 0; i--)
      stack.push({ tile: children[i], parent: id });
  }
  const count = rows.length;
  const emptyIds = () => new Uint32Array(count).fill(nil);
  const parents = emptyIds(),
    templateIds = emptyIds(),
    transformOffsets = emptyIds();
  const volumeIds = emptyIds(),
    contentVolumeIds = emptyIds(),
    uriIds = emptyIds();
  const errors = new Float64Array(count);
  const transforms: number[] = [],
    volumeValues: number[] = [],
    volumeKinds: number[] = [];
  const volumeMasks: number[] = [],
    volumeOffsets = [0];
  const templates: Template[] = [],
    strings: string[] = [];
  const volumeLookup = new Map<string, number>(),
    templateLookup = new Map<string, number>();
  const stringLookup = new Map<string, number>();
  const encodeVolume = (volume: Volume) => {
    if (
      [volume.box, volume.sphere, volume.region].filter(
        (value) => value !== undefined
      ).length !== 1
    )
      throw new Error("Ambiguous tileset bounding volume");
    const kind = volume.box ? 0 : volume.sphere ? 1 : 2;
    const values = volume.box ?? volume.sphere ?? volume.region;
    if (
      !values ||
      values.length !== [12, 4, 6][kind] ||
      !values.every(Number.isFinite)
    )
      throw new Error("Invalid tileset bounding volume");
    // Exact values, not subtract/add deltas: preserve ECEF precision and -0.
    const key = `${kind}:${values
      .map((value) => (Object.is(value, -0) ? "-0" : value))
      .join(",")}`;
    const existing = volumeLookup.get(key);
    if (existing !== undefined) return existing;
    const id = volumeKinds.length;
    volumeLookup.set(key, id);
    volumeKinds.push(kind);
    let mask = 0;
    values.forEach((value, index) => {
      if (value !== 0 || Object.is(value, -0)) {
        mask |= 1 << index;
        volumeValues.push(value);
      }
    });
    volumeMasks.push(mask);
    volumeOffsets.push(volumeValues.length);
    return id;
  };
  rows.forEach(({ tile, parent }, i) => {
    const {
      children,
      boundingVolume,
      content,
      geometricError,
      transform,
      ...properties
    } = tile;
    const { box, sphere, region, ...volumeProperties } = boundingVolume;
    const {
      uri,
      url,
      boundingVolume: contentVolume,
      ...contentProperties
    } = content ?? {};
    if (uri !== undefined && url !== undefined)
      throw new Error("Ambiguous content URI");
    const {
      box: cb,
      sphere: cs,
      region: cr,
      ...contentVolumeProperties
    } = contentVolume ?? {};
    const template: Template = {
      properties,
      volumeProperties,
      contentProperties,
      contentVolumeProperties,
      hasChildren: children !== undefined,
      hasError: geometricError !== undefined,
      hasContent: content !== undefined,
      uriField: uri !== undefined ? "uri" : "url",
    };
    // Encoding-only dictionary key; the persisted index is never JSON.parse'd.
    const key = JSON.stringify(template);
    if (!templateLookup.has(key)) {
      templateLookup.set(key, templates.length);
      templates.push(template);
    }
    templateIds[i] = templateLookup.get(key)!;
    parents[i] = parent;
    errors[i] = geometricError ?? 0;
    if (!Number.isFinite(errors[i])) throw new Error("Invalid geometric error");
    volumeIds[i] = encodeVolume(boundingVolume);
    if (contentVolume) contentVolumeIds[i] = encodeVolume(contentVolume);
    if (transform) {
      if (transform.length !== 16 || !transform.every(Number.isFinite))
        throw new Error("Invalid tile transform");
      transformOffsets[i] = transforms.length;
      transforms.push(...transform);
    }
    const value = uri ?? url;
    if (value !== undefined) {
      if (typeof value !== "string") throw new Error("Invalid content URI");
      if (!stringLookup.has(value)) {
        stringLookup.set(value, strings.length);
        strings.push(value);
      }
      uriIds[i] = stringLookup.get(value)!;
    }
  });
  const encoder = new TextEncoder();
  const encoded = strings.map((value) => encoder.encode(value));
  const stringOffsets = new Uint32Array(strings.length + 1);
  encoded.forEach(
    (value, i) => (stringOffsets[i + 1] = stringOffsets[i] + value.length)
  );
  const stringBytes = new Uint8Array(stringOffsets.at(-1)!);
  encoded.forEach((value, i) => stringBytes.set(value, stringOffsets[i]));
  const { root, ...header } = source;
  const page: TilesetHierarchyPage = {
    version: TILESET_HIERARCHY.version,
    header,
    parents,
    templateIds,
    templates,
    errors,
    transformOffsets,
    transforms: Float64Array.from(transforms),
    volumeIds,
    contentVolumeIds,
    volumeKinds: Uint8Array.from(volumeKinds),
    volumeMasks: Uint16Array.from(volumeMasks),
    volumeOffsets: Uint32Array.from(volumeOffsets),
    volumeValues: Float64Array.from(volumeValues),
    uriIds,
    stringOffsets,
    stringBytes,
    bytes: 0,
  };
  page.bytes =
    Object.values(page).reduce<number>(
      (sum, value) => sum + (ArrayBuffer.isView(value) ? value.byteLength : 0),
      0
    ) + encoder.encode(JSON.stringify({ header, templates })).byteLength;
  if (page.bytes > TILESET_HIERARCHY.maximumPageBytes)
    throw new Error("Tileset hierarchy page exceeds budget");
  return page;
};

/** Incremental native-descriptor construction: callers choose a task-sized batch.
 * Existing 3d-tiles-renderer owns parent objects, transforms, OBBs and refinement.
 */
export const createTilesetHierarchyPageReader = (
  page: TilesetHierarchyPage
) => {
  const nil = TILESET_HIERARCHY.missing;
  const fail = (): never => {
    throw new Error("Invalid cached tileset hierarchy page");
  };
  if (
    page?.version !== TILESET_HIERARCHY.version ||
    !(page.parents instanceof Uint32Array) ||
    !page.parents.length ||
    page.parents.length > TILESET_HIERARCHY.maximumNodes ||
    !(page.bytes > 0 && page.bytes <= TILESET_HIERARCHY.maximumPageBytes)
  )
    fail();
  const count = page.parents.length;
  if (
    !page.header?.asset ||
    typeof page.header.asset !== "object" ||
    typeof (page.header.asset as Properties).version !== "string"
  )
    fail();
  for (const values of [
    page.templateIds,
    page.transformOffsets,
    page.volumeIds,
    page.contentVolumeIds,
    page.uriIds,
  ])
    if (!(values instanceof Uint32Array) || values.length !== count) fail();
  if (
    !(page.errors instanceof Float64Array) ||
    page.errors.length !== count ||
    !(page.transforms instanceof Float64Array) ||
    !(page.volumeValues instanceof Float64Array) ||
    !(page.volumeKinds instanceof Uint8Array) ||
    !(page.volumeMasks instanceof Uint16Array) ||
    !(page.volumeOffsets instanceof Uint32Array) ||
    !(page.stringOffsets instanceof Uint32Array) ||
    !(page.stringBytes instanceof Uint8Array) ||
    !Array.isArray(page.templates) ||
    page.volumeOffsets.length !== page.volumeKinds.length + 1 ||
    page.volumeMasks.length !== page.volumeKinds.length ||
    page.volumeOffsets.at(-1) !== page.volumeValues.length ||
    page.stringOffsets.at(-1) !== page.stringBytes.length
  )
    fail();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const strings = new Map<number, string>();
  const nodes: TileDescriptor[] = [];
  const copyProperties = (value: Properties): Properties =>
    Object.values(value).some(
      (item) => item !== null && typeof item === "object"
    )
      ? structuredClone(value)
      : { ...value };
  const readVolume = (id: number, properties: Properties): Volume => {
    const kind = page.volumeKinds[id];
    if (id >= page.volumeKinds.length || kind > 2) fail();
    const length = [12, 4, 6][kind];
    const values = new Array<number>(length).fill(0);
    const mask = page.volumeMasks[id];
    let offset = page.volumeOffsets[id];
    if (mask >= 1 << length || offset > page.volumeOffsets[id + 1]) fail();
    for (let i = 0; i < length; i++)
      if (mask & (1 << i)) {
        const value = page.volumeValues[offset++];
        if (!Number.isFinite(value)) fail();
        values[i] = value;
      }
    if (offset !== page.volumeOffsets[id + 1]) fail();
    const key = ["box", "sphere", "region"][kind];
    return { ...copyProperties(properties), [key]: values };
  };
  const read = (): boolean => {
    const i = nodes.length;
    if (i >= count) return false;
    const parent = page.parents[i];
    if (i === 0 ? parent !== nil : parent >= i) fail();
    const meta = page.templates[page.templateIds[i]];
    if (!meta || !Number.isFinite(page.errors[i])) fail();
    const node: TileDescriptor = {
      ...copyProperties(meta.properties),
      boundingVolume: readVolume(page.volumeIds[i], meta.volumeProperties),
    };
    if (meta.hasError) node.geometricError = page.errors[i];
    const transformOffset = page.transformOffsets[i];
    if (transformOffset !== nil) {
      if (transformOffset + 16 > page.transforms.length) fail();
      node.transform = Array.from(
        page.transforms.subarray(transformOffset, transformOffset + 16)
      );
      if (!node.transform.every(Number.isFinite)) fail();
    }
    if (meta.hasChildren) node.children = [];
    if (meta.hasContent) {
      node.content = copyProperties(meta.contentProperties);
      if (page.contentVolumeIds[i] !== nil)
        node.content.boundingVolume = readVolume(
          page.contentVolumeIds[i],
          meta.contentVolumeProperties
        );
      const uri = page.uriIds[i];
      if (uri !== nil) {
        if (
          uri + 1 >= page.stringOffsets.length ||
          page.stringOffsets[uri] > page.stringOffsets[uri + 1] ||
          page.stringOffsets[uri + 1] > page.stringBytes.length
        )
          fail();
        if (!strings.has(uri))
          strings.set(
            uri,
            decoder.decode(
              page.stringBytes.subarray(
                page.stringOffsets[uri],
                page.stringOffsets[uri + 1]
              )
            )
          );
        node.content[meta.uriField] = strings.get(uri)!;
      }
    }
    nodes.push(node);
    if (parent !== nil) (nodes[parent].children ??= []).push(node);
    return true;
  };
  return {
    read,
    finish: (): TilesetDescriptor => {
      if (nodes.length !== count) fail();
      return { ...page.header, root: nodes[0] } as TilesetDescriptor;
    },
  };
};
