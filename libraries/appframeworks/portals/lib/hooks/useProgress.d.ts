export declare const useProgress: () => {
  progress: number;
  showProgress: boolean;
  handleProgressUpdate: (e: { current: number; total: number }) => void;
  resetProgress: () => void;
  setProgress: import("react").Dispatch<import("react").SetStateAction<number>>;
  setShowProgress: import("react").Dispatch<
    import("react").SetStateAction<boolean>
  >;
};
export default useProgress;
