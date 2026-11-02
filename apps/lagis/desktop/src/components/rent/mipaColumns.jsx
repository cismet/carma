import { InputNumber, Tag } from "antd";
import { mipa } from "@carma-collab/wuppertal/lagis-desktop";
import {
  byDay,
  byText,
  dateColumn,
  textColumn,
  VIEW_DAY,
} from "../editing/columns";
import { CellSelect } from "../editing/cells";
import { MIPA_RULES } from "../../core/editing/validation";

const merkmalNames = (names) => names.join(", ");

const MerkmalTags = ({ names }) => (
  <div className="merkmal-tags">
    {names.map((name, i) => (
      <Tag key={i}>{name}</Tag>
    ))}
  </div>
);

// the collab texts have no Nutzer title yet
const NUTZER_TITLE = mipa.mipaTable.nutzerCol ?? "Nutzer";
const popup = () => document.body;

// stammdaten: { kategorien, merkmale }; invalid(record, field) marks a cell red
export const mipaColumns = ({ stammdaten, invalid }) => {
  const kategorien = stammdaten?.kategorien ?? [];
  const merkmale = stammdaten?.merkmale ?? [];
  const kategorieName = new Map(kategorien.map((k) => [k.id, k.bezeichnung]));
  const merkmalName = new Map(merkmale.map((m) => [m.id, m.bezeichnung]));
  const required = (field) => MIPA_RULES.required.includes(field);
  const cell = (build, field) => (update) =>
    build(null, field, update, (record) => invalid(record, field));
  const text = (key, title, width) => ({
    key,
    title,
    width,
    required: required(key),
    view: { dataIndex: key, sorter: byText((row) => row[key]) },
    edit: cell(textColumn, key),
  });
  const day = (key, title, viewIndex) => ({
    key,
    title,
    width: "11%",
    required: required(key),
    view: {
      dataIndex: viewIndex,
      sorter: byDay((row) => row[viewIndex], VIEW_DAY),
    },
    edit: cell(dateColumn, key),
  });
  return [
    text("lage", mipa.mipaTable.lageCol, "15%"),
    text("aktenzeichen", mipa.mipaTable.aktenzeichenCol, "13%"),
    {
      key: "flaeche",
      title: mipa.mipaTable.flaecheCol,
      width: "8%",
      view: { dataIndex: "flaeche", sorter: byText((row) => row.flaeche) },
      edit: (update) => ({
        dataIndex: "flaeche",
        sorter: byText((row) => row.flaeche),
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
      }),
    },
    {
      key: "nutzung",
      title: mipa.mipaTable.nutzungCol,
      width: "13%",
      required: required("kategorieId"),
      view: { dataIndex: "nutzung", sorter: byText((row) => row.nutzung) },
      edit: (update) => ({
        dataIndex: "kategorieId",
        sorter: byText((row) => kategorieName.get(row.kategorieId)),
        render: (kategorieId, record) => (
          <CellSelect
            size="small"
            status={invalid(record, "kategorieId") ? "error" : undefined}
            showSearch
            allowClear
            optionFilterProp="label"
            placeholder="Nutzung"
            className="w-full"
            getPopupContainer={popup}
            options={kategorien.map((k) => ({
              value: k.id,
              label: k.bezeichnung,
            }))}
            value={kategorieId}
            // like Java: another Kategorie drops the selected number
            onChange={(next) =>
              update(record.id, {
                kategorieId: next,
                ...(next !== kategorieId ? { ausgewaehlteNummer: null } : {}),
              })
            }
          />
        ),
      }),
    },
    text("nutzer", NUTZER_TITLE, "13%"),
    day("vertragsbeginn", mipa.mipaTable.vertragsbeginCol, "vertragsbegin"),
    day("vertragsende", mipa.mipaTable.vertragsendeCol, "vertragsende"),
    {
      key: "merkmale",
      title: mipa.mipaTable.merkmaleCol,
      width: "16%",
      wrap: true,
      view: {
        dataIndex: "merkmale",
        render: (merkmale) => (
          <MerkmalTags
            names={merkmale.map((m) => m.mipa_merkmal.bezeichnung)}
          />
        ),
        sorter: byText((row) =>
          merkmalNames(row.merkmale.map((m) => m.mipa_merkmal.bezeichnung))
        ),
      },
      edit: (update) => ({
        dataIndex: "merkmalIds",
        sorter: byText((row) =>
          merkmalNames(row.merkmalIds.map((id) => merkmalName.get(id)))
        ),
        render: (merkmalIds, record) => (
          <div className="merkmal-cell">
            <MerkmalTags names={merkmalIds.map((id) => merkmalName.get(id))} />
            <CellSelect
              size="small"
              mode="multiple"
              optionFilterProp="label"
              tagRender={() => null}
              className="merkmal-picker"
              getPopupContainer={popup}
              options={merkmale.map((m) => ({
                value: m.id,
                label: m.bezeichnung,
              }))}
              value={merkmalIds}
              onChange={(next) => update(record.id, { merkmalIds: next })}
            />
          </div>
        ),
      }),
    },
  ];
};
