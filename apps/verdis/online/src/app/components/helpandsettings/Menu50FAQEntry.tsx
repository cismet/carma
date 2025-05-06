// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { Link } from "react-scroll";
import { Icon } from "react-fa";

const Comp = ({
  id,
  title,
  containerId = "myMenu",
  linkToKey = "help",
  content,
  showOnSeperatePage,
}) => {
  return (
    <div>
      <div name={id}>
        <br />
      </div>
      <h4 id={id}>
        {title}{" "}
        <Link
          to={linkToKey}
          containerId={showOnSeperatePage === false ? containerId : undefined}
          style={{ cursor: "pointer", color: "#00000044" }}
        >
          <Icon name={"arrow-circle-up"} />
        </Link>
      </h4>
      {content}
    </div>
  );
};

export default Comp;
