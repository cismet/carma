import { Doc, DocumentViewer } from "@carma-commons/document-viewer";
import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import {
  getAEVFeatureByGazObject,
  loadAEVs,
  searchForAEVs,
} from "../store/slices/aenderungsverfahren";
import { useLocation, useParams } from "react-router-dom";
import {
  getDocsForAEVGazetteerEntry,
  getDocsForStaticEntry,
} from "../utils/DocsHelper";
import type { UnknownAction } from "redux";

export function App() {
  const dispatch = useDispatch();
  const location = useLocation();
  const { pathname } = location;
  let { docPackageId } = useParams();
  const [docs, setDocs] = useState<Doc[]>([]);

  const getMeta = async (url: string) => {
    const extra = await fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Network response was not ok");
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
        // @ts-expect-error meta type inconsistent
        const test2 = await getMeta(doc.meta);
        doc.meta = test2;
      })
    );

    return tmpDocs;
  };

  useEffect(() => {
    dispatch(
      loadAEVs(() => {
        //has now a done callback that executes when everything is loaded
        const getUpdatedDocs = async (tmpDocs: Doc[]) => {
          const updatedDocs = await getDocsWithUpdatedMetaData(tmpDocs);

          setDocs(updatedDocs);
        };

        const getStaticDocs = async () => {
          const staticDocs = await getDocsForStaticEntry({
            docPackageIdParam: docPackageId,
          });
          getUpdatedDocs(staticDocs);
        };

        if (docPackageId) {
          let tmpDocs;

          if (pathname.includes("static")) {
            getStaticDocs();
          } else {
            tmpDocs = getDocsForAEVGazetteerEntry({
              gazHit: { type: "aenderungsv", more: { v: docPackageId } },
              searchForAEVs: (aevs, done) =>
                dispatch(
                  getAEVFeatureByGazObject(
                    aevs,
                    done
                  ) as unknown as UnknownAction
                ),
            });
          }

          if (tmpDocs) {
            getUpdatedDocs(tmpDocs);
          }
        }
      }) as unknown as UnknownAction
    );
    document.title = `Dokumentenansicht | ${docPackageId}`;
  }, [docPackageId]);

  if (docs.length > 0) {
    return <DocumentViewer docs={docs} mode="aenderungsv" />;
  } else {
    return null;
  }
}

export default App;
