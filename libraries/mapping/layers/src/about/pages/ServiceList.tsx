import { useCallback, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useStore } from "react-redux";
import type { Item } from "@carma-mapping/layers";
import { getAllLayers } from "../../slices/mapLayers";
import { useAdditionalConfig } from "../../hooks/useAdditionalConfig";
import { useLoadCapabilities } from "../../hooks/useLoadCapabilities";
import { extractCarmaConfig } from "@carma-commons/utils";
import { parseDescription } from "../../helper/layerHelper";
import { partianTwinConfig } from "../../helper/config";
import PageLayout from "../components/PageLayout";
import PageHeader from "../components/PageHeader";
import ContentCard from "../components/ContentCard";
import LoadingSpinner from "../components/LoadingSpinner";
import SearchInput from "../components/SearchInput";
import FilterBadge from "../components/FilterBadge";
import CategoryCard from "../components/CategoryCard";
import Badge from "../components/Badge";

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

const ItemEntry = ({ layer, isLast }: { layer: Item; isLast: boolean }) => {
  const carmaConf = extractCarmaConfig(layer.keywords);
  const descriptions = parseDescription(layer.description);
  const typeColors = typeBadgeColors[layer.type] || {
    bg: "#e8ecf1",
    color: "#4a5568",
  };
  const openDataUrl = carmaConf?.opendata as string | undefined;
  const vectorStyle = layer.vectorStyle || carmaConf?.vectorStyle;
  const vectorLegend = layer.vectorLegend || carmaConf?.vectorLegend;
  const isVector =
    !!(vectorStyle || vectorLegend || (layer as any).layerType === "vector");

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
    </div>
  );
};

const ServiceList = () => {
  const allLayers = useSelector(getAllLayers);
  const store = useStore();
  const additionalLayersRef = useRef<
    { serviceName: string; title: string; layers: any[] }[]
  >([]);
  const [sensorEntries, setSensorEntries] = useState<
    { serviceName: string; title: string; layers: any[] }[]
  >([]);
  const [objectEntries, setObjectEntries] = useState<
    { serviceName: string; title: string; layers: any[] }[]
  >([]);
  const [search, setSearch] = useState("");

  const addItemToCategory = useCallback(
    (
      categoryId: string,
      subCategory: { id: string; Title: string },
      item: any
    ) => {
      const layers = Array.isArray(item) ? item : [item];
      const entry = {
        serviceName: subCategory.id,
        title: subCategory.Title,
        layers,
      };
      if (categoryId === "mapLayers") {
        additionalLayersRef.current.push(entry);
      } else if (categoryId === "sensors") {
        setSensorEntries((prev) => [...prev, entry]);
      } else if (categoryId === "objects") {
        setObjectEntries((prev) => [...prev, entry]);
      }
    },
    []
  );

  const noopSetSidebarElements = useCallback((() => {}) as any, []);

  const { loadingAdditionalConfig } = useAdditionalConfig({
    addItemToCategory,
    setSidebarElements: noopSetSidebarElements,
  });

  useLoadCapabilities({
    loadingAdditionalConfig,
    activeLayers: [] as any,
    store,
  });

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

  const loading = allLayers.length === 0;

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
      if (!search.trim()) return categories;
      const term = search.toLowerCase();
      return categories
        .map((category) => ({
          ...category,
          layers: category.layers.filter((layer: Item) =>
            getSearchableText(layer).includes(term)
          ),
        }))
        .filter((category) => category.layers.length > 0);
    },
    [search, getSearchableText]
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
    getNumberOfLayers(objectLayers);
  const filteredCount =
    getNumberOfLayers(filteredLayers) +
    getNumberOfLayers(filteredTopicMaps) +
    getNumberOfLayers(filteredSensors) +
    getNumberOfLayers(filteredObjects);

  return (
    <PageLayout>
      <PageHeader title="Geoportal Diensteübersicht" />

      <ContentCard>
        <p style={{ margin: "0 0 8px", fontWeight: 600, color: "#2d3748" }}>
          Diese Seite zeigt alle konfigurierten Inhalte des Geoportals mit ihren
          Metadaten (Titel, Beschreibungen, Tags, Dienst-Informationen) an:
          Kartenebenen, Teilzwillinge, Sensoren und Objekte.
        </p>
        <ul style={{ margin: "0 0 8px", paddingLeft: 20 }}>
          <li>
            Jeder Layer wird mit seinen strukturierten Beschreibungsabschnitten
            dargestellt.
          </li>
          <li>
            Tags und Layer Informationen sind bei jedem Eintrag einsehbar.
          </li>
        </ul>
        {!loading && (
          <p style={{ margin: 0, fontSize: 13, color: "#718096" }}>
            {displayLayers.length +
              topicMaps.length +
              sensorLayers.length +
              objectLayers.length}{" "}
            Kategorien, {totalLayerCount} Einträge geladen.
          </p>
        )}
      </ContentCard>

      {loading && <LoadingSpinner />}

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
            />
          ))}
        </CategoryCard>
      ))}
    </PageLayout>
  );
};

export default ServiceList;
