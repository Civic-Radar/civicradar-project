# SSU Starter App V2

Professor Brockenbrough's Next.js starter with Tailwind CSS, Supabase auth, and a user profile system.

## Prerequisites

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com) and create a new project. Wait for the database to finish provisioning.

### 2. Get your connection variables

In your Supabase project, go to **Project Settings → GENERAL** and copy:
- **Project ID** → use to form `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL`. Take the value and construct a path like this: "https://xxxx.supabase.co" by adding the https part and the supabase.co part.  Both SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL use thissame value.

In your Supabase project, go to **Project Settings → API Keys/Legacy anon, service_role API keys** and copy:
- **anon public key** → use as `SUPABASE_ANON_KEY`
- **service_role secret key** → use as `SUPABASE_SERVICE_ROLE_KEY`

Create a `.env.local` file in the project root (copy from `.env.example`) and fill in those values:

```
SUPABASE_URL="https://your-project-id.supabase.co"
SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
NEXT_PUBLIC_SUPABASE_URL="https://your-project-id.supabase.co"
```

### 3. Run the schema script

In your Supabase project, open the **SQL Editor** and run the contents of [`supabase/schema.sql`](supabase/schema.sql). That one file sets up everything:

- `myapp_profile`, the table used by the profile page
- the 31 Civic Radar tables from the system requirements
- Row Level Security on every Civic Radar table
- the public `avatars` storage bucket

Re-running the file drops and recreates the Civic Radar tables, so any data in them is lost. `myapp_profile`, `auth.users`, and stored files are left alone.

[`database/schema.sql`](database/schema.sql) is the same schema as a portable PostgreSQL script (`psql -d <database> -f database/schema.sql`) and is the source of truth; `supabase/schema.sql` is that script plus the Supabase-specific pieces, which are listed in its header.

### 4. A note on Row Level Security

The Civic Radar tables have RLS enabled with no policies yet, so the anon key cannot read or write them. The API routes use `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS, so they work as-is. If a query against one of those tables comes back empty while only `SUPABASE_ANON_KEY` is set, that is RLS, not a bug — add a policy for the table as you build the feature.

## Quick start

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # run all tests
```
