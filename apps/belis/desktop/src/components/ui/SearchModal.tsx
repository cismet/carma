import { useState, useEffect } from "react";
import { Modal, Button, Segmented } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { LeuchteSearch, MastSearch } from "./featuresSearches";

type SearchType = "leuchte" | "mast";

interface SearchModalProps {
  defaultOpen?: boolean;
}

const searchTypeLabels: Record<SearchType, string> = {
  leuchte: "Leuchte",
  mast: "Mast",
};

const SearchModalHeader = ({
  searchType,
  onSearchTypeChange,
}: {
  searchType: SearchType;
  onSearchTypeChange: (type: SearchType) => void;
}) => (
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
      <SearchOutlined className="text-xl text-blue-600" />
    </div>
    <div className="flex-1">
      <h2 className="text-lg font-semibold text-gray-900">Erweiterte Suche</h2>
      <Segmented
        size="small"
        value={searchType}
        onChange={(value) => onSearchTypeChange(value as SearchType)}
        options={Object.entries(searchTypeLabels).map(([value, label]) => ({
          value,
          label,
        }))}
        className="mt-1"
      />
    </div>
  </div>
);

const SearchModal = ({ defaultOpen = false }: SearchModalProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [searchType, setSearchType] = useState<SearchType>("leuchte");

  useEffect(() => {
    setIsOpen(defaultOpen);
  }, [defaultOpen]);

  const handleSearch = (values: unknown) => {
    console.log("Search values:", values);
    // TODO: Implement search functionality
  };

  const renderSearchComponent = () => {
    switch (searchType) {
      case "mast":
        return <MastSearch onValuesChange={handleSearch} />;
      case "leuchte":
      default:
        return <LeuchteSearch onValuesChange={handleSearch} />;
    }
  };

  return (
    <>
      <Button
        type="text"
        icon={<SearchOutlined />}
        onClick={() => setIsOpen(true)}
        title="Erweiterte Suche"
      >
        Suche
      </Button>

      <Modal
        title={
          <SearchModalHeader
            searchType={searchType}
            onSearchTypeChange={setSearchType}
          />
        }
        open={isOpen}
        onCancel={() => setIsOpen(false)}
        footer={
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button onClick={() => setIsOpen(false)}>Abbrechen</Button>
            <Button type="primary" onClick={() => setIsOpen(false)}>
              Suchen
            </Button>
          </div>
        }
        width={600}
        styles={{
          body: { paddingTop: 16 },
          header: { borderBottom: "1px solid #f3f4f6", paddingBottom: 16 },
        }}
      >
{renderSearchComponent()}
      </Modal>
    </>
  );
};

export default SearchModal;
