import { Doc, DocumentViewer } from '@carma-commons/document-viewer';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'leaflet/dist/leaflet.css';
import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import 'react-bootstrap-typeahead/css/Typeahead.css';
import 'react-cismap/topicMaps.css';
import {
  getPlanFeatureByGazObject,
  loadBPlaene,
} from '../store/slices/bplaene';
import { useParams } from 'react-router-dom';
import { getDocsForBPlaeneGazetteerEntry } from '../utils/DocsHelper';

export function App() {
  const dispatch = useDispatch();
  let { docPackageId } = useParams();
  const [docs, setDocs] = useState<Doc[]>([]);

  const getMeta = async (url: string) => {
    const extra = await fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then((result) => {
        return result;
      });
    return extra;
  };

  const getDocsWithUpdatedMetaData = async (tmpDocs: Doc[]) => {
    await Promise.all(
      tmpDocs.map(async (doc) => {
        // @ts-ignore
        const test2 = await getMeta(doc.meta);
        doc.meta = test2;
      })
    );

    return tmpDocs;
  };

  useEffect(() => {
    // @ts-ignore
    dispatch(loadBPlaene());

    const getUpdatedDocs = async (tmpDocs: Doc[]) => {
      const updatedDocs = await getDocsWithUpdatedMetaData(tmpDocs);

      setDocs(updatedDocs);
    };

    if (docPackageId) {
      let tmpDocs;
      tmpDocs = getDocsForBPlaeneGazetteerEntry({
        gazHit: {
          type: 'bplaene',
          more: { v: docPackageId },
        },
        getPlanFeatureByGazObject: (aevs, done) =>
          // @ts-ignore
          dispatch(getPlanFeatureByGazObject(aevs, done)),
      });

      if (tmpDocs) {
        getUpdatedDocs(tmpDocs);
      }
    }

    document.title = `Dokumentenansicht | ${docPackageId}`;
  }, [docPackageId]);

  return (
    <>{docs.length > 0 && <DocumentViewer docs={docs} mode="bplaene" />}</>
  );
}

export default App;
