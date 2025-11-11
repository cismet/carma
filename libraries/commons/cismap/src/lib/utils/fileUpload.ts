export const uploadImage = async ({
  file,
  apiUrl = "https://wunda-cloud-api.cismet.de",
  jwt,
  messageApi,
}: {
  file: File;
  apiUrl?: string;
  jwt?: string;
  messageApi?: any;
}) => {
  let fileUrl = "";
  await fetch(apiUrl + "/configattributes/geoportal.files", {
    method: "GET",
    headers: {
      Authorization: "Bearer " + jwt,
    },
  })
    .then((response) => {
      return response.text();
    })
    .then(async (data) => {
      const geoportalFiles = JSON.parse(data)["geoportal.files"];
      const uploadData = JSON.parse(geoportalFiles);
      const baseUrl = uploadData?.url;

      if (!baseUrl) {
        messageApi?.open({
          type: "error",
          content: `Es gab einen Fehler beim Hochladen des Bildes`,
          duration: 2,
        });
        return;
      }

      const form = new FormData();
      form.append("dateifeld", file);

      const newFileName = `${Date.now()}-${file.name}`;

      await fetch(baseUrl + `/${newFileName}`, {
        method: "PUT",
        headers: {
          Authorization:
            "Basic " + btoa(uploadData.user + ":" + uploadData.password),
        },
        body: file,
      })
        .then((response) => {
          fileUrl = response.url;
        })
        .catch((error) => {
          console.error(error);
          messageApi?.open({
            type: "error",
            content: `Es gab einen Fehler beim Hochladen des Bildes`,
            duration: 2,
          });
        });
    });
  return fileUrl;
};
