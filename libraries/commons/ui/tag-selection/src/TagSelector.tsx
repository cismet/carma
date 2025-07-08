import React, { useState } from "react";
import { Input, Tag } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";

export interface TagSelectorProps {
  keywords: string[];
  setKeywords: (keywords: string[]) => void;
  showAddButton?: boolean;
}

export const TagSelector = ({
  keywords,
  setKeywords,
  showAddButton = true,
}: TagSelectorProps) => {
  const [keywordInput, setKeywordInput] = useState("");
  const [showKeywordInput, setShowKeywordInput] = useState(false);
  const [selectedKeywordIndex, setSelectedKeywordIndex] = useState<
    number | null
  >(null);

  const handleRemoveKeyword = (keyword: string) => {
    const newKeywords = keywords.filter((tag) => tag !== keyword);
    setKeywords(newKeywords);
  };

  const handleAddKeyword = (keyword: string) => {
    if (keyword.trim() !== "") {
      setKeywords([...keywords, keyword.trim()]);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.5rem",
      }}
    >
      {keywords.map((keyword, index) =>
        index === selectedKeywordIndex ? (
          <Input
            key={`keyword-${index}-${keyword}`}
            type="text"
            size="small"
            onPressEnter={() => {
              setShowKeywordInput(false);
              keywords[index] = keywordInput;
              setKeywords(keywords);
              setSelectedKeywordIndex(null);
              setKeywordInput("");
            }}
            style={{
              width: "64px",
              height: "22px",
              marginInlineEnd: 8,
              verticalAlign: "top",
              background: "white",
            }}
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            autoFocus
          />
        ) : (
          <Tag
            key={`keyword-${index}-${keyword}`}
            closable
            onClose={() => handleRemoveKeyword(keyword)}
            className="bg-white"
            onDoubleClick={() => {
              setSelectedKeywordIndex(index);
              setKeywordInput(keyword);
            }}
          >
            <span style={{ marginInlineStart: 2 }}>{keyword}</span>
          </Tag>
        )
      )}
      {showAddButton &&
        (showKeywordInput ? (
          <Input
            type="text"
            size="small"
            onPressEnter={() => {
              setShowKeywordInput(false);
              handleAddKeyword(keywordInput);
              setKeywordInput("");
            }}
            style={{
              width: "64px",
              height: "22px",
              marginInlineEnd: 8,
              verticalAlign: "top",
              background: "white",
            }}
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            autoFocus
          />
        ) : (
          <Tag
            style={{
              height: "22px",
              borderStyle: "dashed",
              background: "white",
            }}
            icon={<FontAwesomeIcon icon={faPlus} />}
            onClick={() => {
              setShowKeywordInput(true);
              setSelectedKeywordIndex(null);
              setKeywordInput("");
            }}
          >
            <span style={{ marginInlineStart: 8 }}>Neu</span>
          </Tag>
        ))}
    </div>
  );
};

export default TagSelector;
