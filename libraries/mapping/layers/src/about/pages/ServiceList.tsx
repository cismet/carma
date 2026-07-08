import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Item } from "../../lib/contracts/carma-layers.d";
import { wuppLayerCatalogConfig } from "../../config/layerCatalogConfig";
import {
  LayerCatalogProvider,
  useCatalogData,
} from "../../context/LayerCatalogProvider";
import { useAdditionalConfig } from "../../hooks/useAdditionalConfig";
import { useLoadCapabilities } from "../../hooks/useLoadCapabilities";
import {
  deriveAdditionalConfigFragments,
  deriveConfigSubcategories,
} from "../../helper/buildCatalog";
import { useFeatureFlags } from "@carma-providers/feature-flag";
import { extractCarmaConfig } from "@carma-commons/utils";
import { parseDescription } from "../../helper/layerHelper";
import { partianTwinConfig } from "../../helper/config";
import {
  discoverConfig,
  fetchDiscoverItems,
  type DiscoverProps,
} from "../../helper/discover";
import PageLayout from "../components/PageLayout";
import PageHeader from "../components/PageHeader";
import ContentCard from "../components/ContentCard";
import LoadingSpinner from "../components/LoadingSpinner";
import SearchInput from "../components/SearchInput";
import FilterBadge from "../components/FilterBadge";
import CategoryCard from "../components/CategoryCard";
import Badge from "../components/Badge";
import { CopyOutlined, CheckOutlined, RightOutlined } from "@ant-design/icons";

interface VectorStyleMeta {
  status: "loading" | "loaded" | "error";
  source?:
    | "wms-keywords"
    | "vector-style-keywords"
    | "style-layer-keywords"
    | "both"
    | "none";
  wmsInfoboxMapping?: string[];
  vectorInfoboxMapping?: string[];
  layerInfoboxMapping?: string[];
  vectorStyleUrl?: string;
  error?: string;
}

const isJson = (str: unknown): boolean => {
  if (typeof str !== "string") return false;
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
};

const typeBadgeColors: Record<string, { bg: string; color: string }> = {
  layer: { bg: "#ebf4ff", color: "#3182ce" },
  link: { bg: "#fefcbf", color: "#975a16" },
  collection: { bg: "#e6fffa", color: "#285e61" },
  object: { bg: "#faf5ff", color: "#6b46c1" },
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#718096",
  marginBottom: 2,
};

const valueStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#2d3748",
  marginBottom: 8,
};

const monoValueStyle: React.CSSProperties = {
  ...valueStyle,
  fontFamily: "monospace",
  fontSize: 12,
  backgroundColor: "#f0f2f5",
  padding: "2px 6px",
  borderRadius: 4,
  wordBreak: "break-all" as const,
};

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <h2
    style={{
      fontSize: 20,
      fontWeight: 700,
      color: "#2d3748",
      margin: "32px 0 12px",
      paddingBottom: 6,
      borderBottom: "2px solid #e2e8f0",
    }}
  >
    {children}
  </h2>
);

const badgeColors: Record<string, { bg: string; color: string }> = {
  ...typeBadgeColors,
  queryable: { bg: "#c6f6d5", color: "#276749" },
  vector: { bg: "#e9d8fd", color: "#553c9a" },
  raster: { bg: "#bee3f8", color: "#2a4365" },
};

const mappingBadges: Record<
  string,
  { bg: string; color: string; label: string }
> = {
  "mapping:wms": { bg: "#c6f6d5", color: "#276749", label: "WMS" },
  "mapping:style": { bg: "#e9d8fd", color: "#553c9a", label: "Style" },
  "mapping:both": { bg: "#fefcbf", color: "#975a16", label: "WMS + Style" },
  "mapping:none": { bg: "#fed7d7", color: "#9b2c2c", label: "Kein Mapping" },
  "mapping:foto": { bg: "#c6f6d5", color: "#276749", label: "Foto" },
};

const getLayerBadges = (layer: Item): string[] => {
  const badges: string[] = [];
  if (layer.type) badges.push(layer.type);
  if (layer.queryable) badges.push("queryable");
  if (layer.type === "layer") {
    const carmaConf = extractCarmaConfig(layer.keywords);
    const hasVector = !!(
      layer.vectorStyle ||
      carmaConf?.vectorStyle ||
      layer.vectorLegend ||
      carmaConf?.vectorLegend ||
      (layer as any).layerType === "vector"
    );
    badges.push(hasVector ? "vector" : "raster");
  }
  return badges;
};

interface ParsedMappingEntry {
  key: string;
  value: string;
}

const parseMappingEntries = (
  mappings: string[]
): ParsedMappingEntry[] | "function" => {
  const joined = mappings.join("\n");
  if (/function\s*\(/.test(joined) || /\(\s*\w+\s*\)\s*=>/.test(joined)) {
    return "function";
  }
  return mappings.map((entry) => {
    const colonIdx = entry.indexOf(":");
    const key = colonIdx !== -1 ? entry.slice(0, colonIdx).trim() : entry;
    const value = colonIdx !== -1 ? entry.slice(colonIdx + 1).trim() : "";
    return { key, value };
  });
};

const mappingHasKey = (
  mappings: string[] | undefined,
  key: string
): boolean => {
  if (!mappings || mappings.length === 0) return false;
  const parsed = parseMappingEntries(mappings);
  if (parsed === "function") {
    const re = new RegExp(`\\b${key}\\b\\s*[:=]`);
    return mappings.some((m) => re.test(m));
  }
  return parsed.some((entry) => entry.key === key);
};

const getEffectiveMapping = (
  meta: VectorStyleMeta | undefined
): string[] | undefined => {
  if (!meta || meta.status !== "loaded") return undefined;
  if (meta.wmsInfoboxMapping?.length) return meta.wmsInfoboxMapping;
  if (meta.vectorInfoboxMapping?.length) return meta.vectorInfoboxMapping;
  if (meta.layerInfoboxMapping?.length) return meta.layerInfoboxMapping;
  return undefined;
};

const getEffectiveSource = (
  meta: VectorStyleMeta | undefined
): VectorStyleMeta["source"] | undefined => {
  if (!meta || meta.status !== "loaded") return undefined;
  const hasWms = !!meta.wmsInfoboxMapping?.length;
  const hasStyle = !!(
    meta.vectorInfoboxMapping?.length || meta.layerInfoboxMapping?.length
  );
  if (hasWms && hasStyle) return "both";
  if (hasWms) return "wms-keywords";
  if (meta.vectorInfoboxMapping?.length) return "vector-style-keywords";
  if (meta.layerInfoboxMapping?.length) return "style-layer-keywords";
  return "none";
};

const sourceColors: Record<
  string,
  { bg: string; color: string; label: string }
> = {
  "wms-keywords": { bg: "#c6f6d5", color: "#276749", label: "WMS Mapping" },
  "vector-style-keywords": {
    bg: "#e9d8fd",
    color: "#553c9a",
    label: "Vector Style Mapping",
  },
  both: { bg: "#fefcbf", color: "#975a16", label: "WMS + Style Mapping" },
  none: { bg: "#fed7d7", color: "#9b2c2c", label: "No Mapping" },
};

const buildLayerInfo = (layer: Item): Record<string, unknown> => {
  const carmaConf = extractCarmaConfig(layer.keywords);
  const vectorStyle = layer.vectorStyle || carmaConf?.vectorStyle;
  const vectorLegend =
    layer.vectorLegend ||
    carmaConf?.vectorLegend ||
    (layer as any).props?.Style?.[0]?.LegendURL?.[0]?.OnlineResource;
  const props = (layer as any).props;

  const info: Record<string, unknown> = {};
  if (layer.title) info.title = layer.title;
  if (layer.description) info.description = layer.description;
  if (layer.tags?.length) info.tags = layer.tags;
  const keywords = layer.keywords?.filter((k) => k !== ":vec:");
  if (keywords?.length) info.keywords = keywords;
  if (layer.id) info.id = layer.id;
  if (layer.name) info.name = layer.name;
  if (layer.type) info.type = layer.type;
  if (layer.queryable !== undefined) info.queryable = layer.queryable;
  if (layer.maxZoom !== undefined) info.maxZoom = layer.maxZoom;
  if (layer.minZoom !== undefined) info.minZoom = layer.minZoom;
  if (layer.path) info.path = layer.path;
  if (layer.icon) info.icon = layer.icon;
  if (layer.thumbnail) info.thumbnail = layer.thumbnail;
  if (vectorStyle) info.vectorStyle = vectorStyle;
  if (vectorLegend) info.vectorLegend = vectorLegend;
  if (layer.vectorLegendTitle) info.vectorLegendTitle = layer.vectorLegendTitle;
  if (props?.MetadataURL) info.props = { MetadataURL: props.MetadataURL };
  return info;
};

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      navigator.clipboard.writeText(text).then(
        () => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        },
        (err) => console.error("Failed to copy layerInfo:", err)
      );
    },
    [text]
  );
  return (
    <button
      onClick={handleCopy}
      title="layerInfo kopieren"
      aria-label="layerInfo kopieren"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        padding: "2px 6px",
        borderRadius: 6,
        border: "1px solid #cbd5e0",
        backgroundColor: copied ? "#c6f6d5" : "#fff",
        color: copied ? "#276749" : "#4a5568",
        cursor: "pointer",
      }}
    >
      {copied ? <CheckOutlined /> : <CopyOutlined />}
    </button>
  );
};

const LayerInfoDetails = ({ json }: { json: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <details
      style={{ marginTop: 10 }}
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary
        style={{
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          color: "#4a5568",
          display: "flex",
          alignItems: "center",
          gap: 8,
          // flex display removes the native disclosure marker, so we render
          // our own rotating chevron instead.
          listStyle: "none",
        }}
      >
        <RightOutlined
          style={{
            fontSize: 11,
            transition: "transform 0.15s",
            transform: open ? "rotate(90deg)" : "none",
          }}
        />
        <span>layerInfo</span>
        <CopyButton text={json} />
      </summary>
      <div style={{ marginTop: 8 }}>
        <pre
          style={{
            ...monoValueStyle,
            margin: 0,
            padding: "10px 14px",
            whiteSpace: "pre-wrap",
            maxHeight: 320,
            overflow: "auto",
          }}
        >
          {json}
        </pre>
      </div>
    </details>
  );
};

const ItemEntry = ({
  layer,
  isLast,
  vectorMeta,
}: {
  layer: Item;
  isLast: boolean;
  vectorMeta?: VectorStyleMeta;
}) => {
  const carmaConf = extractCarmaConfig(layer.keywords);
  const descriptions = parseDescription(layer.description);
  const typeColors = typeBadgeColors[layer.type] || {
    bg: "#e8ecf1",
    color: "#4a5568",
  };
  const openDataUrl = carmaConf?.opendata as string | undefined;
  const vectorStyle = layer.vectorStyle || carmaConf?.vectorStyle;
  const vectorLegend = layer.vectorLegend || carmaConf?.vectorLegend;
  const isVector = !!(
    vectorStyle ||
    vectorLegend ||
    (layer as any).layerType === "vector"
  );

  return (
    <div
      style={{
        padding: "16px 20px",
        borderBottom: !isLast ? "1px solid #edf2f7" : "none",
      }}
    >
      {/* Header: title + type badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 600,
            color: "#2d3748",
          }}
        >
          {layer.title}
        </h3>
        <Badge bg={typeColors.bg} color={typeColors.color}>
          {layer.type}
        </Badge>
        {layer.queryable && (
          <Badge bg="#c6f6d5" color="#276749">
            queryable
          </Badge>
        )}
        {layer.type === "layer" && (
          <Badge
            bg={isVector ? "#e9d8fd" : "#bee3f8"}
            color={isVector ? "#553c9a" : "#2a4365"}
          >
            {isVector ? "vector" : "raster"}
          </Badge>
        )}
      </div>

      {/* Descriptions */}
      {descriptions.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {descriptions.map((section, i) => {
            if (section.title === "Sichtbarkeit") return null;
            return (
              <div key={`desc_${i}`} style={{ marginBottom: 6 }}>
                <div style={labelStyle}>{section.title}</div>
                <div
                  style={valueStyle}
                  dangerouslySetInnerHTML={{
                    __html: section.description,
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Metadata grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "4px 24px",
        }}
      >
        {layer.type === "link" && (layer as any).url && (
          <div>
            <div style={labelStyle}>URL</div>
            <div style={monoValueStyle}>
              <a
                href={(layer as any).url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#3182ce", fontSize: 12 }}
              >
                {(layer as any).url}
              </a>
            </div>
          </div>
        )}
        {layer.service?.url && (
          <div>
            <div style={labelStyle}>Service-URL</div>
            <div style={monoValueStyle}>
              {!isVector && layer.name
                ? `${layer.service.url}?service=WMS&request=GetMap&layers=${layer.name}`
                : layer.service.url}
            </div>
          </div>
        )}
        {(layer.minZoom !== undefined || layer.maxZoom !== undefined) && (
          <div>
            <div style={labelStyle}>Zoom-Bereich</div>
            <div style={valueStyle}>
              {layer.minZoom ?? "–"} – {layer.maxZoom ?? "–"}
            </div>
          </div>
        )}
        {layer.copyright && (
          <div>
            <div style={labelStyle}>Bildnachweis</div>
            <div style={valueStyle}>{layer.copyright}</div>
          </div>
        )}
        {openDataUrl && (
          <div>
            <div style={labelStyle}>Open Data</div>
            <div style={valueStyle}>
              <a
                href={openDataUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#3182ce", fontSize: 13 }}
              >
                {openDataUrl}
              </a>
            </div>
          </div>
        )}
        {vectorStyle && (
          <div>
            <div style={labelStyle}>Vector Style</div>
            <div style={monoValueStyle}>{String(vectorStyle)}</div>
          </div>
        )}
        {vectorLegend && (
          <div>
            <div style={labelStyle}>Vector Legend</div>
            <div style={monoValueStyle}>{String(vectorLegend)}</div>
          </div>
        )}
      </div>

      {/* Tags */}
      {layer.tags && layer.tags.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={labelStyle}>Tags</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {layer.tags.map((tag, i) => (
              <Badge
                key={`tag_${i}`}
                size="small"
                style={{ padding: "1px 8px" }}
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Infobox Mapping Analysis */}
      {vectorMeta && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 14px",
            backgroundColor: "#f7fafc",
            borderRadius: 6,
            border: "1px solid #e2e8f0",
          }}
        >
          <div style={{ ...labelStyle, fontSize: 13, marginBottom: 6 }}>
            Infobox Mapping
          </div>
          {vectorMeta.status === "loading" && (
            <div style={{ fontSize: 12, color: "#a0aec0" }}>
              Lade Vector Style Metadaten...
            </div>
          )}
          {vectorMeta.status === "error" && (
            <div style={{ fontSize: 12, color: "#e53e3e" }}>
              Fehler: {vectorMeta.error}
            </div>
          )}
          {vectorMeta.status === "loaded" &&
            (() => {
              const effective = getEffectiveMapping(vectorMeta);
              const isFunction = effective
                ? parseMappingEntries(effective) === "function"
                : false;
              const hasFoto = effective
                ? mappingHasKey(effective, "foto")
                : false;

              return (
                <div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                      marginBottom: 8,
                    }}
                  >
                    {(() => {
                      const src = getEffectiveSource(vectorMeta);
                      return src ? (
                        <Badge
                          bg={sourceColors[src]?.bg ?? "#e8ecf1"}
                          color={sourceColors[src]?.color ?? "#4a5568"}
                        >
                          {sourceColors[src]?.label ?? src}
                        </Badge>
                      ) : null;
                    })()}
                    {isFunction && (
                      <Badge bg="#fefcbf" color="#975a16">
                        function
                      </Badge>
                    )}
                    {hasFoto && (
                      <Badge
                        bg={hasFoto ? "#c6f6d5" : "#fed7d7"}
                        color={hasFoto ? "#276749" : "#9b2c2c"}
                      >
                        foto
                      </Badge>
                    )}
                  </div>

                  {vectorMeta.wmsInfoboxMapping &&
                    vectorMeta.wmsInfoboxMapping.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ ...labelStyle, fontSize: 11 }}>
                          WMS Keywords Mapping:
                        </div>
                        <div style={monoValueStyle}>
                          {vectorMeta.wmsInfoboxMapping.map((m, i) => (
                            <div key={i}>{m}</div>
                          ))}
                        </div>
                      </div>
                    )}

                  {vectorMeta.vectorInfoboxMapping &&
                    vectorMeta.vectorInfoboxMapping.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ ...labelStyle, fontSize: 11 }}>
                          Vector Style Metadata Mapping:
                        </div>
                        <div style={monoValueStyle}>
                          {vectorMeta.vectorInfoboxMapping.map((m, i) => (
                            <div key={i}>{m}</div>
                          ))}
                        </div>
                      </div>
                    )}

                  {vectorMeta.layerInfoboxMapping &&
                    vectorMeta.layerInfoboxMapping.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ ...labelStyle, fontSize: 11 }}>
                          Style Layer Metadata Mapping:
                        </div>
                        <div style={monoValueStyle}>
                          {vectorMeta.layerInfoboxMapping.map((m, i) => (
                            <div key={i}>{m}</div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              );
            })()}
        </div>
      )}

      {(layer.type === "layer" || layer.type === "object") && (
        <LayerInfoDetails
          json={JSON.stringify(buildLayerInfo(layer), null, 2)}
        />
      )}
    </div>
  );
};

interface ServiceListProps {
  discoverProps?: DiscoverProps;
  markdown?: boolean;
}

const ServiceListContent = ({
  discoverProps = wuppLayerCatalogConfig.discoverProps,
  markdown = false,
}: ServiceListProps) => {
  const { serviceCategories: allLayers, loadingServiceIds } = useCatalogData();
  const [discoverLayers, setDiscoverLayers] = useState<
    { id: string; Title: string; layers: any[] }[]
  >([]);
  const [discoverLoaded, setDiscoverLoaded] = useState(!discoverProps);
  const [search, setSearch] = useState("");
  const [badgeFilter, setBadgeFilter] = useState<string | null>(null);
  const [vectorMetaMap, setVectorMetaMap] = useState<
    Record<string, VectorStyleMeta>
  >({});

  useEffect(() => {
    if (!discoverProps) return;
    fetchDiscoverItems(discoverProps).then((items) => {
      const categories: { id: string; Title: string; layers: any[] }[] = [];
      for (const key in discoverConfig) {
        const config = discoverConfig[key as keyof typeof discoverConfig];
        const filteredItems = items.filter(
          (item) => JSON.parse(item.config).serviceName === config.id
        );
        const layers = filteredItems.map((item) => ({
          ...JSON.parse(item.config),
          id: item.id.toString(),
        }));
        if (layers.length > 0) {
          categories.push({
            id: config.id,
            Title: config.Title,
            layers,
          });
        }
      }
      setDiscoverLayers(categories);
      setDiscoverLoaded(true);
    });
  }, []);

  const flags = useFeatureFlags();
  const {
    additionalConfig,
    sensorConfig,
    objectConfig,
    loadingAdditionalConfig,
  } = useAdditionalConfig({
    assetBaseUrl: wuppLayerCatalogConfig.assetBaseUrl,
  });

  const fragmentsToEntries = (fragments: { id?: string; Title: string; layers: any[] }[]) =>
    fragments.map((fragment) => ({
      serviceName: fragment.id ?? "",
      title: fragment.Title,
      layers: fragment.layers,
    }));

  const additionalLayers = useMemo(
    () => fragmentsToEntries(deriveAdditionalConfigFragments(additionalConfig, flags)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [additionalConfig, flags]
  );
  const sensorEntries = useMemo(
    () => fragmentsToEntries(deriveConfigSubcategories(sensorConfig, flags)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sensorConfig, flags]
  );
  const objectEntries = useMemo(
    () => fragmentsToEntries(deriveConfigSubcategories(objectConfig, flags)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [objectConfig, flags]
  );

  useLoadCapabilities({
    loadingAdditionalConfig,
    activeLayers: [] as any,
    services: wuppLayerCatalogConfig.services,
  });

  const displayLayers = useMemo(() => {
    if (allLayers.length === 0) return allLayers;
    // copy only what gets extended; the layer objects themselves stay shared
    const merged = allLayers.map((category) => ({
      ...category,
      layers: [...category.layers],
    }));
    for (const entry of additionalLayers) {
      // the config fragments carry catalog items (loose legacy typing)
      const entryLayers = entry.layers as Item[];
      const existing = merged.find((cat) => cat.id === entry.serviceName);
      if (existing) {
        for (const layer of entryLayers) {
          if (!existing.layers.some((l) => l.id === layer.id)) {
            existing.layers.push(layer);
          }
        }
      } else {
        merged.push({
          id: entry.serviceName,
          Title: entry.title,
          layers: entryLayers,
        });
      }
    }
    return merged;
  }, [allLayers, additionalLayers]);

  const topicMaps = useMemo(() => {
    const categories: { id: string; Title: string; layers: any[] }[] = [];
    for (const key in partianTwinConfig) {
      const config = partianTwinConfig[key as keyof typeof partianTwinConfig];
      categories.push({
        id: config.id,
        Title: config.Title,
        layers: config.layers,
      });
    }
    return categories;
  }, []);

  const sensorLayers = useMemo(() => {
    const merged: { id: string; Title: string; layers: any[] }[] = [];
    for (const entry of sensorEntries) {
      const existing = merged.find((cat) => cat.id === entry.serviceName);
      if (existing) {
        for (const layer of entry.layers) {
          if (!existing.layers.some((l: any) => l.id === layer.id)) {
            existing.layers.push(layer);
          }
        }
      } else {
        merged.push({
          id: entry.serviceName,
          Title: entry.title,
          layers: [...entry.layers],
        });
      }
    }
    return merged;
  }, [sensorEntries]);

  const objectLayers = useMemo(() => {
    const merged: { id: string; Title: string; layers: any[] }[] = [];
    for (const entry of objectEntries) {
      const existing = merged.find((cat) => cat.id === entry.serviceName);
      if (existing) {
        for (const layer of entry.layers) {
          if (!existing.layers.some((l: any) => l.id === layer.id)) {
            existing.layers.push(layer);
          }
        }
      } else {
        merged.push({
          id: entry.serviceName,
          Title: entry.title,
          layers: [...entry.layers],
        });
      }
    }
    return merged;
  }, [objectEntries]);

  useEffect(() => {
    const allItems: Item[] = [];
    for (const cat of [
      ...displayLayers,
      ...topicMaps,
      ...sensorLayers,
      ...objectLayers,
    ]) {
      for (const layer of cat.layers) {
        allItems.push(layer);
      }
    }

    for (const layer of allItems) {
      if (layer.type !== "layer" && layer.type !== "object") continue;

      const carmaConf = extractCarmaConfig(layer.keywords);
      const vectorStyleRef = layer.vectorStyle || carmaConf?.vectorStyle;

      const wmsInfoboxMapping = Array.isArray(carmaConf?.infoboxMapping)
        ? (carmaConf.infoboxMapping as string[])
        : undefined;

      // For non-vector layers that have WMS infobox mapping, store that directly
      if (!vectorStyleRef) {
        if (wmsInfoboxMapping?.length && !vectorMetaMap[layer.id]) {
          setVectorMetaMap((prev) => ({
            ...prev,
            [layer.id]: {
              status: "loaded",
              source: "wms-keywords",
              wmsInfoboxMapping,
            },
          }));
        }
        continue;
      }

      if (vectorMetaMap[layer.id]) continue;

      setVectorMetaMap((prev) => ({
        ...prev,
        [layer.id]: { status: "loading" },
      }));

      const resolveVectorStyle = async () => {
        let styleJson: any = null;
        let resolvedUrl: string | undefined;

        if (isJson(vectorStyleRef)) {
          styleJson = JSON.parse(vectorStyleRef as string);
        } else if (typeof vectorStyleRef === "string") {
          resolvedUrl = vectorStyleRef;
          try {
            const response = await fetch(vectorStyleRef);
            styleJson = await response.json();
          } catch (err) {
            setVectorMetaMap((prev) => ({
              ...prev,
              [layer.id]: {
                status: "error",
                wmsInfoboxMapping,
                error: String(err),
              },
            }));
            return;
          }
        }

        if (!styleJson) {
          setVectorMetaMap((prev) => ({
            ...prev,
            [layer.id]: {
              status: "loaded",
              source: wmsInfoboxMapping?.length ? "wms-keywords" : "none",
              wmsInfoboxMapping,
              vectorStyleUrl: resolvedUrl,
            },
          }));
          return;
        }

        // Extract from top-level metadata.carmaConf.layerInfo.keywords
        let vectorInfoboxMapping: string[] | undefined;
        const layerInfoKeywords =
          styleJson.metadata?.carmaConf?.layerInfo?.keywords;
        if (Array.isArray(layerInfoKeywords)) {
          const vectorConf = extractCarmaConfig(layerInfoKeywords);
          if (Array.isArray(vectorConf?.infoboxMapping)) {
            vectorInfoboxMapping = vectorConf!.infoboxMapping as string[];
          }
        }

        // Extract from per-style-layer metadata.carmaConf
        let layerInfoboxMapping: string[] | undefined;
        if (Array.isArray(styleJson.layers)) {
          for (const styleLayer of styleJson.layers) {
            const slKeywords = styleLayer.metadata?.carmaConf?.keywords;
            if (Array.isArray(slKeywords)) {
              const slConf = extractCarmaConfig(slKeywords);
              if (Array.isArray(slConf?.infoboxMapping)) {
                layerInfoboxMapping = slConf!.infoboxMapping as string[];
                break;
              }
            }
            // Also check direct infoboxMapping on carmaConf
            const directMapping =
              styleLayer.metadata?.carmaConf?.infoboxMapping;
            if (Array.isArray(directMapping) && directMapping.length > 0) {
              layerInfoboxMapping = directMapping;
              break;
            }
          }
        }

        const hasWms = !!wmsInfoboxMapping?.length;
        const hasVector = !!vectorInfoboxMapping?.length;
        const hasStyleLayer = !!layerInfoboxMapping?.length;
        let source: VectorStyleMeta["source"] = "none";
        if (hasWms && (hasVector || hasStyleLayer)) {
          source = "both";
        } else if (hasWms) {
          source = "wms-keywords";
        } else if (hasVector) {
          source = "vector-style-keywords";
        } else if (hasStyleLayer) {
          source = "style-layer-keywords";
        }

        setVectorMetaMap((prev) => ({
          ...prev,
          [layer.id]: {
            status: "loaded",
            source,
            wmsInfoboxMapping,
            vectorInfoboxMapping,
            layerInfoboxMapping,
            vectorStyleUrl: resolvedUrl,
          },
        }));
      };

      resolveVectorStyle();
    }
  }, [displayLayers, topicMaps, sensorLayers, objectLayers]);

  const loading = allLayers.length === 0;

  const allDataLoaded = useMemo(() => {
    // WMS capabilities still loading (individual services tracked by ID)
    if (loadingServiceIds.length > 0) return false;
    // Additional/sensor/object configs still loading
    if (loadingAdditionalConfig) return false;
    // Discover items still loading
    if (!discoverLoaded) return false;
    // Vector metadata still loading
    const allItems: Item[] = [];
    for (const cat of [
      ...displayLayers,
      ...topicMaps,
      ...sensorLayers,
      ...objectLayers,
    ]) {
      for (const layer of cat.layers) {
        allItems.push(layer);
      }
    }
    for (const layer of allItems) {
      if (layer.type !== "layer" && layer.type !== "object") continue;
      const carmaConf = extractCarmaConfig(layer.keywords);
      const vectorStyleRef = layer.vectorStyle || carmaConf?.vectorStyle;
      if (!vectorStyleRef) continue;
      const meta = vectorMetaMap[layer.id];
      if (!meta || meta.status === "loading") return false;
    }
    return true;
  }, [
    loadingServiceIds,
    loadingAdditionalConfig,
    discoverLoaded,
    displayLayers,
    topicMaps,
    sensorLayers,
    objectLayers,
    vectorMetaMap,
  ]);

  const getSearchableText = useCallback((layer: Item): string => {
    const parts: string[] = [
      layer.title || "",
      layer.description || "",
      layer.name || "",
      layer.serviceName || "",
      layer.copyright || "",
      ...(layer.tags || []),
      ...(layer.keywords || []),
    ];
    if (layer.service?.url) {
      parts.push(layer.service.url);
    }
    if ((layer as any).url) {
      parts.push((layer as any).url);
    }
    if (layer.type) {
      parts.push(layer.type);
    }
    return parts.join(" ").toLowerCase();
  }, []);

  const filterCategories = useCallback(
    (categories: { id: string; Title: string; layers: any[] }[]) => {
      const term = search.trim().toLowerCase();
      const hasSearch = term.length > 0;
      if (!hasSearch && !badgeFilter) return categories;
      return categories
        .map((category) => ({
          ...category,
          layers: category.layers.filter((layer: Item) => {
            if (hasSearch && !getSearchableText(layer).includes(term))
              return false;
            if (badgeFilter) {
              if (badgeFilter.startsWith("mapping:")) {
                const meta = vectorMetaMap[layer.id];
                if (!meta || meta.status !== "loaded") return false;
                const effectiveSource = getEffectiveSource(meta);
                if (badgeFilter === "mapping:wms") {
                  return effectiveSource === "wms-keywords";
                }
                if (badgeFilter === "mapping:style") {
                  return (
                    effectiveSource === "vector-style-keywords" ||
                    effectiveSource === "style-layer-keywords"
                  );
                }
                if (badgeFilter === "mapping:both") {
                  return effectiveSource === "both";
                }
                if (badgeFilter === "mapping:none") {
                  return effectiveSource === "none";
                }
                if (badgeFilter === "mapping:foto") {
                  const effective = getEffectiveMapping(meta);
                  return mappingHasKey(effective, "foto");
                }
                if (badgeFilter === "mapping:no-foto") {
                  const effective = getEffectiveMapping(meta);
                  return !mappingHasKey(effective, "foto");
                }
                return false;
              }
              if (!getLayerBadges(layer).includes(badgeFilter)) return false;
            }
            return true;
          }),
        }))
        .filter((category) => category.layers.length > 0);
    },
    [search, badgeFilter, getSearchableText, vectorMetaMap]
  );

  const filteredLayers = useMemo(
    () => filterCategories(displayLayers),
    [displayLayers, filterCategories]
  );
  const filteredTopicMaps = useMemo(
    () => filterCategories(topicMaps),
    [topicMaps, filterCategories]
  );
  const filteredSensors = useMemo(
    () => filterCategories(sensorLayers),
    [sensorLayers, filterCategories]
  );
  const filteredObjects = useMemo(
    () => filterCategories(objectLayers),
    [objectLayers, filterCategories]
  );
  const filteredDiscover = useMemo(
    () => filterCategories(discoverLayers),
    [discoverLayers, filterCategories]
  );

  const getNumberOfLayers = (layerCategories: any) => {
    let count = 0;
    layerCategories?.forEach((category: any) => {
      count += category?.layers?.length ?? 0;
    });
    return count;
  };

  const totalLayerCount =
    getNumberOfLayers(displayLayers) +
    getNumberOfLayers(topicMaps) +
    getNumberOfLayers(sensorLayers) +
    getNumberOfLayers(objectLayers) +
    getNumberOfLayers(discoverLayers);
  const filteredCount =
    getNumberOfLayers(filteredLayers) +
    getNumberOfLayers(filteredTopicMaps) +
    getNumberOfLayers(filteredSensors) +
    getNumberOfLayers(filteredObjects) +
    getNumberOfLayers(filteredDiscover);

  const formatLayerMarkdown = (
    layer: Item,
    meta?: VectorStyleMeta
  ): string[] => {
    const lines: string[] = [];
    const carmaConf = extractCarmaConfig(layer.keywords);
    const descriptions = parseDescription(layer.description);
    const openDataUrl = carmaConf?.opendata as string | undefined;
    const vectorStyle = layer.vectorStyle || carmaConf?.vectorStyle;
    const vectorLegend = layer.vectorLegend || carmaConf?.vectorLegend;
    const isVector = !!(
      vectorStyle ||
      vectorLegend ||
      (layer as any).layerType === "vector"
    );

    const badges: string[] = layer.type ? [layer.type] : [];
    if (layer.queryable) badges.push("queryable");
    if (layer.type === "layer") badges.push(isVector ? "vector" : "raster");

    lines.push(`### ${layer.title} [${badges.join(", ")}]`);
    lines.push("");

    if (descriptions.length > 0) {
      for (const section of descriptions) {
        if (section.title === "Sichtbarkeit") continue;
        lines.push(
          `**${section.title}:** ${section.description.replace(/<[^>]*>/g, "")}`
        );
      }
      lines.push("");
    }

    if (layer.type === "link" && (layer as any).url) {
      lines.push(`- **URL:** ${(layer as any).url}`);
    }
    if (layer.service?.url) {
      const serviceUrl =
        !isVector && layer.name
          ? `${layer.service.url}?service=WMS&request=GetMap&layers=${layer.name}`
          : layer.service.url;
      lines.push(`- **Service-URL:** ${serviceUrl}`);
    }
    if (layer.minZoom !== undefined || layer.maxZoom !== undefined) {
      lines.push(
        `- **Zoom-Bereich:** ${layer.minZoom ?? "–"} – ${layer.maxZoom ?? "–"}`
      );
    }
    if (layer.copyright) {
      lines.push(`- **Bildnachweis:** ${layer.copyright}`);
    }
    if (openDataUrl) {
      lines.push(`- **Open Data:** ${openDataUrl}`);
    }
    if (vectorStyle) {
      lines.push(`- **Vector Style:** ${String(vectorStyle)}`);
    }
    if (vectorLegend) {
      lines.push(`- **Vector Legend:** ${String(vectorLegend)}`);
    }

    if (layer.tags && layer.tags.length > 0) {
      lines.push(`- **Tags:** ${layer.tags.join(", ")}`);
    }

    if (meta && meta.status === "loaded") {
      const effectiveSource = getEffectiveSource(meta);
      const effective = getEffectiveMapping(meta);
      const isFunction = effective
        ? parseMappingEntries(effective) === "function"
        : false;
      const hasFoto = effective ? mappingHasKey(effective, "foto") : false;

      const mappingParts: string[] = [];
      if (effectiveSource && sourceColors[effectiveSource]) {
        mappingParts.push(sourceColors[effectiveSource].label);
      }
      if (isFunction) mappingParts.push("function");
      if (hasFoto) mappingParts.push("foto");

      if (mappingParts.length > 0) {
        lines.push(`- **Infobox Mapping:** ${mappingParts.join(", ")}`);
      }

      if (meta.wmsInfoboxMapping?.length) {
        lines.push(`  - WMS: ${meta.wmsInfoboxMapping.join("; ")}`);
      }
      if (meta.vectorInfoboxMapping?.length) {
        lines.push(`  - Vector Style: ${meta.vectorInfoboxMapping.join("; ")}`);
      }
      if (meta.layerInfoboxMapping?.length) {
        lines.push(`  - Style Layer: ${meta.layerInfoboxMapping.join("; ")}`);
      }
    }

    if (layer.type === "layer" || layer.type === "object") {
      lines.push("");
      lines.push("**layerInfo:**");
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(buildLayerInfo(layer), null, 2));
      lines.push("```");
    }

    lines.push("");
    lines.push("---");
    lines.push("");
    return lines;
  };

  const formatSection = (
    heading: string,
    categories: { id: string; Title: string; layers: any[] }[]
  ): string[] => {
    if (categories.length === 0) return [];
    const lines: string[] = [];
    lines.push(`# ${heading}`);
    lines.push("");
    for (const category of categories) {
      lines.push(`## ${category.Title}`);
      lines.push("");
      for (const layer of category.layers) {
        lines.push(...formatLayerMarkdown(layer, vectorMetaMap[layer.id]));
      }
    }
    return lines;
  };

  if (markdown) {
    if (!allDataLoaded) return null;

    const lines: string[] = [];
    lines.push("# Geoportal Diensteübersicht");
    lines.push("");
    lines.push(
      `${
        displayLayers.length +
        topicMaps.length +
        sensorLayers.length +
        objectLayers.length +
        discoverLayers.length
      } Kategorien, ${totalLayerCount} Einträge.`
    );
    lines.push("");

    lines.push(...formatSection("Kartenebenen", displayLayers));
    lines.push(...formatSection("Teilzwillinge", topicMaps));
    lines.push(...formatSection("Sensoren", sensorLayers));
    lines.push(...formatSection("Objekte", objectLayers));
    lines.push(...formatSection("Entdecken", discoverLayers));

    return (
      <pre
        style={{
          padding: "32px 24px",
          fontFamily: "monospace",
          fontSize: 13,
          lineHeight: 1.6,
          backgroundColor: "#fff",
          minHeight: "100vh",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          margin: 0,
        }}
      >
        {lines.join("\n")}
      </pre>
    );
  }

  return (
    <PageLayout>
      <PageHeader title="Geoportal Diensteübersicht" />

      <ContentCard>
        <p style={{ margin: "0 0 8px", fontWeight: 600, color: "#2d3748" }}>
          Diese Seite zeigt alle konfigurierten Inhalte des Geoportals mit ihren
          Metadaten (Titel, Beschreibungen, Tags, Dienst-Informationen) an:
          Kartenebenen, Teilzwillinge, Sensoren, Objekte und Entdecken-Inhalte.
        </p>
        <ul style={{ margin: "0 0 8px", paddingLeft: 20 }}>
          <li>
            Jeder Layer wird mit seinen strukturierten Beschreibungsabschnitten
            dargestellt.
          </li>
          <li>
            Tags und Layer-Informationen sind bei jedem Eintrag einsehbar.
          </li>
          <li>
            Mit den Typ-Filtern unterhalb können die Einträge nach Typ (z.B.
            Layer, Link, Collection) oder Eigenschaft (z.B. queryable, vector)
            gefiltert werden.
          </li>
        </ul>
        {!loading && (
          <p style={{ margin: 0, fontSize: 13, color: "#718096" }}>
            {displayLayers.length +
              topicMaps.length +
              sensorLayers.length +
              objectLayers.length +
              discoverLayers.length}{" "}
            Kategorien, {totalLayerCount} Einträge geladen.
          </p>
        )}
      </ContentCard>

      {loading && <LoadingSpinner />}

      <div
        style={{
          marginBottom: 12,
          padding: "10px 14px",
          backgroundColor: "#fff",
          borderRadius: 8,
          border: "1px solid #e2e8f0",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#4a5568",
              marginBottom: 6,
            }}
          >
            Nach Typ filtern
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {Object.keys(badgeColors).map((key) => {
              const active = badgeFilter === key;
              const { bg, color } = badgeColors[key];
              return (
                <button
                  key={key}
                  onClick={() => setBadgeFilter(active ? null : key)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "4px 12px",
                    borderRadius: 10,
                    border: active
                      ? `2px solid ${color}`
                      : "2px solid transparent",
                    backgroundColor: bg,
                    color,
                    cursor: "pointer",
                    opacity: active ? 1 : 0.7,
                    transition: "opacity 0.15s, border-color 0.15s",
                  }}
                >
                  {key}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#4a5568",
              marginBottom: 6,
            }}
          >
            Nach Mapping filtern
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {Object.keys(mappingBadges).map((key) => {
              const active = badgeFilter === key;
              const { bg, color, label } = mappingBadges[key];
              return (
                <button
                  key={key}
                  onClick={() => setBadgeFilter(active ? null : key)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "4px 12px",
                    borderRadius: 10,
                    border: active
                      ? `2px solid ${color}`
                      : "2px solid transparent",
                    backgroundColor: bg,
                    color,
                    cursor: "pointer",
                    opacity: active ? 1 : 0.7,
                    transition: "opacity 0.15s, border-color 0.15s",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Filtern nach Titel, Beschreibung, Tags, Dienst..."
      />

      <FilterBadge filteredCount={filteredCount} totalCount={totalLayerCount} />

      {filteredLayers.length > 0 && (
        <SectionHeading>Kartenebenen</SectionHeading>
      )}
      {filteredLayers.map((category) => (
        <CategoryCard
          key={category.id}
          title={category.Title}
          layerCount={category.layers.length}
        >
          {category.layers.map((layer: Item, layerIndex: number) => (
            <ItemEntry
              key={layer.id}
              layer={layer}
              isLast={layerIndex === category.layers.length - 1}
              vectorMeta={vectorMetaMap[layer.id]}
            />
          ))}
        </CategoryCard>
      ))}

      {filteredTopicMaps.length > 0 && (
        <SectionHeading>Teilzwillinge</SectionHeading>
      )}
      {filteredTopicMaps.map((category) => (
        <CategoryCard
          key={category.id}
          title={category.Title}
          layerCount={category.layers.length}
        >
          {category.layers.map((layer: Item, layerIndex: number) => (
            <ItemEntry
              key={layer.id}
              layer={layer}
              isLast={layerIndex === category.layers.length - 1}
              vectorMeta={vectorMetaMap[layer.id]}
            />
          ))}
        </CategoryCard>
      ))}

      {filteredSensors.length > 0 && <SectionHeading>Sensoren</SectionHeading>}
      {filteredSensors.map((category) => (
        <CategoryCard
          key={category.id}
          title={category.Title}
          layerCount={category.layers.length}
        >
          {category.layers.map((layer: Item, layerIndex: number) => (
            <ItemEntry
              key={layer.id}
              layer={layer}
              isLast={layerIndex === category.layers.length - 1}
              vectorMeta={vectorMetaMap[layer.id]}
            />
          ))}
        </CategoryCard>
      ))}

      {filteredObjects.length > 0 && <SectionHeading>Objekte</SectionHeading>}
      {filteredObjects.map((category) => (
        <CategoryCard
          key={category.id}
          title={category.Title}
          layerCount={category.layers.length}
        >
          {category.layers.map((layer: Item, layerIndex: number) => (
            <ItemEntry
              key={layer.id}
              layer={layer}
              isLast={layerIndex === category.layers.length - 1}
              vectorMeta={vectorMetaMap[layer.id]}
            />
          ))}
        </CategoryCard>
      ))}

      {filteredDiscover.length > 0 && (
        <SectionHeading>Entdecken</SectionHeading>
      )}
      {filteredDiscover.map((category) => (
        <CategoryCard
          key={category.id}
          title={category.Title}
          layerCount={category.layers.length}
        >
          {category.layers.map((layer: Item, layerIndex: number) => (
            <ItemEntry
              key={layer.id}
              layer={layer}
              isLast={layerIndex === category.layers.length - 1}
              vectorMeta={vectorMetaMap[layer.id]}
            />
          ))}
        </CategoryCard>
      ))}
    </PageLayout>
  );
};

const ServiceList = (props: ServiceListProps) => (
  <LayerCatalogProvider>
    <ServiceListContent {...props} />
  </LayerCatalogProvider>
);

export default ServiceList;
