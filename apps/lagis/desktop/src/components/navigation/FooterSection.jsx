import React from 'react';
// import packageJson from "../../../package.json";
const packageJson = { version: '?.?.?' };

const FooterSection = () => {
  return (
    <div
      className="flex justify-beetween"
      style={{ color: '#8F8F8F', lineHeight: 1 }}
    >
      <div className="">
        <span style={{ textDecoration: '#underline' }}>
          LagIS-Desktop v:{packageJson.version}
        </span>
      </div>
      <div className="ml-auto">Powered by cids</div>
    </div>
  );
};

export default FooterSection;
