import { useMemo } from "react";
import { Table, Tag } from "antd";
import {
  AppstoreOutlined,
  BorderOuterOutlined,
  EuroOutlined,
  MinusCircleOutlined,
  OrderedListOutlined,
  PlusCircleOutlined,
} from "@ant-design/icons";
import { formatPrice } from "../../core/tools/helper";
import { splitUsageStats } from "../../core/wizard/usageStats";

const formatArea = (area) =>
  `${Number(area).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} m²`;

const signed = (value, format) =>
  value > 0 ? `+${format(value)}` : value < 0 ? `−${format(-value)}` : "±0";

const Delta = ({ value, format }) => (
  <span
    className={`whitespace-nowrap tabular-nums ${
      Math.abs(value) > 0.005 ? "font-medium text-red-600" : "text-gray-400"
    }`}
  >
    {signed(value, format)}
  </span>
);

const Amount = ({ value, format }) => (
  <span className="whitespace-nowrap tabular-nums">{format(value)}</span>
);

const amountColumns = (field, title, format) => [
  {
    key: `${field}Before`,
    title: `${title} vorher`,
    align: "right",
    render: (_, row) => <Amount value={row.before[field]} format={format} />,
  },
  {
    key: `${field}After`,
    title: `${title} nachher`,
    align: "right",
    render: (_, row) => <Amount value={row.after[field]} format={format} />,
  },
  {
    key: `${field}Delta`,
    title: "Δ",
    align: "right",
    render: (_, row) => <Delta value={row.delta[field]} format={format} />,
  },
];

const Change = ({ before, after, delta, format }) => (
  <span className="whitespace-nowrap tabular-nums">
    {format(before)} → {format(after)} <Delta value={delta} format={format} />
  </span>
);

const names = (klassen, nameOf) =>
  klassen.length ? klassen.map(nameOf).join(", ") : "–";

const StatsSummary = ({ stats, nameOf }) => {
  const { total, klassen } = stats;
  const changed = klassen.filter((k) => k.changed).length;
  const added = klassen.filter((k) => k.before.count === 0);
  const removed = klassen.filter((k) => k.after.count === 0);
  const items = [
    [
      AppstoreOutlined,
      "Anlageklassen",
      `${klassen.length}${changed ? ` (${changed} abweichend)` : ""}`,
    ],
    [
      OrderedListOutlined,
      "Nutzungen",
      `${total.before.count} → ${total.after.count}`,
    ],
    [
      BorderOuterOutlined,
      "Fläche",
      <Change
        before={total.before.flaeche}
        after={total.after.flaeche}
        delta={total.delta.flaeche}
        format={formatArea}
      />,
    ],
    [
      EuroOutlined,
      "Gesamtpreis",
      <Change
        before={total.before.wert}
        after={total.after.wert}
        delta={total.delta.wert}
        format={(value) => formatPrice(value)}
      />,
    ],
    [PlusCircleOutlined, "Neu", names(added, nameOf)],
    [MinusCircleOutlined, "Entfällt", names(removed, nameOf)],
  ];
  return (
    <div className="mb-2 grid w-fit grid-cols-2 gap-x-8 gap-y-1 text-sm">
      {items.map(([Icon, title, shown]) => (
        <span key={title} className="flex items-center gap-2">
          <Icon />
          {title}: {shown}
        </span>
      ))}
      {stats.perParcel.map((parcel, index) => (
        <span
          key={parcel.label}
          className={`whitespace-nowrap tabular-nums ${
            index < 2 ? "mt-6" : ""
          }`}
        >
          {parcel.label}: {parcel.count} Nutzungen, {formatArea(parcel.flaeche)}
          , {formatPrice(parcel.wert)}
        </span>
      ))}
    </div>
  );
};

const SplitUsageStats = ({ sourceUsage, usage, anlageklassen }) => {
  const stats = useMemo(
    () => splitUsageStats(sourceUsage, usage),
    [sourceUsage, usage]
  );
  const klasseName = useMemo(
    () => new Map(anlageklassen.map((k) => [k.id, k.bezeichnung])),
    [anlageklassen]
  );

  const nameOf = (row) =>
    row.anlageklasseId === undefined
      ? "ohne Anlageklasse"
      : klasseName.get(row.anlageklasseId) ??
        `Anlageklasse ${row.anlageklasseId}`;

  const columns = [
    {
      key: "anlageklasse",
      title: "Anlageklasse",
      render: (_, row) => (
        <span className="flex items-center gap-2 font-semibold">
          {nameOf(row)}
          {row.before.count === 0 && <Tag color="blue">neu</Tag>}
          {row.after.count === 0 && <Tag color="red">entfällt</Tag>}
        </span>
      ),
    },
    {
      key: "count",
      title: "Nutzungen",
      align: "right",
      render: (_, row) => `${row.before.count} → ${row.after.count}`,
    },
    ...amountColumns("flaeche", "Fläche", formatArea),
    ...amountColumns("wert", "Gesamtpreis", (value) => formatPrice(value)),
  ];

  const { total } = stats;
  const deviates = total.changed || stats.klassen.some((k) => k.changed);

  return (
    <section className="mb-5 rounded-md border border-solid border-gray-200">
      <header className="flex items-center gap-2 rounded-t-md border-0 border-b border-solid border-gray-200 bg-gray-50 px-3 py-3.5 font-medium">
        <span
          className={`h-2 w-2 rounded-full ${
            deviates ? "bg-orange-500" : "bg-green-500"
          }`}
        />
        Nutzungen vor und nach der Teilung
        <Tag color={deviates ? "orange" : "green"} className="ml-auto mr-0">
          {deviates ? "abweichend" : "unverändert"}
        </Tag>
      </header>
      <div className="flex flex-col gap-2 p-3">
        <StatsSummary stats={stats} nameOf={nameOf} />
        <Table
          size="small"
          pagination={false}
          rowKey={(row) => row.anlageklasseId ?? "none"}
          columns={columns}
          dataSource={stats.klassen}
          rowClassName={(row) => (row.changed ? "bg-orange-50" : "")}
          summary={() => (
            <Table.Summary.Row className="font-semibold">
              <Table.Summary.Cell index={0}>Gesamt</Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                {total.before.count} → {total.after.count}
              </Table.Summary.Cell>
              {[
                ["flaeche", formatArea],
                ["wert", (value) => formatPrice(value)],
              ].flatMap(([field, format], i) => [
                <Table.Summary.Cell
                  key={`${field}b`}
                  index={2 + i * 3}
                  align="right"
                >
                  <Amount value={total.before[field]} format={format} />
                </Table.Summary.Cell>,
                <Table.Summary.Cell
                  key={`${field}a`}
                  index={3 + i * 3}
                  align="right"
                >
                  <Amount value={total.after[field]} format={format} />
                </Table.Summary.Cell>,
                <Table.Summary.Cell
                  key={`${field}d`}
                  index={4 + i * 3}
                  align="right"
                >
                  <Delta value={total.delta[field]} format={format} />
                </Table.Summary.Cell>,
              ])}
            </Table.Summary.Row>
          )}
        />
      </div>
    </section>
  );
};

export default SplitUsageStats;
