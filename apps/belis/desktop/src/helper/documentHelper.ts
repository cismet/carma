import { SECRES_BASE_URL } from "../constants/belis";

export const getSecureDocumentUrl = (
  jwt: string,
  objectName: string
): string => {
  return `${SECRES_BASE_URL}/${jwt}/beliswebdav/${objectName}`;
};

export const getDocumentBlobUrl = async (
  jwt: string,
  objectName: string
): Promise<string> => {
  const secureUrl = getSecureDocumentUrl(jwt, objectName);
  const response = await fetch(secureUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch document: ${response.status}`);
  }
  const blob = await response.blob();
  return window.URL.createObjectURL(blob);
};

export const downloadDocument = async (
  jwt: string,
  objectName: string,
  fileName?: string
): Promise<void> => {
  const secureUrl = getSecureDocumentUrl(jwt, objectName);
  const response = await fetch(secureUrl);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }
  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = fileName || objectName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
};
