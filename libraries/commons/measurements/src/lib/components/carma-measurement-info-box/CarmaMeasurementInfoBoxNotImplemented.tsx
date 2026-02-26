type CarmaMeasurementInfoBoxNotImplementedProps = {
  kind: string;
};

export const CarmaMeasurementInfoBoxNotImplemented = ({
  kind,
}: CarmaMeasurementInfoBoxNotImplementedProps) => (
  <div
    className="mt-2 w-[90%] p-2"
    data-test-id="carma-infobox-not-implemented"
  >
    <p className="text-[#212529] font-normal text-xs leading-normal">
      Dieser Messungstyp ist in der neuen InfoBox noch nicht implementiert:
      <br />
      <span className="font-semibold">{kind}</span>
    </p>
  </div>
);
