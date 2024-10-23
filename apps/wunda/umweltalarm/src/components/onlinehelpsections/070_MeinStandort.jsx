import GenericHelpTextForMyLocation from "react-cismap/topicmaps/docBlocks/GenericHelpTextForMyLocation";
import { Link } from "react-scroll";
import slugify from "slugify";

const MeinStandort = () => {
  return (
    <div>
      <GenericHelpTextForMyLocation
        defaultContextValues={{
          genericHelpTextForMyLocation: {
            addendum: (
              <span>
                Mit einer Positionierung des Karteninhaltes über "Mein Standort" wird stets eine
                Verschiebung des Karteninhaltes bewirkt, nach der immer automatisch ein{" "}
                <Link
                  class='renderAsLink'
                  to={slugify("Karteninhalt verschieben und thematischer Durchstich")}
                  containerId={"myMenu"}
                  activeClass='active'
                >
                  thematischer Durchstich
                </Link>{" "}
                an der Position des Fadenkreuzes ausgelöst wird.
              </span>
            ),
          },
        }}
      />
    </div>
  );
};
export default MeinStandort;
