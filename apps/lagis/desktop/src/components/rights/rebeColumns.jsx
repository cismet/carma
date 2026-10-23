import { Switch } from "antd";
import { rebe } from "@carma-collab/wuppertal/lagis-desktop";
import { compare } from "../../core/tools/helper";
import { artChanges } from "../../core/editing/rebe";
import { rebeColor } from "../../core/extractors/rebePageExtractor";
import {
  byDay,
  byText,
  dateColumn,
  textColumn,
  VIEW_DAY,
} from "../editing/columns";
import { CellSelect, ColorMark } from "../editing/cells";

// kindSwitchAllowed: false on non-städtische parcels, they hold only Rechte
// invalid(record, field) marks a cell red
export const rebeColumns = ({ rebeArten, draft, invalid }) => {
  const artName = new Map(
    (rebeArten ?? []).map((art) => [art.id, art.bezeichnung])
  );
  // colors follow the row's place in the list, as in the view
  const colorOf = (row) =>
    rebeColor(
      row.istRecht,
      draft.rebes.findIndex((rebe) => rebe.id === row.id)
    );
  return [
    {
      key: "farbe",
      title: rebe.rebeTable.farbeCol,
      width: "6%",
      view: {
        dataIndex: "farbe",
        render: (title, record) => (
          <div className="flex items-center">
            <span
              style={{
                width: "9px",
                height: "11px",
                marginRight: "6px",
                backgroundColor: record?.color || "transporent",
              }}
            ></span>
            <span>{title}</span>
          </div>
        ),
        sorter: (a, b) => compare(a.recht, b.recht),
      },
      edit: () => ({
        dataIndex: "istRecht",
        sorter: byText((row) => row.istRecht),
        render: (_, record) => <ColorMark color={colorOf(record)} />,
      }),
    },
    {
      key: "recht",
      title: rebe.rebeTable.rechtCol,
      width: "8%",
      view: {
        dataIndex: "recht",
        render: (record) => <Switch size="small" checked={record} />,
        sorter: byText((row) => row.recht),
      },
      edit: (update) => ({
        dataIndex: "istRecht",
        sorter: byText((row) => row.istRecht),
        render: (istRecht, record) => (
          <Switch
            size="small"
            checked={istRecht}
            disabled={!draft.kindSwitchAllowed}
            onChange={(next) => update(record.id, { istRecht: next })}
          />
        ),
      }),
    },
    {
      key: "art",
      title: rebe.rebeTable.artCol,
      width: "15%",
      view: { dataIndex: "art", sorter: byText((row) => row.art) },
      edit: (update) => ({
        dataIndex: "artId",
        sorter: byText((row) => artName.get(row.artId)),
        render: (artId, record) => (
          <CellSelect
            size="small"
            showSearch
            allowClear
            optionFilterProp="label"
            placeholder="Art"
            className="w-full"
            getPopupContainer={() => document.body}
            options={rebeArten.map((art) => ({
              value: art.id,
              label: art.bezeichnung,
            }))}
            value={artId}
            onChange={(next) =>
              update(record.id, artChanges(record, next, artName.get(next)))
            }
          />
        ),
      }),
    },
    {
      key: "beschreibung",
      title: rebe.rebeTable.artrechtCol,
      width: "17%",
      view: { dataIndex: "artrecht", sorter: byText((row) => row.artrecht) },
      edit: (update) => textColumn(null, "beschreibung", update),
    },
    {
      key: "nummer",
      title: rebe.rebeTable.nummerCol,
      width: "14%",
      view: { dataIndex: "nummer", sorter: byText((row) => row.nummer) },
      edit: (update) => textColumn(null, "nummer", update),
    },
    {
      key: "eintragung",
      title: rebe.rebeTable.eintragungCol,
      width: "12%",
      view: {
        dataIndex: "eintragung",
        sorter: byDay((row) => row.eintragung, VIEW_DAY),
      },
      edit: (update) => dateColumn(null, "eintragung", update),
    },
    {
      key: "loeschung",
      title: rebe.rebeTable.loschungCol,
      width: "12%",
      view: {
        dataIndex: "loschung",
        sorter: byDay((row) => row.loschung, VIEW_DAY),
      },
      edit: (update) =>
        dateColumn(null, "loeschung", update, (record) =>
          invalid(record, "loeschung")
        ),
    },
    {
      key: "bemerkung",
      title: rebe.rebeTable.bemerkungCol,
      width: "16%",
      view: { dataIndex: "bemerkung", sorter: byText((row) => row.bemerkung) },
      edit: (update) => textColumn(null, "bemerkung", update),
    },
  ];
};
