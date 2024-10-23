import { createSlice } from '@reduxjs/toolkit';
// import dexieworker from 'workerize-loader!../../workers/dexie'; // eslint-disable-line import/no-webpack-loader-syntax

import { db } from '../../indexeddb/dexiedb';
import { workerInstance } from '../../workers/utils';

const slice = createSlice({
  name: 'dexie',
  initialState: {
    worker: workerInstance,

    db,
  },
  reducers: {},
});

export default slice;

//actions

//selectors
export const getWorker = (state) => state.dexie.worker;
export const getDexieDB = (state) => state.dexie.db;
