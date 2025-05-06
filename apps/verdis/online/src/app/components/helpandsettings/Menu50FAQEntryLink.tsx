import { Badge } from "react-bootstrap";
import { Link } from "react-scroll";

const Comp = (props) => {
  const {
    id,
    title,
    containerId = "myMenu",
    bsStyle = "default",
    showOnSeperatePage,
  } = props;
  return (
    <Link
      to={id}
      containerId={showOnSeperatePage === false ? containerId : undefined}
      style={{ textDecoration: "none" }}
    >
      <Badge style={{ cursor: "pointer" }} variant={bsStyle}>
        {title}
      </Badge>{" "}
    </Link>
  );
};

export default Comp;
