import PropTypes from "prop-types";
import InfoBlock from "../ui/Blocks/InfoBlock";
import { useState, useEffect } from "react";
import { Button, Space, Tooltip } from "antd";
import { FileAddOutlined } from "@ant-design/icons";
import { vorgange } from "@carma-collab/wuppertal/lagis-desktop";
import SheetTable from "../editing/SheetTable";
import useDraftTable from "../editing/useDraftTable";
import useStammdatenList from "../editing/useStammdatenList";
import useInvalidCells from "../editing/useInvalidCells";
import { contractColumns } from "./contractColumns";
import { newVertragRow } from "../../core/editing/vertrag";
import { VERTRAG_RULES } from "../../core/editing/validation";
import LinkVertragModal from "./LinkVertragModal";

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
  const [linking, setLinking] = useState(false);
  const { editable, locked, draft, patch, actions, tableProps } = useDraftTable(
    {
      section: "vertrag",
      field: "vertraege",
      newRow: () => newVertragRow(vertragsarten),
      selection,
    }
  );
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
        locked={locked}
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
          <SheetTable
            columns={contractColumns({ vertragsarten, invalid })}
            editable={editable}
            ready={Boolean(vertragsarten)}
            fixHeight
            view={{
              rows: contracts,
              activeRow,
              setActiveRow: (row) => {
                setActiveRow(row);
                setActiveDataId(row?.id);
              },
            }}
            edit={tableProps}
            toEditRow={(row) =>
              tableProps.rows.find((draftRow) => draftRow.id === String(row.id))
            }
          />
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
