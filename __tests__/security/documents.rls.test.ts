/**
 * Row Level Security tests for documents (RLS card #723).
 *
 * Adapted from rls-suite.ts in github.com/brockenbrough/security-starter-rls-v1,
 * following user_followed_towns.rls.test.ts. One row in this table is one file
 * retrieved from a town's source. Documents are town data, not per-user data,
 * so there is no owner column: the rules come from the SRS.
 *
 *   select  any signed-in user, every row (SRS-213.2 "All towns")
 *   insert  nobody through the public API (retrieval uses the service role key)
 *   update  nobody through the public API (the summary job uses the service role key)
 *   delete  nobody (documents are never deleted)
 *   visitor who is not signed in: nothing
 *
 * Nothing is mocked. The tests talk to the real Supabase project in .env.local
 * the way a browser would: with the public anon key, signed in as nobody or as
 * one resident. The admin client (service role key) skips RLS; it only creates
 * the test user and one temporary test document, checks what is really in the
 * table, and removes both at the end. No real document is read or changed by
 * an attack: every attack targets the temporary row.
 *
 * The temporary row is marked so nothing else in the app acts on it:
 *  - baselined_at is set, so a source check never announces it as new material
 *  - summary_status is Complete, so the summary job never picks it up
 *  - mime_type is text/plain and there is no Storage file, so no PDF is served
 *
 * Two groups:
 *  - Attacks: a visitor or a resident tries to read without signing in, or to
 *    create, change or delete documents. These must stay blocked before and
 *    after the fix.
 *  - Allowed: a signed-in resident reads documents. The table already has RLS
 *    on with no policies, which blocks everyone, so this fails until the policy
 *    in supabase/rls_documents.sql is added.
 *
 * The tests run in file order, because some of them try to change rows.
 * Run with:  npm run test:security
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// --- Load credentials from .env.local / .env (real values, not mocks) -------
for (const file of ['.env.local', '.env']) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const TABLE = 'documents';
const PASSWORD = 'Rls-Test-Password-123!';
const runId = Math.random().toString(36).slice(2, 8);
const TEST_PREFIX = `rls-test-${runId}`;
const TEST_TITLE = `RLS test document ${runId} (temporary)`;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

type TestUser = { id: string; email: string };
type Meeting = { meeting_id: number; town_id: number };

/** Client with only the public anon key, signed in as nobody. */
function anonClient() {
  return createClient(SUPABASE_URL, ANON_KEY, noSession);
}

/** Client with the public anon key, signed in as `user` (what their browser has). */
async function clientSignedInAs(user: TestUser) {
  const { data, error } = await anonClient().auth.signInWithPassword({
    email: user.email,
    password: PASSWORD,
  });
  if (error || !data.session) throw new Error(`Could not sign in ${user.email}: ${error?.message}`);
  return createClient(SUPABASE_URL, ANON_KEY, {
    ...noSession,
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

/** A complete documents row for the temporary test document. */
function testDocument(meeting: Meeting, name: string) {
  const at = new Date().toISOString();
  return {
    meeting_id: meeting.meeting_id,
    town_id: meeting.town_id,
    source_file_id: `${TEST_PREFIX}-${name}`,
    title: TEST_TITLE,
    document_type: 'Other',
    source_url: 'https://example.com/rls-test',
    storage_path: `${TEST_PREFIX}/${name}.txt`,
    mime_type: 'text/plain',
    file_size_bytes: 0,
    file_sha256: '0'.repeat(64),
    retrieved_at: at,
    baselined_at: at,
    summary_status: 'Complete',
    summary_text: 'Temporary row for the RLS attack tests.',
    summary_generated_at: at,
  };
}

describe(`RLS on "${TABLE}"`, () => {
  let admin: SupabaseClient;
  let resident: TestUser; // a signed-in resident: may read, may not write
  let asResident: SupabaseClient;
  let meeting: Meeting; // an existing meeting the test document hangs off
  let testDocumentId: number;

  async function createUser(name: string): Promise<TestUser> {
    const email = `rls-test-${name}-${runId}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`Could not create ${name}: ${error?.message}`);
    return { id: data.user.id, email };
  }

  /** The test documents that really exist, read with the admin client (skips RLS). */
  async function testDocumentsAsAdmin() {
    const { data, error } = await admin
      .from(TABLE)
      .select('document_id, title, summary_status')
      .like('source_file_id', `${TEST_PREFIX}-%`)
      .order('document_id');
    if (error) throw new Error(`Admin could not read ${TABLE}: ${error.message}`);
    return data ?? [];
  }

  beforeAll(async () => {
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
      throw new Error(
        'Missing Supabase credentials. Set SUPABASE_URL, SUPABASE_ANON_KEY and ' +
          'SUPABASE_SERVICE_ROLE_KEY in .env.local (see .env.example).',
      );
    }
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, noSession);

    resident = await createUser('resident');

    // A document needs an existing meeting (composite foreign key on meeting and town).
    const meetings = await admin.from('meetings').select('meeting_id, town_id').order('meeting_id').limit(1);
    if (meetings.error || (meetings.data ?? []).length === 0) {
      throw new Error(`Need one stored meeting: ${meetings.error?.message ?? 'none found'}`);
    }
    meeting = meetings.data![0] as Meeting;

    const inserted = await admin.from(TABLE).insert(testDocument(meeting, 'seed')).select('document_id').single();
    if (inserted.error || !inserted.data) {
      throw new Error(`Could not create the test document: ${inserted.error?.message}`);
    }
    testDocumentId = inserted.data.document_id as number;

    asResident = await clientSignedInAs(resident);
  });

  afterAll(async () => {
    // Removes the temporary test document, and any row an attack managed to create.
    if (admin) await admin.from(TABLE).delete().like('source_file_id', `${TEST_PREFIX}-%`);
    if (resident) await admin.auth.admin.deleteUser(resident.id);
  });

  describe('attacks: must stay blocked', () => {
    it('a visitor who is not signed in cannot read the test document', async () => {
      const { data } = await anonClient().from(TABLE).select('*').eq('document_id', testDocumentId);

      expect(
        data ?? [],
        `LEAK: someone who isn't signed in, holding only the public anon key, read the test document.`,
      ).toHaveLength(0);
    });

    it('a visitor who is not signed in cannot list any documents', async () => {
      const { data } = await anonClient().from(TABLE).select('document_id').limit(5);

      expect(
        data ?? [],
        `LEAK: someone who isn't signed in listed ${data?.length} document(s).`,
      ).toHaveLength(0);
    });

    it('a visitor who is not signed in cannot change a document', async () => {
      await anonClient().from(TABLE).update({ title: 'Changed by a visitor' }).eq('document_id', testDocumentId);

      expect(
        (await testDocumentsAsAdmin()).map((row) => row.title),
        'TAMPERING: a visitor changed the test document.',
      ).toEqual([TEST_TITLE]);
    });

    it('a signed-in resident cannot create a document', async () => {
      await asResident.from(TABLE).insert(testDocument(meeting, 'forged'));

      expect(
        (await testDocumentsAsAdmin()).map((row) => row.document_id),
        'FORGERY: a resident added a document. Only retrieval may add documents.',
      ).toEqual([testDocumentId]);
    });

    it("a signed-in resident cannot change a document's title", async () => {
      await asResident.from(TABLE).update({ title: 'Changed by a resident' }).eq('document_id', testDocumentId);

      expect(
        (await testDocumentsAsAdmin()).map((row) => row.title),
        'TAMPERING: a resident changed the title of the test document.',
      ).toEqual([TEST_TITLE]);
    });

    it("a signed-in resident cannot change a document's summary status", async () => {
      await asResident.from(TABLE).update({ summary_status: 'Failed', summary_text: null, summary_generated_at: null })
        .eq('document_id', testDocumentId);

      expect(
        (await testDocumentsAsAdmin()).map((row) => row.summary_status),
        'TAMPERING: a resident changed the summary status. Only the summary job may.',
      ).toEqual(['Complete']);
    });

    it('a signed-in resident cannot delete a document', async () => {
      await asResident.from(TABLE).delete().eq('document_id', testDocumentId);

      expect(
        (await testDocumentsAsAdmin()).map((row) => row.document_id),
        'DESTRUCTION: a resident deleted the test document.',
      ).toEqual([testDocumentId]);
    });

    it('a visitor who is not signed in cannot delete a document', async () => {
      await anonClient().from(TABLE).delete().eq('document_id', testDocumentId);

      expect(
        (await testDocumentsAsAdmin()).map((row) => row.document_id),
        'DESTRUCTION: a visitor deleted the test document.',
      ).toEqual([testDocumentId]);
    });
  });

  describe('allowed: must work after the fix', () => {
    it('a signed-in resident can read the test document (SRS-213.2)', async () => {
      const { data, error } = await asResident.from(TABLE).select('document_id, title').eq('document_id', testDocumentId);

      expect(
        data ?? [],
        `READ BLOCKED: a signed-in resident could not read the document (${error?.message ?? 'no rows came back'}).`,
      ).toEqual([{ document_id: testDocumentId, title: TEST_TITLE }]);
    });

    it("a signed-in resident can list documents from every town, not only one", async () => {
      const { data, error } = await asResident.from(TABLE).select('town_id').limit(1000);
      const { data: all } = await admin.from(TABLE).select('town_id').limit(1000);
      const towns = (rows: { town_id: number }[] | null) => [...new Set((rows ?? []).map((row) => row.town_id))].sort();

      expect(
        towns(data),
        `READ BLOCKED: a signed-in resident saw documents from ${towns(data).length} town(s), ` +
          `not all ${towns(all).length} (${error?.message ?? 'rows missing'}).`,
      ).toEqual(towns(all));
    });
  });
});
