import PropTypes from "prop-types";
import InfoBlock from "../ui/Blocks/InfoBlock";
import TableCustom from "../ui/tables/TableCustom";
import { useState, useEffect } from "react";
import { Button, Select, Space, Spin, Tooltip } from "antd";
import { FileAddOutlined } from "@ant-design/icons";
import { compare } from "../../core/tools/helper";
import { vorgange } from "@carma-collab/wuppertal/lagis-desktop";
import EditableTable from "../editing/EditableTable";
import useDraftTable from "../editing/useDraftTable";
import useStammdatenList from "../editing/useStammdatenList";
import useInvalidCells from "../editing/useInvalidCells";
import {
  byText,
  numberColumn,
  requiredTitle,
  textColumn,
  withSort,
} from "../editing/columns";
import { newVertragRow } from "../../core/editing/vertrag";
import { VERTRAG_RULES } from "../../core/editing/validation";
import LinkVertragModal from "./LinkVertragModal";

const columns = [
  {
    title: vorgange.vorgangeTable.vertragsartCol,
    key: "vertragsart",
    dataIndex: "vertragsart",
    sorter: (a, b) => compare(a.vertragsart, b.vertragsart),
  },
  {
    title: vorgange.vorgangeTable.nummerCol,
    key: "nummer",
    dataIndex: "nummer",
    sorter: (a, b) => compare(a.nummer, b.nummer),
  },
  {
    title: vorgange.vorgangeTable.quadratmeterpreisCol,
    key: "quadratmeterpreis",
    dataIndex: "quadratmeterpreis",
    sorter: (a, b) => compare(a.quadratmeterpreis, b.quadratmeterpreis),
  },
  {
    title: vorgange.vorgangeTable.kaufpreisCol,
    key: "kaufpreis",
    dataIndex: "kaufpreis",
    sorter: (a, b) => compare(a.kaufpreis, b.kaufpreis),
  },
];

const byNumber = (value) => (a, b) =>
  (value(a) ?? -Infinity) - (value(b) ?? -Infinity);

// keys match the view columns, so the sort stays when edit turns on
const editColumns = (vertragsarten, invalid) => {
  const artName = new Map(
    vertragsarten.map((art) => [art.id, art.bezeichnung])
  );
  return (update) => [
    {
      title: requiredTitle(vorgange.vorgangeTable.vertragsartCol),
      key: "vertragsart",
      dataIndex: "artId",
      sorter: byText((row) => artName.get(row.artId)),
      render: (artId, record) => (
        <Select
          size="small"
          showSearch
          optionFilterProp="label"
          placeholder="Vertragsart"
          className="w-full"
          status={invalid(record, "artId") ? "error" : undefined}
          getPopupContainer={() => document.body}
          options={vertragsarten.map((art) => ({
            value: art.id,
            label: art.bezeichnung,
          }))}
          value={artId}
          onChange={(next) => update(record.id, { artId: next })}
        />
      ),
    },
    {
      ...textColumn(vorgange.vorgangeTable.nummerCol, "aktenzeichen", update),
      key: "nummer",
    },
    {
      ...numberColumn(
        vorgange.vorgangeTable.quadratmeterpreisCol,
        "quadratmeterpreis",
        update
      ),
      key: "quadratmeterpreis",
      sorter: byNumber((row) => row.quadratmeterpreis),
    },
    {
      ...numberColumn(
        vorgange.vorgangeTable.kaufpreisCol,
        "gesamtpreis",
        update
      ),
      key: "kaufpreis",
      sorter: byNumber((row) => row.gesamtpreis),
    },
  ];
};

// selection: [id, setId] of the draft Vertrag, shared with the detail blocks
const Contracts = ({
  width = 231,
  height = 188,
  style,
  dataIn,
  extractor,
  setActiveDataId,
  selection,
}) => {
  const [contracts, setContracts] = useState([]);
  const [activeRow, setActiveRow] = useState();
  const [sort, setSort] = useState({});
  const [linking, setLinking] = useState(false);
  const { editable, draft, patch, actions, tableProps } = useDraftTable({
    section: "vertrag",
    field: "vertraege",
    newRow: () => newVertragRow(vertragsarten),
    selection,
  });
  const stammdaten = useStammdatenList("vorgang", editable);
  const vertragsarten = stammdaten?.vertragsarten;
  const invalid = useInvalidCells("vertrag", tableProps.rows, VERTRAG_RULES);
  const linkVertraege = (picked) => {
    patch({
      vertraege: [...tableProps.rows, ...picked],
      linked: {
        ...draft.linked,
        ...Object.fromEntries(picked.map((row) => [row.vertragId, row])),
      },
    });
    tableProps.onActiveChange(picked[0]?.id);
  };
  const isStory = false;
  const storyStyle = { width, height, ...style };
  useEffect(() => {
    const data = extractor(dataIn);
    setContracts(data);
    setActiveRow(data[0]);
  }, [dataIn]);
  return (
    <div
      style={
        isStory
          ? storyStyle
          : {
              backgroundColor: "#FFFFFF",
              borderRadius: "6px",
            }
      }
      className="shadow-md overflow-auto h-full"
    >
      <InfoBlock
        editable={editable}
        title={vorgange.vorgangeTable.vorgangeTitle}
        controlBar={
          editable && (
            <Space size={4}>
              <Tooltip title="Vorhandenen Vertrag hinzufügen">
                <Button
                  size="small"
                  icon={<FileAddOutlined />}
                  onClick={() => setLinking(true)}
                />
              </Tooltip>
              {actions}
            </Space>
          )
        }
      >
        {editable && (
          <LinkVertragModal
            open={linking}
            heldIds={tableProps.rows
              .map((row) => row.vertragId)
              .filter(Boolean)}
            vertragsarten={vertragsarten}
            onLink={linkVertraege}
            onClose={() => setLinking(false)}
          />
        )}
        <div className="relative">
          {!editable ? (
            <TableCustom
              columns={withSort(columns, sort)}
              onSortChange={setSort}
              data={contracts}
              setActiveRow={setActiveRow}
              activeRow={activeRow}
              fixHeight={true}
              setActiveDataId={setActiveDataId}
            />
          ) : vertragsarten ? (
            <EditableTable
              {...tableProps}
              columns={(update) =>
                withSort(editColumns(vertragsarten, invalid)(update), sort)
              }
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

export default Contracts;
Contracts.propTypes = {
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
