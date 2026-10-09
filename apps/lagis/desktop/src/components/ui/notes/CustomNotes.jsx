import { Input } from "antd";
const { TextArea } = Input;
const CustomNotes = ({
  styles,
  currentText,
  ifDisable = true,
  readOnly,
  onChange,
}) => {
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
        readOnly={readOnly}
        className="shadow-md"
        style={{
          resize: "none",
          outline: "none",
          flexGrow: 1,
        }}
        value={currentText}
        onChange={onChange && ((event) => onChange(event.target.value))}
      />
    </div>
  );
};

export default CustomNotes;
