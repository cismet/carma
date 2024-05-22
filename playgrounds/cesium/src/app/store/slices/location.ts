import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface LocationState {
  hash: string | null;
  hashParams?: Record<string, string>;
}

const hashToParams = (hash: string) => {
  const params = new URLSearchParams(hash.slice(1));
  const result: Record<string, string> = {};
  params.forEach((value, key) => {
    result[key] = value;
  });
  return result;
};

const paramsToHashset = (params: Record<string, string>) => {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    result.set(key, value);
  }
  return '#' + result.toString();
};

export default createSlice({
  name: 'location',
  initialState: { hash: window.location.hash },
  reducers: {
    setLocation: (state: LocationState, action: PayloadAction<string>) => {
      state.hash = action.payload;
      state.hashParams = hashToParams(action.payload);
    },
  },
});
