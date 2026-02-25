import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import type { Item, Layer } from "@carma/types";
import { getAllLayers } from "./slices/mapLayers";
import { LayerIcon } from "@carma-mapping/components";
import { updateUrl, extractCarmaConfig } from "@carma-commons/utils";
import { parseToMapLayer } from "@carma-mapping/utils";

const imgStyle: React.CSSProperties = {
  maxWidth: 300,
  maxHeight: 200,
  objectFit: "contain",
  borderRadius: 6,
  boxShadow: "0 1px 4px rgba(0,0,0,0.10)",
  background: "#fff",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  fontSize: 11,
  fontWeight: 600,
  padding: "2px 8px",
  borderRadius: 10,
  backgroundColor: "#e8ecf1",
  color: "#4a5568",
  marginBottom: 6,
};

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

const ImageList = () => {
  const allLayers = useSelector(getAllLayers);
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

  useEffect(() => {
    const parseLayers = async () => {
      const map: Record<string, Layer> = {};
      for (const category of allLayers) {
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
  }, [allLayers]);

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
    if (!search.trim()) return allLayers;
    const term = search.toLowerCase();
    return allLayers
      .map((category) => ({
        ...category,
        layers: category.layers.filter((layer) =>
          getLayerUrls(layer).some((url) => url.toLowerCase().includes(term))
        ),
      }))
      .filter((category) => category.layers.length > 0);
  }, [allLayers, search, getLayerUrls]);

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

  return (
    <div
      style={{
        padding: "32px 24px",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        backgroundColor: "#f5f7fa",
        minHeight: "100vh",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <h1
          style={{
            margin: "0 0 24px",
            fontSize: 24,
            fontWeight: 700,
            color: "#2d3748",
          }}
        >
          Geoportal Bilderübersicht
        </h1>
        <input
          type="text"
          placeholder="Filtern..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 16px",
            marginBottom: 24,
            fontSize: 14,
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            boxSizing: "border-box",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            outline: "none",
            transition: "border-color 0.2s, box-shadow 0.2s",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "#667eea";
            e.currentTarget.style.boxShadow =
              "0 0 0 3px rgba(102,126,234,0.15)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "#e2e8f0";
            e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)";
          }}
        />

        {getNumberOfLayers(filteredLayers) !== getNumberOfLayers(allLayers) && (
          <div style={{ marginBottom: 20 }}>
            <span
              style={{
                display: "inline-block",
                fontSize: 13,
                fontWeight: 600,
                padding: "4px 12px",
                borderRadius: 12,
                backgroundColor: "#ebf4ff",
                color: "#3182ce",
              }}
            >
              Showing {getNumberOfLayers(filteredLayers)} of{" "}
              {getNumberOfLayers(allLayers)} layers
            </span>
          </div>
        )}

        {renderErrorBox("Parse Error", parseErrors)}
        {renderErrorBox("Icon Error", iconErrors)}
        {renderErrorBox("Vorschaubild Error", thumbnailErrors)}
        {renderErrorBox("Legenden Error", legendErrors)}

        {filteredLayers.map((category) => (
          <div
            key={category.id}
            style={{
              marginBottom: 24,
              background: "#fff",
              borderRadius: 10,
              boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
              overflow: "hidden",
            }}
          >
            <h2
              style={{
                margin: 0,
                padding: "16px 20px",
                fontSize: 18,
                fontWeight: 700,
                borderBottom: "1px solid #edf2f7",
                color: "#2d3748",
              }}
            >
              {category.Title}
            </h2>

            {category.layers.map((layer, layerIndex) => {
              const carmaConf = extractCarmaConfig(layer.keywords);
              const vectorLegend =
                layer.vectorLegend || carmaConf?.vectorLegend;
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
                      gap: 24,
                      flexWrap: "wrap",
                      alignItems: "flex-start",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          ...badgeStyle,
                          marginBottom: 10,
                        }}
                      >
                        Icon
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 16,
                          marginBottom: 10,
                        }}
                      >
                        <div>
                          <div
                            style={{
                              ...badgeStyle,
                              fontSize: 10,
                              padding: "1px 6px",
                            }}
                          >
                            Angepasst
                          </div>
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
                          <div
                            style={{
                              ...badgeStyle,
                              fontSize: 10,
                              padding: "1px 6px",
                            }}
                          >
                            Original
                          </div>
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
                        <div
                          style={{
                            ...badgeStyle,
                            marginBottom: 10,
                          }}
                        >
                          Vorschaubild
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: 16,
                            marginBottom: 10,
                          }}
                        >
                          <div>
                            <div
                              style={{
                                ...badgeStyle,
                                fontSize: 10,
                                padding: "1px 6px",
                              }}
                            >
                              Angepasst
                            </div>
                            <img
                              src={updateUrl(layer.thumbnail)}
                              alt={`${layer.title} Vorschaubild (Angepasst)`}
                              style={imgStyle}
                              onError={() =>
                                handleThumbnailError(
                                  layer.title,
                                  updateUrl(layer.thumbnail)
                                )
                              }
                            />
                            <div style={urlStyle}>
                              {updateUrl(layer.thumbnail)}
                            </div>
                          </div>
                          <div>
                            <div
                              style={{
                                ...badgeStyle,
                                fontSize: 10,
                                padding: "1px 6px",
                              }}
                            >
                              Original
                            </div>
                            <img
                              src={layer.thumbnail}
                              alt={`${layer.title} Vorschaubild (Original)`}
                              style={imgStyle}
                              onError={() =>
                                handleThumbnailError(
                                  layer.title,
                                  layer.thumbnail!
                                )
                              }
                            />
                            <div style={urlStyle}>{layer.thumbnail}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {legends && legends.length > 0 && (
                      <div>
                        <div
                          style={{
                            ...badgeStyle,
                            marginBottom: 10,
                          }}
                        >
                          Legende
                        </div>
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
                                <div
                                  style={{
                                    ...badgeStyle,
                                    fontSize: 10,
                                    padding: "1px 6px",
                                  }}
                                >
                                  Angepasst
                                </div>
                                <img
                                  src={updateUrl(legend.OnlineResource)}
                                  alt={`${layer.title} legend (updateUrl)`}
                                  style={imgStyle}
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
                                <div
                                  style={{
                                    ...badgeStyle,
                                    fontSize: 10,
                                    padding: "1px 6px",
                                  }}
                                >
                                  Original
                                </div>
                                <img
                                  src={legend.OnlineResource}
                                  alt={`${layer.title} legend (raw)`}
                                  style={imgStyle}
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
          </div>
        ))}
      </div>
    </div>
  );
};

export default ImageList;
