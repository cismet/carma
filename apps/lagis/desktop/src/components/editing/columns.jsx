import React from "react";
import { DatePicker, Input, InputNumber, Select } from "antd";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { compare, getColorFromCode } from "../../core/tools/helper";
import { ColorMark, dienststelleLabel } from "./cells";
dayjs.extend(customParseFormat);

export const VIEW_DAY = "DD.MM.YYYY";
export const EDIT_DAY = "YYYY-MM-DD";

// Both modes sort on what the cell shows; dates by time, empty dates last.
export const byText = (value) => (a, b) => compare(value(a), value(b));
export const byDay = (value, format) => (a, b) => {
  const x = value(a) ? dayjs(value(a), format).valueOf() : Infinity;
  const y = value(b) ? dayjs(value(b), format).valueOf() : Infinity;
  return x === y ? 0 : x < y ? -1 : 1;
};

// one sort for both modes, so switching to edit keeps the order
export const withSort = (columns, sort) =>
  columns.map((column) => ({
    ...column,
    sortOrder: sort.columnKey === column.key ? sort.order : null,
  }));

export const textColumn = (title, dataIndex, update) => ({
  key: dataIndex,
  title,
  dataIndex,
  sorter: byText((row) => row[dataIndex]),
  render: (value, record) => (
    <Input
      size="small"
      value={value}
      onChange={(event) =>
        update(record.id, { [dataIndex]: event.target.value })
      }
    />
  ),
});

// draft rows keep days as EDIT_DAY
export const dateColumn = (title, dataIndex, update) => ({
  key: dataIndex,
  title,
  dataIndex,
  sorter: byDay((row) => row[dataIndex], EDIT_DAY),
  render: (day, record) => (
    <DatePicker
      size="small"
      format={VIEW_DAY}
      className="w-full"
      getPopupContainer={() => document.body}
      value={day ? dayjs(day) : null}
      onChange={(next) =>
        update(record.id, { [dataIndex]: next ? next.format(EDIT_DAY) : null })
      }
    />
  ),
});

export const dienststelleColumn = (title, dienststellen, update) => {
  const byId = new Map(dienststellen.map((d) => [d.id, d]));
  const options = dienststellen
    .map((d) => ({ value: d.id, label: dienststelleLabel(d) }))
    .sort((a, b) => compare(a.label, b.label));
  return {
    title,
    dataIndex: "dienststelleId",
    render: (dienststelleId, record) => (
      <div className="flex items-center">
        <ColorMark
          color={
            dienststelleId &&
            getColorFromCode(
              byId.get(dienststelleId)?.farbeArrayRelationShip?.[0]
                ?.rgb_farbwert
            )
          }
        />
        <Select
          size="small"
          showSearch
          optionFilterProp="label"
          placeholder="Dienststelle wählen"
          className="w-full"
          options={options}
          value={dienststelleId}
          onChange={(next) => update(record.id, { dienststelleId: next })}
        />
      </div>
    ),
  };
};

export const numberColumn = (title, dataIndex, update) => ({
  title,
  dataIndex,
  render: (number, record) => (
    <InputNumber
      size="small"
      min={0}
      decimalSeparator=","
      precision={2}
      className="w-full"
      value={number}
      onChange={(next) => update(record.id, { [dataIndex]: next ?? null })}
    />
  ),
});

export const rolleArtColumn = (title, rolleArten, update) => ({
  title,
  dataIndex: "rolleArtId",
  render: (rolleArtId, record) => (
    <Select
      size="small"
      placeholder="Rolle wählen"
      className="w-full"
      options={rolleArten.map((art) => ({ value: art.id, label: art.name }))}
      value={rolleArtId}
      onChange={(next) => update(record.id, { rolleArtId: next })}
    />
  ),
});

const strassenOptions = (names) => [
  { value: "", label: <i>keine</i> },
  ...names.map((name) => ({ value: name, label: name })),
];

export const strassenColumn = (title, strassennamen, update) => ({
  title,
  dataIndex: "strassenname",
  render: (strassenname, record) => (
    <Select
      size="small"
      showSearch
      className="w-full"
      optionFilterProp="value"
      options={strassenOptions(strassennamen)}
      value={strassenname ?? ""}
      onChange={(next) => update(record.id, { strassenname: next ?? "" })}
    />
  ),
});

// Same order as the Java client: by schluessel, plain string comparison.
const bySchluessel = (a, b) => {
  const x = a.schluessel ?? "";
  const y = b.schluessel ?? "";
  return x < y ? -1 : x > y ? 1 : 0;
};

// stammdaten: { anlageklassen, nutzungsarten }
export const usageColumns = (stammdaten) => {
  const anlageklassen = stammdaten.anlageklassen.map((klasse) => ({
    value: klasse.id,
    label: klasse.bezeichnung,
  }));
  const nutzungsarten = [...stammdaten.nutzungsarten]
    .sort(bySchluessel)
    .map((entry) => ({ value: entry.id, label: entry.bezeichnung }));

  return (update) => [
    {
      key: "anlageklasse",
      width: 200,
      title: "Anlageklasse",
      dataIndex: "anlageklasseId",
      render: (anlageklasseId, record) => (
        <Select
          size="small"
          placeholder="Anlageklasse"
          className="w-full"
          getPopupContainer={() => document.body}
          options={anlageklassen}
          value={anlageklasseId}
          onChange={(next) => update(record.id, { anlageklasseId: next })}
        />
      ),
    },
    {
      key: "nutzungsartBezeichnung",
      width: 200,
      title: "Nutzungsarten-Bezeichnung",
      dataIndex: "nutzungsartId",
      render: (nutzungsartId, record) => (
        <Select
          size="small"
          showSearch
          optionFilterProp="label"
          placeholder="Nutzungsart"
          className="w-full"
          getPopupContainer={() => document.body}
          options={nutzungsarten}
          value={nutzungsartId}
          onChange={(next) => update(record.id, { nutzungsartId: next })}
        />
      ),
    },
    {
      key: "flaeche",
      width: 110,
      title: "Fläche/m²",
      dataIndex: "flaeche",
      render: (flaeche, record) => (
        <InputNumber
          size="small"
          min={0}
          precision={0}
          className="w-full"
          value={flaeche}
          onChange={(next) => update(record.id, { flaeche: next ?? null })}
        />
      ),
    },
    {
      key: "quadratmeterpreis",
      width: 110,
      title: "m²-Preis",
      dataIndex: "quadratmeterpreis",
      render: (preis, record) => (
        <InputNumber
          size="small"
          min={0}
          precision={2}
          decimalSeparator=","
          className="w-full"
          value={preis}
          onChange={(next) =>
            update(record.id, { quadratmeterpreis: next ?? null })
          }
        />
      ),
    },
  ];
};
