import React from "react";
import { useSearchParams } from "react-router-dom";

const AlkisLandparcelPage = () => {
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");

  console.log("xxx lanparcelPage", id);

  return (
    <div>
      <h1>Alkis Flurstueck Page</h1>
      <p>Selected ID: {id}</p>
    </div>
  );
};

export default AlkisLandparcelPage;
