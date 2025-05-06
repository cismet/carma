// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import FAQs from "./../app/components/helpandsettings/Menu50FAQ";

const VerdisOnlineHelp = () => {
  return (
    <div style={{ margin: 25 }}>
      <FAQs
        key="FAQs"
        // applicationMenuActiveKey={applicationMenuActiveKey}
        setApplicationMenuActiveKey={() => {}}
        showModalMenu={() => {}}
        showOnSeperatePage={true}
      />
    </div>
  );
};

export default VerdisOnlineHelp;
