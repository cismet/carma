export const uploadImage = async ({
  file,
  apiUrl = "https://wunda-cloud-api.cismet.de",
  jwt,
}: {
  file: File;
  apiUrl?: string;
  jwt?: string;
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

      const form = new FormData();
      form.append("dateifeld", file);

      const newFileName = `${Date.now()}-${file.name}`;

      await fetch(uploadData.url + `/${newFileName}`, {
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
        });
    });
  return fileUrl;
};
