import { Link } from "react-scroll";
import slugify from "slugify";
import InKartePositionierenOriginal from "react-cismap/topicmaps/docBlocks/InKartePositionieren";
const InKartePositionieren = () => {
  return (
    <div>
      <InKartePositionierenOriginal
        defaultContextValues={{
          inKartePositionieren: {
            grosseZoomstufe: 18,
            addendum: (
              <span>
                {" "}
                Mit den hier beschriebenen Positionierungen werden stets Verschiebungen des
                Karteninhaltes bewirkt, nach denen jeweils automatisch ein{" "}
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
export default InKartePositionieren;
