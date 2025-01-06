export type FieldType = {
  username?: string;
  password?: string;
};

export const REST_SERVICE = "https://verdis-api.cismet.de";
const DOMAIN = "VERDIS_GRUNDIS";

export const login = (values: FieldType, setJwt: (j: string) => void) => {
  fetch(REST_SERVICE + "/users", {
    method: "GET",
    headers: {
      Authorization:
        "Basic " + btoa(values.username + "@" + DOMAIN + ":" + values.password),
      "Content-Type": "application/json",
    },
  })
    .then(function (response) {
      if (response.status >= 200 && response.status < 300) {
        response.json().then(function (responseWithJWT) {
          const jwt = responseWithJWT.jwt;
          setJwt(jwt);
        });
      } else {
        console.log("xxx error: Bei der Anmeldung ist ein Fehler aufgetreten.");
      }
    })
    .catch(function (err) {
      console.log(
        "xxx error catch: Bei der Anmeldung ist ein Fehler aufgetreten."
      );
    });
};
