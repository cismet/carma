export const downloadAsBlobAsync = async (downloadUrl: string) => {
  try {
    const response = await fetch(downloadUrl, { mode: "cors" });
    if (!response.ok) throw new Error("Network response was not ok");
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const filename =
      downloadUrl.split("/").pop() || `oblique-image-${Date.now()}.jpg`;
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(blobUrl);
  } catch (e) {
    console.debug("Download failed", e);
  }
};
