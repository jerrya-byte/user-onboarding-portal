# Access control with EntraID security groups

The portal supports three roles, mapped to three EntraID security groups:

| Role | Group name (suggested) | What they can do |
|---|---|---|
| **HR Admins** | `IDP-Onboarding-HRAdmins` | Full control — create requests, see all candidates and identities, terminate, plus everything Managers and End Users can do. |
| **Managers** | `IDP-Onboarding-Managers` | Approve / edit / reject candidate submissions assigned to them, and update their own self-service details. |
| **End Users** | `IDP-Onboarding-EndUsers` | Self-service only — update their own family name, mobile, and emergency contact details. |

Higher-privilege roles **inherit** lower-privilege capabilities, so a person who only needs to be in one group is fine. (HR Admins can also use the Manager and Me pages; Managers can also use the Me page.)

If none of the three group env vars are set in Vercel, the app falls back to its **pre-RBAC behaviour** — any signed-in Microsoft user has full access. This means you can deploy the code changes first and add RBAC by setting env vars later, without breaking anything.

Total time: **~15 minutes** the first time, plus ~2 minutes per user thereafter.

---

## Step 1 — Create the three security groups

1. Go to **<https://entra.microsoft.com>** and sign in with a tenant admin account.
2. In the left sidebar click **Groups** → **All groups**.
3. Click **+ New group** at the top.
4. Fill in:
   - **Group type:** `Security`
   - **Group name:** `IDP-Onboarding-HRAdmins`
   - **Group description:** `Full access to the Identity Onboarding Portal — HR administrators.`
   - **Membership type:** `Assigned`
5. Under **Members**, click **No members selected** → add the HR staff who should have full access → click **Select** → **Create**.
6. **Repeat steps 3–5 twice more** to create:
   - `IDP-Onboarding-Managers` — add the reporting managers who will approve submissions.
   - `IDP-Onboarding-EndUsers` — add all employees who should be able to self-service their own details.

> **Tip — overlapping membership.** A reporting manager who also has self-service needs only has to be in the `Managers` group; the app grants End User capabilities to anyone with a higher role. Same for HR Admins.

---

## Step 2 — Copy each group's Object ID

The app identifies groups by their Object ID (a GUID like `12345678-aaaa-bbbb-cccc-1234567890ab`), not their name. You need to copy this once per group.

1. **Groups** → **All groups** → click into `IDP-Onboarding-HRAdmins`.
2. On the **Overview** page, find the **Object ID** field at the top.
3. Click the **copy** icon next to it. Paste it somewhere safe (Notepad is fine) and label it "HR Admins".
4. Click back, then repeat for `IDP-Onboarding-Managers` ("Managers") and `IDP-Onboarding-EndUsers` ("End Users").

You should end up with three labelled GUIDs.

---

## Step 3 — Tell the App Registration to emit groups in the ID token

The app reads the groups claim from the ID token. By default Entra doesn't include groups — we have to turn it on.

1. **Microsoft Entra admin center** → **Applications** → **App registrations**.
2. Click the **All applications** tab and find the registration used for the Identity Proofing Solution. (App ID `131f0637-b48c-475b-894f-588e501aa42e`.) Click into it.
3. In the left sidebar click **Token configuration**.
4. Click **+ Add groups claim** (top right of the page).
5. In the side panel that appears:
   - Under **Select group types to include in Access, ID, and SAML tokens**, tick **Security groups**.
   - Under **Customize token properties by type**, expand each of **ID**, **Access**, and **SAML** and make sure **Group ID** is selected (it is by default).
   - Leave **"Emit groups as role claims"** unticked.
6. Click **Add** at the bottom.

You should now see an entry like:
> **groups** — `Security groups` — Token type: ID, Access, SAML

That's it for Entra.

> **Note about big tenants.** If a user belongs to more than ~200 groups, Entra sends an overflow link (`_claim_names`) instead of the actual groups list. The app doesn't currently follow that link, so users with very wide group membership would appear as "no access". This is rare in practice. If you hit it, switch from "Security groups" to "Groups assigned to the application" in the same dialog — that limits the claim to only the three groups we care about.

---

## Step 4 — (Recommended) Restrict who can sign in at all

So that people who aren't in any of the three groups don't even reach a "no access" screen:

1. **Microsoft Entra admin center** → **Applications** → **Enterprise applications**.
2. Find the same app (Identity Proofing Solution) and click into it.
3. Left sidebar → **Properties** → set **Assignment required?** to **Yes** → **Save**.
4. Left sidebar → **Users and groups** → **+ Add user/group** → assign each of the three groups (HRAdmins, Managers, EndUsers) → **Assign**.

Only members of those groups can now sign into the app at all. Anyone else gets a polite "You don't have access" message from Microsoft before they reach the portal.

---

## Step 5 — Add the group IDs to Vercel

1. Open your **Vercel dashboard** → click your **onboarding-portal** project → **Settings** → **Environment Variables**.
2. Add **three new variables**, each one ticked for **all three environments** (Production, Preview, Development):

| Variable name | Value |
|---|---|
| `VITE_GROUP_HR_ADMINS` | the HR Admins Object ID from Step 2 |
| `VITE_GROUP_MANAGERS` | the Managers Object ID from Step 2 |
| `VITE_GROUP_END_USERS` | the End Users Object ID from Step 2 |

3. Go to the **Deployments** tab → click the three-dot menu next to the latest deployment → **Redeploy**. (Vite bakes env vars in at build time, so a redeploy is required for them to take effect.)

---

## Step 6 — Test each role end-to-end

After Vercel finishes redeploying, open the production URL in three separate **incognito** windows (or use three different test accounts) — one per role.

**HR Admin test account:**
- Sign in → should land on `/hr/dashboard`.
- Nav shows: Home, HR · Submit Email, HR · Dashboard, HR · Identities, HR · Termination, HR · Reissue Link, Manager · Approvals, My Details.
- Should be able to open any URL.

**Manager test account:**
- Sign in → should land on `/manager/dashboard`.
- Nav shows: Home, Manager · Approvals, My Details. **No HR links.**
- Visiting any `/hr/*` URL manually should show the "You don't have access" screen.

**End User test account:**
- Sign in → should land on `/me`.
- Nav shows: Home, My Details. **No HR or Manager links.**
- Visiting `/hr/dashboard` or `/manager/dashboard` should show the "You don't have access" screen.
- On `/me` they should see their record. The "Family Name", "Mobile", and "Emergency Contact" fields are editable; everything else is read-only.

**No-group account:**
- Sign in with a user who isn't in any of the three groups → should see the "You don't have access" screen with a list of groups to ask their admin about.

---

## Adding or removing users later

- **Add a user to a role:** Microsoft Entra admin center → Groups → `IDP-Onboarding-<RoleName>` → Members → **+ Add members**. Changes take effect at the user's next sign-in (existing sessions keep their old roles until they refresh their token — usually ~1 hour).
- **Move a user to a different role:** add them to the new group, remove them from the old group.
- **Revoke access immediately:** Microsoft Entra admin center → Users → click the user → **Revoke sessions** at the top. Combined with removing them from the group, this kills any cached role within ~5 minutes.

---

## Troubleshooting

- **A user is in the right group but still sees "no access":** they may have signed in *before* you added the groups claim in Step 3. Have them sign out fully (close all browser tabs / clear cookies) and sign in again.
- **The role-based redirects don't trigger and everyone gets full access:** the env vars in Vercel aren't set, or you didn't redeploy after setting them. Check **Settings → Environment Variables**, then redo Step 5's redeploy.
- **`VITE_GROUP_*` env vars look right but Console shows the user has `groups: []`:** the App Registration's Token Configuration is missing the groups claim. Redo Step 3.
- **You want to see what the app actually sees:** sign in, then open the browser DevTools console and run `JSON.parse(localStorage.getItem('msal.account.keys'))` and look up the matching account in `localStorage` — the `idTokenClaims.groups` array shows you exactly which GUIDs Microsoft sent through.

---

## What's NOT enforced (and why)

The role check happens **in the browser**, by reading the ID token claims. A determined attacker could in theory modify their JavaScript to bypass the check — they'd see the HR pages on screen.

**They still couldn't actually do harm,** because:

- Reads/writes go through Supabase, which uses its own row-level security policies (currently permissive in the prototype, but will be tightened before production — see SUPABASE_SETUP.md).
- Critical writes (creating onboarding requests, approving submissions) require the Edge Functions, which can validate the caller's token server-side.

For a production deployment, you'd want to **also** add server-side RBAC by checking the same `groups` claim in your Edge Functions and in Supabase RLS policies. The browser-side check is convenience UX, not a security boundary.
