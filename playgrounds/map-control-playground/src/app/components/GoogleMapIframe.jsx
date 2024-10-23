import React from 'react';

const GoogleMapIframe = () => {
  const mapSrc =
    'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3153.0868232157696!2d144.9537353156168!3d-37.816279179751955!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x6ad642af0f11fd81%3A0xf5770a8f909f9076!2sFederation%20Square!5e0!3m2!1sen!2sau!4v1614577285276!5m2!1sen!2sau';

  return (
    <div style={{ width: '100%', height: '100%', border: '1px solid blue' }}>
      <iframe
        src={mapSrc}
        title="GitHub Page"
        style={{ width: '100%', height: '100%', border: 'none' }}
      />
    </div>
  );
};

export default GoogleMapIframe;
