import { Link } from 'react-router-dom';
import { Card } from 'antd';

const { Meta } = Card;
const base = import.meta.env.BASE_URL;
console.log('base', base);

export default function Landing() {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <h2 style={{ width: '80%', margin: 20 }}>
          Demo Basistechnologie für dig. FußgängerIS (WIP)
        </h2>
        <Link to="/topicmapWithNewLocator">
          <Card
            hoverable
            style={{ width: 240, margin: 20 }}
            cover={<img alt="example" src={base + 'locator.jpeg'} />}
          >
            <Meta
              title="Standortvisualisierung"
              description="mit Richtungsanzeige"
            />
          </Card>
        </Link>
        <Link to="turnableTopicMap">
          <Card
            hoverable
            style={{ width: 240, margin: 20 }}
            cover={<img alt="example" src={base + 'turnableMap.jpeg'} />}
          >
            <Meta
              title="TopicMap 3.0?"
              description="dreh- und kippbare Karte"
            />
          </Card>
        </Link>
        <Link to="qrklima">
          <Card
            hoverable
            style={{ width: 240, margin: 20 }}
            cover={<img alt="example" src={base + 'qrklima.jpeg'} />}
          >
            <Meta title="Klimastandorte" description="QR Code enabled" />
          </Card>
        </Link>
        {/* <a href='/sensorDemo'>
          <Card
            hoverable
            style={{ width: 240, margin: 20 }}
            cover={
              <img alt='example' src='https://os.alipayobjects.com/rmsportal/QBnOOoLaAfKPirc.png' />
            }
          >
            <Meta title='Kompass auslesen' description='Techdemo' />
          </Card>
        </a> */}
      </div>
    </div>
  );
}
