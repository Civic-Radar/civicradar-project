import { useReducer } from 'react';

// The Documents page's title search (UR-216). The state lives in a reducer so
// each rule can be tested without a browser.

export type TitleSearchState = {
  // What is in the search field (SRS-216.1).
  query: string;
};

export type TitleSearchAction = { type: 'typed'; value: string };

export const INITIAL_TITLE_SEARCH: TitleSearchState = { query: '' };

export function titleSearchReducer(state: TitleSearchState, action: TitleSearchAction): TitleSearchState {
  switch (action.type) {
    case 'typed':
      return { ...state, query: action.value };
    default:
      return state;
  }
}

export type TitleSearch = TitleSearchState & {
  type: (value: string) => void;
};

export function useTitleSearch(): TitleSearch {
  const [state, dispatch] = useReducer(titleSearchReducer, INITIAL_TITLE_SEARCH);
  return { ...state, type: (value) => dispatch({ type: 'typed', value }) };
}
