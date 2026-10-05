import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { Spin } from "antd";
import InfoBlock from "../ui/Blocks/InfoBlock";
import TableCustom from "../ui/tables/TableCustom";
import EditableTable from "../editing/EditableTable";
import useDraftTable from "../editing/useDraftTable";
import useStammdatenList from "../editing/useStammdatenList";
import { numberColumn, strassenColumn } from "../editing/columns";
import "./offices.css";
import { compare } from "../../core/tools/helper";
import { streetfrontsExtractor } from "../../core/extractors/officesPageExtractor";
import { newStrassenfrontRow } from "../../core/wizard/adminData";
import { verwaltung } from "@carma-collab/wuppertal/lagis-desktop";

const columns = [
  {
    title: verwaltung.strassen.strasseCol,
    dataIndex: "street",
    sorter: (a, b) => compare(a.street, b.street),
  },
  {
    title: verwaltung.strassen.lange,
    dataIndex: "length",
    sorter: (a, b) => compare(a.length, b.length),
  },
];

const Streetfronts = ({ dataIn, extractor = streetfrontsExtractor }) => {
  const [streetfronts, setStreetfronts] = useState([]);
  const [activeRow, setActiveRow] = useState();
  const { editable, actions, tableProps } = useDraftTable({
    section: "admin",
    field: "strassenfronten",
    newRow: newStrassenfrontRow,
  });
  const strassennamen = useStammdatenList("strassennamen", editable);

  useEffect(() => {
    const data = extractor(dataIn);
    setStreetfronts(data);
    setActiveRow(data[0]);
  }, [dataIn]);

  const renderEditTable = () =>
    strassennamen ? (
      <EditableTable
        {...tableProps}
        columns={(update) => [
          strassenColumn(verwaltung.strassen.strasseCol, strassennamen, update),
          numberColumn(verwaltung.strassen.lange, "laenge", update),
        ]}
      />
    ) : (
      <div className="flex justify-center p-8">
        <Spin />
      </div>
    );

  return (
    <div
      className="shadow-md"
      style={{
        height: "100%",
        borderRadius: "6px",
        backgroundColor: "#ffffff",
        overflow: "auto",
      }}
    >
      <InfoBlock title={verwaltung.strassen.tableTitle} controlBar={actions}>
        <div className="relative">
          {editable ? (
            renderEditTable()
          ) : (
            <TableCustom
              columns={columns}
              data={streetfronts}
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
export default Streetfronts;
Streetfronts.propTypes = {
  dataIn: PropTypes.object,
  extractor: PropTypes.func,
};
