import { message } from "antd";
import type { DraftFile } from "../store/slices/featuresForms";
import type { DokumentItem } from "../components/ui/DocumentPreview";
import { uploadBelisDocument } from "./apiMethods";

/**
 * Server response structure for uploaded documents.
 * Matches the shape returned by the uploadBelisDocument endpoint.
 */
interface UploadedDocumentResponse {
  id: number;
  description: string;
  name: string | null;
  typ: string | null;
  url_id?: {
    id: number;
    object_name: string;
    url_base_id?: {
      id: number;
      prot_prefix: string;
      server: string;
      path: string;
    };
  };
}

/**
 * Uploads an array of DraftFile objects to the server and returns
 * the resulting DokumentItem[] that can be appended to a dokumenteArray.
 *
 * Uses the same upload flow as key table forms (MasttypForm):
 *   DraftFile.base64Data  →  uploadBelisDocument()  →  DokumentItem
 *
 * Shows antd success/error messages for user feedback.
 */
export const uploadDraftFiles = async (
  jwt: string,
  draftFiles: DraftFile[]
): Promise<DokumentItem[]> => {
  if (draftFiles.length === 0) return [];

  const uploadPromises = draftFiles.map(async (df) => {
    // Use user-edited fileName + original extension
    const dotIndex = df.originalFileName.lastIndexOf(".");
    const ext = dotIndex >= 0 ? df.originalFileName.slice(dotIndex) : "";
    const uploadName = df.fileName + ext;

    try {
      const result = await uploadBelisDocument(jwt, {
        name: uploadName,
        data: df.base64Data,
      });
      return { name: uploadName, result };
    } catch (error) {
      return {
        name: uploadName,
        result: {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  });

  const results = await Promise.all(uploadPromises);

  const successful = results.filter((r) => r.result.success);
  const failed = results.filter((r) => !r.result.success);

  if (successful.length > 0) {
    message.success(`${successful.length} Dokument(e) hochgeladen`);
  }
  if (failed.length > 0) {
    message.error(`${failed.length} Dokument(e) fehlgeschlagen`);
  }

  // Transform successful uploads to DokumentItem format
  const newDocuments: DokumentItem[] = successful
    .filter((r) => r.result.data)
    .map((r) => {
      const responseWrapper = r.result.data as { res: string };
      const serverResponse = JSON.parse(
        responseWrapper.res
      ) as UploadedDocumentResponse;

      return {
        dms_url: {
          id: serverResponse.id,
          description: serverResponse.description,
          name: serverResponse.name,
          typ: serverResponse.typ,
          url: {
            id: serverResponse.url_id?.id ?? 0,
            object_name: serverResponse.url_id?.object_name ?? "",
            url_base: serverResponse.url_id?.url_base_id
              ? {
                  id: serverResponse.url_id.url_base_id.id,
                  prot_prefix: serverResponse.url_id.url_base_id.prot_prefix,
                  server: serverResponse.url_id.url_base_id.server,
                  path: serverResponse.url_id.url_base_id.path,
                }
              : undefined,
          },
        },
      };
    });

  return newDocuments;
};
