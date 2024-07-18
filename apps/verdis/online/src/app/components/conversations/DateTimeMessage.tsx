import Msg from './InternalMessage';
const DateTimeMessage = ({ msg }) => {
  return (
    <Msg
      msg={msg}
      from={""}
      alignment="center"
      background="#F8F8F8"
      color="#666"
      margin={"5px"}
      padding={"5px"}
      fontSize={0.9}
      width="fit-content"
    />
  );
};

export default DateTimeMessage;
