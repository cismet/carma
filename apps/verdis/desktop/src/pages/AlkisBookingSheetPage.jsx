import { useSearchParams } from "react-router-dom";

const AlkisBookingSheetPage = () => {
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");

  return (
    <div>
      <h1>Alkis Buchungsblatt Page</h1>
      <p>Selected id: {id}</p>
    </div>
  );
};

export default AlkisBookingSheetPage;
