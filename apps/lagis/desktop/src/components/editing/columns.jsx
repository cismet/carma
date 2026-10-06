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
