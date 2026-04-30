// Dual-mode backend:
//
//   1. Supabase (real) — when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
//      are set. HR requests persist in the `onboarding_requests` table,
//      candidate magic links are real Supabase Auth magic-link emails,
//      and candidate submissions insert into the `identity_records`
//      table (the Source of Truth). See SUPABASE_SETUP.md.
//
//   2. localStorage mock (fallback) — original prototype behaviour
//      when Supabase keys aren't configured. Lets the app run offline
//      and demo without any backend.
//
// All exports are async. Pages using them must `await` (they already
// use useEffect for data loading).

import { supabase, hasSupabase } from './supabase';

// ─────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────

const KEY_REQUESTS = 'onboarding.requests.v1';
const KEY_NOTIFS   = 'onboarding.notifications.v1';

const now = () => new Date().toISOString();

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// Random-ish invitation code: OB-YYYY-XXXX
function generateInviteCode() {
  const year = new Date().getFullYear();
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `OB-${year}-${s}`;
}

function generateReference() {
  return `OB-${new Date().getFullYear()}-${
    Math.floor(Math.random() * 90000) + 10000
  }`;
}

// ─────────────────────────────────────────────────────────────
// Magic-link tokens (mock-mode only)
// ─────────────────────────────────────────────────────────────
// Base64-url encodes a signed-ish payload. This is a mock — a real
// backend would HMAC this. In Supabase mode, the real magic-link is
// issued by Supabase Auth and this token is not used for verification;
// we still store it as a fake preview value so the HR "Preview Link"
// button remains functional.

function b64urlEncode(obj) {
  const json = JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(token) {
  try {
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function buildMagicLinkToken(requestId, email, expiresAt) {
  return b64urlEncode({ rid: requestId, email, exp: expiresAt, iat: Date.now() });
}

export function parseMagicLinkToken(token) {
  const payload = b64urlDecode(token);
  if (!payload || !payload.rid) return { ok: false, reason: 'invalid' };
  if (Date.now() > payload.exp) return { ok: false, reason: 'expired', payload };
  return { ok: true, payload };
}

// ─────────────────────────────────────────────────────────────
// Supabase row ⇄ app object mapping
// ─────────────────────────────────────────────────────────────

function fromSupabase(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    linkSentAt: row.link_sent_at,
    expiresAt: row.expires_at,
    inviteCode: row.invite_code,
    // Magic token is only meaningful in mock mode — in Supabase mode
    // the real auth token is in the email. We leave a preview token
    // so the "Preview Link" button in the dashboard still works (it
    // just dumps the candidate straight to the auth landing page).
    magicToken: row.magic_token || buildMagicLinkToken(
      row.id,
      row.email,
      row.expires_at ? new Date(row.expires_at).getTime() : Date.now() + 72 * 3600 * 1000,
    ),
    givenName: row.given_name,
    familyName: row.family_name,
    email: row.email,
    position: row.position,
    positionNumber: row.position_number,
    level: row.level,
    division: row.division,
    branch: row.branch,
    groupName: row.group_name,
    commencement: row.commencement,
    managerName: row.manager_name,
    managerEmail: row.manager_email,
    managerPosition: row.manager_position,
    location: row.location,
    reissueHistory: row.reissue_history || [],
    submission: row.submitted_at
      ? { submittedAt: row.submitted_at, reference: row.reference }
      : null,
  };
}

function toSupabase(input) {
  return {
    given_name: input.givenName,
    family_name: input.familyName,
    email: input.email,
    position: input.position,
    position_number: input.positionNumber,
    level: input.level,
    division: input.division,
    branch: input.branch,
    group_name: input.groupName,
    commencement: input.commencement || null,
    manager_name: input.managerName,
    manager_email: input.managerEmail,
    manager_position: input.managerPosition,
    location: input.location,
  };
}

// ─────────────────────────────────────────────────────────────
// Requests — public API
// ─────────────────────────────────────────────────────────────

export async function listRequests() {
  if (hasSupabase) {
    const { data, error } = await supabase
      .from('onboarding_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[store] listRequests failed:', error);
      return [];
    }
    return (data || []).map(fromSupabase);
  }
  return read(KEY_REQUESTS, []);
}

export async function getRequest(id) {
  if (!id) return null;
  if (hasSupabase) {
    const { data, error } = await supabase
      .from('onboarding_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      console.error('[store] getRequest failed:', error);
      return null;
    }
    return fromSupabase(data);
  }
  return read(KEY_REQUESTS, []).find((r) => r.id === id) || null;
}

// Look up a request by candidate email — used when the candidate clicks
// the magic link and we don't know the request_id in the URL (Supabase
// mode preserves query params, so we usually do, but this is a safety net).
export async function getRequestByEmail(email) {
  if (!email) return null;
  if (hasSupabase) {
    const { data, error } = await supabase
      .from('onboarding_requests')
      .select('*')
      .ilike('email', email)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) return null;
    return fromSupabase(data[0]);
  }
  return (
    read(KEY_REQUESTS, []).find(
      (r) => r.email?.toLowerCase() === email.toLowerCase(),
    ) || null
  );
}

// ─────────────────────────────────────────────────────────────
// Identity records — completed candidate submissions.
// ─────────────────────────────────────────────────────────────

function fromIdentityRecord(row) {
  if (!row) return null;
  // Per Jerry's spec, `id` and `request_id` are not displayed in any HR
  // table. We do keep them on the returned object so action handlers
  // (reissue, set termination date) can resolve back to the underlying
  // record/request — the UI just doesn't render them as columns.
  return {
    id: row.id,
    requestId: row.request_id || null,
    reference: row.reference,
    submittedAt: row.submitted_at,
    givenName: row.given_name,
    familyName: row.family_name,
    preferredName: row.preferred_name,
    dob: row.dob,
    position: row.position,
    positionNumber: row.position_number,
    level: row.level,
    division: row.division,
    branch: row.branch,
    groupName: row.group_name,
    commencement: row.commencement,
    managerName: row.manager_name,
    location: row.location,
    identityState: row.identity_state,
    email: row.email,
    mobile: row.mobile,
    emergencyName: row.emergency_name,
    emergencyPhone: row.emergency_phone,
    relationship: row.relationship,
    securityClearance: row.security_clearance,
    onboardingStatus: row.onboarding_status,
    terminationDate: row.termination_date,
  };
}

/**
 * Update the termination_date on an identity_records row.
 * The UI is responsible for validating that `date` is a future date —
 * we still re-validate here so the rule isn't trusted only client-side.
 *
 * @param {string} id   identity_records.id (uuid)
 * @param {string|null} date  ISO date string (YYYY-MM-DD), or null to clear
 */
export async function setTerminationDate(id, date) {
  if (!id) throw new Error('Identity record id is required');

  if (date != null) {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error('Termination date is invalid.');
    }
    // Compare at day-level. We treat "today" as not-future so HR can't
    // accidentally terminate someone effective immediately by clicking
    // through the picker.
    const startOfTomorrow = new Date();
    startOfTomorrow.setHours(0, 0, 0, 0);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    if (parsed < startOfTomorrow) {
      throw new Error('Termination date must be in the future.');
    }
  }

  if (hasSupabase) {
    const { data, error } = await supabase
      .from('identity_records')
      .update({ termination_date: date })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('[store] setTerminationDate failed:', error);
      throw new Error(`Could not save termination date: ${error.message}`);
    }
    return fromIdentityRecord(data);
  }

  // Mock-mode: identity records are derived from requests in localStorage,
  // so persist the termination_date on the matching request.submission.
  const all = read(KEY_REQUESTS, []);
  const idx = all.findIndex((r) => r.submission && r.id === id);
  if (idx < 0) {
    // The mock identities use the request_id as their id (because we
    // synthesise them in listIdentityRecords above), so try that too.
    const altIdx = all.findIndex((r) => r.id === id);
    if (altIdx < 0) throw new Error('Identity record not found.');
    all[altIdx] = {
      ...all[altIdx],
      submission: { ...(all[altIdx].submission || {}), terminationDate: date },
    };
    write(KEY_REQUESTS, all);
    return null;
  }
  all[idx] = {
    ...all[idx],
    submission: { ...all[idx].submission, terminationDate: date },
  };
  write(KEY_REQUESTS, all);
  return null;
}

/**
 * List all identity records (completed onboarding submissions).
 * In mock mode, derive them from the in-memory requests with submissions.
 */
export async function listIdentityRecords() {
  if (hasSupabase) {
    const { data, error } = await supabase
      .from('identity_records')
      .select('*')
      .order('submitted_at', { ascending: false });
    if (error) {
      console.error('[store] listIdentityRecords failed:', error);
      return [];
    }
    return (data || []).map(fromIdentityRecord);
  }

  // Mock-mode: derive from completed requests' submission blob.
  const all = read(KEY_REQUESTS, []);
  return all
    .filter((r) => r.submission)
    .map((r) => ({
      // In mock mode the identity record doesn't have its own uuid, so
      // we surface the request id as both `id` and `requestId`. The
      // Termination page only needs *something* unique to update.
      id: r.id,
      requestId: r.id,
      reference: r.submission.reference,
      submittedAt: r.submission.submittedAt,
      givenName: r.submission.givenName || r.givenName,
      familyName: r.submission.familyName || r.familyName,
      preferredName: r.submission.preferredName || null,
      dob: r.submission.dob || null,
      position: r.submission.position || r.position,
      positionNumber: r.submission.positionNumber || r.positionNumber || null,
      level: r.submission.level || r.level,
      division: r.submission.division || r.division,
      branch: r.submission.branch || r.branch || null,
      groupName: r.submission.groupName || r.groupName || null,
      commencement: r.submission.commencement || r.commencement,
      managerName: r.submission.managerName || r.managerName,
      location: r.submission.location || r.location,
      identityState: null,
      email: r.email,
      mobile: r.submission.mobile || null,
      emergencyName: r.submission.emergencyName || null,
      emergencyPhone: r.submission.emergencyPhone || null,
      relationship: r.submission.relationship || null,
      securityClearance: r.submission.securityClearance || null,
      onboardingStatus: 'committed',
      terminationDate: r.submission.terminationDate || null,
    }));
}

/**
 * Create a new onboarding request. In Supabase mode this also triggers
 * a real magic-link email to the candidate via Supabase Auth.
 *
 * @returns {Promise<{request: object, magicLinkEmailSent: boolean, emailError: string|null}>}
 */
export async function createRequest(input, { validityHours = 72 } = {}) {
  const expiresAtMs = Date.now() + validityHours * 60 * 60 * 1000;
  const inviteCode = generateInviteCode();

  if (hasSupabase) {
    const row = {
      ...toSupabase(input),
      status: 'link_sent',
      link_sent_at: now(),
      expires_at: new Date(expiresAtMs).toISOString(),
      invite_code: inviteCode,
      reissue_history: [],
    };
    const { data, error } = await supabase
      .from('onboarding_requests')
      .insert(row)
      .select()
      .single();
    if (error) {
      console.error('[store] createRequest insert failed:', error);
      throw new Error(`Could not save request: ${error.message}`);
    }
    const request = fromSupabase(data);

    // Send the real magic-link email via Supabase Auth.
    const emailResult = await sendMagicLink(request);
    return {
      request,
      magicLinkEmailSent: emailResult.ok,
      emailError: emailResult.error,
    };
  }

  // --- localStorage fallback ---
  const id = uuid();
  const request = {
    id,
    status: 'link_sent',
    createdAt: now(),
    linkSentAt: now(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    inviteCode,
    magicToken: buildMagicLinkToken(id, input.email, expiresAtMs),
    submission: null,
    reissueHistory: [],
    ...input,
  };
  const all = read(KEY_REQUESTS, []);
  all.unshift(request);
  write(KEY_REQUESTS, all);
  addNotification({
    kind: 'link_sent',
    title: `Link sent — ${input.givenName} ${input.familyName}`,
    body: 'Onboarding email delivered to candidate (prototype — no real email).',
    requestId: id,
  });
  return { request, magicLinkEmailSent: false, emailError: null };
}

/**
 * Send (or re-send) a magic-link email for a request.
 *
 * Delivery is handled by the `send-magic-link` Edge Function, which:
 *   1. Calls supabase.auth.admin.generateLink({ type: 'magiclink' }) to
 *      MINT a Supabase Auth magic link without sending an email.
 *   2. Sends that link via Resend (no daily cap like Supabase's built-in SMTP).
 *
 * The candidate-side flow is unchanged: they click the link, Supabase
 * verifies the token, then redirects them to /candidate/auth where the
 * client picks up the session and forwards them to the onboarding form.
 */
async function sendMagicLink(request) {
  if (!hasSupabase) return { ok: false, error: 'Supabase not configured' };
  const redirectTo = `${window.location.origin}/candidate/auth?request_id=${request.id}`;
  const { data, error } = await supabase.functions.invoke('send-magic-link', {
    body: {
      email: request.email,
      redirectTo,
      requestId: request.id,
      givenName: request.givenName,
      familyName: request.familyName,
    },
  });
  if (error) {
    console.error('[store] send-magic-link invoke failed:', error);
    return { ok: false, error: error.message };
  }
  if (data && data.error) {
    console.error('[store] send-magic-link returned error:', data);
    return { ok: false, error: data.error };
  }
  return { ok: true, error: null };
}

/**
 * Invoke the `send-confirmation-email` Supabase Edge Function. The function
 * uses Resend to deliver a "Onboarding submitted — your reference ID" email
 * to the candidate. RESEND_API_KEY is held server-side as a function secret;
 * the client never sees it.
 */
async function sendConfirmationEmail({ email, reference, givenName, familyName }) {
  if (!hasSupabase) return { ok: false, error: 'Supabase not configured' };
  const { data, error } = await supabase.functions.invoke('send-confirmation-email', {
    body: { email, reference, givenName, familyName },
  });
  if (error) {
    console.error('[store] send-confirmation-email invoke failed:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true, data };
}

export async function updateRequest(id, patch) {
  if (hasSupabase) {
    const row = {};
    // Map camelCase → snake_case for the few fields we update.
    if ('status' in patch) row.status = patch.status;
    if ('email' in patch) row.email = patch.email;
    if ('inviteCode' in patch) row.invite_code = patch.inviteCode;
    if ('magicToken' in patch) row.magic_token = patch.magicToken;
    if ('linkSentAt' in patch) row.link_sent_at = patch.linkSentAt;
    if ('expiresAt' in patch) row.expires_at = patch.expiresAt;
    if ('reissueHistory' in patch) row.reissue_history = patch.reissueHistory;
    if ('submittedAt' in patch) row.submitted_at = patch.submittedAt;
    if ('reference' in patch) row.reference = patch.reference;
    const { data, error } = await supabase
      .from('onboarding_requests')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('[store] updateRequest failed:', error);
      return null;
    }
    return fromSupabase(data);
  }

  const all = read(KEY_REQUESTS, []);
  const idx = all.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch };
  write(KEY_REQUESTS, all);
  return all[idx];
}

export async function reissueRequest(
  id,
  { validityHours = 72, reason, note, updatedEmail } = {},
) {
  const existing = await getRequest(id);
  if (!existing) return null;

  const expiresAtMs = Date.now() + validityHours * 60 * 60 * 1000;
  const email = updatedEmail || existing.email;
  const inviteCode = generateInviteCode();
  const entry = {
    issued: now(),
    expiry: new Date(expiresAtMs).toISOString(),
    reason: reason || 'Link expired',
    note: note || '',
    previousExpiry: existing.expiresAt,
  };

  const updated = await updateRequest(id, {
    email,
    inviteCode,
    expiresAt: entry.expiry,
    linkSentAt: entry.issued,
    status: 'link_sent',
    reissueHistory: [...(existing.reissueHistory || []), entry],
    magicToken: buildMagicLinkToken(id, email, expiresAtMs),
  });

  if (hasSupabase && updated) {
    const emailResult = await sendMagicLink(updated);
    if (!emailResult.ok) {
      console.warn('[store] reissue email failed:', emailResult.error);
    }
  } else {
    addNotification({
      kind: 'link_sent',
      title: `Link reissued — ${existing.givenName} ${existing.familyName}`,
      body: `New magic link issued (${validityHours}h validity).`,
      requestId: id,
    });
  }
  return updated;
}

/**
 * Candidate submits the onboarding form. In Supabase mode this:
 *   1. Inserts a full row into `identity_records` (Source of Truth)
 *   2. Marks the matching `onboarding_requests` row as completed
 *
 * In mock mode it stores the submission blob on the request in-place.
 */
export async function submitCandidateForm(id, formData) {
  const reference = generateReference();
  const submittedAt = now();

  if (hasSupabase) {
    const req = await getRequest(id);
    if (!req) return null;
    // 1) Write to Source of Truth.
    //    - `onboarding_status: 'committed'` — per Jerry's spec, the candidate
    //      successfully completing the form transitions them straight to
    //      'committed' (no separate HR review step). The column still
    //      defaults to 'uncommitted' at the DB level for safety in case a
    //      row is ever inserted by another path.
    //    - We deliberately DO NOT collect or store: bank account details,
    //      or tax file number (TFN). The TFN column has been dropped.
    //    - Position number / Branch / Group come from the originating
    //      onboarding_request (HR-supplied), copied through here as the
    //      identity_record is the source of truth post-submission.
    const row = {
      request_id: id,
      reference,
      submitted_at: submittedAt,
      onboarding_status: 'committed',
      given_name: formData.givenName,
      family_name: formData.familyName,
      preferred_name: formData.preferredName || null,
      dob: formData.dob || null,
      email: req.email,
      position: formData.position,
      position_number: formData.positionNumber || req.positionNumber || null,
      level: formData.level,
      division: formData.division,
      branch: formData.branch || req.branch || null,
      group_name: formData.groupName || req.groupName || null,
      commencement: formData.commencement || null,
      manager_name: formData.managerName,
      location: formData.location,
      mobile: formData.mobile,
      emergency_name: formData.emergencyName,
      emergency_phone: formData.emergencyPhone,
      relationship: formData.relationship || null,
      security_clearance: formData.securityClearance || null,
    };
    const { error: insertErr } = await supabase
      .from('identity_records')
      .insert(row);
    if (insertErr) {
      console.error('[store] identity_records insert failed:', insertErr);
      throw new Error(`Could not save identity record: ${insertErr.message}`);
    }
    // 2) Mark request completed + stamp reference.
    const updated = await updateRequest(id, {
      status: 'completed',
      submittedAt,
      reference,
    });

    // 3) Fire-and-forget confirmation email via Edge Function.
    //    We don't block the candidate's "you're done" screen on this — if
    //    the email fails (Resend down, key missing, etc.), the submission
    //    is still durable and HR can resend manually.
    sendConfirmationEmail({
      email: req.email,
      reference,
      givenName: formData.givenName || req.givenName,
      familyName: formData.familyName || req.familyName,
    }).catch((err) => {
      console.warn('[store] confirmation email failed (non-blocking):', err);
    });

    return updated;
  }

  const existing = read(KEY_REQUESTS, []).find((r) => r.id === id);
  if (!existing) return null;
  const updated = {
    ...existing,
    status: 'completed',
    submission: { ...formData, submittedAt, reference },
  };
  const all = read(KEY_REQUESTS, []).map((r) => (r.id === id ? updated : r));
  write(KEY_REQUESTS, all);
  addNotification({
    kind: 'completed',
    title: `Form completed — ${existing.givenName} ${existing.familyName}`,
    body: 'Onboarding form submitted. Identity record written to IAM DB.',
    requestId: id,
  });
  return updated;
}

/** Mark requests whose expires_at is in the past as 'expired'. */
export async function refreshStatuses() {
  const all = await listRequests();
  const nowMs = Date.now();
  const stale = all.filter(
    (r) =>
      r.status === 'link_sent' &&
      r.expiresAt &&
      nowMs > new Date(r.expiresAt).getTime(),
  );
  for (const r of stale) {
    await updateRequest(r.id, { status: 'expired' });
    addNotification({
      kind: 'expired',
      title: `Link expired — ${r.givenName} ${r.familyName}`,
      body: 'Magic link expired without completion. Action required.',
      requestId: r.id,
    });
  }
  return listRequests();
}

// ─────────────────────────────────────────────────────────────
// Notifications — ephemeral, localStorage only
// (HR UI notifications don't need to sync across devices.)
// ─────────────────────────────────────────────────────────────

export function listNotifications() {
  return read(KEY_NOTIFS, []);
}

export function addNotification(n) {
  const all = listNotifications();
  all.unshift({
    id: uuid(),
    createdAt: now(),
    read: false,
    ...n,
  });
  write(KEY_NOTIFS, all.slice(0, 40));
}

export function markAllNotificationsRead() {
  const all = listNotifications().map((n) => ({ ...n, read: true }));
  write(KEY_NOTIFS, all);
}

// ─────────────────────────────────────────────────────────────
// Seed — mock-mode only.
// ─────────────────────────────────────────────────────────────

export async function seedIfEmpty() {
  if (hasSupabase) return; // never seed real DB with demo rows
  if (read(KEY_REQUESTS, []).length > 0) return;

  const sample = [
    {
      givenName: 'Priya',    familyName: 'Sharma',
      email: 'p.sharma@agency.gov.au', position: 'Data Analyst', level: 'APS 5',
      division: 'Data & Analytics', commencement: '2026-04-02',
      managerName: 'Ashwin Raj', managerEmail: 'a.raj@agency.gov.au',
      managerPosition: 'Director, Data Analytics', location: 'Sydney NSW',
      status: 'completed',
    },
    {
      givenName: 'James',    familyName: 'Nguyen',
      email: 'james.nguyen@agency.gov.au', position: 'Senior Policy Adviser', level: 'APS 6',
      division: 'Digital Transformation', commencement: '2026-04-14',
      managerName: 'Dr. Michelle Park', managerEmail: 'm.park@agency.gov.au',
      managerPosition: 'Director, Digital Policy', location: 'Canberra ACT',
      status: 'link_sent',
    },
    {
      givenName: 'Aisha',    familyName: 'Okonkwo',
      email: 'a.okonkwo@agency.gov.au', position: 'Communications Officer', level: 'APS 4',
      division: 'Communications', commencement: '2026-04-21',
      managerName: 'Rebecca Liu', managerEmail: 'r.liu@agency.gov.au',
      managerPosition: 'Director, Public Affairs', location: 'Melbourne VIC',
      status: 'link_sent',
    },
    {
      givenName: 'Michael',  familyName: 'Torres',
      email: 'm.torres@agency.gov.au', position: 'ICT Security Analyst', level: 'APS 6',
      division: 'Cyber Security Operations', commencement: '2026-04-07',
      managerName: 'Brendan Walsh', managerEmail: 'b.walsh@agency.gov.au',
      managerPosition: 'Director, Cyber Operations', location: 'Canberra ACT',
      status: 'expired',
      __backdate: 1000 * 60 * 60 * 24 * 7,
    },
  ];

  for (const s of sample) {
    const { request } = await createRequest(s, { validityHours: 72 });
    if (s.__backdate) {
      const ts = Date.now() - s.__backdate;
      await updateRequest(request.id, {
        createdAt: new Date(ts).toISOString(),
        linkSentAt: new Date(ts).toISOString(),
        expiresAt: new Date(ts + 72 * 3600 * 1000).toISOString(),
        status: 'expired',
      });
    } else if (s.status) {
      await updateRequest(request.id, { status: s.status });
    }
    if (s.status === 'completed') {
      await updateRequest(request.id, {
        submittedAt: now(),
        reference: generateReference(),
      });
    }
  }
}
