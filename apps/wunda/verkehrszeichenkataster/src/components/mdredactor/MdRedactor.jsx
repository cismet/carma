import { useEffect, useState, useRef } from "react";
import MdEditor from "react-markdown-editor-lite";
import MarkdownIt from "markdown-it";
import "react-markdown-editor-lite/lib/index.css";
import "./splittstyle.css";

export const mdParser = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

MdEditor.addLocale("de-DE", {
  btnHeader: "Überschrift",
  btnClear: "Löschen",
  btnBold: "Fett",
  btnItalic: "Kursiv",
  btnUndo: "Rückgängig machen",
  btnRedo: "Wiederholen",
  btnUnderline: "Unterstrichen",
  btnStrikethrough: "Durchgestrichen",
  btnUnordered: "Aufzählungsliste",
  btnOrdered: "Nummerierte Liste",
  btnQuote: "Zitat",
  btnLink: "Link",
});
MdEditor.useLocale("de-DE");

const ViewMode = (props) => {
  const [isPreviewActive, setIsPreviewActive] = useState(false);
  const handleClickPreview = () => {
    props.editor.setView({
      md: false,
      menu: true,
      html: true,
    });
    setIsPreviewActive(true);
  };
  const handleClickWrite = () => {
    props.editor.setView({
      md: true,
      menu: true,
      html: false,
    });
    setIsPreviewActive(false);
  };

  useEffect(() => {
    const toolbarLeft = props.config.menuRef.current.querySelector(
      ".navigation-nav.left"
    );
    if (isPreviewActive) {
      toolbarLeft.classList.add("hide-tools");
    } else {
      toolbarLeft.classList.remove("hide-tools");
    }
  }, [isPreviewActive]);

  return (
    <>
      <div
        className={
          !isPreviewActive ? "mode-btn-toggle-active" : "mode-btn-toggle"
        }
        onClick={handleClickWrite}
      >
        Bearbeiten
      </div>
      <div
        className={
          isPreviewActive ? "mode-btn-toggle-active" : "mode-btn-toggle"
        }
        onClick={handleClickPreview}
      >
        Vorschau
      </div>
    </>
  );
};

ViewMode.defaultConfig = {};
ViewMode.align = "right";
ViewMode.pluginName = "viewmode";

MdEditor.use(ViewMode, {});

const pluginsListSplited = [
  "viewmode",
  "divider",
  "logger",
  "divider",
  "header",
  "font-bold",
  "font-italic",
  "font-strikethrough",
  "list-unordered",
  "list-ordered",
  "block-quote",
  "link",
];

const MdRedactor = ({
  mdDoc = "",
  getDocument = () => console.log("getDoc function"),
  placeholder = "",
  width = "100%",
  height = "200px",
}) => {
  const [mdText, setMdText] = useState(mdDoc);
  const menuRef = useRef(null);
  ViewMode.defaultConfig = {
    menuRef,
  };

  const handleEditorChange = ({ html, text }) => {
    getDocument(text);
    setMdText(text);
  };

  return (
    <div ref={menuRef}>
      <MdEditor
        style={{ width, height }}
        plugins={pluginsListSplited}
        renderHTML={(text) => mdParser.render(text)}
        value={mdText}
        onChange={handleEditorChange}
        // onImageUpload={onImageUpload}
        shortcuts={true}
        placeholder={placeholder}
        view={{ menu: true, md: true, html: false }}
      />
    </div>
  );
};

export default MdRedactor;
