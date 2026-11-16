import { useReducer } from 'react';

// The Documents page's title search (UR-216). The state lives in a reducer so
// each rule can be tested without a browser.

export type TitleSearchState = {
  // What is in the search field (SRS-216.1).
  query: string;
  // The trimmed term of the last submitted search, or '' for no search (SRS-216.2).
  submittedTerm: string;
};

export type TitleSearchAction = { type: 'typed'; value: string } | { type: 'submitted' };

export const INITIAL_TITLE_SEARCH: TitleSearchState = { query: '', submittedTerm: '' };

export function titleSearchReducer(state: TitleSearchState, action: TitleSearchAction): TitleSearchState {
  switch (action.type) {
    case 'typed':
      // Typing alone does not filter the list; only submitting does (SRS-216.2).
      return { ...state, query: action.value };
    case 'submitted':
      return { ...state, submittedTerm: state.query.trim() };
    default:
      return state;
  }
}

export type TitleSearch = TitleSearchState & {
  type: (value: string) => void;
  submit: () => void;
};

export function useTitleSearch(): TitleSearch {
  const [state, dispatch] = useReducer(titleSearchReducer, INITIAL_TITLE_SEARCH);
  return {
    ...state,
    type: (value) => dispatch({ type: 'typed', value }),
    submit: () => dispatch({ type: 'submitted' }),
  };
}
