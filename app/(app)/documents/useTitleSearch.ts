import { useReducer } from 'react';

// The Documents page's title search (UR-216). The state lives in a reducer so
// each rule can be tested without a browser.

export type TitleSearchState = {
  // What is in the search field (SRS-216.1).
  query: string;
  // The trimmed term of the last submitted search, or '' for no search (SRS-216.2).
  submittedTerm: string;
};

export type TitleSearchAction = { type: 'typed'; value: string } | { type: 'submitted' } | { type: 'cleared' };

export const INITIAL_TITLE_SEARCH: TitleSearchState = { query: '', submittedTerm: '' };

export function titleSearchReducer(state: TitleSearchState, action: TitleSearchAction): TitleSearchState {
  switch (action.type) {
    case 'typed':
      // Typing alone does not filter the list; only submitting does (SRS-216.2).
      // An emptied field (text deleted, or the field's own clear button) ends the
      // search, so every document in scope is listed again (SRS-216.4).
      return { query: action.value, submittedTerm: action.value.trim() === '' ? '' : state.submittedTerm };
    case 'submitted':
      return { ...state, submittedTerm: state.query.trim() };
    case 'cleared':
      // The Clear search button (SRS-216.4).
      return INITIAL_TITLE_SEARCH;
    default:
      return state;
  }
}

export type TitleSearch = TitleSearchState & {
  type: (value: string) => void;
  submit: () => void;
  clear: () => void;
};

export function useTitleSearch(): TitleSearch {
  const [state, dispatch] = useReducer(titleSearchReducer, INITIAL_TITLE_SEARCH);
  return {
    ...state,
    type: (value) => dispatch({ type: 'typed', value }),
    submit: () => dispatch({ type: 'submitted' }),
    clear: () => dispatch({ type: 'cleared' }),
  };
}
