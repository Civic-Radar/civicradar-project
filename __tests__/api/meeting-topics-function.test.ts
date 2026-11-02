// SRS-401.4, EG, Topic tagging: replace_meeting_topics database function (Tasks 401.4-3, 401.4-4)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(join(process.cwd(), 'supabase/schema.sql'), 'utf8');

// The function body, from its create statement to the end of its dollar quote.
const start = schema.indexOf('create function public.replace_meeting_topics');
const body = start === -1 ? '' : schema.slice(start, schema.indexOf('$$;', start));

describe('replace_meeting_topics (SRS-401.4)', () => {
  it('takes a meeting id, a JSON list of tags, and the agenda they came from, and returns a boolean', () => {
    expect(body).toMatch(
      /^create function public\.replace_meeting_topics \(p_meeting_id BIGINT, p_tags JSONB, p_agenda JSONB\) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER/,
    );
    expect(body).toMatch(/search_path = pg_catalog,\s+public/);
  });

  it('rejects tags that are not a JSON array', () => {
    expect(body).toMatch(
      /IF p_tags IS NULL OR jsonb_typeof\(p_tags\) <> 'array' THEN\s+RAISE EXCEPTION 'p_tags must be a JSON array';/,
    );
  });

  it('locks the meeting row and stops when the meeting is missing', () => {
    expect(body).toContain('PERFORM 1 FROM meetings WHERE meeting_id = p_meeting_id FOR UPDATE;');
    expect(body).toMatch(/IF NOT FOUND THEN\s+RAISE EXCEPTION 'Meeting % not found', p_meeting_id;/);
  });

  it('saves nothing when the agenda changed, checking after the lock and before any write', () => {
    const lock = body.indexOf('FOR UPDATE;');
    const compare = body.indexOf('IS DISTINCT FROM p_agenda THEN');
    const stale = body.indexOf('RETURN false;');
    const del = body.indexOf('DELETE FROM meeting_topics');

    expect(compare).toBeGreaterThan(lock);
    expect(stale).toBeGreaterThan(compare);
    expect(del).toBeGreaterThan(stale);
    expect(body).toMatch(
      /jsonb_agg\(jsonb_build_object\('agenda_item_id', agenda_item_id, 'item_text', item_text\) ORDER BY sort_order, agenda_item_id\)/,
    );
    expect(body).toMatch(/WHERE meeting_id = p_meeting_id AND removed_at IS NULL\s+\) IS DISTINCT FROM p_agenda/);
  });

  it('replaces the tags, marks the meeting Classified, and returns true, in that order', () => {
    const del = body.indexOf('DELETE FROM meeting_topics WHERE meeting_id = p_meeting_id;');
    const ins = body.indexOf('INSERT INTO meeting_topics (meeting_id, topic_id, evidence_text)');
    const upd = body.indexOf("UPDATE meetings SET topic_classification = 'Classified' WHERE meeting_id = p_meeting_id;");
    const done = body.indexOf('RETURN true;');

    expect(del).toBeGreaterThan(-1);
    expect(ins).toBeGreaterThan(del);
    expect(upd).toBeGreaterThan(ins);
    expect(done).toBeGreaterThan(upd);
    expect(body).toContain('FROM jsonb_array_elements(p_tags) AS tag;');
  });

  it('can only be run by the service role', () => {
    expect(schema).toContain(
      'revoke all on function public.replace_meeting_topics (BIGINT, JSONB, JSONB) from public, anon, authenticated;',
    );
    const grants = [
      ...schema.matchAll(/grant execute on function public\.replace_meeting_topics \(([A-Z, ]+)\) to (\w+);/g),
    ];
    expect(grants.map((match) => [match[1], match[2]])).toEqual([['BIGINT, JSONB, JSONB', 'service_role']]);
  });

  it('is dropped when the schema is rebuilt', () => {
    expect(schema).toContain('drop function IF exists public.replace_meeting_topics (BIGINT, JSONB, JSONB) CASCADE;');
  });
});

// SRS-401.10, EG, Unavailable classification: mark_meeting_unavailable database function (Task 401.10-1)
const unavailableStart = schema.indexOf('create function public.mark_meeting_unavailable');
const unavailableBody = unavailableStart === -1 ? '' : schema.slice(unavailableStart, schema.indexOf('$$;', unavailableStart));

describe('mark_meeting_unavailable (SRS-401.10)', () => {
  it('takes a meeting id and the agenda that was read, and returns a boolean', () => {
    expect(unavailableBody).toMatch(
      /^create function public\.mark_meeting_unavailable \(p_meeting_id BIGINT, p_agenda JSONB\) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER/,
    );
    expect(unavailableBody).toMatch(/search_path = pg_catalog,\s+public/);
  });

  it('locks the meeting, then saves nothing when the agenda changed, before any write', () => {
    const lock = unavailableBody.indexOf('PERFORM 1 FROM meetings WHERE meeting_id = p_meeting_id FOR UPDATE;');
    const compare = unavailableBody.indexOf('IS DISTINCT FROM p_agenda THEN');
    const stale = unavailableBody.indexOf('RETURN false;');
    const del = unavailableBody.indexOf('DELETE FROM meeting_topics');

    expect(lock).toBeGreaterThan(-1);
    expect(compare).toBeGreaterThan(lock);
    expect(stale).toBeGreaterThan(compare);
    expect(del).toBeGreaterThan(stale);
    expect(unavailableBody).toMatch(/WHERE meeting_id = p_meeting_id AND removed_at IS NULL\s+\) IS DISTINCT FROM p_agenda/);
  });

  it('removes the tags, marks the meeting Unavailable, and returns true, in that order', () => {
    const del = unavailableBody.indexOf('DELETE FROM meeting_topics WHERE meeting_id = p_meeting_id;');
    const upd = unavailableBody.indexOf("UPDATE meetings SET topic_classification = 'Unavailable' WHERE meeting_id = p_meeting_id;");
    const done = unavailableBody.indexOf('RETURN true;');

    expect(del).toBeGreaterThan(-1);
    expect(upd).toBeGreaterThan(del);
    expect(done).toBeGreaterThan(upd);
  });

  it('can only be run by the service role, and is dropped when the schema is rebuilt', () => {
    expect(schema).toContain(
      'revoke all on function public.mark_meeting_unavailable (BIGINT, JSONB) from public, anon, authenticated;',
    );
    expect(schema).toContain('grant execute on function public.mark_meeting_unavailable (BIGINT, JSONB) to service_role;');
    expect(schema).toContain('drop function IF exists public.mark_meeting_unavailable (BIGINT, JSONB) CASCADE;');
  });
});
