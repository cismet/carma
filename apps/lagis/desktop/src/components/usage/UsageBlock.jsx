import PropTypes from "prop-types";
import InfoBlock from "../ui/Blocks/InfoBlock";
import TableCustom from "../ui/tables/TableCustom";
import EditableTable from "../editing/EditableTable";
import useDraftTable from "../editing/useDraftTable";
import useStammdatenList from "../editing/useStammdatenList";
import { usageColumns } from "../editing/columns";
import { useState, useEffect, useMemo } from "react";
import { compare, formatPrice } from "../../core/tools/helper";
import { gesamtpreis, newUsageRow } from "../../core/wizard/usageData";
import { FlagOutlined } from "@ant-design/icons";
import { nutzung } from "@carma-collab/wuppertal/lagis-desktop";
import { Tooltip } from "antd";
// Both modes use a fixed layout with these widths and one-line cells, so
// toggling edit mode moves neither columns nor rows.
const WIDTH = {
  nutzung: 110,
  buchungs: 130,
  anlageklasse: 260,
  bezeichnung: 240,
  fläche: 120,
  preis: 120,
  gesamtpreis: 130,
  stille: 130,
  buchwert: 100,
  bemerkung: 200,
};
const SCROLL = { x: Object.values(WIDTH).reduce((sum, w) => sum + w, 0) };

const viewColumns = [
  {
    title: nutzung.nutzungTable.nutzungCol,
    dataIndex: "nutzung",
    sorter: (a, b) => compare(a.nutzung, b.nutzung),
  },
  {
    title: nutzung.nutzungTable.buchungsCol,
    dataIndex: "buchungs",
    sorter: (a, b) => compare(a.buchungs, b.buchungs),
  },
  {
    title: nutzung.nutzungTable.anlageklasseCol,
    dataIndex: "anlageklasse",
    render: (record, row) => (
      // the cell may cut a long name, so the tooltip shows it in full
      <Tooltip title={record && `${record} (${row.anlageklasseKey})`}>
        <span>{record}</span>
      </Tooltip>
    ),
    sorter: (a, b) => compare(a.anlageklasse, b.anlageklasse),
  },
  // {
  //   title: "Nutzungsart",
  //   dataIndex: "nutzungsart",
  // },
  {
    title: nutzung.nutzungTable.bezeichnungCol,
    dataIndex: "bezeichnung",
    sorter: (a, b) => compare(a.bezeichnung, b.bezeichnung),
  },
  {
    title: nutzung.nutzungTable.flacheCol,
    dataIndex: "fläche",
    sorter: (a, b) => compare(a.fläche, b.fläche),
  },
  {
    title: nutzung.nutzungTable.preisCol,
    dataIndex: "preis",
    sorter: (a, b) => compare(a.preis, b.preis),
  },
  {
    title: nutzung.nutzungTable.gesamtpreisCol,
    dataIndex: "gesamtpreis",
    sorter: (a, b) => compare(a.gesamtpreis, b.gesamtpreis),
  },
  {
    title: nutzung.nutzungTable.stilleCol,
    dataIndex: "stille",
    sorter: (a, b) => compare(a.stille, b.stille),
  },
  {
    title: nutzung.nutzungTable.buchwertCol,
    dataIndex: "buchwert",
    render: (record) => (
      <div className="flex items-center justify-center">
        {record ? (
          <FlagOutlined style={{ color: "green" }} />
        ) : (
          <FlagOutlined style={{ color: "red" }} />
        )}
      </div>
    ),
    sorter: (a, b) => compare(a.buchwert, b.buchwert),
  },
  {
    title: nutzung.nutzungTable.bemerkungCol,
    dataIndex: "bemerkung",
    sorter: (a, b) => compare(a.bemerkung, b.bemerkung),
  },
];
const columns = viewColumns.map((c) => ({
  ...c,
  width: WIDTH[c.dataIndex],
  ellipsis: c.dataIndex !== "buchwert",
}));
const column = (dataIndex) => columns.find((c) => c.dataIndex === dataIndex);

// All view columns stay visible; only Anlageklasse, Nutzungsart, Fläche and
// m²-Preis are inputs. Read-only values come from the saved Nutzung.
// sorts on what the cell shows, like the read mode table
const editColumns = (stammdaten, savedById) => (update) => {
  const [anlageklasse, nutzungsart, flaeche, preis] =
    usageColumns(stammdaten)(update);
  const anlageklasseName = new Map(
    stammdaten.anlageklassen.map((k) => [k.id, k.bezeichnung])
  );
  const nutzungsartName = new Map(
    stammdaten.nutzungsarten.map((a) => [a.id, a.bezeichnung])
  );
  const saved = (row) => savedById.get(row.id);
  // a changed row gets a new Buchung, so the saved price no longer applies
  const shownGesamtpreis = (row) =>
    saved(row) &&
    saved(row).fläche === row.flaeche &&
    saved(row).quadratmeterpreis === row.quadratmeterpreis
      ? saved(row).gesamtpreis
      : formatPrice(gesamtpreis(row));
  const shown = {
    nutzung: (row) => saved(row)?.nutzung,
    buchungs: (row) => saved(row)?.buchungs,
    anlageklasse: (row) => anlageklasseName.get(row.anlageklasseId),
    bezeichnung: (row) => nutzungsartName.get(row.nutzungsartId),
    fläche: (row) => row.flaeche,
    preis: (row) => row.quadratmeterpreis,
    gesamtpreis: shownGesamtpreis,
    stille: (row) => saved(row)?.stille,
    // a new Nutzung starts with a Buchwert
    buchwert: (row) => (saved(row) ? saved(row).buchwert : true),
    bemerkung: (row) => saved(row)?.bemerkung,
  };
  const like = (dataIndex) => ({
    title: column(dataIndex).title,
    width: column(dataIndex).width,
    ellipsis: column(dataIndex).ellipsis,
    sorter: (a, b) => compare(shown[dataIndex](a), shown[dataIndex](b)),
  });
  const readOnly = (dataIndex) => ({
    ...like(dataIndex),
    dataIndex,
    render: (_, row) => shown[dataIndex](row) ?? "",
  });
  return [
    readOnly("nutzung"),
    readOnly("buchungs"),
    { ...anlageklasse, ...like("anlageklasse"), ellipsis: false },
    { ...nutzungsart, ...like("bezeichnung"), ellipsis: false },
    { ...flaeche, ...like("fläche"), ellipsis: false },
    { ...preis, ...like("preis"), ellipsis: false },
    readOnly("gesamtpreis"),
    readOnly("stille"),
    {
      ...readOnly("buchwert"),
      render: (_, row) => column("buchwert").render(shown.buchwert(row), row),
    },
    readOnly("bemerkung"),
  ];
};

const mockExtractor = (input) => {
  return [
    {
      id: "1",
      nutzung: "237284656",
      buchungs: "1",
      anlageklasse: "Infrastrukturvermögen Grundstücke",
      nutzungsart: "3273-12376",
      bezeichnung: "3273-12376",
      fläche: "2132",
      preis: "38274€",
      gesamtpreis: "38274€",
      stille: "Stille 1",
      buchwert: "Buchwert 1",
      bemerkung: "Bemerkung 1",
    },
    {
      id: "2",
      nutzung: "746",
      buchungs: "1",
      anlageklasse: "Infrastrukturvermögen Grundstücke",
      nutzungsart: "3273-12376",
      bezeichnung: "3273-12376",
      fläche: "2132",
      preis: "38274€",
      gesamtpreis: "38274€",
      stille: "",
      buchwert: "",
      bemerkung: "",
    },
    {
      id: "3",
      nutzung: "2372846",
      buchungs: "1",
      anlageklasse: "Infrastrukturvermögen Grundstücke",
      nutzungsart: "3273-12376",
      bezeichnung: "3273-12376",
      fläche: "2132",
      preis: "38274€",
      gesamtpreis: "38274€",
      stille: "",
      buchwert: "",
      bemerkung: "",
    },
    {
      id: "4",
      nutzung: "2372846",
      buchungs: "1",
      anlageklasse: "Infrastrukturvermögen Grundstücke",
      nutzungsart: "3273-12376",
      bezeichnung: "3273-12376",
      fläche: "2132",
      preis: "38274€",
      gesamtpreis: "38274€",
      stille: "",
      buchwert: "",
      bemerkung: "",
    },
  ];
};

const UsageBlock = ({
  dataIn,
  extractor = mockExtractor,
  width = 231,
  height = 188,
  style,
}) => {
  // const data = extractor(dataIn);
  const isStory = false;
  const storyStyle = { width, height, ...style };
  const [usage, setUsage] = useState([]);
  const [activeRow, setActiveRow] = useState();
  const { editable, actions, tableProps } = useDraftTable({
    section: "usage",
    field: "nutzungen",
    newRow: (draft) => newUsageRow(draft.nutzungen[draft.nutzungen.length - 1]),
  });
  const stammdaten = useStammdatenList("nutzung", editable);
  // draft row ids are the Nutzung ids as strings
  const tableColumns = useMemo(
    () =>
      stammdaten
        ? editColumns(
            stammdaten,
            new Map(usage.map((row) => [String(row.id), row]))
          )
        : undefined,
    [stammdaten, usage]
  );
  useEffect(() => {
    // same order as the edit rows (loadUsageSection)
    const data = [...extractor(dataIn)].sort((a, b) => a.id - b.id);
    setUsage(data);
    setActiveRow(data[0]);
  }, [dataIn]);
  return (
    <div
      style={
        isStory
          ? storyStyle
          : {
              height: "100%",
              backgroundColor: "#FFFFFF",
              borderRadius: "6px",
            }
      }
      className="shadow-md overflow-auto"
    >
      <InfoBlock title={nutzung.nutzungTable.tableTitle} controlBar={actions}>
        <div className="relative">
          {/* the view table stays until the Stammdaten are there, no spinner */}
          {editable && tableColumns ? (
            <EditableTable
              {...tableProps}
              columns={tableColumns}
              scroll={SCROLL}
              tableLayout="fixed"
              className="nfk-cover nfk-editing"
            />
          ) : (
            <TableCustom
              columns={columns}
              data={usage}
              activerow={setActiveRow}
              addClass="nfk-cover"
              activeRow={activeRow}
              setActiveRow={setActiveRow}
              fixHeight={true}
              scroll={SCROLL}
              tableLayout="fixed"
            />
          )}
        </div>
      </InfoBlock>
    </div>
  );
};

export default UsageBlock;
UsageBlock.propTypes = {
  /**
   * The current main data object that is being used
   */
  dataIn: PropTypes.object,
  /**
   * The extractor function that is used to transform the dataIn object into the data object
   */
  extractor: PropTypes.func,
  /**
   * The width of the component
   * @default 300
   * @type number
   * @required false
   * @control input
   * @group size
   *
   **/
  width: PropTypes.number,

  /**
   * The height of the component
   *
   * @default 300
   * @type number
   * @required false
   * @control input
   *
   **/

  height: PropTypes.number,
};
