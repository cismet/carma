export const getStatusByObjectId = (objectId: string) => {
  const status = objectId.split(".");
  console.log("xxx status helper", status);
  if (status.length !== 2) return null;
  let statusString = "";

  switch (status[1]) {
    case "nrw":
      statusString = "nicht rechtskräftig";
      break;
    case "rw":
      statusString = "rechtskräftig";
      break;
    default:
      statusString = objectId;
  }

  console.log("xxx status helper return", statusString);
  return statusString;
};
