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

export async function setTerminationDate(id, date) {
  if (!id) throw new Error('Identity record id is required');

  if (date != null) {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error('Termination date is invalid.');
    }
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

  const all = read(KEY_REQUESTS, []);
  const idx = all.findIndex((r) => r.submission && r.id === id);
  if (idx < 0) {
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

// ─────────────────────────────────────────────────────────────
// End User self-service — fetch and update the signed-in user's
// own identity_records row by email. Only a small allow-list of
// fields is writable; everything else is intentionally read-only.
// ─────────────────────────────────────────────────────────────

const SELF_SERVICE_ALLOWED_FIELDS = new Set([
  'family_name',
  'mobile',
  'emergency_name',
  'emergency_phone',
  'relationship',
]);

export async function getMyIdentityRecord(email) {
  if (!email) return null;
  if (hasSupabase) {
    const { data, error } = await supabase
      .from('identity_records')
      .select('*')
      .ilike('email', email)
      .order('submitted_at', { ascending: false })
      .limit(1);
    if (error) {
      console.error('[store] getMyIdentityRecord failed:', error);
      return null;
    }
    return data?.length ? fromIdentityRecord(data[0]) : null;
  }
  // Mock-mode: derive from completed requests.
  const records = await listIdentityRecords();
  return records.find((r) => r.email?.toLowerCase() === email.toLowerCase()) || null;
}

export async function updateMyIdentityRecord(id, patch) {
  if (!id) throw new Error('Identity record id is required');
  // Only allow a strict subset of fields — defence in depth in case the
  // UI ever calls this with extra props.
  const safePatch = {};
  const camelToSnake = {
    familyName: 'family_name',
    mobile: 'mobile',
    emergencyName: 'emergency_name',
    emergencyPhone: 'emergency_phone',
    relationship: 'relationship',
  };
  for (const [k, v] of Object.entries(patch || {})) {
    const snake = camelToSnake[k] || k;
    if (SELF_SERVICE_ALLOWED_FIELDS.has(snake)) {
      safePatch[snake] = v;
    }
  }
  if (Object.keys(safePatch).length === 0) {
    throw new Error('No allowed fields to update.');
  }

  if (hasSupabase) {
    const { data, error } = await supabase
      .from('identity_records')
      .update(safePatch)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('[store] updateMyIdentityRecord failed:', error);
      throw new Error(`Could not save: ${error.message}`);
    }
    return fromIdentityRecord(data);
  }

  // Mock-mode: write into the request's submission blob.
  const all = read(KEY_REQUESTS, []);
  const idx = all.findIndex((r) => r.id === id || r.submission?.id === id);
  if (idx < 0) throw new Error('Identity record not found.');
  const snakeToCamel = {
    family_name: 'familyName',
    mobile: 'mobile',
    emergency_name: 'emergencyName',
    emergency_phone: 'emergencyPhone',
    relationship: 'relationship',
  };
  const camelPatch = {};
  for (const [k, v] of Object.entries(safePatch)) {
    camelPatch[snakeToCamel[k] || k] = v;
  }
  all[idx] = {
    ...all[idx],
    submission: { ...all[idx].submission, ...camelPatch },
    // Surface family_name back onto the top-level request too, so the
    // mock-mode listIdentityRecords sees the change consistently.
    ...(camelPatch.familyName ? { familyName: camelPatch.familyName } : {}),
  };
  write(KEY_REQUESTS, all);
  return all[idx];
}

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

  const all = read(KEY_REQUESTS, []);
  return all
    .filter((r) => r.submission)
    .map((r) => ({
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
    const emailResult = await sendMagicLink(request);
    return {
      request,
      magicLinkEmailSent: emailResult.ok,
      emailError: emailResult.error,
    };
  }

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

// Post-approval notifications to the security clearance office + the
// building pass office. Recipients are configurable server-side via
// SECURITY_CLEARANCE_EMAIL / BUILDING_PASS_EMAIL function secrets;
// each function has a sensible default so the demo works out of the box.
async function sendSecurityClearanceEmail(payload) {
  if (!hasSupabase) return { ok: false, error: 'Supabase not configured' };
  const { data, error } = await supabase.functions.invoke('send-security-clearance-email', {
    body: payload,
  });
  if (error) {
    console.error('[store] send-security-clearance-email invoke failed:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true, data };
}

async function sendBuildingPassEmail(payload) {
  if (!hasSupabase) return { ok: false, error: 'Supabase not configured' };
  const { data, error } = await supabase.functions.invoke('send-building-pass-email', {
    body: payload,
  });
  if (error) {
    console.error('[store] send-building-pass-email invoke failed:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true, data };
}

export async function updateRequest(id, patch) {
  if (hasSupabase) {
    const row = {};
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

// ─────────────────────────────────────────────────────────────
// Paged candidate form — drafts, submission, and manager approval.
// ─────────────────────────────────────────────────────────────
//
// Flow:
//   1. Candidate moves through stepper sections (personal, security
//      clearance, building pass, conflict of interest). Each Next/
//      Back call hits saveDraft() to persist progress.
//   2. On final submit, submitForApproval() flips form_submissions
//      .status='submitted' and onboarding_requests.status='pending_approval'.
//      Identity record is NOT yet written.
//   3. The manager opens /manager/dashboard, sees pending approvals
//      filtered by their email, optionally edits, then clicks Approve.
//   4. approveSubmission() inserts into identity_records, flips
//      statuses, and logs an approvals row for audit.

const SECTIONS = ['personal', 'security_clearance', 'building_pass', 'conflict_of_interest'];

function fromFormSubmission(row) {
  if (!row) return null;
  return {
    id: row.id,
    requestId: row.request_id,
    status: row.status,
    currentSection: row.current_section,
    personal: row.personal || {},
    securityClearance: row.security_clearance || {},
    buildingPass: row.building_pass || {},
    conflictOfInterest: row.conflict_of_interest || {},
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    rejectedAt: row.rejected_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getFormSubmission(requestId) {
  if (!requestId) return null;
  if (hasSupabase) {
    const { data, error } = await supabase
      .from('form_submissions')
      .select('*')
      .eq('request_id', requestId)
      .maybeSingle();
    if (error) {
      console.error('[store] getFormSubmission failed:', error);
      return null;
    }
    return fromFormSubmission(data);
  }
  const all = read(KEY_REQUESTS, []);
  const req = all.find((r) => r.id === requestId);
  return req?.draftSubmission || null;
}

export async function saveDraft(requestId, { sections = {}, currentSection } = {}) {
  if (!requestId) throw new Error('requestId is required');

  if (hasSupabase) {
    const prior = await getFormSubmission(requestId);
    const patch = {
      request_id: requestId,
      status: prior?.status === 'changes_requested' ? 'changes_requested' : 'draft',
    };
    if (currentSection) patch.current_section = currentSection;
    if ('personal' in sections) patch.personal = sections.personal;
    if ('securityClearance' in sections) patch.security_clearance = sections.securityClearance;
    if ('buildingPass' in sections) patch.building_pass = sections.buildingPass;
    if ('conflictOfInterest' in sections) patch.conflict_of_interest = sections.conflictOfInterest;

    const { data, error } = await supabase
      .from('form_submissions')
      .upsert(patch, { onConflict: 'request_id' })
      .select()
      .single();
    if (error) {
      console.error('[store] saveDraft failed:', error);
      throw new Error(`Could not save draft: ${error.message}`);
    }
    return fromFormSubmission(data);
  }

  const all = read(KEY_REQUESTS, []);
  const idx = all.findIndex((r) => r.id === requestId);
  if (idx < 0) throw new Error('Request not found');
  const prev = all[idx].draftSubmission || {
    id: uuid(), requestId, status: 'draft', currentSection: 'personal',
    personal: {}, securityClearance: {}, buildingPass: {}, conflictOfInterest: {},
    createdAt: now(),
  };
  const updated = {
    ...prev,
    ...sections,
    currentSection: currentSection || prev.currentSection,
    updatedAt: now(),
  };
  all[idx] = { ...all[idx], draftSubmission: updated };
  write(KEY_REQUESTS, all);
  return updated;
}

export async function submitForApproval(requestId, sections = {}) {
  if (!requestId) throw new Error('requestId is required');
  const submittedAt = now();

  if (hasSupabase) {
    const patch = {
      request_id: requestId,
      status: 'submitted',
      submitted_at: submittedAt,
      current_section: 'review',
    };
    if (sections.personal) patch.personal = sections.personal;
    if (sections.securityClearance) patch.security_clearance = sections.securityClearance;
    if (sections.buildingPass) patch.building_pass = sections.buildingPass;
    if (sections.conflictOfInterest) patch.conflict_of_interest = sections.conflictOfInterest;

    const { data: submission, error: subErr } = await supabase
      .from('form_submissions')
      .upsert(patch, { onConflict: 'request_id' })
      .select()
      .single();
    if (subErr) {
      console.error('[store] submitForApproval upsert failed:', subErr);
      throw new Error(`Could not submit form: ${subErr.message}`);
    }

    await updateRequest(requestId, { status: 'pending_approval' });
    return fromFormSubmission(submission);
  }

  const all = read(KEY_REQUESTS, []);
  const idx = all.findIndex((r) => r.id === requestId);
  if (idx < 0) throw new Error('Request not found');
  const prev = all[idx].draftSubmission || {
    id: uuid(), requestId, status: 'draft', currentSection: 'review',
    personal: {}, securityClearance: {}, buildingPass: {}, conflictOfInterest: {},
    createdAt: now(),
  };
  const updated = {
    ...prev,
    ...sections,
    status: 'submitted',
    submittedAt,
    currentSection: 'review',
  };
  all[idx] = { ...all[idx], status: 'pending_approval', draftSubmission: updated };
  write(KEY_REQUESTS, all);
  addNotification({
    kind: 'pending_approval',
    title: `Awaiting manager approval — ${all[idx].givenName} ${all[idx].familyName}`,
    body: 'Candidate submitted the onboarding form. Manager review required.',
    requestId,
  });
  return updated;
}

export async function listPendingApprovals(managerEmail) {
  if (hasSupabase) {
    let query = supabase
      .from('onboarding_requests')
      .select('*, form_submissions!inner(*)')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false });
    if (managerEmail) {
      query = query.ilike('manager_email', managerEmail);
    }
    const { data, error } = await query;
    if (error) {
      console.error('[store] listPendingApprovals failed:', error);
      return [];
    }
    return (data || []).map((row) => ({
      request: fromSupabase(row),
      submission: fromFormSubmission(row.form_submissions),
    }));
  }

  const all = read(KEY_REQUESTS, []);
  return all
    .filter((r) => r.status === 'pending_approval')
    .filter((r) => !managerEmail || r.managerEmail?.toLowerCase() === managerEmail.toLowerCase())
    .map((r) => ({ request: r, submission: r.draftSubmission }));
}

export async function getApprovalDetail(requestId) {
  const request = await getRequest(requestId);
  if (!request) return null;
  const submission = await getFormSubmission(requestId);
  return { request, submission };
}

export async function managerEditSection(requestId, section, sectionData) {
  if (!SECTIONS.includes(section)) throw new Error(`Unknown section: ${section}`);
  if (hasSupabase) {
    const col =
      section === 'personal' ? 'personal'
        : section === 'security_clearance' ? 'security_clearance'
        : section === 'building_pass' ? 'building_pass'
        : 'conflict_of_interest';
    const { data, error } = await supabase
      .from('form_submissions')
      .update({ [col]: sectionData })
      .eq('request_id', requestId)
      .select()
      .single();
    if (error) {
      console.error('[store] managerEditSection failed:', error);
      throw new Error(`Could not save edit: ${error.message}`);
    }
    return fromFormSubmission(data);
  }
  const all = read(KEY_REQUESTS, []);
  const idx = all.findIndex((r) => r.id === requestId);
  if (idx < 0) return null;
  const sub = all[idx].draftSubmission || {};
  const camel =
    section === 'personal' ? 'personal'
      : section === 'security_clearance' ? 'securityClearance'
      : section === 'building_pass' ? 'buildingPass'
      : 'conflictOfInterest';
  all[idx] = {
    ...all[idx],
    draftSubmission: { ...sub, [camel]: sectionData, updatedAt: now() },
  };
  write(KEY_REQUESTS, all);
  return all[idx].draftSubmission;
}

export async function approveSubmission(requestId, { manager, comments, fieldChanges = [] }) {
  if (!requestId) throw new Error('requestId is required');
  if (!manager?.email) throw new Error('Manager email is required');

  const reference = generateReference();
  const approvedAt = now();

  if (hasSupabase) {
    const detail = await getApprovalDetail(requestId);
    if (!detail?.submission) throw new Error('No submission found to approve');
    const { request, submission } = detail;
    const p = submission.personal || {};

    const identityRow = {
      request_id: requestId,
      reference,
      submitted_at: submission.submittedAt || approvedAt,
      onboarding_status: 'committed',
      given_name: request.givenName,
      family_name: request.familyName,
      preferred_name: p.preferredName || null,
      dob: p.dob || null,
      email: request.email,
      position: request.position,
      position_number: request.positionNumber || null,
      level: request.level,
      division: request.division,
      branch: request.branch || null,
      group_name: request.groupName || null,
      commencement: request.commencement || null,
      manager_name: request.managerName,
      location: request.location,
      mobile: p.mobile || null,
      emergency_name: p.emergencyName || null,
      emergency_phone: p.emergencyPhone || null,
      relationship: p.relationship || null,
      // Prefer the clearance the role REQUIRES (forward-looking — what IAM
      // should provision toward). Fall back to the candidate's existing
      // level, then to the legacy single-field value for old drafts.
      security_clearance:
        submission.securityClearance?.clearanceRequired ||
        submission.securityClearance?.previousClearanceLevel ||
        submission.securityClearance?.clearanceLevel ||
        null,
    };
    const { error: insertErr } = await supabase
      .from('identity_records')
      .insert(identityRow);
    if (insertErr) {
      console.error('[store] identity_records insert failed:', insertErr);
      throw new Error(`Could not write identity record: ${insertErr.message}`);
    }

    const { error: subErr } = await supabase
      .from('form_submissions')
      .update({ status: 'approved', approved_at: approvedAt })
      .eq('request_id', requestId);
    if (subErr) console.warn('[store] flip submission status failed:', subErr);

    await updateRequest(requestId, { status: 'completed', submittedAt: approvedAt, reference });

    const { error: auditErr } = await supabase.from('approvals').insert({
      submission_id: submission.id,
      request_id: requestId,
      manager_email: manager.email,
      manager_name: manager.name || null,
      action: 'approved',
      comments: comments || null,
      field_changes: fieldChanges,
    });
    if (auditErr) console.warn('[store] approvals insert failed:', auditErr);

    // Post-approval notifications — all fire-and-forget. If any of these
    // fail (Resend down, key missing, recipient bounced) the approval
    // itself is still durable; the manager can re-trigger from logs.
    const candidateName = [request.givenName, request.familyName].filter(Boolean).join(' ');
    const commonPayload = {
      candidateEmail: request.email,
      candidateName,
      reference,
      managerName: manager.name,
      managerEmail: manager.email,
      approvedAt,
    };

    sendConfirmationEmail({
      email: request.email,
      reference,
      givenName: request.givenName,
      familyName: request.familyName,
    }).catch((err) => console.warn('[store] confirmation email failed (non-blocking):', err));

    sendSecurityClearanceEmail({
      ...commonPayload,
      security: submission.securityClearance || {},
    }).catch((err) => console.warn('[store] security clearance email failed (non-blocking):', err));

    sendBuildingPassEmail({
      ...commonPayload,
      building: submission.buildingPass || {},
    }).catch((err) => console.warn('[store] building pass email failed (non-blocking):', err));

    return { reference, approvedAt };
  }

  const all = read(KEY_REQUESTS, []);
  const idx = all.findIndex((r) => r.id === requestId);
  if (idx < 0) throw new Error('Request not found');
  const req = all[idx];
  const sub = req.draftSubmission || {};
  const p = sub.personal || {};
  all[idx] = {
    ...req,
    status: 'completed',
    submission: {
      submittedAt: sub.submittedAt || approvedAt,
      reference,
      givenName: req.givenName,
      familyName: req.familyName,
      preferredName: p.preferredName,
      dob: p.dob,
      mobile: p.mobile,
      emergencyName: p.emergencyName,
      emergencyPhone: p.emergencyPhone,
      relationship: p.relationship,
      securityClearance:
        sub.securityClearance?.clearanceRequired ||
        sub.securityClearance?.previousClearanceLevel ||
        sub.securityClearance?.clearanceLevel ||
        null,
    },
    draftSubmission: { ...sub, status: 'approved', approvedAt },
    approvalLog: [
      ...(req.approvalLog || []),
      { action: 'approved', manager, comments, fieldChanges, at: approvedAt },
    ],
  };
  write(KEY_REQUESTS, all);
  addNotification({
    kind: 'approved',
    title: `Approved — ${req.givenName} ${req.familyName}`,
    body: `Manager ${manager.name || manager.email} approved the submission. Identity record written.`,
    requestId,
  });
  return { reference, approvedAt };
}

export async function rejectSubmission(requestId, { manager, comments }) {
  if (!manager?.email) throw new Error('Manager email is required');
  const rejectedAt = now();

  if (hasSupabase) {
    const { data: sub } = await supabase
      .from('form_submissions')
      .update({ status: 'rejected', rejected_at: rejectedAt })
      .eq('request_id', requestId)
      .select()
      .single();
    await updateRequest(requestId, { status: 'rejected' });
    if (sub) {
      await supabase.from('approvals').insert({
        submission_id: sub.id,
        request_id: requestId,
        manager_email: manager.email,
        manager_name: manager.name || null,
        action: 'rejected',
        comments: comments || null,
      });
    }
    return { rejectedAt };
  }

  const all = read(KEY_REQUESTS, []);
  const idx = all.findIndex((r) => r.id === requestId);
  if (idx < 0) return null;
  all[idx] = {
    ...all[idx],
    status: 'rejected',
    draftSubmission: { ...(all[idx].draftSubmission || {}), status: 'rejected', rejectedAt },
    approvalLog: [
      ...(all[idx].approvalLog || []),
      { action: 'rejected', manager, comments, at: rejectedAt },
    ],
  };
  write(KEY_REQUESTS, all);
  return { rejectedAt };
}

export async function requestChanges(requestId, { manager, comments }) {
  if (!manager?.email) throw new Error('Manager email is required');
  if (!comments) throw new Error('Comments are required when requesting changes');

  if (hasSupabase) {
    const { data: sub } = await supabase
      .from('form_submissions')
      .update({ status: 'changes_requested' })
      .eq('request_id', requestId)
      .select()
      .single();
    await updateRequest(requestId, { status: 'link_sent' });
    if (sub) {
      await supabase.from('approvals').insert({
        submission_id: sub.id,
        request_id: requestId,
        manager_email: manager.email,
        manager_name: manager.name || null,
        action: 'changes_requested',
        comments,
      });
    }
    return { ok: true };
  }

  const all = read(KEY_REQUESTS, []);
  const idx = all.findIndex((r) => r.id === requestId);
  if (idx < 0) return null;
  all[idx] = {
    ...all[idx],
    status: 'link_sent',
    draftSubmission: {
      ...(all[idx].draftSubmission || {}),
      status: 'changes_requested',
    },
    approvalLog: [
      ...(all[idx].approvalLog || []),
      { action: 'changes_requested', manager, comments, at: now() },
    ],
  };
  write(KEY_REQUESTS, all);
  return { ok: true };
}

// Legacy single-step submission. Kept for backwards compatibility — now
// thin-wraps the new two-step flow. The request lands in pending_approval
// like any other submission.
export async function submitCandidateForm(id, formData) {
  const sections = {
    personal: {
      preferredName: formData.preferredName,
      dob: formData.dob,
      mobile: formData.mobile,
      emergencyName: formData.emergencyName,
      emergencyPhone: formData.emergencyPhone,
      relationship: formData.relationship,
    },
    securityClearance: { clearanceLevel: formData.securityClearance },
    buildingPass: {},
    conflictOfInterest: {},
  };
  return submitForApproval(id, sections);
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

// Notifications -- ephemeral, localStorage only
// (HR UI notifications don't need to sync across devices.)
// -----------------------------------------------------------------

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

// -----------------------------------------------------------------
// Seed -- mock-mode only.
// -----------------------------------------------------------------


// -----------------------------------------------------------------
// Seed -- mock-mode only.
// -----------------------------------------------------------------

export async function seedIfEmpty() {
  if (hasSupabase) return;
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
