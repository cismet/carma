export const getStatusByObjectId = (objectId: string) => {
  const status = objectId.split(".");
  if (status.length !== 2) return null;
  let statusString = "";

  switch (status[1]) {
    case "nrk":
      statusString = "nicht rechtskräftig";
      break;
    case "rk":
      statusString = "rechtskräftig";
      break;
    default:
      statusString = objectId;
  }

  return statusString;
};
