import { vorgange } from "@carma-collab/wuppertal/lagis-desktop";
import {
  byDay,
  byText,
  dateColumn,
  euros,
  numberColumn,
  VIEW_DAY,
} from "../editing/columns";
import { CellSelect } from "../editing/cells";

// artColumn for Kostenart / Beschlussart; only new or changed rows go red
const artColumn = (title, viewIndex, arten, missing) => ({
  key: "art",
  title,
  width: "40%",
  required: true,
  view: {
    dataIndex: viewIndex,
    sorter: byText((row) => row[viewIndex]),
  },
  edit: (update) => ({
    dataIndex: "artId",
    sorter: byText(
      (row) => arten.find((art) => art.id === row.artId)?.bezeichnung
    ),
    render: (artId, record) => (
      <CellSelect
        size="small"
        showSearch
        optionFilterProp="label"
        placeholder={title}
        className="w-full"
        status={missing(record) ? "error" : undefined}
        getPopupContainer={() => document.body}
        options={arten.map((art) => ({
          value: art.id,
          label: art.bezeichnung,
        }))}
        value={artId}
        onChange={(next) => update(record.id, { artId: next })}
      />
    ),
  }),
});

const dayColumn = (title, viewIndex, width) => ({
  key: "datum",
  title,
  width,
  view: {
    dataIndex: viewIndex,
    sorter: byDay((row) => row[viewIndex], VIEW_DAY),
  },
  edit: (update) => dateColumn(null, "datum", update),
});

export const kostenColumns = ({ kostenarten, missing }) => [
  artColumn(vorgange.qkb.kostenartCol, "kostenart", kostenarten, missing),
  {
    key: "betrag",
    title: vorgange.qkb.betragCol,
    width: "30%",
    view: {
      dataIndex: "betrag",
      sorter: (a, b) => euros(a.betrag) - euros(b.betrag),
    },
    edit: (update) => ({
      ...numberColumn(null, "betrag", update),
      sorter: (a, b) => (a.betrag ?? -Infinity) - (b.betrag ?? -Infinity),
    }),
  },
  dayColumn(vorgange.qkb.anweisungCol, "anweisung", "30%"),
];

export const beschlussColumns = ({ beschlussarten, missing }) => [
  artColumn("Beschlussart", "beschlussart", beschlussarten, missing),
  dayColumn("Datum", "datum", "60%"),
];
