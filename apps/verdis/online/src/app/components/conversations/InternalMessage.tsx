const InternalMessage = ({
  msg = '',
  from,
  width = '75%',
  background = '#00aabb99',
  color = 'black',
  alignment = 'left',
  margin = '10px',
  padding = '15px',
  fontSizeSender = 0.8,
  fontSize = 1,
}) => {
  let textAlign;
  let flexStyles = {};
  if (alignment === 'left') {
    textAlign = 'start';
    flexStyles = {
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
    };
  } else if (alignment === 'center') {
    textAlign = 'start'; //'center';
    flexStyles = {
      alignItems: 'center',
      justifyContent: 'center',
    };
  } else {
    textAlign = 'end'; //'end';
    flexStyles = {
      alignItems: 'flex-end',
      justifyContent: 'flex-end',
    };
  }
  let messageToDisplay: any = msg;
  if (typeof msg === 'string') {
    messageToDisplay = msg.split('\n').map((i, index) => {
      return (
        <p
          key={'INTERNALMESSAGE.p.' + index}
          style={{ margin: '0px', minHeight: '20px' }}
        >
          {i}
        </p>
      );
    });
  }

  return (
    <div
      style={{
        boxSizing: 'border-box',
        minWidth: '0px',
        minHeight: '0px',
        display: 'flex',
        flexFlow: 'column',
        flex: '0 1 auto',
        marginLeft: '15px',
        marginTop: '10px',
        marginRight: '15px',
        fontSize: '80%',
        ...flexStyles,
      }}
    >
      {from}
      <div
        style={{
          boxSizing: 'border-box',
          minWidth: '0px',
          minHeight: '0px',
          display: 'flex',
          flexFlow: 'row',
          flex: '0 1 auto',
          fontSize: (fontSize / fontSizeSender) * 100 + '%',
          border: '1px solid transparent',
          borderRadius: '5px',
          padding: padding,
          marginTop: '1px',
          marginLeft: '1px',
          marginRight: '1px',
          background: background,
          color: color,
          maxWidth: width,
          textAlign,
          ...flexStyles,
        }}
      >
        <div>{messageToDisplay}</div>
      </div>
    </div>
  );
};

export default InternalMessage;
