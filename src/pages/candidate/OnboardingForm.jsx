import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import CandidateChrome from '../../components/CandidateChrome';
import StepperSidebar from '../../components/StepperSidebar';
import { Card, SectionSep } from '../../components/Card';
import { Field, TextInput, SelectInput, TextArea } from '../../components/Field';
import Alert from '../../components/Alert';
import {
  getRequest,
  getRequestByEmail,
  parseMagicLinkToken,
  getFormSubmission,
  saveDraft,
  submitForApproval,
} from '../../lib/store';
import { hasSupabase, supabase } from '../../lib/supabase';

const RELATIONSHIPS = ['Spouse / Partner', 'Parent', 'Sibling', 'Friend', 'Other'];
const CLEARANCE_LEVELS = [
  'None',
  'Baseline',
  'Negative Vetting 1 (NV1)',
  'Negative Vetting 2 (NV2)',
  'Positive Vetting (PV)',
];
const PASS_TYPES = ['Standard Employee', 'Contractor', 'Visitor (recurring)', 'Executive'];
const ACCESS_ZONES = ['General Office', 'Secure Zone (Zone 2)', 'Server Room', 'Data Centre', 'Records Vault'];

const SECTIONS = [
  { key: 'personal',             label: 'Personal Details',      hint: 'Contact + emergency info' },
  { key: 'security_clearance',   label: 'Security Clearance',    hint: 'AGSVA clearance form' },
  { key: 'building_pass',        label: 'Building Pass',         hint: 'Access + photo consent' },
  { key: 'conflict_of_interest', label: 'Conflict of Interest',  hint: 'Declarations' },
  { key: 'review',               label: 'Review & Submit',       hint: 'Final check' },
];

// ─────────────────────────────────────────────────────────────
// Outer component — resolves the active onboarding request, hydrates
// any saved draft, then mounts <FormView>.
// ─────────────────────────────────────────────────────────────

export default function OnboardingForm() {
  const [search] = useSearchParams();
  const token = search.get('token');
  const requestIdParam = search.get('request_id');
  const isPreview = search.get('preview') === '1';

  const [req, setReq] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let resolved = null;
      if (requestIdParam) resolved = await getRequest(requestIdParam);
      if (!resolved && token) {
        const parsed = parseMagicLinkToken(token);
        if (parsed.ok) resolved = await getRequest(parsed.payload.rid);
      }
      if (!resolved && hasSupabase) {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.user?.email) {
          resolved = await getRequestByEmail(data.session.user.email);
        }
      }
      if (!resolved) {
        const sid = sessionStorage.getItem('onboarding.activeRequest');
        if (sid) resolved = await getRequest(sid);
      }

      let hydrated = null;
      if (resolved) hydrated = await getFormSubmission(resolved.id);

      if (!cancelled) {
        setReq(resolved);
        setDraft(hydrated);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, requestIdParam]);

  if (loading) {
    return (
      <div className="min-h-screen py-10 px-4">
        <CandidateChrome>
          <Alert kind="info">Loading your onboarding record…</Alert>
        </CandidateChrome>
      </div>
    );
  }

  if (!req) {
    return (
      <div className="min-h-screen py-10 px-4">
        <div className="gov-breadcrumb max-w-[960px] mx-auto">
          <span>Candidate-facing screen (external view)</span>
        </div>
        <CandidateChrome>
          <Alert kind="warn">
            No active onboarding session. Please open your magic link from the
            invitation email, or start a new request from the HR portal.
          </Alert>
          <div className="text-center mt-4">
            <Link to="/hr/new" className="gov-btn gov-btn-primary">
              Go to HR portal (demo)
            </Link>
          </div>
        </CandidateChrome>
      </div>
    );
  }

  return <FormView key={req.id} req={req} initialDraft={draft} isPreview={isPreview} />;
}

// ─────────────────────────────────────────────────────────────
// FormView — owns the form state and stepper navigation.
// ─────────────────────────────────────────────────────────────

function FormView({ req, initialDraft, isPreview }) {
  const navigate = useNavigate();

  // Section blobs. Seed from any saved draft, then fall back to the
  // pre-filled request fields where it makes sense (e.g. personal.dob
  // is candidate-supplied, but doesn't have a pre-fill source).
  const [personal, setPersonal] = useState(() => ({
    preferredName: '',
    dob: '',
    mobile: '',
    emergencyName: '',
    emergencyPhone: '',
    relationship: '',
    ...(initialDraft?.personal || {}),
  }));
  const [securityClearance, setSecurityClearance] = useState(() => ({
    clearanceLevel: '',
    sponsoringAgency: '',
    dateGranted: '',
    expiryDate: '',
    hasPriorClearance: '',
    ...(initialDraft?.securityClearance || {}),
  }));
  const [buildingPass, setBuildingPass] = useState(() => ({
    passType: '',
    accessZones: [],
    photoConsent: '',
    medicalConditions: '',
    dietaryRequirements: '',
    ...(initialDraft?.buildingPass || {}),
  }));
  const [conflictOfInterest, setConflictOfInterest] = useState(() => ({
    hasExternalEmployment: '',
    externalEmployer: '',
    externalRole: '',
    hasFinancialInterests: '',
    financialInterestDetails: '',
    hasFamilyInAgency: '',
    familyDetails: '',
    declaration: false,
    ...(initialDraft?.conflictOfInterest || {}),
  }));

  const [currentKey, setCurrentKey] = useState(
    initialDraft?.currentSection &&
      SECTIONS.some((s) => s.key === initialDraft.currentSection)
      ? initialDraft.currentSection
      : 'personal',
  );
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [bannerMsg, setBannerMsg] = useState('');

  // Track which sections have been completed successfully (no
  // validation errors at the time the candidate clicked Next).
  const [completed, setCompleted] = useState(() => {
    // If the candidate is mid-draft, treat all sections before their
    // currentSection as completed so the checkmarks look right.
    const cur = initialDraft?.currentSection;
    if (!cur) return {};
    const acc = {};
    for (const s of SECTIONS) {
      if (s.key === cur) break;
      acc[s.key] = true;
    }
    return acc;
  });

  const sectionsBlob = () => ({
    personal,
    securityClearance,
    buildingPass,
    conflictOfInterest,
  });

  const validateCurrent = () => {
    const e = {};
    if (currentKey === 'personal') {
      if (!personal.dob) e.dob = 'Required';
      if (!personal.mobile?.trim()) e.mobile = 'Required';
      else if (!/^(\+?\d[\d\s-]{6,})$/.test(personal.mobile))
        e.mobile = 'Enter a valid phone number';
      if (!personal.emergencyName?.trim()) e.emergencyName = 'Required';
      if (!personal.emergencyPhone?.trim()) e.emergencyPhone = 'Required';
      else if (!/^(\+?\d[\d\s-]{6,})$/.test(personal.emergencyPhone))
        e.emergencyPhone = 'Enter a valid phone number';
    }
    if (currentKey === 'security_clearance') {
      if (!securityClearance.clearanceLevel) e.clearanceLevel = 'Required';
      // If they hold a clearance, the granting agency is mandatory.
      if (
        securityClearance.clearanceLevel &&
        securityClearance.clearanceLevel !== 'None' &&
        !securityClearance.sponsoringAgency?.trim()
      ) {
        e.sponsoringAgency = 'Required when a clearance is held';
      }
    }
    if (currentKey === 'building_pass') {
      if (!buildingPass.passType) e.passType = 'Required';
      if (!buildingPass.photoConsent) e.photoConsent = 'Required';
    }
    if (currentKey === 'conflict_of_interest') {
      if (!conflictOfInterest.hasExternalEmployment) e.hasExternalEmployment = 'Required';
      if (!conflictOfInterest.hasFinancialInterests) e.hasFinancialInterests = 'Required';
      if (!conflictOfInterest.hasFamilyInAgency) e.hasFamilyInAgency = 'Required';
      if (!conflictOfInterest.declaration)
        e.declaration = 'You must acknowledge the declaration to continue';
    }
    return e;
  };

  const persist = async (nextKey, opts = { final: false }) => {
    if (isPreview) return; // Preview never writes to backend.
    setSavingDraft(true);
    try {
      if (opts.final) {
        await submitForApproval(req.id, sectionsBlob());
      } else {
        await saveDraft(req.id, {
          sections: sectionsBlob(),
          currentSection: nextKey,
        });
      }
    } catch (err) {
      console.error('[OnboardingForm] persist failed:', err);
      throw err;
    } finally {
      setSavingDraft(false);
    }
  };

  const goNext = async () => {
    const e = validateCurrent();
    setErrors(e);
    if (Object.keys(e).length > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const idx = SECTIONS.findIndex((s) => s.key === currentKey);
    const next = SECTIONS[idx + 1]?.key;
    setCompleted((c) => ({ ...c, [currentKey]: true }));
    if (next) {
      try {
        await persist(next);
        setCurrentKey(next);
        setBannerMsg('Progress saved.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        setSubmitError(err.message || 'Could not save progress. Please try again.');
      }
    }
  };

  const goBack = async () => {
    const idx = SECTIONS.findIndex((s) => s.key === currentKey);
    const prev = SECTIONS[idx - 1]?.key;
    if (prev) {
      try {
        await persist(prev);
        setCurrentKey(prev);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        setSubmitError(err.message || 'Could not save progress.');
      }
    }
  };

  const jumpTo = async (key) => {
    if (key === currentKey) return;
    // No validation gate on jump — candidate can browse freely.
    try {
      await persist(key);
      setCurrentKey(key);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSubmitError(err.message || 'Could not save progress.');
    }
  };

  const onFinalSubmit = async () => {
    if (isPreview) {
      alert('Preview mode — submission skipped. In the real flow, this would send to your manager for approval.');
      return;
    }
    setSubmitError('');
    setSubmitting(true);
    try {
      await persist(null, { final: true });
      sessionStorage.setItem('onboarding.activeRequest', req.id);
      navigate('/candidate/done');
    } catch (err) {
      console.error(err);
      setSubmitError(err.message || 'Submission failed. Please try again.');
      setSubmitting(false);
    }
  };

  // Field-level helpers — reduces noise in JSX.
  const errOf = (k) => errors[k];

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="gov-breadcrumb max-w-[1120px] mx-auto">
        <span>Candidate-facing screen (external view)</span>
      </div>

      <div className="max-w-[1120px] mx-auto">
        <div className="candidate-wrap min-h-[400px] bg-bg border border-border rounded overflow-hidden">
          <div className="bg-navy px-8 py-5 border-b-[3px] border-gold-light flex items-center gap-3.5">
            <div className="w-9 h-9 bg-gold-light rounded-[5px] flex items-center justify-center font-serif text-base font-bold text-navy-dark">
              ID
            </div>
            <div>
              <h1 className="font-serif text-[15px] font-bold text-white">
                Identity Onboarding Portal
              </h1>
              <p className="text-[11px] text-slate2">
                Department of Superheroes — Australian Government
              </p>
            </div>
          </div>

          <div className="p-6 md:p-8">
            {isPreview && (
              <Alert kind="warn" className="mb-5">
                <strong>Preview mode</strong> — this is how the candidate experience will look. Submissions are disabled.
              </Alert>
            )}

            <Alert kind="success" className="mb-5">
              Identity verified successfully. Please complete the four onboarding
              forms below. Your progress is saved automatically as you move
              between sections.
            </Alert>

            {submitError && <Alert kind="error">{submitError}</Alert>}
            {bannerMsg && !submitError && (
              <p
                role="status"
                aria-live="polite"
                className="text-[12px] text-ink-soft mb-3"
              >
                {savingDraft ? 'Saving…' : bannerMsg}
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
              <aside>
                <StepperSidebar
                  sections={SECTIONS}
                  currentKey={currentKey}
                  completed={completed}
                  onJump={jumpTo}
                />
              </aside>

              <section aria-live="polite">
                {currentKey === 'personal' && (
                  <PersonalSection
                    req={req}
                    state={personal}
                    onChange={setPersonal}
                    errOf={errOf}
                  />
                )}
                {currentKey === 'security_clearance' && (
                  <SecurityClearanceSection
                    state={securityClearance}
                    onChange={setSecurityClearance}
                    errOf={errOf}
                  />
                )}
                {currentKey === 'building_pass' && (
                  <BuildingPassSection
                    state={buildingPass}
                    onChange={setBuildingPass}
                    errOf={errOf}
                  />
                )}
                {currentKey === 'conflict_of_interest' && (
                  <ConflictOfInterestSection
                    state={conflictOfInterest}
                    onChange={setConflictOfInterest}
                    errOf={errOf}
                  />
                )}
                {currentKey === 'review' && (
                  <ReviewSection
                    req={req}
                    personal={personal}
                    securityClearance={securityClearance}
                    buildingPass={buildingPass}
                    conflictOfInterest={conflictOfInterest}
                    onJump={jumpTo}
                  />
                )}

                <div className="flex flex-wrap gap-3 mt-6">
                  {currentKey !== 'personal' && (
                    <button type="button" className="gov-btn gov-btn-secondary" onClick={goBack}>
                      ← Back
                    </button>
                  )}
                  {currentKey !== 'review' ? (
                    <button type="button" className="gov-btn gov-btn-primary" onClick={goNext}>
                      Save & Continue →
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="gov-btn gov-btn-primary"
                      onClick={onFinalSubmit}
                      disabled={submitting}
                    >
                      {submitting ? 'Submitting…' : 'Submit for manager approval'}
                    </button>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Section components
// ─────────────────────────────────────────────────────────────

function PersonalSection({ req, state, onChange, errOf }) {
  const set = (k) => (e) => onChange((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Card
      title="Personal Information"
      subtitle="Pre-filled fields are read-only. Please verify and complete any blank required fields."
    >
      <div className="gov-field-row">
        <Field label="Given Name" required prefilled>
          <TextInput prefilled value={req.givenName || ''} readOnly />
        </Field>
        <Field label="Family Name" required prefilled>
          <TextInput prefilled value={req.familyName || ''} readOnly />
        </Field>
      </div>
      <div className="gov-field-row">
        <Field label="Preferred Name">
          <TextInput
            placeholder="If different from given name"
            value={state.preferredName || ''}
            onChange={set('preferredName')}
          />
        </Field>
        <Field label="Date of Birth" required error={errOf('dob')}>
          <TextInput type="date" value={state.dob || ''} onChange={set('dob')} error={!!errOf('dob')} />
        </Field>
      </div>

      <SectionSep>Employment (from HR)</SectionSep>
      <div className="gov-field-row">
        <Field label="Position Title" prefilled>
          <TextInput prefilled value={req.position || ''} readOnly />
        </Field>
        <Field label="Position Number / ID" prefilled>
          <TextInput prefilled value={req.positionNumber || ''} readOnly />
        </Field>
      </div>
      <div className="gov-field-row">
        <Field label="Employment Level" prefilled>
          <TextInput prefilled value={req.level || ''} readOnly />
        </Field>
        <Field label="Commencement Date" prefilled>
          <TextInput type="date" prefilled value={req.commencement || ''} readOnly />
        </Field>
      </div>
      <div className="gov-field-row">
        <Field label="Reporting Manager" prefilled>
          <TextInput prefilled value={req.managerName || ''} readOnly />
        </Field>
        <Field label="Work Location" prefilled>
          <TextInput prefilled value={req.location || ''} readOnly />
        </Field>
      </div>

      <SectionSep>Contact & Emergency Details</SectionSep>
      <div className="gov-field-row">
        <Field label="Personal Mobile Number" required error={errOf('mobile')}>
          <TextInput
            type="tel"
            placeholder="04XX XXX XXX"
            value={state.mobile || ''}
            onChange={set('mobile')}
            error={!!errOf('mobile')}
          />
        </Field>
        <Field label="Emergency Contact Name" required error={errOf('emergencyName')}>
          <TextInput
            placeholder="Full name"
            value={state.emergencyName || ''}
            onChange={set('emergencyName')}
            error={!!errOf('emergencyName')}
          />
        </Field>
      </div>
      <div className="gov-field-row">
        <Field label="Emergency Contact Phone" required error={errOf('emergencyPhone')}>
          <TextInput
            type="tel"
            placeholder="04XX XXX XXX"
            value={state.emergencyPhone || ''}
            onChange={set('emergencyPhone')}
            error={!!errOf('emergencyPhone')}
          />
        </Field>
        <Field label="Relationship">
          <SelectInput value={state.relationship || ''} onChange={set('relationship')}>
            <option value="">— Select —</option>
            {RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}
          </SelectInput>
        </Field>
      </div>
    </Card>
  );
}

function SecurityClearanceSection({ state, onChange, errOf }) {
  const set = (k) => (e) => onChange((s) => ({ ...s, [k]: e.target.value }));
  const showDetails =
    state.clearanceLevel && state.clearanceLevel !== 'None';
  return (
    <Card
      title="Security Clearance"
      subtitle="Declare any current AGSVA security clearance. Select 'None' if you have never held a clearance."
    >
      <Field
        label="Current clearance level"
        required
        hint="Choose your highest active clearance level."
        error={errOf('clearanceLevel')}
      >
        <SelectInput
          value={state.clearanceLevel || ''}
          onChange={set('clearanceLevel')}
          error={!!errOf('clearanceLevel')}
        >
          <option value="">— Select —</option>
          {CLEARANCE_LEVELS.map((c) => <option key={c}>{c}</option>)}
        </SelectInput>
      </Field>

      <Field label="Have you previously held a higher clearance?">
        <SelectInput value={state.hasPriorClearance || ''} onChange={set('hasPriorClearance')}>
          <option value="">— Select —</option>
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </SelectInput>
      </Field>

      {showDetails && (
        <>
          <SectionSep>Active clearance details</SectionSep>
          <div className="gov-field-row">
            <Field
              label="Sponsoring agency"
              required
              error={errOf('sponsoringAgency')}
            >
              <TextInput
                placeholder="e.g. Department of Home Affairs"
                value={state.sponsoringAgency || ''}
                onChange={set('sponsoringAgency')}
                error={!!errOf('sponsoringAgency')}
              />
            </Field>
            <Field label="Date granted">
              <TextInput type="date" value={state.dateGranted || ''} onChange={set('dateGranted')} />
            </Field>
          </div>
          <Field label="Clearance expiry date">
            <TextInput type="date" value={state.expiryDate || ''} onChange={set('expiryDate')} />
          </Field>
        </>
      )}
    </Card>
  );
}

function BuildingPassSection({ state, onChange, errOf }) {
  const set = (k) => (e) => onChange((s) => ({ ...s, [k]: e.target.value }));
  const toggleZone = (zone) => () => {
    onChange((s) => {
      const cur = new Set(s.accessZones || []);
      if (cur.has(zone)) cur.delete(zone); else cur.add(zone);
      return { ...s, accessZones: [...cur] };
    });
  };
  return (
    <Card
      title="Building Pass Application"
      subtitle="Information required to issue your physical building pass and access card."
    >
      <Field label="Pass type" required error={errOf('passType')}>
        <SelectInput
          value={state.passType || ''}
          onChange={set('passType')}
          error={!!errOf('passType')}
        >
          <option value="">— Select —</option>
          {PASS_TYPES.map((t) => <option key={t}>{t}</option>)}
        </SelectInput>
      </Field>

      <Field
        label="Requested access zones"
        hint="Select all zones you need access to. Your manager will confirm or revise these on approval."
      >
        <div className="flex flex-col gap-2 mt-1">
          {ACCESS_ZONES.map((z) => (
            <label key={z} className="inline-flex items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                checked={(state.accessZones || []).includes(z)}
                onChange={toggleZone(z)}
                className="w-4 h-4"
              />
              {z}
            </label>
          ))}
        </div>
      </Field>

      <Field
        label="Photo consent"
        required
        hint="A photo will be taken on your first day for your pass."
        error={errOf('photoConsent')}
      >
        <SelectInput
          value={state.photoConsent || ''}
          onChange={set('photoConsent')}
          error={!!errOf('photoConsent')}
        >
          <option value="">— Select —</option>
          <option value="consent">I consent to a photograph being taken</option>
          <option value="decline">I do not consent (manager will follow up)</option>
        </SelectInput>
      </Field>

      <SectionSep>Wellbeing</SectionSep>
      <Field
        label="Medical conditions we should be aware of"
        hint="Used for workplace adjustments and emergency response. Leave blank if none."
      >
        <TextArea
          rows={3}
          value={state.medicalConditions || ''}
          onChange={set('medicalConditions')}
        />
      </Field>
      <Field label="Dietary requirements">
        <TextArea
          rows={2}
          value={state.dietaryRequirements || ''}
          onChange={set('dietaryRequirements')}
        />
      </Field>
    </Card>
  );
}

function ConflictOfInterestSection({ state, onChange, errOf }) {
  const set = (k) => (e) => onChange((s) => ({ ...s, [k]: e.target.value }));
  const setBool = (k) => (e) => onChange((s) => ({ ...s, [k]: e.target.checked }));
  return (
    <Card
      title="Conflict of Interest Declaration"
      subtitle="Declare any interests that may, or may be perceived to, conflict with your duties."
    >
      <Field
        label="Do you have other paid employment outside this role?"
        required
        error={errOf('hasExternalEmployment')}
      >
        <SelectInput
          value={state.hasExternalEmployment || ''}
          onChange={set('hasExternalEmployment')}
          error={!!errOf('hasExternalEmployment')}
        >
          <option value="">— Select —</option>
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </SelectInput>
      </Field>
      {state.hasExternalEmployment === 'yes' && (
        <div className="gov-field-row">
          <Field label="External employer">
            <TextInput value={state.externalEmployer || ''} onChange={set('externalEmployer')} />
          </Field>
          <Field label="Role / hours per week">
            <TextInput value={state.externalRole || ''} onChange={set('externalRole')} />
          </Field>
        </div>
      )}

      <Field
        label="Do you hold financial interests (shares, board positions, etc.) that could conflict with your duties?"
        required
        error={errOf('hasFinancialInterests')}
      >
        <SelectInput
          value={state.hasFinancialInterests || ''}
          onChange={set('hasFinancialInterests')}
          error={!!errOf('hasFinancialInterests')}
        >
          <option value="">— Select —</option>
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </SelectInput>
      </Field>
      {state.hasFinancialInterests === 'yes' && (
        <Field label="Please describe">
          <TextArea
            rows={3}
            value={state.financialInterestDetails || ''}
            onChange={set('financialInterestDetails')}
          />
        </Field>
      )}

      <Field
        label="Do you have close family members working in this agency?"
        required
        error={errOf('hasFamilyInAgency')}
      >
        <SelectInput
          value={state.hasFamilyInAgency || ''}
          onChange={set('hasFamilyInAgency')}
          error={!!errOf('hasFamilyInAgency')}
        >
          <option value="">— Select —</option>
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </SelectInput>
      </Field>
      {state.hasFamilyInAgency === 'yes' && (
        <Field label="Names, relationships, and divisions">
          <TextArea
            rows={3}
            value={state.familyDetails || ''}
            onChange={set('familyDetails')}
          />
        </Field>
      )}

      <SectionSep>Declaration</SectionSep>
      <Field
        label="I confirm the information provided is true, accurate, and complete to the best of my knowledge."
        required
        error={errOf('declaration')}
      >
        <label className="inline-flex items-start gap-2 text-[14px] mt-1">
          <input
            type="checkbox"
            checked={!!state.declaration}
            onChange={setBool('declaration')}
            className="w-4 h-4 mt-1"
          />
          <span>I acknowledge that providing false or misleading information may result in disciplinary action and/or revocation of any offer of employment.</span>
        </label>
      </Field>
    </Card>
  );
}

function ReviewSection({ req, personal, securityClearance, buildingPass, conflictOfInterest, onJump }) {
  const dash = (v) => (v == null || v === '' ? '—' : String(v));
  const yesNo = (v) => (v === 'yes' ? 'Yes' : v === 'no' ? 'No' : '—');
  return (
    <Card
      title="Review & Submit"
      subtitle="Check each section below. Use the Edit links to make changes. After submission your manager will review and approve."
    >
      <ReviewBlock
        title="Personal Details"
        onEdit={() => onJump('personal')}
        rows={[
          ['Given Name', dash(req.givenName)],
          ['Family Name', dash(req.familyName)],
          ['Preferred Name', dash(personal.preferredName)],
          ['Date of Birth', dash(personal.dob)],
          ['Mobile', dash(personal.mobile)],
          ['Emergency Contact', `${dash(personal.emergencyName)} — ${dash(personal.emergencyPhone)} (${dash(personal.relationship)})`],
        ]}
      />
      <ReviewBlock
        title="Security Clearance"
        onEdit={() => onJump('security_clearance')}
        rows={[
          ['Clearance Level', dash(securityClearance.clearanceLevel)],
          ['Sponsoring Agency', dash(securityClearance.sponsoringAgency)],
          ['Date Granted', dash(securityClearance.dateGranted)],
          ['Expiry', dash(securityClearance.expiryDate)],
          ['Held Prior Clearance', yesNo(securityClearance.hasPriorClearance)],
        ]}
      />
      <ReviewBlock
        title="Building Pass"
        onEdit={() => onJump('building_pass')}
        rows={[
          ['Pass Type', dash(buildingPass.passType)],
          ['Access Zones', (buildingPass.accessZones || []).join(', ') || '—'],
          ['Photo Consent', dash(buildingPass.photoConsent)],
          ['Medical Conditions', dash(buildingPass.medicalConditions)],
          ['Dietary Requirements', dash(buildingPass.dietaryRequirements)],
        ]}
      />
      <ReviewBlock
        title="Conflict of Interest"
        onEdit={() => onJump('conflict_of_interest')}
        rows={[
          ['External Employment', yesNo(conflictOfInterest.hasExternalEmployment)],
          ['External Employer', dash(conflictOfInterest.externalEmployer)],
          ['Financial Interests', yesNo(conflictOfInterest.hasFinancialInterests)],
          ['Financial Details', dash(conflictOfInterest.financialInterestDetails)],
          ['Family in Agency', yesNo(conflictOfInterest.hasFamilyInAgency)],
          ['Declaration', conflictOfInterest.declaration ? 'Acknowledged' : 'Not acknowledged'],
        ]}
      />
      <Alert kind="info" className="mt-4">
        On submit, your form will be sent to <strong>{req.managerName || 'your reporting manager'}</strong> for review.
        You will receive an email confirmation once approved.
      </Alert>
    </Card>
  );
}

function ReviewBlock({ title, rows, onEdit }) {
  return (
    <div className="mb-5 border border-border rounded-md overflow-hidden">
      <div className="flex items-center justify-between bg-slate-50 px-4 py-2 border-b border-border">
        <h3 className="font-semibold text-[14px] m-0">{title}</h3>
        <button type="button" className="text-[12px] text-navy underline" onClick={onEdit}>
          Edit
        </button>
      </div>
      <dl className="divide-y divide-border">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[160px_1fr] gap-3 px-4 py-2 text-[13px]">
            <dt className="text-ink-soft">{k}</dt>
            <dd className="m-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
