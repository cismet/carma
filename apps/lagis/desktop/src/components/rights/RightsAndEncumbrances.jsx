import PropTypes from "prop-types";
import InfoBlock from "../ui/Blocks/InfoBlock";
import TableCustom from "../ui/tables/TableCustom";
import { useEffect, useState } from "react";
import { compare } from "../../core/tools/helper";
import { Select, Spin, Switch } from "antd";
import EditableTable from "../editing/EditableTable";
import useDraftTable from "../editing/useDraftTable";
import useStammdatenList from "../editing/useStammdatenList";
import {
  byDay,
  byText,
  dateColumn,
  textColumn,
  VIEW_DAY,
  withSort,
} from "../editing/columns";
import { ColorMark } from "../editing/cells";
import { artChanges, newRebeRow } from "../../core/editing/rebe";
import { rebeColor } from "../../core/extractors/rebePageExtractor";
import dayjs from "dayjs";
import weekday from "dayjs/plugin/weekday";
import localeData from "dayjs/plugin/localeData";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { rebe } from "@carma-collab/wuppertal/lagis-desktop";
dayjs.extend(weekday);
dayjs.extend(localeData);
dayjs.extend(customParseFormat);
// same widths in both modes, so the table doesn't jump when edit turns on
const WIDTHS = {
  farbe: "6%",
  recht: "8%",
  art: "15%",
  beschreibung: "17%",
  nummer: "14%",
  eintragung: "12%",
  loeschung: "12%",
  bemerkung: "16%",
};
const withFixedWidths = (columns) =>
  columns.map((column) => ({ ...column, width: WIDTHS[column.key] }));

const columns = [
  {
    title: rebe.rebeTable.farbeCol,
    key: "farbe",
    dataIndex: "farbe",
    render: (title, record, rowIndex) => (
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
  {
    title: rebe.rebeTable.rechtCol,
    key: "recht",
    dataIndex: "recht",
    render: (record) => <Switch size="small" checked={record} />,
    sorter: byText((row) => row.recht),
  },
  {
    title: rebe.rebeTable.artCol,
    key: "art",
    dataIndex: "art",
    sorter: byText((row) => row.art),
  },
  {
    title: rebe.rebeTable.artrechtCol,
    key: "beschreibung",
    dataIndex: "artrecht",
    sorter: byText((row) => row.artrecht),
  },
  {
    title: rebe.rebeTable.nummerCol,
    key: "nummer",
    dataIndex: "nummer",
    sorter: byText((row) => row.nummer),
  },
  {
    title: rebe.rebeTable.eintragungCol,
    key: "eintragung",
    dataIndex: "eintragung",
    sorter: byDay((row) => row.eintragung, VIEW_DAY),
  },
  {
    title: rebe.rebeTable.loschungCol,
    key: "loeschung",
    dataIndex: "loschung",
    sorter: byDay((row) => row.loschung, VIEW_DAY),
  },
  {
    title: rebe.rebeTable.bemerkungCol,
    key: "bemerkung",
    dataIndex: "bemerkung",
    sorter: byText((row) => row.bemerkung),
  },
];

// kindSwitchAllowed: false on non-städtische parcels, they hold only Rechte
const editColumns = (rebeArten, { rebes, kindSwitchAllowed }) => {
  const artName = new Map(rebeArten.map((art) => [art.id, art.bezeichnung]));
  // colors follow the row's place in the list, as in the view
  const colorOf = (row) =>
    rebeColor(
      row.istRecht,
      rebes.findIndex((rebe) => rebe.id === row.id)
    );
  return (update) => [
    {
      title: rebe.rebeTable.farbeCol,
      key: "farbe",
      dataIndex: "istRecht",
      sorter: byText((row) => row.istRecht),
      render: (_, record) => <ColorMark color={colorOf(record)} />,
    },
    {
      title: rebe.rebeTable.rechtCol,
      key: "recht",
      dataIndex: "istRecht",
      sorter: byText((row) => row.istRecht),
      render: (istRecht, record) => (
        <Switch
          size="small"
          checked={istRecht}
          disabled={!kindSwitchAllowed}
          onChange={(next) => update(record.id, { istRecht: next })}
        />
      ),
    },
    {
      title: rebe.rebeTable.artCol,
      key: "art",
      dataIndex: "artId",
      sorter: byText((row) => artName.get(row.artId)),
      render: (artId, record) => (
        <Select
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
    },
    textColumn(rebe.rebeTable.artrechtCol, "beschreibung", update),
    textColumn(rebe.rebeTable.nummerCol, "nummer", update),
    dateColumn(rebe.rebeTable.eintragungCol, "eintragung", update),
    dateColumn(rebe.rebeTable.loschungCol, "loeschung", update),
    textColumn(rebe.rebeTable.bemerkungCol, "bemerkung", update),
  ];
};
const mockExtractor = (input) => {
  return [
    {
      id: "1",
      recht: "",
      art: "Dienstbarkeit",
      artrecht: "Geh- und Fahrrecht",
      nummer: "Dept. II, No. 22",
      eintragung: "07.05.2001",
      loschung: "21.07.2016",
      bemerkung: "21.07.2016",
    },
    {
      id: "2",
      recht: "",
      art: "Dienstbarkeit",
      artrecht: "Geh- und Fahrrecht",
      nummer: "Dept. II, No. 23",
      eintragung: "07.05.2001",
      loschung: "21.07.2016",
      bemerkung: "1111111",
    },
    {
      id: "3",
      recht: "",
      art: "Dienstbarkeit",
      artrecht: "Geh- und Fahrrecht",
      nummer: "Dept. II, No. 24",
      eintragung: "07.5.2001",
      loschung: "21.07.2016",
      bemerkung: "22222",
    },
    {
      id: "4",
      recht: "",
      art: "Dienstbarkeit",
      artrecht: "Geh- und Fahrrecht",
      nummer: "Dept. II, No. 25",
      eintragung: "07.05.2001",
      loschung: "12.06.2002",
      bemerkung: "3333333",
    },
  ];
};

const RightsAndEncumbrances = ({
  dataIn,
  extractor = mockExtractor,
  width = 231,
  height = 188,
  style,
  setExtraGeom,
  selectedTableRowId,
  setSelectedTableRowId,
  selectedTableIdByMap,
}) => {
  // const data = extractor(dataIn);
  const isStory = false;
  const storyStyle = { width, height, ...style };
  // const dateFormat = "DD.MM.YYYY";
  const [rights, setRghts] = useState([]);
  const [activeRow, setActiveRow] = useState();
  const [sort, setSort] = useState({});
  const { editable, draft, actions, tableProps } = useDraftTable({
    section: "rebe",
    field: "rebes",
    newRow: newRebeRow,
  });
  const rebeArten = useStammdatenList("rebeArten", editable);
  // view ids are list positions; both lists are ordered by id
  useEffect(() => {
    if (editable && activeRow) {
      const row = tableProps.rows[activeRow.id];
      if (row) {
        tableProps.onActiveChange(row.id);
      }
    }
  }, [editable]);
  useEffect(() => {
    const data = extractor(dataIn);
    setRghts(data);
    setActiveRow(data[0]);
    setSelectedTableRowId(data[0]?.id);
  }, [dataIn]);
  useEffect(() => {
    if (
      activeRow &&
      setSelectedTableRowId !== null &&
      activeRow !== setSelectedTableRowId
    ) {
      setExtraGeom(rights);
      setSelectedTableRowId(activeRow.id);
    }
  }, [activeRow]);
  useEffect(() => {
    if (selectedTableIdByMap !== null && activeRow) {
      if (selectedTableIdByMap !== activeRow.id) {
        setActiveRow(rights[selectedTableIdByMap]);
      }
    }
  }, [selectedTableIdByMap]);
  return (
    <div
      style={isStory ? storyStyle : { height: "100%" }}
      className="shadow-md w-full"
    >
      <InfoBlock title={rebe.rebeTable.tableTitle} controlBar={actions}>
        <div className="overflow-auto">
          {!editable ? (
            <TableCustom
              columns={withFixedWidths(withSort(columns, sort))}
              tableLayout="fixed"
              onSortChange={setSort}
              data={rights}
              activeRow={activeRow}
              setActiveRow={setActiveRow}
              selectedFeatureKey={"selectedTableGeom"}
            />
          ) : rebeArten ? (
            <EditableTable
              {...tableProps}
              fixHeight={false}
              columns={(update) =>
                withFixedWidths(
                  withSort(editColumns(rebeArten, draft)(update), sort)
                )
              }
              tableLayout="fixed"
              onSortChange={setSort}
            />
          ) : (
            <div className="flex justify-center p-8">
              <Spin />
            </div>
          )}
        </div>
      </InfoBlock>
    </div>
  );
};

export default RightsAndEncumbrances;
RightsAndEncumbrances.propTypes = {
  /**
   * The current main data object that is being used
   */
  dataIn: PropTypes.array,
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
