import { Doc, DocumentViewer } from '@cismet/document-viewer';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'leaflet/dist/leaflet.css';
import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import 'react-bootstrap-typeahead/css/Typeahead.css';
import 'react-cismap/topicMaps.css';
import { loadAEVs, searchForAEVs } from '../store/slices/aenderungsverfahren';
import { useParams } from 'react-router-dom';
import { getDocsForAEVGazetteerEntry } from '../utils/DocsHelper';

export function App() {
  const dispatch = useDispatch();
  let { docPackageId, file, page } = useParams();
  const [docs, setDocs] = useState<Doc[]>([]);

  useEffect(() => {
    dispatch(loadAEVs());

    if (docPackageId) {
      let tmp;
      tmp = getDocsForAEVGazetteerEntry({
        gazHit: { type: 'aenderungsv', more: { v: docPackageId } },
        searchForAEVs: (aevs) => dispatch(searchForAEVs(aevs)),
      });

      setDocs(tmp);
    }
  }, [docPackageId]);

  return <>{docs && <DocumentViewer docs={docs} />}</>;
}

export default App;
