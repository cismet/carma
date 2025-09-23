import { Input } from "antd";
const { TextArea } = Input;
const CustomNotes = ({ styles, currentText, ifDisable = true }) => {
  return (
    <div
      className={styles}
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <TextArea
        disabled={ifDisable}
        className="shadow-md"
        style={{
          resize: "none",
          outline: "none",
          flexGrow: 1,
        }}
        value={currentText}
      />
    </div>
  );
};

export default CustomNotes;
