import { memo, type Ref } from "react";
import { Input, type InputRef } from "antd";

const { Search } = Input;

interface CatalogSearchProps {
  /** fires per keystroke and on clearing the input */
  onChange: (value: string) => void;
  /** fires on enter / the search button */
  onSubmit: (value: string) => void;
  isSearching: boolean;
  inputRef?: Ref<InputRef>;
}

/** the catalog search input; term state lives in useCatalogSearch */
const CatalogSearch = memo(
  ({ onChange, onSubmit, isSearching, inputRef }: CatalogSearchProps) => (
    <Search
      ref={inputRef}
      placeholder="Suchbegriff eingeben"
      className="w-full sm:w-[76%]"
      allowClear
      onChange={(e) => onChange(e.target.value)}
      loading={isSearching}
      onSearch={onSubmit}
    />
  )
);
CatalogSearch.displayName = "CatalogSearch";

export default CatalogSearch;
