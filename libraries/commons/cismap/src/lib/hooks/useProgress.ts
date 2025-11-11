import { useState } from "react";

export const useProgress = () => {
  const [progress, setProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false);

  const handleProgressUpdate = (e: { current: number; total: number }) => {
    const newProgress = Math.round((e.current / e.total) * 100);
    setProgress(newProgress);
    setShowProgress(newProgress < 100);
  };

  const resetProgress = () => {
    setProgress(0);
    setShowProgress(false);
  };

  return {
    progress,
    showProgress,
    handleProgressUpdate,
    resetProgress,
    setProgress,
    setShowProgress,
  };
};

export default useProgress;
