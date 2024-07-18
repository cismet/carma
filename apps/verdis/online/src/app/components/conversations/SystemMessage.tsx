import Msg from './InternalMessage';

const SystemMessage = ({ msg }) => {
  return (
    <Msg
      from={''}
      msg={msg}
      alignment="center"
      background="#eee"
      color="#666"
      margin={'5px'}
      padding={'5px'}
      fontSize={0.9}
      width="40%"
    />
  );
};

export default SystemMessage;
