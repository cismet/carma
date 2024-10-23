import { createSlice } from '@reduxjs/toolkit';

const slice = createSlice({
	name: 'uiMessage',
	initialState: undefined,
	reducers: {
		set: (state, action) => action.payload
	}
});

export default slice;

//actions
export const { set } = slice.actions;

//selectors
export const getUIMessage = (state) => state.uiMessage;
