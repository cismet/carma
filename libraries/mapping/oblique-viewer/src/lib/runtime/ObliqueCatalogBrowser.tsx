import { useEffect, useMemo, useState, type HTMLAttributes } from "react";
import {
  Button,
  Input,
  InputNumber,
  Modal,
  Space,
  Table,
  Typography,
  message,
  type TableProps,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Degrees } from "@carma-units";
import type { ObliqueImageRecord, ObliqueSelectionData } from "../core/types";
import { cardinalLetter } from "../core/utils/orientation";
import {
  catalogImageHeading,
  EMPTY_CATALOG_IMAGE_FILTER,
  type CatalogImageFilter,
} from "../core/utils/catalog-image-filter";

type Row = {
  id: string;
  sourceId: string;
  series: string;
  seriesLabel: string;
  camera: string;
  view: string;
  strip: string;
  waypoint: string;
  station: string;
  sector: string;
  heading: Degrees | null;
  record: ObliqueImageRecord;
};
const comparator = new Intl.Collator("de", {
  numeric: true,
  sensitivity: "base",
});
const filtersFor = (
  rows: Row[],
  key: keyof Pick<Row, "series" | "camera" | "view" | "strip" | "waypoint">
) =>
  [...new Set(rows.map((row) => row[key]))]
    .sort(comparator.compare)
    .map((value) => ({
      text:
        key === "series"
          ? rows.find((row) => row.series === value)!.seriesLabel
          : value,
      value,
    }));
export const ObliqueCatalogBrowser = ({
  open,
  onClose,
  catalog,
  eligible,
  filter,
  onFilterChange,
  onFlyToImage,
  onFlyToExtent,
  onLoadAll,
  loading,
  complete,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  catalog: ObliqueSelectionData | null;
  eligible: ObliqueSelectionData | null;
  filter: CatalogImageFilter;
  onFilterChange: (filter: CatalogImageFilter) => void;
  onFlyToImage: (id: string) => Promise<boolean>;
  onFlyToExtent: (ids: readonly string[]) => Promise<boolean>;
  onLoadAll: () => Promise<unknown>;
  loading: boolean;
  complete: boolean;
  busy: boolean;
}) => {
  const [selected, setSelected] = useState<string[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const [flyingExtent, setFlyingExtent] = useState(false);
  const allRows = useMemo(
    () =>
      !open || !catalog
        ? []
        : [...catalog.imageRecords.values()].map((record): Row => {
            const dataset = catalog.datasets.get(record.seriesId);
            return {
              id: record.id,
              sourceId: record.sourceId,
              series: record.seriesId,
              seriesLabel: dataset?.label ?? record.seriesId,
              camera: record.cameraId,
              view: dataset?.cameras[record.cameraId]?.view ?? "—",
              strip: String(record.lineIndex ?? "—"),
              waypoint: String(record.waypointIndex ?? "—"),
              station: record.stationId ?? "—",
              sector: cardinalLetter(record.sector),
              heading: catalogImageHeading(record),
              record,
            };
          }),
    [open, catalog]
  );
  const rows = useMemo(
    () => allRows.filter((row) => eligible?.imageRecords.has(row.id)),
    [allRows, eligible]
  );
  useEffect(() => {
    setSelected((previous) => {
      const next = previous.filter((id) => eligible?.imageRecords.has(id));
      return next.length === previous.length ? previous : next;
    });
  }, [eligible]);
  const loadAll = async () => {
    if (loadingAll) return;
    setLoadingAll(true);
    try {
      await onLoadAll();
    } catch (error) {
      message.error(
        error instanceof Error
          ? error.message
          : "Der Katalog konnte nicht vollständig geladen werden."
      );
    } finally {
      setLoadingAll(false);
    }
  };
  useEffect(() => {
    if (open) void loadAll();
  }, [open]);
  const multiselectColumn = (
    key: "series" | "camera" | "view" | "strip" | "waypoint",
    title: string,
    width: number,
    filterKey: "series" | "cameras" | "views" | "strips" | "waypoints"
  ): ColumnsType<Row>[number] => ({
    title,
    key: filterKey,
    dataIndex: key === "series" ? "seriesLabel" : key,
    width,
    filters: filtersFor(allRows, key),
    filterSearch: true,
    filteredValue: filter[filterKey],
    sorter: {
      compare: (a, b) => comparator.compare(a[key], b[key]),
      multiple: 1,
    },
    ellipsis: true,
  });
  const columns: ColumnsType<Row> = [
    {
      title: "Bild-ID",
      key: "id",
      dataIndex: "sourceId",
      width: 190,
      fixed: "left",
      sorter: {
        compare: (a, b) => comparator.compare(a.sourceId, b.sourceId),
        multiple: 1,
      },
      filteredValue: filter.id ? [filter.id] : [],
      filterDropdown: ({
        selectedKeys,
        setSelectedKeys,
        confirm,
        clearFilters,
      }) => (
        <div style={{ padding: 8 }}>
          <Input
            aria-label="Bild-ID filtern"
            value={String(selectedKeys[0] ?? "")}
            onChange={(event) =>
              setSelectedKeys(event.target.value ? [event.target.value] : [])
            }
            onPressEnter={() => confirm()}
          />
          <Space style={{ marginTop: 8 }}>
            <Button size="small" type="primary" onClick={() => confirm()}>
              Filtern
            </Button>
            <Button
              size="small"
              onClick={() => {
                clearFilters?.();
                confirm();
              }}
            >
              Zurücksetzen
            </Button>
          </Space>
        </div>
      ),
    },
    multiselectColumn("series", "Katalog", 180, "series"),
    multiselectColumn("camera", "Kamera", 95, "cameras"),
    multiselectColumn("view", "Kamerablick", 120, "views"),
    multiselectColumn("strip", "Flugstreifen", 110, "strips"),
    {
      title: "Position",
      key: "waypoints",
      dataIndex: "waypoint",
      width: 100,
      sorter: {
        compare: (a, b) => comparator.compare(a.waypoint, b.waypoint),
        multiple: 1,
      },
      filteredValue: filter.waypoints,
      filterDropdown: ({
        selectedKeys,
        setSelectedKeys,
        confirm,
        clearFilters,
      }) => (
        <div style={{ padding: 8 }}>
          <Input
            aria-label="Position filtern"
            placeholder="z. B. 1466, 1467"
            value={selectedKeys.join(", ")}
            onChange={(event) =>
              setSelectedKeys(event.target.value ? [event.target.value] : [])
            }
            onPressEnter={() => confirm()}
          />
          <Space style={{ marginTop: 8 }}>
            <Button size="small" type="primary" onClick={() => confirm()}>
              Filtern
            </Button>
            <Button
              size="small"
              onClick={() => {
                clearFilters?.();
                confirm();
              }}
            >
              Zurücksetzen
            </Button>
          </Space>
        </div>
      ),
    },
    {
      title: "Station",
      dataIndex: "station",
      width: 120,
      sorter: {
        compare: (a, b) => comparator.compare(a.station, b.station),
        multiple: 1,
      },
      ellipsis: true,
    },
    {
      title: "Richtung",
      dataIndex: "sector",
      width: 85,
      sorter: {
        compare: (a, b) => comparator.compare(a.sector, b.sector),
        multiple: 1,
      },
    },
    {
      title: "Heading",
      dataIndex: "heading",
      width: 110,
      render: (value: Degrees | null) =>
        value === null ? "—" : `${value.toFixed(1)}°`,
      sorter: {
        compare: (a, b) => (a.heading ?? -1) - (b.heading ?? -1),
        multiple: 1,
      },
    },
    {
      title: "Flug",
      key: "fly",
      width: 95,
      fixed: "right",
      render: (_, row) => (
        <Button
          size="small"
          disabled={busy}
          aria-label={`Flug zu ${row.sourceId}`}
          onClick={() => {
            onClose();
            void onFlyToImage(row.id);
          }}
        >
          Anfliegen
        </Button>
      ),
    },
  ];
  const change: TableProps<Row>["onChange"] = (_, values) => {
    const strings = (key: string) => (values[key] ?? []).map(String);
    onFilterChange({
      ...filter,
      id: strings("id")[0] ?? "",
      series: strings("series"),
      cameras: strings("cameras"),
      views: strings("views"),
      strips: strings("strips"),
      waypoints: strings("waypoints").flatMap((value) =>
        value
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
      ),
    });
  };
  const flyExtent = async (ids: readonly string[]) => {
    if (!ids.length) return;
    setFlyingExtent(true);
    try {
      if (await onFlyToExtent(ids)) onClose();
    } catch (error) {
      message.error(
        error instanceof Error
          ? error.message
          : "Das Ausmaß konnte nicht angeflogen werden."
      );
    } finally {
      setFlyingExtent(false);
    }
  };
  return (
    <Modal
      open={open}
      title="Bildkatalog"
      width={1260}
      footer={null}
      onCancel={onClose}
      maskClosable={false}
    >
      <div data-test-id="oblique-catalog-browser">
        <Space wrap style={{ marginBottom: 12 }}>
          <Input.Search
            allowClear
            placeholder="Alle Spalten durchsuchen"
            aria-label="Bildkatalog durchsuchen"
            value={filter.query}
            onChange={(event) =>
              onFilterChange({ ...filter, query: event.target.value })
            }
            style={{ width: 300 }}
          />
          <span>Heading</span>
          <InputNumber<number>
            aria-label="Heading von"
            placeholder="von"
            min={0}
            max={360}
            value={filter.headingMin}
            onChange={(value) =>
              onFilterChange({ ...filter, headingMin: value as Degrees | null })
            }
          />
          <InputNumber<number>
            aria-label="Heading bis"
            placeholder="bis"
            min={0}
            max={360}
            value={filter.headingMax}
            onChange={(value) =>
              onFilterChange({ ...filter, headingMax: value as Degrees | null })
            }
          />
          <Button
            onClick={() => {
              onFilterChange({ ...EMPTY_CATALOG_IMAGE_FILTER });
              setSelected([]);
            }}
          >
            Filter zurücksetzen
          </Button>
        </Space>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <Typography.Text data-test-id="oblique-catalog-count">
            {rows.length.toLocaleString("de-DE")} /{" "}
            {allRows.length.toLocaleString("de-DE")} Bilder
            {complete && !loadingAll ? "" : " (Katalog wird vervollständigt)"}
          </Typography.Text>
          <Button
            size="small"
            disabled={!rows.length || busy}
            loading={flyingExtent}
            onClick={() => void flyExtent(rows.map((row) => row.id))}
          >
            Gefiltertes Ausmaß anfliegen
          </Button>
          <Button
            size="small"
            disabled={!selected.length || busy}
            loading={flyingExtent}
            onClick={() => void flyExtent(selected)}
          >
            Auswahl anfliegen ({selected.length})
          </Button>
          {!complete && (
            <Button
              size="small"
              loading={loadingAll || loading}
              onClick={() => void loadAll()}
            >
              Katalog vervollständigen
            </Button>
          )}
        </div>
        <Table<Row>
          size="small"
          virtual
          pagination={false}
          scroll={{ x: 1260, y: 460 }}
          columns={columns}
          dataSource={rows}
          rowKey="id"
          onChange={change}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: (keys) => setSelected(keys.map(String)),
          }}
          onRow={(row) =>
            ({ "data-source-id": row.sourceId } as HTMLAttributes<HTMLElement>)
          }
          locale={{ emptyText: "Keine Bilder passen zu diesen Filtern." }}
        />
        <Typography.Text
          type="secondary"
          style={{ display: "block", marginTop: 10 }}
        >
          Die Filter gelten auch für die Footprints und Bildauswahl in der
          Szene. Heading von größer als bis umfasst den Übergang über Nord.
        </Typography.Text>
      </div>
    </Modal>
  );
};
