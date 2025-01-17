import { useState } from "react";
import { useSearchParams } from "react-router-dom";
// import { getJWT } from "../../../store/slices/auth";
import { useDispatch, useSelector } from "react-redux";
import { getJWT } from "../store/slices/auth.js";

const AlkisLandparcelPage = () => {
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const jwt = useSelector(getJWT);
  const [resHtml, setResHtml] = (useState < JSX.Element) | (null > null);

  return (
    <div>
      <h1>Alkis Flurstueck Page</h1>
      <p>Selected id: {id}</p>
    </div>
  );
};

export default AlkisLandparcelPage;
