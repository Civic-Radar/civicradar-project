// SRS-401.4, EG, Topic tagging: replace_meeting_topics database function (Task 401.4-3)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(join(process.cwd(), 'supabase/schema.sql'), 'utf8');

// The function body, from its create statement to the end of its dollar quote.
const start = schema.indexOf('create function public.replace_meeting_topics');
const body = start === -1 ? '' : schema.slice(start, schema.indexOf('$$;', start));

describe('replace_meeting_topics (SRS-401.4)', () => {
  it('takes a meeting id and a JSON list of tags, with a pinned search path', () => {
    expect(body).toMatch(
      /^create function public\.replace_meeting_topics \(p_meeting_id BIGINT, p_tags JSONB\) RETURNS void LANGUAGE plpgsql SECURITY INVOKER/,
    );
    expect(body).toMatch(/search_path = pg_catalog,\s+public/);
  });

  it('locks the meeting row and stops when the meeting is missing', () => {
    expect(body).toContain('PERFORM 1 FROM meetings WHERE meeting_id = p_meeting_id FOR UPDATE;');
    expect(body).toMatch(/IF NOT FOUND THEN\s+RAISE EXCEPTION 'Meeting % not found', p_meeting_id;/);
  });

  it('replaces the tags and marks the meeting Classified, in that order', () => {
    const del = body.indexOf('DELETE FROM meeting_topics WHERE meeting_id = p_meeting_id;');
    const ins = body.indexOf('INSERT INTO meeting_topics (meeting_id, topic_id, evidence_text)');
    const upd = body.indexOf("UPDATE meetings SET topic_classification = 'Classified' WHERE meeting_id = p_meeting_id;");

    expect(del).toBeGreaterThan(-1);
    expect(ins).toBeGreaterThan(del);
    expect(upd).toBeGreaterThan(ins);
    expect(body).toContain('FROM jsonb_array_elements(p_tags) AS tag;');
  });

  it('can only be run by the service role', () => {
    expect(schema).toContain(
      'revoke all on function public.replace_meeting_topics (BIGINT, JSONB) from public, anon, authenticated;',
    );
    const grants = [...schema.matchAll(/grant execute on function public\.replace_meeting_topics \(BIGINT, JSONB\) to (\w+);/g)];
    expect(grants.map((match) => match[1])).toEqual(['service_role']);
  });

  it('is dropped when the schema is rebuilt', () => {
    expect(schema).toContain('drop function IF exists public.replace_meeting_topics (BIGINT, JSONB) CASCADE;');
  });
});
