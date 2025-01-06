const DOMAIN = "VERDIS_GRUNDIS";

export const login = (username, password) => {
  fetch(REST_SERVICE + "/users", {
    method: "GET",
    headers: {
      Authorization: "Basic " + btoa(username + "@" + DOMAIN + ":" + password),
      "Content-Type": "application/json",
    },
  })
    .then(function (response) {
      if (response.status >= 200 && response.status < 300) {
        response.json().then(function (responseWithJWT) {
          const jwt = responseWithJWT.jwt;
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
