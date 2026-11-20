/**
 * RLS, KJ, Secure the user_followed_topics table
 *
 * Attack tests for Row Level Security on user_followed_topics, adapted from the
 * starter repo's rls-suite.ts (brockenbrough/security-starter-rls-v1).
 *
 * These tests talk to the REAL Supabase project; nothing is mocked. Every
 * attack uses only the public anon key, the same key any browser gets, either
 * signed in as nobody or signed in as a test user. The service_role key is used
 * only to set up the test data and to look at what is really in the table.
 *
 * Each test asserts what SHOULD happen. A failing test names the problem.
 *
 * Owner column: user_id (the same id as auth.users.id).
 * Rules: a signed-in resident may read, add and remove only their own follows.
 * Nobody may update a follow. A visitor who is not signed in may do nothing.
 *
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

const TABLE = 'user_followed_topics';
const PASSWORD = 'Rls-Demo-Password-123!';
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

type TestUser = { id: string; email: string };

/** Client with only the public anon key, signed in as nobody. */
function anonClient() {
  return createClient(SUPABASE_URL, ANON_KEY, noSession);
}

/** Client with the public anon key, signed in as `user` (what their browser has). */
async function clientSignedInAs(user: TestUser) {
  const { data, error } = await anonClient().auth.signInWithPassword({ email: user.email, password: PASSWORD });
  if (error || !data.session) throw new Error(`Could not sign in ${user.email}: ${error?.message}`);
  return createClient(SUPABASE_URL, ANON_KEY, {
    ...noSession,
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

describe(`RLS on "${TABLE}": residents must not be able to touch each other's followed topics`, () => {
  const runId = Math.random().toString(36).slice(2, 8);

  // The admin client (service role) BYPASSES RLS. It only sets up data and checks results.
  let admin: SupabaseClient;

  let alice: TestUser; // the victim
  let bob: TestUser; // the attacker
  let carol: TestUser; // a resident who follows nothing

  // Three existing catalog topics. The tests only add follows; they never change the catalog.
  let topicA: number; // Alice follows this one
  let topicB: number; // Bob follows this one
  let topicC: number; // used when someone tries to add a new follow

  async function createUser(name: string): Promise<TestUser> {
    const email = `rls-demo-${name}-topics-${runId}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error || !data.user) throw new Error(`Could not create ${name}: ${error?.message}`);
    // user_followed_topics.user_id references user_accounts, so each test user needs an account row.
    const { error: accountError } = await admin.from('user_accounts').upsert({ user_id: data.user.id, email });
    if (accountError) throw new Error(`Could not create the account row for ${name}: ${accountError.message}`);
    return { id: data.user.id, email };
  }

  /** The topic ids `user` really follows, read with the service role. */
  async function followedTopicIds(user: TestUser) {
    const { data, error } = await admin.from(TABLE).select('topic_id').eq('user_id', user.id).order('topic_id');
    if (error) throw new Error(`Could not read ${TABLE}: ${error.message}`);
    return (data ?? []).map((row) => row.topic_id as number);
  }

  beforeAll(async () => {
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
      throw new Error(
        'Missing Supabase credentials. Set SUPABASE_URL, SUPABASE_ANON_KEY and ' +
          'SUPABASE_SERVICE_ROLE_KEY in .env.local (see .env.example).',
      );
    }
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, noSession);

    const { data: topics, error: topicsError } = await admin
      .from('topics')
      .select('topic_id')
      .is('removed_at', null)
      .order('topic_id')
      .limit(3);
    if (topicsError || !topics || topics.length < 3) {
      throw new Error(`The catalog needs at least 3 active topics: ${topicsError?.message ?? 'found fewer'}`);
    }
    [topicA, topicB, topicC] = topics.map((topic) => topic.topic_id as number);

    alice = await createUser('alice');
    bob = await createUser('bob');
    carol = await createUser('carol');

    const { error } = await admin.from(TABLE).insert([
      { user_id: alice.id, topic_id: topicA },
      { user_id: bob.id, topic_id: topicB },
    ]);
    if (error) throw new Error(`Could not seed ${TABLE}: ${error.message}`);
  });

  afterAll(async () => {
    // Deleting the auth users cascades to user_accounts and then to their followed topics.
    for (const user of [alice, bob, carol]) {
      if (user) await admin.auth.admin.deleteUser(user.id);
    }
  });

  // --- The owner can use the table (the app's rules, SRS-101.4 and SRS-101.5) ---

  it('Alice can read her own followed topics', async () => {
    const asAlice = await clientSignedInAs(alice);
    const { data } = await asAlice.from(TABLE).select('topic_id').eq('user_id', alice.id);

    expect(
      (data ?? []).map((row) => row.topic_id),
      `BLOCKED OWNER: Alice could not read her own row in ${TABLE}.`,
    ).toEqual([topicA]);
  });

  it('Alice can follow a topic for herself', async () => {
    try {
      const asAlice = await clientSignedInAs(alice);
      await asAlice.from(TABLE).insert({ user_id: alice.id, topic_id: topicC });

      expect(await followedTopicIds(alice), `BLOCKED OWNER: Alice could not follow a topic in ${TABLE}.`).toContain(topicC);
    } finally {
      // Put Alice back to following only topic A, even when the check above fails.
      await admin.from(TABLE).delete().eq('user_id', alice.id).eq('topic_id', topicC);
    }
  });

  it('Alice can unfollow her own topic', async () => {
    await admin.from(TABLE).upsert({ user_id: alice.id, topic_id: topicC });
    try {
      const asAlice = await clientSignedInAs(alice);
      await asAlice.from(TABLE).delete().eq('user_id', alice.id).eq('topic_id', topicC);

      expect(await followedTopicIds(alice), `BLOCKED OWNER: Alice could not unfollow her own topic in ${TABLE}.`).not.toContain(topicC);
    } finally {
      // Put Alice back to following only topic A, even when the check above fails.
      await admin.from(TABLE).delete().eq('user_id', alice.id).eq('topic_id', topicC);
    }
  });

  // --- The five attacks ---

  it('an anonymous visitor (not signed in) cannot list followed topics', async () => {
    const { data } = await anonClient().from(TABLE).select('*').in('user_id', [alice.id, bob.id]);

    expect(
      data ?? [],
      `LEAK: someone who isn't signed in, holding only the public anon key, read ${data?.length} row(s) from ${TABLE}.`,
    ).toHaveLength(0);
  });

  it("Bob cannot read Alice's followed topics", async () => {
    const asBob = await clientSignedInAs(bob);
    const { data } = await asBob.from(TABLE).select('*').eq('user_id', alice.id);

    expect(data ?? [], `LEAK: Bob read Alice's followed topics in ${TABLE}: ${JSON.stringify(data)}`).toHaveLength(0);
  });

  it("Bob cannot change Alice's followed topic", async () => {
    const asBob = await clientSignedInAs(bob);
    await asBob.from(TABLE).update({ topic_id: topicC }).eq('user_id', alice.id).eq('topic_id', topicA);

    expect(await followedTopicIds(alice), `TAMPERING: Bob changed which topic Alice follows in ${TABLE}.`).toEqual([topicA]);
  });

  it('Bob cannot follow a topic on behalf of another resident', async () => {
    const asBob = await clientSignedInAs(bob);
    await asBob.from(TABLE).insert({ user_id: carol.id, topic_id: topicA });

    expect(await followedTopicIds(carol), `IMPERSONATION: Bob created a row in ${TABLE} using Carol's user id.`).toEqual([]);
  });

  // Runs last because, while the table is vulnerable, it really deletes Alice's follow.
  it("Bob cannot delete Alice's followed topic", async () => {
    const asBob = await clientSignedInAs(bob);
    await asBob.from(TABLE).delete().eq('user_id', alice.id);

    expect(await followedTopicIds(alice), `DESTRUCTION: Bob deleted Alice's followed topic in ${TABLE}.`).toEqual([topicA]);
  });
});
