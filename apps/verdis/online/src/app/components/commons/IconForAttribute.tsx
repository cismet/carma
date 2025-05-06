import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
const Comp = ({ iconAttributeMap, value }) => {
  return (
    <span>
      {value !== undefined && (
        <FontAwesomeIcon icon={iconAttributeMap[value]} />
      )}
    </span>
  );
};
export default Comp;
