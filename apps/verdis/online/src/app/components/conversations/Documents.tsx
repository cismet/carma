import Document from './Document';

export const Documents = ({ docs, setDocs, readOnly = false, embedded = false }) => {
  let remover;
  if (readOnly === false) {
    remover = (index) => {
      const newAttachments = JSON.parse(JSON.stringify(docs));
      newAttachments.splice(index, 1);
      setDocs(newAttachments);
    };
  }
  let background;
  let margin = '5px';
  if (embedded === true) {
    background = '#00000000'; //transparent
    // background = '#fff000'; //transparent
    margin = '0px';
  }

  return (
    <div style={{ margin }}>
      {(docs || []).map((fileO, index) => {
        return (
          <span key={'draftDocs.' + index}>
            {index > 0 ? ' ' : ''}
            {readOnly && (
              <Document
                addComma={index < docs.length - 1}
                fileObject={fileO}
                background={background}
              />
            )}
            {!readOnly && (
              <Document
                addComma={index < docs.length - 1}
                fileObject={fileO}
                remove={() => {
                  remover(index);
                }}
                background={background}
              />
            )}
          </span>
        );
      })}
    </div>
  );
};

export default Documents;
