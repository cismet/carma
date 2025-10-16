import { FallbackProps } from "react-error-boundary";

const AppErrorFallback = ({ error, resetErrorBoundary }: FallbackProps) => {
  return (
    <div role="alert" className="p-4">
      <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
      <pre className="bg-red-100 p-4 rounded mb-4">{error.message}</pre>
      <button
        onClick={resetErrorBoundary}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        Try again
      </button>
    </div>
  );
};

export default AppErrorFallback;
