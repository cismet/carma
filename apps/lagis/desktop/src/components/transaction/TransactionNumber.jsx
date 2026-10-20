import PropTypes from "prop-types";
import InfoBlock from "../ui/Blocks/InfoBlock";
import TableCustom from "../ui/tables/TableCustom";
import { Button, Input, message, Space, Tooltip } from "antd";
import { useEffect, useState } from "react";
import { LinkOutlined } from "@ant-design/icons";
import EditableTable from "../editing/EditableTable";
import useDraftTable from "../editing/useDraftTable";
import useInvalidCells from "../editing/useInvalidCells";
import {
  byDay,
  byText,
  requiredTitle,
  VIEW_DAY,
  withSort,
} from "../editing/columns";
import {
  findKassenzeichenInParcel,
  newKassenzeichenRow,
} from "../../core/editing/kassenzeichen";
import { useSelector } from "react-redux";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { getGeometry } from "../../store/slices/lagis";
import { getJWT } from "../../store/slices/auth";
import {
  duplicateKassenzeichen,
  KASSENZEICHEN_RULES,
} from "../../core/editing/validation";
import { VERDIS_KASSENZEICHEN_URL } from "../../core/extractors/transactionPageExtractor";
import dayjs from "dayjs";
import weekday from "dayjs/plugin/weekday";
import localeData from "dayjs/plugin/localeData";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { kassenzeichen } from "@carma-collab/wuppertal/lagis-desktop";

dayjs.extend(weekday);
dayjs.extend(localeData);
dayjs.extend(customParseFormat);

const VerdisLink = ({ nummer }) => (
  <div>
    <span className="mr-4">{nummer}</span>
    <a href={VERDIS_KASSENZEICHEN_URL + nummer} target="blank">
      <LinkOutlined className="cursor-pointer text-blue-500 hover:text-blue-400" />
    </a>
  </div>
);

const columns = [
  {
    title: kassenzeichen.kassenzeichenTable.kassenzeichenCol,
    key: "kassenzeichen",
    dataIndex: "kassenzeichen",
    render: (nummer) => <VerdisLink nummer={nummer} />,
    sorter: byText((row) => row.kassenzeichen),
  },
  {
    title: kassenzeichen.kassenzeichenTable.zugeordnetCol,
    key: "zugeordnet",
    dataIndex: "zugeordnet",
    sorter: byDay((row) => row.zugeordnet, VIEW_DAY),
  },
];

const editColumns = (invalid) => (update) =>
  [
    {
      title: requiredTitle(kassenzeichen.kassenzeichenTable.kassenzeichenCol),
      key: "kassenzeichen",
      dataIndex: "nummer",
      sorter: byText((row) => row.nummer),
      render: (nummer, record) =>
        record.kassenzeichenId ? (
          <VerdisLink nummer={nummer} />
        ) : (
          <Input
            size="small"
            maxLength={8}
            placeholder="8 Ziffern"
            status={invalid(record) ? "error" : undefined}
            value={nummer}
            onChange={(event) =>
              update(record.id, {
                nummer: event.target.value.replace(/\D/g, ""),
              })
            }
          />
        ),
    },
    {
      title: kassenzeichen.kassenzeichenTable.zugeordnetCol,
      key: "zugeordnet",
      dataIndex: "zugeordnetAm",
      sorter: byDay((row) => row.zugeordnetAm),
      render: (day) => (day ? dayjs(day).format(VIEW_DAY) : ""),
    },
  ];

const mockExtractor = (input) => {
  return [
    {
      key: "1",
      kassenzeichen: "1237563255",
      zugeordnet: "02.05.2023",
    },
    {
      key: "2",
      kassenzeichen: "1237563255",
      zugeordnet: "02.05.2023",
    },
    {
      key: "3",
      kassenzeichen: "1237563255",
      zugeordnet: "02.05.2023",
    },
    {
      key: "4",
      kassenzeichen: "1237563255",
      zugeordnet: "02.05.2023",
    },
  ];
};
const TransactionNumber = ({
  dataIn,
  extractor = mockExtractor,
  width = 231,
  height = 188,
  style,
}) => {
  const isStory = false;
  const storyStyle = { width, height, ...style };
  const [transaction, setTransaction] = useState([]);
  const [activeRow, setActiveRow] = useState();
  const [sort, setSort] = useState({});
  const { editable, actions, tableProps } = useDraftTable({
    section: "kassenzeichen",
    field: "kassenzeichen",
    newRow: newKassenzeichenRow,
  });
  const invalidCell = useInvalidCells(
    "kassenzeichen",
    tableProps.rows,
    KASSENZEICHEN_RULES
  );
  const geometry = useSelector(getGeometry);
  const jwt = useSelector(getJWT);
  const [searching, setSearching] = useState(false);
  const duplicates = duplicateKassenzeichen(tableProps.rows);

  const addFromParcel = async () => {
    setSearching(true);
    try {
      const found = await findKassenzeichenInParcel(geometry, jwt);
      const present = new Set(tableProps.rows.map((row) => row.nummer.trim()));
      const added = [...new Set(found)]
        .filter((nummer) => !present.has(nummer))
        .map((nummer) => ({ ...newKassenzeichenRow(), nummer }));
      if (added.length) {
        tableProps.onChange([...tableProps.rows, ...added]);
        tableProps.onActiveChange(added[0].id);
      } else {
        message.info("Es wurden keine weiteren Kassenzeichen gefunden.");
      }
    } catch (error) {
      console.error("Kassenzeichen aus Flurstück", error);
      message.error(error.message);
    } finally {
      setSearching(false);
    }
  };
  const invalid = (record) =>
    invalidCell(record, "nummer") || duplicates.has(record.nummer.trim());
  // keep the selected row when edit turns on; draft ids are the view ids
  useEffect(() => {
    if (editable && activeRow) {
      tableProps.onActiveChange(String(activeRow.id));
    }
  }, [editable]);
  useEffect(() => {
    const data = extractor(dataIn);
    setTransaction(data);
    setActiveRow(data[0]);
  }, [dataIn]);
  return (
    <div
      className="shadow-md bg-white overflow-auto"
      style={isStory ? storyStyle : { height: "100%", borderRadius: "6px" }}
    >
      <InfoBlock
        title={kassenzeichen.kassenzeichenTable.tableTitle}
        controlBar={
          editable ? (
            <Space size={4}>
              <Tooltip title="Kassenzeichen des Flurstücks hinzufügen">
                <Button
                  size="small"
                  icon={
                    <FontAwesomeIcon
                      icon={faWandMagicSparkles}
                      style={{ opacity: 0.75 }}
                    />
                  }
                  loading={searching}
                  disabled={!geometry}
                  onClick={addFromParcel}
                />
              </Tooltip>
              {actions}
            </Space>
          ) : (
            actions
          )
        }
      >
        <div className="relative">
          {editable ? (
            <EditableTable
              {...tableProps}
              columns={(update) => withSort(editColumns(invalid)(update), sort)}
              onSortChange={setSort}
            />
          ) : (
            <TableCustom
              columns={withSort(columns, sort)}
              onSortChange={setSort}
              data={transaction}
              activeRow={activeRow}
              setActiveRow={setActiveRow}
              fixHeight={true}
            />
          )}
        </div>
      </InfoBlock>
    </div>
  );
};

export default TransactionNumber;
TransactionNumber.propTypes = {
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
