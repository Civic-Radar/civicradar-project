import { Search } from 'lucide-react';
import { buttonClasses } from '../../components/ui/Button';
import { inputClasses } from '../../components/ui/TextField';

// SRS-216.1: the exact label of the title search field.
export const TITLE_SEARCH_LABEL = 'Search by title';

// SRS-216.4: shown while a search is active, for browsers whose search field
// has no clear button of its own.
export const CLEAR_SEARCH_LABEL = 'Clear search';

// The title search field above the document list (SRS-216.1). The page owns the
// state and passes it in, so the form itself holds none.
export default function TitleSearch({
  query,
  onQueryChange,
  onSubmit,
  searchActive = false,
  onClear = () => {},
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
  searchActive?: boolean;
  onClear?: () => void;
}) {
  return (
    <form
      role="search"
      aria-label={TITLE_SEARCH_LABEL}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex w-full min-w-0 gap-2 sm:w-auto sm:flex-1"
    >
      <label className="min-w-0 flex-1">
        <span className="sr-only">{TITLE_SEARCH_LABEL}</span>
        <span className="relative block">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <input
            type="search"
            name="title"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={TITLE_SEARCH_LABEL}
            autoComplete="off"
            className={inputClasses('min-h-11 pl-9')}
          />
        </span>
      </label>
      <button type="submit" className={buttonClasses({ variant: 'secondary' })}>
        Search
      </button>
      {searchActive ? (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-semibold text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {CLEAR_SEARCH_LABEL}
        </button>
      ) : null}
    </form>
  );
}
