type AnnotationJsonPreviewProps = {
  value: unknown;
  emptyText?: string;
};

export const AnnotationJsonPreview = ({
  value,
  emptyText = "Keine Messung ausgewaehlt.",
}: AnnotationJsonPreviewProps) => {
  if (value == null) {
    return (
      <div className="mt-2 w-[90%] p-2 text-[#212529] font-normal text-[12px] leading-normal">
        {emptyText}
      </div>
    );
  }

  return (
    <pre className="m-0 w-full overflow-auto px-2 pb-2 text-[12px] leading-normal text-[#212529] whitespace-pre-wrap break-words">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
};
