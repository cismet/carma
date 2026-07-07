import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import type { Item, Layer } from "../../lib/contracts/carma-layers.d";
import { wuppLayerCatalogConfig } from "../../config/layerCatalogConfig";
import { getAllLayers } from "../../slices/mapLayers";
import { useAdditionalConfig } from "../../hooks/useAdditionalConfig";
import { useLoadCapabilities } from "../../hooks/useLoadCapabilities";
import { LayerIcon } from "@carma-mapping/components";
import { updateUrl, extractCarmaConfig } from "@carma-commons/utils";
import { parseToMapLayer, resolveLayerIconUrl } from "@carma-mapping/utils";
import LegendDisplay from "../../components/LegendDisplay";
import ThumbnailDisplay from "../../components/ThumbnailDisplay";
import PageLayout from "../components/PageLayout";
import PageHeader from "../components/PageHeader";
import ContentCard from "../components/ContentCard";
import LoadingSpinner from "../components/LoadingSpinner";
import SearchInput from "../components/SearchInput";
import FilterBadge from "../components/FilterBadge";
import CategoryCard from "../components/CategoryCard";
import Badge from "../components/Badge";

const ICON_PREFIX =
  import.meta.env.VITE_WUPP_ASSET_BASEURL +
  "/geoportal/geoportal_icon_legends/";
const ORIGINAL_ICON_PREFIX =
  "https://geo.wuppertal.de/geoportal/geoportal_icon_legends/";

const urlStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: "monospace",
  color: "#718096",
  wordBreak: "break-all",
  marginTop: 8,
  padding: "2px 6px",
  backgroundColor: "#f0f2f5",
  borderRadius: 4,
};

interface ImageListProps {
  markdown?: boolean;
}

const ImageList = ({ markdown = false }: ImageListProps) => {
  const allLayers = useSelector(getAllLayers);
  const additionalLayersRef = useRef<
    { serviceName: string; title: string; layers: any[] }[]
  >([]);
  const [parsedLayerMap, setParsedLayerMap] = useState<Record<string, Layer>>(
    {}
  );
  const [iconErrors, setIconErrors] = useState<
    { title: string; url: string }[]
  >([]);
  const [thumbnailErrors, setThumbnailErrors] = useState<
    { title: string; url: string }[]
  >([]);
  const [legendErrors, setLegendErrors] = useState<
    { title: string; url: string }[]
  >([]);
  const [parseErrors, setParseErrors] = useState<
    { title: string; url: string }[]
  >([]);
  const [search, setSearch] = useState("");

  const addError = useCallback(
    (
      setter: React.Dispatch<
        React.SetStateAction<{ title: string; url: string }[]>
      >,
      title: string,
      url: string
    ) => {
      setter((prev) =>
        prev.some((e) => e.title === title && e.url === url)
          ? prev
          : [...prev, { title, url }]
      );
    },
    []
  );

  const handleIconError = useCallback(
    (title: string, url: string) => addError(setIconErrors, title, url),
    [addError]
  );
  const handleThumbnailError = useCallback(
    (title: string, url: string) => addError(setThumbnailErrors, title, url),
    [addError]
  );
  const handleLegendError = useCallback(
    (title: string, url: string) => addError(setLegendErrors, title, url),
    [addError]
  );

  const addItemToCategory = useCallback(
    (
      categoryId: string,
      subCategory: { id: string; Title: string },
      item: any
    ) => {
      if (categoryId === "mapLayers") {
        const layers = Array.isArray(item) ? item : [item];
        additionalLayersRef.current.push({
          serviceName: subCategory.id,
          title: subCategory.Title,
          layers,
        });
      }
    },
    []
  );

  const noopSetSidebarElements = useCallback((() => {}) as any, []);

  const { loadingAdditionalConfig } = useAdditionalConfig({
    addItemToCategory,
    setSidebarElements: noopSetSidebarElements,
    assetBaseUrl: wuppLayerCatalogConfig.assetBaseUrl,
  });

  useLoadCapabilities({
    loadingAdditionalConfig,
    activeLayers: [] as any,
    services: wuppLayerCatalogConfig.services,
  });

  // Merge additional layers (from useAdditionalConfig) into WMS layers for display
  const displayLayers = useMemo(() => {
    if (allLayers.length === 0) return allLayers;
    const merged = JSON.parse(JSON.stringify(allLayers));
    for (const entry of additionalLayersRef.current) {
      const existing = merged.find((cat: any) => cat.id === entry.serviceName);
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
          layers: entry.layers,
        });
      }
    }
    return merged;
  }, [allLayers]);

  const loading = allLayers.length === 0;
  const totalLayerCount = displayLayers.reduce(
    (sum, cat) => sum + cat.layers.length,
    0
  );
  const parsingDone =
    !loading && totalLayerCount > 0 && Object.keys(parsedLayerMap).length > 0;

  // Markdown mode: pre-fetch all image URLs and collect errors before rendering
  const [markdownReady, setMarkdownReady] = useState(false);
  const [mdIconErrors, setMdIconErrors] = useState<
    { title: string; url: string }[]
  >([]);
  const [mdThumbnailErrors, setMdThumbnailErrors] = useState<
    { title: string; url: string }[]
  >([]);
  const [mdLegendErrors, setMdLegendErrors] = useState<
    { title: string; url: string }[]
  >([]);

  useEffect(() => {
    if (!markdown || !parsingDone) return;

    const checkImage = (url: string): Promise<boolean> =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
      });

    const run = async () => {
      const iconErrs: { title: string; url: string }[] = [];
      const thumbErrs: { title: string; url: string }[] = [];
      const legendErrs: { title: string; url: string }[] = [];

      for (const category of displayLayers) {
        for (const layer of category.layers) {
          const carmaConf = extractCarmaConfig(layer.keywords);
          const vectorLegend = layer.vectorLegend || carmaConf?.vectorLegend;
          const vectorStyle = layer.vectorStyle || carmaConf?.vectorStyle;
          const legends =
            vectorStyle && vectorLegend
              ? [{ OnlineResource: vectorLegend as string }]
              : (layer as any).props?.Style?.[0]?.LegendURL;
          const parsedLayer = parsedLayerMap[layer.id];

          // Check icon
          const adaptedIconUrl = parsedLayer
            ? resolveLayerIconUrl(parsedLayer, ICON_PREFIX)
            : undefined;
          const originalIconUrl = parsedLayer
            ? resolveLayerIconUrl(parsedLayer, ORIGINAL_ICON_PREFIX)
            : undefined;
          if (adaptedIconUrl) {
            const ok = await checkImage(adaptedIconUrl);
            if (!ok) {
              iconErrs.push({ title: layer.title, url: adaptedIconUrl });
            }
          }
          if (originalIconUrl) {
            const ok = await checkImage(originalIconUrl);
            if (!ok) {
              iconErrs.push({ title: layer.title, url: originalIconUrl });
            }
          }

          // Check thumbnail
          if (layer.thumbnail) {
            const adaptedUrl = updateUrl(layer.thumbnail);
            const [adaptedOk, originalOk] = await Promise.all([
              checkImage(adaptedUrl),
              checkImage(layer.thumbnail),
            ]);
            if (!adaptedOk) {
              thumbErrs.push({ title: layer.title, url: adaptedUrl });
            }
            if (!originalOk) {
              thumbErrs.push({ title: layer.title, url: layer.thumbnail });
            }
          }

          // Check legends
          if (legends && legends.length > 0) {
            for (const legend of legends) {
              const adaptedUrl = updateUrl(legend.OnlineResource);
              const [adaptedOk, originalOk] = await Promise.all([
                checkImage(adaptedUrl),
                checkImage(legend.OnlineResource),
              ]);
              if (!adaptedOk) {
                legendErrs.push({ title: layer.title, url: adaptedUrl });
              }
              if (!originalOk) {
                legendErrs.push({
                  title: layer.title,
                  url: legend.OnlineResource,
                });
              }
            }
          }
        }
      }

      setMdIconErrors(iconErrs);
      setMdThumbnailErrors(thumbErrs);
      setMdLegendErrors(legendErrs);
      setMarkdownReady(true);
    };

    run();
  }, [markdown, parsingDone, displayLayers, parsedLayerMap]);

  useEffect(() => {
    const parseLayers = async () => {
      const map: Record<string, Layer> = {};
      for (const category of displayLayers) {
        for (const layer of category.layers) {
          try {
            const parsed = await parseToMapLayer(layer, false, false);
            map[layer.id] = parsed;
          } catch (err) {
            setParseErrors((prev) =>
              prev.some((e) => e.title === layer.title)
                ? prev
                : [
                    ...prev,
                    {
                      title: layer.title,
                      url: String(err),
                    },
                  ]
            );
          }
        }
      }
      setParsedLayerMap(map);
    };
    parseLayers();
  }, [displayLayers]);

  const getLayerUrls = useCallback((layer: Item): string[] => {
    const urls: string[] = [];
    const carmaConf = extractCarmaConfig(layer.keywords);
    const vectorLegend = layer.vectorLegend || carmaConf?.vectorLegend;
    const vectorStyle = layer.vectorStyle || carmaConf?.vectorStyle;
    const legends =
      vectorStyle && vectorLegend
        ? [{ OnlineResource: vectorLegend as string }]
        : (layer as any).props?.Style?.[0]?.LegendURL;

    if (layer.thumbnail) {
      urls.push(updateUrl(layer.thumbnail), layer.thumbnail);
    }
    if (legends) {
      for (const legend of legends) {
        urls.push(updateUrl(legend.OnlineResource), legend.OnlineResource);
      }
    }
    // icon urls are harder to reconstruct exactly, so also match title
    urls.push(layer.title);
    return urls;
  }, []);

  const filteredLayers = useMemo(() => {
    if (!search.trim()) return displayLayers;
    const term = search.toLowerCase();
    return displayLayers
      .map((category) => ({
        ...category,
        layers: category.layers.filter((layer) =>
          getLayerUrls(layer).some((url) => url.toLowerCase().includes(term))
        ),
      }))
      .filter((category) => category.layers.length > 0);
  }, [displayLayers, search, getLayerUrls]);

  const renderErrorBox = (
    label: string,
    errors: { title: string; url: string }[]
  ) => {
    if (errors.length === 0) return null;
    const grouped = errors.reduce<Record<string, string[]>>((acc, e) => {
      (acc[e.title] ??= []).push(e.url);
      return acc;
    }, {});
    return (
      <details
        style={{
          marginBottom: 16,
          background: "#fff",
          borderRadius: 8,
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          borderLeft: "4px solid #e53e3e",
          overflow: "hidden",
        }}
      >
        <summary
          style={{
            padding: "12px 16px",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 14,
            color: "#c53030",
            userSelect: "none",
          }}
        >
          {label}{" "}
          <span
            style={{
              display: "inline-block",
              background: "#fed7d7",
              color: "#c53030",
              fontSize: 12,
              fontWeight: 700,
              padding: "1px 8px",
              borderRadius: 10,
              marginLeft: 6,
            }}
          >
            {Object.keys(grouped).length}
          </span>
        </summary>
        <ul
          style={{
            margin: 0,
            padding: "0 16px 12px 32px",
            listStyle: "disc",
          }}
        >
          {Object.entries(grouped).map(([title, urls]) => (
            <li key={title} style={{ marginBottom: 6 }}>
              <strong style={{ fontSize: 13 }}>{title}</strong>
              {urls.map((url) => (
                <div key={url} style={urlStyle}>
                  {url}
                </div>
              ))}
            </li>
          ))}
        </ul>
      </details>
    );
  };

  const getNumberOfLayers = (layerCategories: any) => {
    let numberOfLayers = 0;
    layerCategories?.forEach((category) => {
      numberOfLayers += category?.layers?.length;
    });
    return numberOfLayers;
  };

  if (markdown) {
    if (!markdownReady) return null;

    const formatErrors = (
      label: string,
      errors: { title: string; url: string }[]
    ): string[] => {
      if (errors.length === 0) return [];
      const lines: string[] = [];
      lines.push(`## ${label}`);
      lines.push("");
      for (const err of errors) {
        lines.push(`- **${err.title}**: ${err.url}`);
      }
      lines.push("");
      return lines;
    };

    const lines: string[] = [];
    lines.push("# Geoportal Layer-Übersicht");
    lines.push("");

    lines.push(...formatErrors("Parse-Fehler", parseErrors));
    lines.push(...formatErrors("Icon-Fehler", mdIconErrors));
    lines.push(...formatErrors("Vorschaubild-Fehler", mdThumbnailErrors));
    lines.push(...formatErrors("Legenden-Fehler", mdLegendErrors));

    for (const category of displayLayers) {
      lines.push(`## ${category.Title}`);
      lines.push("");

      for (const layer of category.layers) {
        const carmaConf = extractCarmaConfig(layer.keywords);
        const vectorLegend = layer.vectorLegend || carmaConf?.vectorLegend;
        const vectorStyle = layer.vectorStyle || carmaConf?.vectorStyle;
        const legends =
          vectorStyle && vectorLegend
            ? [{ OnlineResource: vectorLegend as string }]
            : (layer as any).props?.Style?.[0]?.LegendURL;
        const parsedLayer = parsedLayerMap[layer.id];

        lines.push(`### ${layer.title}`);
        lines.push("");

        // Icon
        const adaptedIconUrl = parsedLayer
          ? resolveLayerIconUrl(parsedLayer, ICON_PREFIX)
          : undefined;
        const originalIconUrl = parsedLayer
          ? resolveLayerIconUrl(parsedLayer, ORIGINAL_ICON_PREFIX)
          : undefined;
        if (adaptedIconUrl || originalIconUrl) {
          lines.push("**Icon:**");
          if (adaptedIconUrl) {
            lines.push(`- Angepasst: ${adaptedIconUrl}`);
          }
          if (originalIconUrl) {
            lines.push(`- Original: ${originalIconUrl}`);
          }
          lines.push("");
        }

        // Thumbnail
        if (layer.thumbnail) {
          lines.push("**Vorschaubild:**");
          lines.push(`- Angepasst: ${updateUrl(layer.thumbnail)}`);
          lines.push(`- Original: ${layer.thumbnail}`);
          lines.push("");
        }

        // Legends
        if (legends && legends.length > 0) {
          lines.push("**Legende:**");
          for (const legend of legends) {
            lines.push(`- Angepasst: ${updateUrl(legend.OnlineResource)}`);
            lines.push(`- Original: ${legend.OnlineResource}`);
          }
          lines.push("");
        }

        lines.push("---");
        lines.push("");
      }
    }

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
      <PageHeader title="Geoportal Bilderübersicht" />

      <ContentCard>
        <p style={{ margin: "0 0 8px", fontWeight: 600, color: "#2d3748" }}>
          Diese Seite zeigt alle konfigurierten Layer des Geoportals mit ihren
          zugehörigen Bildern (Icons, Vorschaubilder und Legenden) an.
        </p>
        <ul style={{ margin: "0 0 8px", paddingLeft: 20 }}>
          <li>
            <strong>Angepasst</strong> zeigt die URL nach Anwendung der internen
            URL-Umschreibung.
          </li>
          <li>
            <strong>Original</strong> zeigt die unveränderte Quell-URL.
          </li>
          <li>
            Fehlerhafte Bilder und Layer werden in den roten Fehlerboxen oben
            aufgelistet.
          </li>
        </ul>
        <p style={{ margin: 0, fontSize: 13, color: "#718096" }}>
          Über das Suchfeld können Layer nach URL oder Titel gefiltert werden.
        </p>
      </ContentCard>

      {loading && <LoadingSpinner />}

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Filtern..."
      />

      <FilterBadge
        filteredCount={getNumberOfLayers(filteredLayers)}
        totalCount={getNumberOfLayers(displayLayers)}
      />

      {renderErrorBox("Parse Error", parseErrors)}
      {renderErrorBox("Icon Error", iconErrors)}
      {renderErrorBox("Vorschaubild Error", thumbnailErrors)}
      {renderErrorBox("Legenden Error", legendErrors)}

      {filteredLayers.map((category) => (
        <CategoryCard key={category.id} title={category.Title}>
          {category.layers.map((layer, layerIndex) => {
            const carmaConf = extractCarmaConfig(layer.keywords);
            const vectorLegend = layer.vectorLegend || carmaConf?.vectorLegend;
            const vectorStyle = layer.vectorStyle || carmaConf?.vectorStyle;
            const legends =
              vectorStyle && vectorLegend
                ? [{ OnlineResource: vectorLegend as string }]
                : (layer as any).props?.Style?.[0]?.LegendURL;
            const parsedLayer = parsedLayerMap[layer.id];

            return (
              <div
                key={layer.id}
                style={{
                  padding: "16px 20px",
                  borderBottom:
                    layerIndex < category.layers.length - 1
                      ? "1px solid #edf2f7"
                      : "none",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 12px",
                    fontSize: 15,
                    fontWeight: 600,
                    color: "#2d3748",
                  }}
                >
                  {layer.title}
                </h3>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                  }}
                >
                  <div>
                    <Badge style={{ marginBottom: 10 }}>Icon</Badge>
                    <div
                      style={{
                        display: "flex",
                        gap: 16,
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        <Badge size="small">Angepasst</Badge>
                        <div>
                          <LayerIcon
                            layer={parsedLayer || (layer as any)}
                            fallbackIcon={layer.icon}
                            displayUrl={true}
                            onError={handleIconError}
                          />
                        </div>
                      </div>
                      <div>
                        <Badge size="small">Original</Badge>
                        <div>
                          <LayerIcon
                            layer={parsedLayer || (layer as any)}
                            fallbackIcon={layer.icon}
                            iconPrefix="https://geo.wuppertal.de/geoportal/geoportal_icon_legends/"
                            displayUrl={true}
                            onError={handleIconError}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {layer.thumbnail && (
                    <div>
                      <Badge style={{ marginBottom: 10 }}>Vorschaubild</Badge>
                      <div
                        style={{
                          display: "flex",
                          gap: 16,
                          marginBottom: 10,
                        }}
                      >
                        <div>
                          <Badge size="small">Angepasst</Badge>
                          <ThumbnailDisplay
                            url={layer.thumbnail}
                            updateUrl
                            onError={() =>
                              handleThumbnailError(
                                layer.title,
                                updateUrl(layer.thumbnail)
                              )
                            }
                            style={{
                              maxHeight: "200px",
                              maxWidth: "356px",
                              aspectRatio: "1.7777/1",
                            }}
                          />
                          <div style={urlStyle}>
                            {updateUrl(layer.thumbnail)}
                          </div>
                        </div>
                        <div>
                          <Badge size="small">Original</Badge>
                          <ThumbnailDisplay
                            url={layer.thumbnail}
                            onError={() =>
                              handleThumbnailError(layer.title, layer.thumbnail)
                            }
                            style={{
                              maxHeight: "200px",
                              maxWidth: "356px",
                              aspectRatio: "1.7777/1",
                            }}
                          />
                          <div style={urlStyle}>{layer.thumbnail}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {legends && legends.length > 0 && (
                    <div>
                      <Badge style={{ marginBottom: 10 }}>Legende</Badge>
                      {legends.map(
                        (legend: { OnlineResource: string }, i: number) => (
                          <div
                            key={`legend_${i}`}
                            style={{
                              display: "flex",
                              gap: 16,
                              marginBottom: 10,
                            }}
                          >
                            <div>
                              <Badge size="small">Angepasst</Badge>
                              <LegendDisplay
                                url={legend.OnlineResource}
                                updateUrl
                                onError={() =>
                                  handleLegendError(
                                    layer.title,
                                    updateUrl(legend.OnlineResource)
                                  )
                                }
                              />
                              <div style={urlStyle}>
                                {updateUrl(legend.OnlineResource)}
                              </div>
                            </div>
                            <div>
                              <Badge size="small">Original</Badge>
                              <LegendDisplay
                                url={legend.OnlineResource}
                                onError={() =>
                                  handleLegendError(
                                    layer.title,
                                    legend.OnlineResource
                                  )
                                }
                              />
                              <div style={urlStyle}>
                                {legend.OnlineResource}
                              </div>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </CategoryCard>
      ))}
    </PageLayout>
  );
};

export default ImageList;
