import PropTypes from "prop-types";
import InfoBlock from "../ui/Blocks/InfoBlock";
import CustomNotes from "../ui/notes/CustomNotes";
import NoteEditor, { SperreCard } from "../editing/NoteEditor";
import useEditSection from "../editing/useEditSection";
import { noteExtractor } from "../../core/extractors/officesPageExtractor";
import { verwaltung } from "@carma-collab/wuppertal/lagis-desktop";

const Notes = ({ dataIn, extractor = noteExtractor }) => {
  const data = extractor(dataIn);
  const { editable, locked, draft, patch } = useEditSection("admin");

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
        editable={editable}
        locked={locked}
        title={verwaltung.bemerkungen.tableTitle}
      >
        {editable ? (
          <div className="p-3">
            <NoteEditor parcel={draft} onChange={patch} />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4 p-3">
            <SperreCard
              sperre={data.ifBemerkungSperre}
              reason={data.bemerkungSperre}
              disabled
            />
            <CustomNotes
              styles="min-h-0 flex-1"
              currentText={data.currentText}
            />
          </div>
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
