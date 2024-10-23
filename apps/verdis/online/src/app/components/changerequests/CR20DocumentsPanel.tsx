import Document from '../conversations/Document';

const CR20DocumentsPanel = ({ documents = [] }) => {
  return (
    <div>
      {documents.length > 0 &&
        documents.map((doc, index) => {
          return (
            <div
              key={'Documents.div.' + index}
              style={{ margin: 10, fontSize: '110%' }}
            >
              <Document fileObject={doc} background="#FFF" />
            </div>
          );
        })}
    </div>
  );
};

export default CR20DocumentsPanel;
