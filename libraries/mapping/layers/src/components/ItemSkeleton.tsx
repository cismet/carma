const ItemSkeleton = () => {
  return (
    <div className="bg-white rounded-lg shadow-sm h-80 w-full flex flex-col gap-2 animate-pulse">
      <div className="h-40 p-2 w-full bg-slate-200 rounded-t-lg"></div>
      <div className="h-4 mt-4 bg-slate-200 rounded mx-8 w-2/3"></div>
    </div>
  );
};

export default ItemSkeleton;
