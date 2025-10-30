import PropTypes from "prop-types";
import InfoBlock from "../ui/Blocks/InfoBlock";
import { Input, Checkbox } from "antd";
import CustomNotes from "../ui/notes/CustomNotes";
import { verwaltung } from "@carma-collab/wuppertal/lagis-desktop";

const { TextArea } = Input;
const mockExtractor = (input) => {
  return "";
};
const onChange = (e) => {};
const Notes = ({
  dataIn,
  extractor = mockExtractor,
  width = 231,
  height = 188,
  style,
}) => {
  const data = extractor(dataIn);
  const isStory = false;
  const storyStyle = { width, height, ...style };
  return (
    <div
      className="shadow-md"
      style={
        isStory
          ? storyStyle
          : {
              height: "100%",
              backgroundColor: "#ffffff",
              borderRadius: "6px",
            }
      }
    >
      <InfoBlock
        title={verwaltung.bemerkungen.tableTitle}
        extraActions={
          <Checkbox checked={data.ifBemerkungSperre}>
            {verwaltung.bemerkungen.checkbox}
          </Checkbox>
        }
        controlBar={<Checkbox onChange={onChange}>Sperre</Checkbox>}
      >
        <CustomNotes styles="p-3 flex" currentText={data.currentText} />
      </InfoBlock>
    </div>
  );
};
export default Notes;
Notes.propTypes = {
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
