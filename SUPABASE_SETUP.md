# Supabase Setup — Step-by-step

This guide walks you through setting up Supabase so the app can send real magic-link emails to candidates and store submissions in a real database. **Everything happens in Supabase's web dashboard — no coding required from you.**

You will end up with:

- Four database tables:
  - `onboarding_requests` — HR-created records
  - `form_submissions` — the candidate's paged onboarding form (Personal, Security Clearance, Building Pass, Conflict of Interest). Stores drafts and the pre-approval state.
  - `approvals` — audit log of manager actions (approved, rejected, changes_requested, edited)
  - `identity_records` — the Source of Truth, written only after the manager approves the submission.
- Magic-link email authentication configured to send candidates a real email from Supabase.
- Two secret values (Project URL + anon key) that you paste into the app so it can talk to Supabase.

### Flow (post-approval-feature)

1. HR creates a request → `onboarding_requests` row (`status='link_sent'`).
2. Candidate clicks the magic link → walks through the stepper. Each Save & Continue upserts to `form_submissions` (`status='draft'`).
3. Candidate hits Submit → `form_submissions.status='submitted'`, `onboarding_requests.status='pending_approval'`. **No identity record yet.**
4. Manager opens `/manager/dashboard`, reviews, optionally edits any field, then clicks Approve.
5. On approve → row inserted into `identity_records`, `form_submissions.status='approved'`, `onboarding_requests.status='completed'`, audit row in `approvals`.

Manager may also: send the form back to the candidate (`requestChanges`) or reject outright (`rejectSubmission`).

Estimated time: **10–15 minutes.**

> **Already on an older version?** The new tables (`form_submissions`, `approvals`) and status values (`pending_approval`, `rejected`) were added in migration `add_form_submissions_and_approvals`. If you're upgrading, see the **Upgrade migration** section at the end of this file.

---

## Step 1 — Create a free Supabase account & project

1. Go to <https://supabase.com/> in your browser.
2. Click **Start your project** → **Sign in with GitHub** (or sign up with email).
3. Once signed in you'll see the Supabase dashboard. Click **New project**.
4. Fill in:
   - **Name:** `onboarding-portal` (or anything you like)
   - **Database Password:** click **Generate a password** and **save it somewhere safe** (you won't need it for the app, but Supabase asks you to record it).
   - **Region:** pick the one closest to your demo audience (e.g. `Sydney` for Australia).
   - **Pricing Plan:** Free.
5. Click **Create new project**.

Supabase will take **1–2 minutes** to provision the project. Wait until the dashboard loads fully.

---

## Step 2 — Create the two tables

In the left sidebar of the Supabase dashboard, click **SQL Editor** (the `</>` icon). Click **+ New query** at the top. Paste the entire block below into the editor and click **Run** (bottom right, or press `Ctrl+Enter` / `Cmd+Enter`).

```sql
-- ============================================================
-- onboarding_requests — HR-created records ("the request table")
-- ============================================================
create table if not exists public.onboarding_requests (
  id                uuid primary key default gen_random_uuid(),
  status            text not null default 'link_sent',
  created_at        timestamptz not null default now(),
  link_sent_at     timestamptz,
  expires_at        timestamptz,
  invite_code       text,

  -- Candidate details (HR-provided)
  given_name        text,
  family_name       text,
  email             text not null,
  position          text,
  level             text,
  division          text,
  commencement      date,

  -- Manager details (HR-provided)
  manager_name      text,
  manager_email     text,
  manager_position  text,
  location          text,

  -- Reissue history (array of past issuances)
  reissue_history   jsonb not null default '[]'::jsonb,

  -- Populated on submission
  submitted_at      timestamptz,
  reference         text
);

-- ============================================================
-- identity_records — Source of Truth (candidate-submitted)
-- ============================================================
create table if not exists public.identity_records (
  id                uuid primary key default gen_random_uuid(),
  request_id        uuid references public.onboarding_requests(id) on delete set null,
  reference         text not null,
  submitted_at      timestamptz not null default now(),

  -- Personal
  given_name        text,
  family_name       text,
  preferred_name    text,
  dob               date,

  -- Employment (mirrored from the request at time of submission)
  position          text,
  level             text,
  division          text,
  commencement      date,
  manager_name      text,
  location          text,
  email             text,

  -- Candidate-supplied
  mobile            text,
  emergency_name    text,
  emergency_phone   text,
  relationship      text,
  tfn               text,   -- In production, encrypt at rest. Prototype only.

  -- Lifecycle state of the candidate's submission. Defaults to
  -- 'uncommitted' on first submit; HR may transition to other states
  -- (e.g., 'committed') after review.
  onboarding_status text not null default 'uncommitted'
);

-- ============================================================
-- Permissive access for the prototype
-- NOTE: These policies allow anyone with the anon key to read/write.
-- Fine for a demo; NOT suitable for production. For production, tighten
-- with authenticated-only policies.
-- ============================================================
alter table public.onboarding_requests enable row level security;
alter table public.identity_records    enable row level security;

drop policy if exists "anon all" on public.onboarding_requests;
drop policy if exists "anon all" on public.identity_records;

create policy "anon all" on public.onboarding_requests
  for all to anon, authenticated using (true) with check (true);

create policy "anon all" on public.identity_records
  for all to anon, authenticated using (true) with check (true);
```

**You should see:** `Success. No rows returned` at the bottom. If you see a red error, scroll up, read the message, and paste it to me — most errors here are trivial (e.g. re-running the same script is fine).

**Verify:** In the left sidebar click **Table Editor**. You should see `onboarding_requests` and `identity_records` listed. They'll be empty for now.

---

## Step 3 — Configure magic-link authentication

This is the step that makes Supabase send real emails to candidates.

1. In the left sidebar click **Authentication** (the person icon) → **Providers**.
2. Make sure **Email** is **Enabled** (it usually is by default).
3. Click into **Email** to open its settings. Confirm:
   - **Enable Email provider:** On.
   - **Enable Email Signups:** On.
   - **Confirm email:** Doesn't matter for magic-link-only flow, leave default.
4. Click **Save** if you changed anything.

### 3a — Add your Vercel URL as an allowed redirect

Supabase will only redirect back to URLs you've whitelisted. This is a security feature.

1. In the left sidebar click **Authentication** → **URL Configuration**.
2. **Site URL:** paste your Vercel URL, e.g. `https://onboarding-app-xxx.vercel.app` (use your actual Vercel URL — no trailing slash).
3. **Redirect URLs** (click **Add URL** for each):
   - `https://YOUR-VERCEL-URL.vercel.app/candidate/auth`
   - `https://YOUR-VERCEL-URL.vercel.app/**` (wildcard, lets the candidate land anywhere safely)
   - `http://localhost:5173/candidate/auth` (so you can also test locally)
   - `http://localhost:5173/**`
4. Click **Save**.

### 3b — Customize the magic link email (optional but nice for the demo)

1. Left sidebar → **Authentication** → **Email Templates** → **Magic Link**.
2. Edit the subject and body to sound like an onboarding email, e.g.:

   **Subject:**
   ```
   Your Department of Superheroes Onboarding Invitation
   ```

   **Body (HTML):**
   ```html
   <h2>Welcome to the Department of Superheroes</h2>
   <p>You have been invited to complete your identity onboarding.</p>
   <p><a href="{{ .ConfirmationURL }}">Click here to begin onboarding</a></p>
   <p>This link will expire in 1 hour and can only be used once.</p>
   <p>If you did not expect this email, please ignore it.</p>
   ```

3. Click **Save**.

> Note: Supabase's built-in magic links expire after **1 hour** by default (not 72 hours). For a true 72-hour link you'd need a custom email + your own token. For a demo, 1 hour is fine.

---

## Step 4 — Copy your Project URL and anon key

The app needs two values to talk to Supabase.

1. Left sidebar → **Project Settings** (the gear icon at the bottom) → **API**.
2. You'll see two things to copy:
   - **Project URL** — looks like `https://abcdefghijklm.supabase.co`
   - **anon public** key — a long string starting with `eyJ...`

Keep this tab open — you'll paste these into Vercel in the next step.

> The `service_role` key on that page is for server-side code only. **Never** paste it into a browser app or commit it to git.

---

## Step 5 — Add the keys to Vercel

1. Go to your project on Vercel (<https://vercel.com/dashboard>).
2. Click your `onboarding-app` project → **Settings** → **Environment Variables**.
3. Add the first variable:
   - **Name:** `VITE_SUPABASE_URL`
   - **Value:** your Project URL from Step 4 (the `https://…supabase.co` one)
   - **Environments:** check all three (Production, Preview, Development)
   - Click **Save**.
4. Add the second variable:
   - **Name:** `VITE_SUPABASE_ANON_KEY`
   - **Value:** your anon public key from Step 4 (the long `eyJ…` string)
   - **Environments:** check all three
   - Click **Save**.
5. **Important:** environment variables only take effect on the next deploy. Go to **Deployments** → click the three-dot menu on the latest deployment → **Redeploy**. Wait for it to finish.

---

## Step 6 — (Optional) also run locally

If you want to also run the app on your laptop:

1. In the `onboarding-app` folder, create a new file called **`.env.local`** (note the leading dot).
2. Paste:
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
3. Stop and restart `npm run dev` (Vite only reads env vars at startup).

---

## How to know it's working

After redeploying on Vercel:

1. Open your Vercel URL in a browser.
2. Click **+ New Request**, fill in the form, use **your own real email address** as the candidate email, and click **Generate & Send Magic Link**.
3. Within ~30 seconds you should receive a real email from `no-reply@mail.supabase.io` with a **Click here to begin onboarding** link.
4. Click it. You should land on the candidate auth page → form (pre-filled) → submit.
5. Back in Supabase → **Table Editor** → `identity_records`, you'll see the new row with everything the candidate submitted.

If the magic-link email doesn't arrive, check spam. If the app still behaves like the old localStorage version, double-check that Vercel has both env vars and that you redeployed.

---

## Troubleshooting

- **Email didn't arrive:** check spam; check Supabase dashboard → **Authentication** → **Logs** (top of the Auth section) for email send errors. The free tier has a small rate limit (~4 emails/hour).
- **Magic link says "invalid or expired":** Supabase magic links expire after 1 hour. Click **Reissue** in the HR dashboard to send a new one.
- **Error on "Generate & Send Magic Link":** open the browser console (right-click → Inspect → Console). Look for red errors. The most common cause is a typo in `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY`.
- **Redirect goes to the wrong URL:** re-check Step 3a — your Vercel URL needs to be in Redirect URLs.

---

## Upgrade migration — adding `form_submissions` + `approvals`

If your Supabase project predates the paged-form + manager-approval feature, run this once in **SQL Editor** to add the new tables. It is idempotent (safe to re-run):

```sql
create table if not exists public.form_submissions (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null unique
                    references public.onboarding_requests(id) on delete cascade,
  status          text not null default 'draft'
                    check (status in ('draft','submitted','changes_requested','approved','rejected')),
  current_section text default 'personal',
  personal             jsonb not null default '{}'::jsonb,
  security_clearance   jsonb not null default '{}'::jsonb,
  building_pass        jsonb not null default '{}'::jsonb,
  conflict_of_interest jsonb not null default '{}'::jsonb,
  submitted_at    timestamptz,
  approved_at     timestamptz,
  rejected_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists form_submissions_status_idx on public.form_submissions(status);
create index if not exists form_submissions_request_idx on public.form_submissions(request_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_form_submissions_updated_at on public.form_submissions;
create trigger trg_form_submissions_updated_at
  before update on public.form_submissions
  for each row execute function public.set_updated_at();

create table if not exists public.approvals (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null references public.form_submissions(id) on delete cascade,
  request_id      uuid not null references public.onboarding_requests(id) on delete cascade,
  manager_email   text not null,
  manager_name    text,
  action          text not null
                    check (action in ('approved','rejected','changes_requested','edited')),
  comments        text,
  field_changes   jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists approvals_submission_idx on public.approvals(submission_id);
create index if not exists approvals_manager_idx on public.approvals(manager_email);

alter table public.form_submissions enable row level security;
alter table public.approvals        enable row level security;

drop policy if exists "anon all" on public.form_submissions;
create policy "anon all" on public.form_submissions for all using (true) with check (true);

drop policy if exists "anon all" on public.approvals;
create policy "anon all" on public.approvals for all using (true) with check (true);
```

After running, refresh the app — the Manager portal at `/manager/dashboard` will start showing pending approvals once a candidate submits a form.
