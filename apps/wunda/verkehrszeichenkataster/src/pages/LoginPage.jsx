import Login from '../components/authentication/Login';
// import packageJson from "../../package.json";
import wupperwurm from '../assets/wupperwurm.svg';
const packageJson = {
  version: '?.?.?',
  dependencies: { 'react-cismap': '?.?.?' },
};
const Page = () => {
  return (
    <div className="h-screen">
      <div className="w-full flex h-full items-center justify-center bg-backgroundImage relative bg-cover">
        <div className="h-screen absolute w-full backdrop-blur" />
        <Login />
        <img
          src={wupperwurm}
          alt="Wupperwurm"
          className="absolute top-6 left-6 w-40"
        />
        <div className="absolute top-6 right-6 text-white/80 font-semibold flex flex-col gap-2 items-end text-right sm:max-w-none max-w-[200px]">
          <span>Stadt Wuppertal</span>
          <span>Vermessung, Katasteramt und Geodaten</span>
          <span>102.23 Kommunalservice Liegenschaftskataster</span>
        </div>
        <div className="absolute bottom-6 right-6 text-white/80 font-semibold flex flex-col gap-2 items-end">
          <span>
            Verkehrszeichen Kataster v:{packageJson.version}{' '}
            <a href="https://cismet.de" className="text-white/50 no-underline">
              cismet GmbH
            </a>{' '}
            auf Basis von
          </span>
          <span>
            <a
              href="https://leafletjs.com/"
              className="text-white/50 no-underline"
            >
              Leaflet
            </a>{' '}
            und{' '}
            <a
              href="https://cismet.de/#refs"
              className="text-white/50 no-underline"
            >
              cids | react cismap v
              {packageJson.dependencies['react-cismap'].slice(1)} |
            </a>
          </span>
          <a
            href="https://cismet.de/datenschutzerklaerung.html"
            className="text-white/50 no-underline"
          >
            Datenschutzerklärung (Privacy Policy)
          </a>
        </div>
      </div>
    </div>
  );
};

export default Page;
