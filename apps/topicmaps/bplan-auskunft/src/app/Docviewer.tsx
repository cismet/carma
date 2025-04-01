import { Doc, DocumentViewer } from "@carma-commons/document-viewer";
import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import {
  getBPLaene,
  getPlanFeatureByTitle,
  loadBPlaene,
} from "../store/slices/bplaene";
import { useParams } from "react-router-dom";
import { getDocsForBPlanTitle } from "../utils/DocsHelper";
import type { UnknownAction } from "redux";

export function App() {
  const dispatch = useDispatch();
  let { docPackageId } = useParams();
  const [docs, setDocs] = useState<Doc[]>([]);
  const bplaene = useSelector(getBPLaene);

  const getMeta = async (url: string) => {
    const extra = await fetch(url)
      .then((response) => {
        if (!response.ok) {
          return undefined;
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
      tmpDocs.map(async (doc: Doc) => {
        // @ts-expect-error meta type inconsistent
        const meta = await getMeta(doc.meta); // TODO check this
        doc.meta = meta;
      })
    );

    return tmpDocs;
  };

  useEffect(() => {
    dispatch(loadBPlaene() as unknown as UnknownAction);
  }, []);

  useEffect(() => {
    const getUpdatedDocs = async (tmpDocs: Doc[]) => {
      const updatedDocs = await getDocsWithUpdatedMetaData(tmpDocs);

      setDocs(updatedDocs);
    };

    if (docPackageId && bplaene) {
      let tmpDocs;

      tmpDocs = getDocsForBPlanTitle({
        title: docPackageId,
        getPlanFeatureByTitle: (title: string, done: (hit: any) => void) =>
          dispatch(
            getPlanFeatureByTitle(title, done) as unknown as UnknownAction
          ),
      });

      if (tmpDocs) {
        getUpdatedDocs(tmpDocs);
      }
    }

    document.title = `Dokumentenansicht | ${docPackageId}`;
  }, [docPackageId, bplaene]);

  if (docs.length > 0) {
    return (
      <DocumentViewer
        title={docPackageId?.replaceAll("_", " ")}
        docs={docs}
        mode="bplaene"
      />
    );
  } else {
    return null;
  }
}

export default App;
