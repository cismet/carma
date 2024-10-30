import React from "react";
import markdownit from "markdown-it";

interface MarkdownProps {
  content: string;
}

const md = markdownit({
  html: true, // Enables HTML tags in the source
  linkify: true, // Automatically turns URLs into clickable links
  typographer: true, // Enables smart quotes and other typographic replacements
});

const Markdown: React.FC<MarkdownProps> = ({ content }) => {
  const renderedMarkdown = md.render(content);

  return <div dangerouslySetInnerHTML={{ __html: renderedMarkdown }} />;
};

export default Markdown;
