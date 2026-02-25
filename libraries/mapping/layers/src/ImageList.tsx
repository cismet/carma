import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import type { Layer } from "@carma/types";
import { getAllLayers } from "./slices/mapLayers";
import { LayerIcon } from "@carma-mapping/components";
import { updateUrl, extractCarmaConfig } from "@carma-commons/utils";
import { parseToMapLayer } from "@carma-mapping/utils";

const imgStyle: React.CSSProperties = {
  maxWidth: 300,
  maxHeight: 200,
  objectFit: "contain",
  border: "1px solid #ddd",
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
          } catch {
            // skip layers that fail to parse
          }
        }
      }
      setParsedLayerMap(map);
    };
    parseLayers();
  }, [allLayers]);

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
      <div
        style={{
          marginBottom: "24px",
          padding: "16px",
          border: "1px solid #f5c6cb",
          borderRadius: 4,
          backgroundColor: "#f8d7da",
          color: "#721c24",
        }}
      >
        <h3 style={{ margin: "0 0 8px" }}>
          {label} ({Object.keys(grouped).length})
        </h3>
        <ul style={{ margin: 0, paddingLeft: "20px" }}>
          {Object.entries(grouped).map(([title, urls]) => (
            <li key={title}>
              <strong>{title}</strong>
              {urls.map((url) => (
                <div
                  key={url}
                  style={{
                    fontSize: 11,
                    wordBreak: "break-all",
                  }}
                >
                  {url}
                </div>
              ))}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div style={{ padding: "24px", fontFamily: "sans-serif" }}>
      {renderErrorBox("Icon Errors", iconErrors)}
      {renderErrorBox("Thumbnail Errors", thumbnailErrors)}
      {renderErrorBox("Legend Errors", legendErrors)}
      {allLayers.map((category) => (
        <div key={category.id} style={{ marginBottom: "48px" }}>
          <h2 style={{ paddingBottom: "8px" }}>{category.Title}</h2>
          {category.layers.map((layer) => {
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
                  marginBottom: "32px",
                  paddingLeft: "16px",
                }}
              >
                <h3>{layer.title}</h3>

                <div
                  style={{
                    display: "flex",
                    gap: "16px",
                    marginBottom: 8,
                  }}
                >
                  <div>
                    <h5 style={{ margin: "0 0 4px", fontSize: 13 }}>
                      Icon (updateUrl)
                    </h5>
                    <LayerIcon
                      layer={parsedLayer || (layer as any)}
                      fallbackIcon={layer.icon}
                      displayUrl={true}
                      onError={handleIconError}
                    />
                  </div>
                  <div>
                    <h5 style={{ margin: "0 0 4px", fontSize: 13 }}>
                      Icon (geo.wuppertal.de)
                    </h5>
                    <LayerIcon
                      layer={parsedLayer || (layer as any)}
                      fallbackIcon={layer.icon}
                      iconPrefix="https://geo.wuppertal.de/geoportal/geoportal_icon_legends/"
                      displayUrl={true}
                      onError={handleIconError}
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "24px",
                    flexWrap: "wrap",
                    alignItems: "flex-start",
                  }}
                >
                  {layer.thumbnail && (
                    <div style={{ display: "flex", gap: "16px" }}>
                      <div>
                        <h4 style={{ margin: "0 0 4px" }}>
                          Thumbnail (updateUrl)
                        </h4>
                        <img
                          src={updateUrl(layer.thumbnail)}
                          alt={`${layer.title} thumbnail (updateUrl)`}
                          style={imgStyle}
                          onError={() =>
                            handleThumbnailError(
                              layer.title,
                              updateUrl(layer.thumbnail)
                            )
                          }
                        />
                        <div
                          style={{
                            fontSize: 11,
                            color: "#888",
                            wordBreak: "break-all",
                            maxWidth: 300,
                          }}
                        >
                          {updateUrl(layer.thumbnail)}
                        </div>
                      </div>
                      <div>
                        <h4 style={{ margin: "0 0 4px" }}>Thumbnail (raw)</h4>
                        <img
                          src={layer.thumbnail}
                          alt={`${layer.title} thumbnail (raw)`}
                          style={imgStyle}
                          onError={() =>
                            handleThumbnailError(layer.title, layer.thumbnail!)
                          }
                        />
                        <div
                          style={{
                            fontSize: 11,
                            color: "#888",
                            wordBreak: "break-all",
                            maxWidth: 300,
                          }}
                        >
                          {layer.thumbnail}
                        </div>
                      </div>
                    </div>
                  )}

                  {legends && legends.length > 0 && (
                    <div>
                      <h4 style={{ margin: "0 0 4px" }}>Legend</h4>
                      {legends.map(
                        (legend: { OnlineResource: string }, i: number) => (
                          <div
                            key={`legend_${i}`}
                            style={{
                              display: "flex",
                              gap: "16px",
                              marginBottom: 8,
                            }}
                          >
                            <div>
                              <h5 style={{ margin: "0 0 4px", fontSize: 13 }}>
                                updateUrl
                              </h5>
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
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "#888",
                                  wordBreak: "break-all",
                                  maxWidth: 300,
                                }}
                              >
                                {updateUrl(legend.OnlineResource)}
                              </div>
                            </div>
                            <div>
                              <h5 style={{ margin: "0 0 4px", fontSize: 13 }}>
                                raw
                              </h5>
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
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "#888",
                                  wordBreak: "break-all",
                                  maxWidth: 300,
                                }}
                              >
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
  );
};

export default ImageList;
