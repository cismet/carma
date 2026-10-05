import PropTypes from "prop-types";
import { Checkbox } from "antd";
import InfoBlock from "../ui/Blocks/InfoBlock";
import CustomNotes from "../ui/notes/CustomNotes";
import NoteEditor from "../editing/NoteEditor";
import useEditSection from "../editing/useEditSection";
import { noteExtractor } from "../../core/extractors/officesPageExtractor";
import { verwaltung } from "@carma-collab/wuppertal/lagis-desktop";

const Notes = ({ dataIn, extractor = noteExtractor }) => {
  const data = extractor(dataIn);
  const { editable, draft, patch } = useEditSection("admin");

  return (
    <div
      className="shadow-md"
      style={{
        height: "100%",
        backgroundColor: "#ffffff",
        borderRadius: "6px",
        overflow: "auto",
      }}
    >
      <InfoBlock
        title={verwaltung.bemerkungen.tableTitle}
        extraActions={
          !editable && (
            <Checkbox checked={data.ifBemerkungSperre}>
              {verwaltung.bemerkungen.checkbox}
            </Checkbox>
          )
        }
      >
        {editable ? (
          <div className="p-3">
            <NoteEditor parcel={draft} onChange={patch} />
          </div>
        ) : (
          <CustomNotes styles="p-3 flex" currentText={data.currentText} />
        )}
      </InfoBlock>
    </div>
  );
};
export default Notes;
Notes.propTypes = {
  dataIn: PropTypes.object,
  extractor: PropTypes.func,
};
