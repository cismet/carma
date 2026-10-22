import HeadBlock from "../heads/HeadBlock";
import { useSelector } from "react-redux";
import { getEditActive } from "../../../store/slices/editing";
import "./info-block.css";

const InfoBlock = ({
  title,
  children,
  controlBar,
  titleAction,
  extraActions,
  editable = false,
}) => {
  const isEdit = useSelector(getEditActive);
  return (
    <div
      className="info-block"
      style={{
        background: "#FFFFFF",
        borderRadius: "6px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <HeadBlock title={title} titleAction={titleAction} editable={editable}>
        <div className="flex items-center gap-3">
          {extraActions}
          {isEdit && controlBar}
        </div>
      </HeadBlock>
      {children}
    </div>
  );
};

export default InfoBlock;
