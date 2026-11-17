import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentState } from '../../app/(app)/documents/[id]/useDocument';

// SRS-203.4, MS, Return from detail page: the back control on a document
// detail page returns the user to the page they came from (defect #500).

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

// The page gets its data only through useDocument, so the hook is replaced by
// whatever state a test sets. No fetch, no localStorage, no effects.
const hook = vi.hoisted(() => ({ state: { status: 'loading' } as DocumentState }));
vi.mock('../../app/(app)/documents/[id]/useDocument', () => ({ useDocument: () => hook.state }));

import DocumentDetailPage from '../../app/(app)/documents/[id]/page';
import BackControl, { BACK_FALLBACK, returnToPreviousPage } from '../../app/(app)/documents/[id]/BackControl';

const LOADED: DocumentState = {
  status: 'loaded',
  document: {
    document_id: 7,
    meeting_id: 1192,
    town_id: 1,
    title: 'City Council Regular Meeting',
    document_type: 'Agenda',
    source_url: 'https://salemma.portal.civicclerk.com/event/1192/overview',
    retrieved_at: '2026-09-20T18:05:00+00:00',
    summary_status: 'Pending',
    summary_text: null,
    summary_generated_at: null,
    pdf_url: 'https://example.supabase.co/storage/v1/object/sign/documents/1/1166.pdf?token=t',
  },
};

function render(state: DocumentState): string {
  // Vitest compiles JSX to React.createElement and the page does not import React.
  vi.stubGlobal('React', React);
  hook.state = state;
  return renderToStaticMarkup(React.createElement(DocumentDetailPage, { params: { id: '7' } }));
}

function backButtons(markup: string): string[] {
  return Array.from(markup.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g), ([, inner]) => inner.replace(/<[^>]*>/g, '').trim())
    .filter((text) => text === 'Back');
}

// A browser tab's history: the pages visited so far, the current one last.
function tab(...visited: string[]) {
  const pages = [...visited];
  return {
    get length() { return pages.length; },
    back: vi.fn(() => { pages.pop(); }),
    get current() { return pages[pages.length - 1]; },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Document detail page: the Back control (SRS-203.4)', () => {
  const states: [string, DocumentState][] = [
    ['loading', { status: 'loading' }],
    ['signed out', { status: 'signedOut' }],
    ['not found', { status: 'notFound' }],
    ['load failed', { status: 'loadFailed' }],
    ['loaded', LOADED],
  ];

  it.each(states)('shows exactly one Back button while %s', (_label, state) => {
    expect(backButtons(render(state))).toEqual(['Back']);
  });

  it('puts Back above the document title', () => {
    const markup = render(LOADED);
    expect(markup.indexOf('>Back<')).toBeGreaterThan(-1);
    expect(markup.indexOf('>Back<')).toBeLessThan(markup.indexOf('City Council Regular Meeting'));
  });

  it('is a real button, so it is reachable by keyboard', () => {
    expect(render(LOADED)).toMatch(/<button type="button"[^>]*>[\s\S]*?Back<\/button>/);
  });
});

describe('returnToPreviousPage (SRS-203.4)', () => {
  it('returns to the meeting details page the document was opened from', () => {
    const history = tab('/meetings/1192', '/documents/7');
    const open = vi.fn();

    returnToPreviousPage(history, open);

    expect(history.back).toHaveBeenCalledTimes(1);
    expect(history.current).toBe('/meetings/1192');
    expect(open).not.toHaveBeenCalled();
  });

  it.each([['/documents'], ['/search?q=parking']])('returns to %s when the document was opened from there', (from) => {
    const history = tab('/dashboard', from, '/documents/7');
    returnToPreviousPage(history, vi.fn());
    expect(history.current).toBe(from);
  });

  it('opens the Documents page when the detail page has no earlier page (a new tab)', () => {
    const history = tab('/documents/7');
    const open = vi.fn();

    returnToPreviousPage(history, open);

    expect(history.back).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith('/documents');
    expect(BACK_FALLBACK).toBe('/documents');
  });
});

describe('BackControl: the button is wired to returnToPreviousPage (SRS-203.4)', () => {
  function click(historyLength: number) {
    const back = vi.fn();
    const assign = vi.fn();
    vi.stubGlobal('React', React);
    vi.stubGlobal('window', { history: { length: historyLength, back }, location: { assign } });
    const element = BackControl() as React.ReactElement<{ onClick: () => void }>;
    element.props.onClick();
    return { back, assign };
  }

  it('goes back in the history when there is an earlier page', () => {
    const { back, assign } = click(2);
    expect(back).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });

  it('opens /documents when there is no earlier page', () => {
    const { back, assign } = click(1);
    expect(back).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith('/documents');
  });
});
