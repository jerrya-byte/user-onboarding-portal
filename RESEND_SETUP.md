# Set up Resend (so candidates get a confirmation email)

After a candidate submits their onboarding form, the app sends them a
"Onboarding submitted — your reference ID" email. The email is sent by a
Supabase **Edge Function** called `send-confirmation-email` that I've already
deployed. It just needs **one secret** — your Resend API key — before it can
actually send mail.

Total time: **about 5 minutes**.

---

## Step 1 — Create a free Resend account

1. Go to **https://resend.com/signup**.
2. Sign up with your email (or "Continue with Google").
3. Confirm your email if asked.

The free plan includes **3,000 emails/month** — way more than you'll need
for this prototype.

---

## Step 2 — Create an API key

1. Once logged in, click **"API Keys"** in the left sidebar (or go to
   **https://resend.com/api-keys**).
2. Click **"+ Create API Key"** (top right).
3. Fill in:
   - **Name:** `onboarding-portal-prototype` (anything you like)
   - **Permission:** **Sending access** (the default — sufficient)
   - **Domain:** **All domains** (the default)
4. Click **"Add"**.
5. A long key starting with `re_...` will appear **once** — copy it
   immediately and keep it somewhere safe (a password manager is ideal).
   You won't see it again.

---

## Step 3 — Paste the key into Supabase

1. Go to **https://supabase.com/dashboard** → your project.
2. Click **Project Settings** (gear icon, bottom-left) → **Edge Functions**.
3. Scroll to **"Edge Functions Secrets"** (or just "Secrets") section.
4. Click **"Add new secret"**.
5. Fill in:
   - **Name:** `RESEND_API_KEY` (exactly this — case sensitive)
   - **Value:** paste the `re_...` key you copied in Step 2
6. Click **"Save"**.

That's it. The function will pick up the secret on its next invocation —
no redeploy needed.

---

## Step 4 — Test it

1. Go to your live app: `https://user-onboarding-portal.vercel.app/hr/new`.
2. Create a request using **your own email**.
3. Click the magic link in your inbox → fill in the candidate form →
   click **Submit Onboarding Form**.
4. Within ~30 seconds you should receive a **second email**:
   - Subject: *Onboarding submitted — your reference ID is OB-2026-XXXXX*
   - Body: a styled confirmation showing the reference ID prominently.

---

## How emails will appear

Out of the box, the email will be sent **from `onboarding@resend.dev`**
(Resend's shared sandbox sender). This works without any domain
verification, but it'll show "via resend.dev" in some inboxes (Gmail does
this).

If you later want emails to come from your own domain
(e.g. `onboarding@yourdepartment.gov.au`):

1. In Resend, go to **Domains** → **+ Add Domain**, enter your domain.
2. Add the DNS records Resend gives you (DKIM, SPF) at your domain
   registrar. Wait ~10 minutes for verification.
3. Once verified, in Supabase add a **second secret** named
   `RESEND_FROM_EMAIL` with value like
   `Onboarding <onboarding@yourdepartment.gov.au>`.
4. The function will pick it up on the next call.

For the prototype, the `onboarding@resend.dev` default is fine.

---

## If something goes wrong

- **No email arrives** — check **Resend dashboard → Logs** to see if it
  was attempted. If it shows "delivered" but you don't see it, check
  spam. If it shows "bounced/failed", the error message tells you why.
- **Browser console shows `send-confirmation-email invoke failed`** —
  most likely `RESEND_API_KEY` isn't set in Supabase yet (or has a typo).
  Re-do Step 3.
- **Submission still completes successfully even if email fails** — that's
  by design. The email is sent in the background; if it fails, the
  candidate's submission is still saved correctly. HR can manually resend
  later if needed.

---

## Security note

The API key lives only on Supabase's servers — it's **never** sent to
the browser. The candidate's browser calls the Edge Function (which
requires their authenticated Supabase session); the function then calls
Resend with the secret key. Standard pattern, secure for production use.
