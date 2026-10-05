import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { Spin } from "antd";
import InfoBlock from "../ui/Blocks/InfoBlock";
import TableCustom from "../ui/tables/TableCustom";
import EditableTable from "../editing/EditableTable";
import useDraftTable from "../editing/useDraftTable";
import useStammdatenList from "../editing/useStammdatenList";
import { dienststelleColumn, rolleArtColumn } from "../editing/columns";
import { ColorMark } from "../editing/cells";
import { compare } from "../../core/tools/helper";
import { additionalRollExtractor } from "../../core/extractors/officesPageExtractor";
import { newRolleRow } from "../../core/wizard/adminData";
import { verwaltung } from "@carma-collab/wuppertal/lagis-desktop";

const columns = [
  {
    title: verwaltung.zusatzlicheRollen.dienststelleCol,
    dataIndex: "agency",
    render: (title, record) => (
      <div className="flex items-center">
        <ColorMark color={record.color} />
        <span>{title}</span>
      </div>
    ),
    sorter: (a, b) => compare(a.agency, b.agency),
  },
  {
    title: verwaltung.zusatzlicheRollen.rolleCol,
    dataIndex: "rolle",
    sorter: (a, b) => compare(a.rolle, b.rolle),
  },
];

const AdditionalRole = ({ dataIn, extractor = additionalRollExtractor }) => {
  const [rolls, setRolls] = useState([]);
  const [activeRow, setActiveRow] = useState();
  const { editable, actions, tableProps } = useDraftTable({
    section: "admin",
    field: "rollen",
    newRow: newRolleRow,
  });
  const dienststellen = useStammdatenList("dienststellen", editable);
  const rolleArten = useStammdatenList("rolleArten", editable);

  useEffect(() => {
    const data = extractor(dataIn);
    setRolls(data);
    setActiveRow(data[0]);
  }, [dataIn]);

  const renderEditTable = () =>
    dienststellen && rolleArten ? (
      <EditableTable
        {...tableProps}
        columns={(update) => [
          dienststelleColumn(
            verwaltung.zusatzlicheRollen.dienststelleCol,
            dienststellen,
            update
          ),
          rolleArtColumn(
            verwaltung.zusatzlicheRollen.rolleCol,
            rolleArten,
            update
          ),
        ]}
      />
    ) : (
      <div className="flex justify-center p-8">
        <Spin />
      </div>
    );

  return (
    <div
      style={{
        height: "100%",
        borderRadius: "6px",
        backgroundColor: "#ffffff",
        overflow: "auto",
      }}
      className="shadow-md overflow-auto"
    >
      <InfoBlock
        title={verwaltung.zusatzlicheRollen.tableTitle}
        controlBar={actions}
      >
        <div style={{ position: "relative", height: "200px" }}>
          {editable ? (
            renderEditTable()
          ) : (
            <TableCustom
              columns={columns}
              data={rolls}
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
export default AdditionalRole;
AdditionalRole.propTypes = {
  dataIn: PropTypes.object,
  extractor: PropTypes.func,
};
