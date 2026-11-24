/**
 * Row Level Security tests for user_followed_towns (RLS card #722).
 *
 * Adapted from rls-suite.ts in github.com/brockenbrough/security-starter-rls-v1.
 * One row in this table means "this resident follows this town", and the owner
 * column is user_id.
 *
 * Nothing is mocked. The tests talk to the real Supabase project in .env.local
 * the way a browser would: with the public anon key, signed in as nobody or as
 * one resident. The admin client (service role key) skips RLS; it only sets up
 * the test users and checks what is really in the table.
 *
 * Two groups:
 *  - Attacks: someone tries to read or change another resident's follows. These
 *    must stay blocked before and after the fix.
 *  - The owner: a resident uses their own follows. Our tables already have RLS
 *    on with no policies, which blocks everyone, owners included. So these fail
 *    until the policies in supabase/rls-user-followed-towns.sql are added.
 *
 * The tests run in file order, because some of them change rows.
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

const TABLE = 'user_followed_towns';
const PASSWORD = 'Rls-Test-Password-123!';
const runId = Math.random().toString(36).slice(2, 8);
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

type TestUser = { id: string; email: string };

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

describe(`RLS on "${TABLE}"`, () => {
  let admin: SupabaseClient;
  let alice: TestUser; // the victim: follows a town
  let bob: TestUser; // the attacker: follows a town too
  let carol: TestUser; // follows nothing yet
  let asAlice: SupabaseClient;
  let asBob: SupabaseClient;
  let asCarol: SupabaseClient;
  let town: number; // the town Alice and Bob follow
  let otherTown: number;

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

  /** The towns a user really follows, read with the admin client (skips RLS). */
  async function followedTownsAsAdmin(user: TestUser) {
    const { data, error } = await admin.from(TABLE).select('town_id').eq('user_id', user.id);
    if (error) throw new Error(`Admin could not read ${TABLE}: ${error.message}`);
    return (data ?? []).map((row) => row.town_id as number);
  }

  beforeAll(async () => {
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
      throw new Error(
        'Missing Supabase credentials. Set SUPABASE_URL, SUPABASE_ANON_KEY and ' +
          'SUPABASE_SERVICE_ROLE_KEY in .env.local (see .env.example).',
      );
    }
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, noSession);

    alice = await createUser('alice');
    bob = await createUser('bob');
    carol = await createUser('carol');

    // A follow needs the resident's user_accounts row first (foreign key).
    const accounts = await admin
      .from('user_accounts')
      .insert([alice, bob, carol].map((u) => ({ user_id: u.id, email: u.email })));
    if (accounts.error) throw new Error(`Could not create user_accounts rows: ${accounts.error.message}`);

    const towns = await admin
      .from('towns')
      .select('town_id')
      .is('removed_at', null)
      .order('town_id')
      .limit(2);
    if (towns.error || (towns.data ?? []).length < 2) {
      throw new Error(`Need two supported towns: ${towns.error?.message ?? 'fewer than two found'}`);
    }
    [town, otherTown] = towns.data!.map((row) => row.town_id as number);

    const follows = await admin.from(TABLE).insert([
      { user_id: alice.id, town_id: town },
      { user_id: bob.id, town_id: town },
    ]);
    if (follows.error) throw new Error(`Could not seed ${TABLE}: ${follows.error.message}`);

    asAlice = await clientSignedInAs(alice);
    asBob = await clientSignedInAs(bob);
    asCarol = await clientSignedInAs(carol);
  });

  afterAll(async () => {
    // Deleting the auth users cascades to user_accounts and to their follows.
    for (const user of [alice, bob, carol]) {
      if (user) await admin.auth.admin.deleteUser(user.id);
    }
  });

  describe('attacks: must stay blocked', () => {
    it('a visitor who is not signed in cannot list followed towns', async () => {
      const { data } = await anonClient().from(TABLE).select('*').in('user_id', [alice.id, bob.id]);

      expect(
        data ?? [],
        `LEAK: someone who isn't signed in, holding only the public anon key, read ` +
          `${data?.length} followed-town row(s).`,
      ).toHaveLength(0);
    });

    it("Bob cannot read Alice's followed towns", async () => {
      const { data } = await asBob.from(TABLE).select('*').eq('user_id', alice.id);

      expect(data ?? [], `LEAK: Bob read Alice's followed towns: ${JSON.stringify(data)}`).toHaveLength(0);
    });

    it("Bob cannot move Alice's follow to another town", async () => {
      await asBob.from(TABLE).update({ town_id: otherTown }).eq('user_id', alice.id);

      expect(
        await followedTownsAsAdmin(alice),
        "TAMPERING: Bob changed which town Alice follows.",
      ).toEqual([town]);
    });

    // Runs before Carol's own follow, so Carol has no rows yet.
    it('Bob cannot follow a town as Carol', async () => {
      await asBob.from(TABLE).insert({ user_id: carol.id, town_id: town });

      expect(
        await followedTownsAsAdmin(carol),
        "IMPERSONATION: Bob made Carol follow a town.",
      ).toEqual([]);
    });

    // Runs before Alice's own unfollow, so her row is still there to attack.
    it('Bob cannot unfollow a town for Alice', async () => {
      await asBob.from(TABLE).delete().eq('user_id', alice.id);

      expect(
        await followedTownsAsAdmin(alice),
        "DESTRUCTION: Bob deleted Alice's follow.",
      ).toEqual([town]);
    });
  });

  describe('the owner: must work after the fix', () => {
    it('Alice can read her own followed towns', async () => {
      const { data, error } = await asAlice.from(TABLE).select('town_id').eq('user_id', alice.id);

      expect(
        (data ?? []).map((row) => row.town_id),
        `OWNER BLOCKED: Alice could not read her own follow (${error?.message ?? 'no rows came back'}).`,
      ).toEqual([town]);
    });

    it('Carol can follow a town as herself', async () => {
      const { error } = await asCarol.from(TABLE).insert({ user_id: carol.id, town_id: town });

      expect(
        await followedTownsAsAdmin(carol),
        `OWNER BLOCKED: Carol could not follow a town (${error?.message ?? 'no row was saved'}).`,
      ).toEqual([town]);
    });

    it('Alice can unfollow her own town', async () => {
      await asAlice.from(TABLE).delete().eq('user_id', alice.id).eq('town_id', town);

      expect(
        await followedTownsAsAdmin(alice),
        'OWNER BLOCKED: Alice could not unfollow her own town.',
      ).toEqual([]);
    });
  });
});
