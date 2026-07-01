const FilterEmptyState = () => (
  <div className="flex flex-col items-center justify-center text-center mb-6">
    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center mb-3 text-gray-400" />
    <p className="max-w-sm text-sm leading-relaxed">
      Klicke links auf ein <strong>Feld</strong>, um eine Bedingung zu erstellen.
      Mehrere Gruppen lassen sich mit <strong>UND</strong> / <strong>ODER</strong>{" "}
      verschachteln.
    </p>
  </div>
);

export default FilterEmptyState;
