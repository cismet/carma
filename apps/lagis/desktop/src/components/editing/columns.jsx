import React from "react";
import { InputNumber, Select } from "antd";
import { compare, getColorFromCode } from "../../core/tools/helper";
import { ColorMark, dienststelleLabel } from "./cells";

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
