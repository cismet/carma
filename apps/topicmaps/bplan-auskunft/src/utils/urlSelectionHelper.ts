export const getStatusByObjectId = (objectId: string) => {
  const status = objectId.split(".");
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

  return statusString;
};
