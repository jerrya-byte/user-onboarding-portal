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
// AGSVA clearance levels — used for both "Clearance required" (target for
// this role) and "Existing / previous clearance level" (what the candidate
// holds today).
const CLEARANCE_REQUIRED = [
  'Baseline',
  'Negative Vetting 1 (NV1)',
  'Negative Vetting 2 (NV2)',
  'Positive Vetting (PV)',
];
const APS_LEVELS = [
  'APS1', 'APS2', 'APS3', 'APS4', 'APS5', 'APS6',
  'EL1', 'EL2',
  'SES1 (Branch Manager)', 'SES2 (General Manager)', 'SES3 (Deputy CEO)', 'CEO',
];
// Building pass — employment types accepted on the DSH access pass form.
const EMPLOYMENT_TYPES = [
  'APS Employee (on-going)',
  'APS Employee (non-ongoing)',
  'Contractor/Labor Hire',
  'External – Government',
  'External – Other (ie. Trades, Technicians, Cleaners)',
];
// Employment types that require a contract start + finish date.
const CONTRACT_DATE_TYPES = new Set([
  'APS Employee (non-ongoing)',
  'Contractor/Labor Hire',
  'External – Other (ie. Trades, Technicians, Cleaners)',
]);

const SECTIONS = [
  { key: 'personal',             label: 'Personal Details',      hint: 'Contact + emergency info' },
  { key: 'security_clearance',   label: 'Security Clearance',    hint: 'AGSVA clearance form' },
  { key: 'building_pass',        label: 'Building Pass',         hint: 'DSH access pass application' },
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
  const [securityClearance, setSecurityClearance] = useState(() => {
    const saved = initialDraft?.securityClearance || {};
    const savedPersonal = initialDraft?.personal || {};
    return {
      // Defaults pull from HR-supplied request (legal name, position, APS
      // level) and the candidate's Personal section (DOB, mobile) so the
      // candidate doesn't re-type — but all are editable, since AGSVA
      // forms require the *legal* name, not preferred/nickname.
      legalSurname:           saved.legalSurname            ?? (req.familyName || ''),
      legalFirstName:         saved.legalFirstName          ?? (req.givenName  || ''),
      dob:                    saved.dob                     ?? (savedPersonal.dob    || ''),
      csid:                   saved.csid                    ?? '',
      mobile:                 saved.mobile                  ?? (savedPersonal.mobile || ''),
      positionTitle:          saved.positionTitle           ?? (req.position   || ''),
      apsLevel:               saved.apsLevel                ?? (req.level      || ''),
      clearanceRequired:      saved.clearanceRequired       ?? '',
      previousClearanceLevel: saved.previousClearanceLevel  ?? (saved.clearanceLevel || ''),
      previousSponsor:        saved.previousSponsor         ?? (saved.sponsoringAgency || ''),
    };
  });
  const [buildingPass, setBuildingPass] = useState(() => {
    const saved = initialDraft?.buildingPass || {};
    return {
      // Section 1 — Details of application (Initial Access Pass is static-Yes)
      initialAccessPass: 'Yes',
      firstName:       saved.firstName       ?? (req.givenName  || ''),
      otherGivenNames: saved.otherGivenNames ?? '',
      surname:         saved.surname         ?? (req.familyName || ''),
      // Section 2 — Employment type (Agency is static-DSH)
      employmentType:   saved.employmentType   ?? '',
      startDate:        saved.startDate        ?? (req.commencement || ''),
      agency:           'DSH',
      contractStartDate: saved.contractStartDate ?? (req.commencement || ''),
      contractEndDate:   saved.contractEndDate   ?? '',
      // Section 3 — Building access (Manager fills these in during review)
      buildingAddress:     saved.buildingAddress     ?? '',
      daytimeAccess:       saved.daytimeAccess       ?? '',
      publicHolidayAccess: saved.publicHolidayAccess ?? '',
      managerSignDate:     saved.managerSignDate     ?? '',
      // Section 5 — Conditions + applicant signature
      conditionsAcknowledged: saved.conditionsAcknowledged ?? false,
      applicantSignature:     saved.applicantSignature     ?? '',
      applicantSignDate:      saved.applicantSignDate      ?? '',
    };
  });
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

  // Snapshot of which fields the manager pre-filled (taken at mount time).
  // The candidate sees these as read-only — they can't override the
  // manager's role decisions.
  const prefilledFields = (() => {
    const sc = initialDraft?.securityClearance || {};
    const bp = initialDraft?.buildingPass || {};
    return {
      // Security Clearance:
      apsLevel:           !!sc.apsLevel,
      clearanceRequired:  !!sc.clearanceRequired,
      // Building Pass:
      employmentType:     !!bp.employmentType,
      contractStartDate:  !!bp.contractStartDate,
      contractEndDate:    !!bp.contractEndDate,
      buildingAddress:    !!bp.buildingAddress,
      daytimeAccess:      !!bp.daytimeAccess,
      publicHolidayAccess:!!bp.publicHolidayAccess,
    };
  })();

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

  // Keep the security-clearance DOB and Mobile in lock-step with the
  // Personal-section values -- both fields are now shown read-only on
  // the SC page and sourced from Personal Details.
  useEffect(() => {
    setSecurityClearance((s) => {
      const next = { ...s };
      let changed = false;
      if ((s.dob || '') !== (personal.dob || '')) {
        next.dob = personal.dob || '';
        changed = true;
      }
      if ((s.mobile || '') !== (personal.mobile || '')) {
        next.mobile = personal.mobile || '';
        changed = true;
      }
      return changed ? next : s;
    });
  }, [personal.dob, personal.mobile]);

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
      if (!securityClearance.legalSurname?.trim()) e.legalSurname = 'Required';
      if (!securityClearance.legalFirstName?.trim()) e.legalFirstName = 'Required';
      // DOB and Mobile are shown read-only here and carried forward from
      // Personal, so we don't re-validate them on this section. CSID is
      // optional ("If known").
      if (!securityClearance.positionTitle?.trim()) e.positionTitle = 'Required';
      if (!securityClearance.apsLevel) e.apsLevel = 'Required';
      if (!securityClearance.clearanceRequired) e.clearanceRequired = 'Required';
      // If they declare a previous clearance level, the sponsor is required.
      if (
        securityClearance.previousClearanceLevel &&
        !securityClearance.previousSponsor?.trim()
      ) {
        e.previousSponsor = 'Required when a previous clearance is declared';
      }
    }
    if (currentKey === 'building_pass') {
      if (!buildingPass.firstName?.trim()) e.firstName = 'Required';
      if (!buildingPass.surname?.trim()) e.surname = 'Required';
      if (!buildingPass.employmentType) e.employmentType = 'Required';
      if (CONTRACT_DATE_TYPES.has(buildingPass.employmentType)) {
        if (!buildingPass.contractStartDate)
          e.contractStartDate = 'Required for this employment type';
        if (!buildingPass.contractEndDate)
          e.contractEndDate = 'Required for this employment type';
      }
      if (!buildingPass.conditionsAcknowledged)
        e.conditionsAcknowledged = 'You must agree to the conditions of issue';
      if (!buildingPass.applicantSignature?.trim()) e.applicantSignature = 'Required';
      if (!buildingPass.applicantSignDate) e.applicantSignDate = 'Required';
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
                    prefilledFields={prefilledFields}
                    personal={personal}
                  />
                )}
                {currentKey === 'building_pass' && (
                  <BuildingPassSection
                    state={buildingPass}
                    onChange={setBuildingPass}
                    errOf={errOf}
                    prefilledFields={prefilledFields}
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
                      {submitting ? 'Submitting…' : 'Submit application'}
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

function SecurityClearanceSection({ state, onChange, errOf, prefilledFields = {}, personal = {} }) {
  const set = (k) => (e) => onChange((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Card
      title="Security Clearance Application"
      subtitle="Complete this form to apply for the clearance required for your role. Some fields are pre-filled from HR records — please verify and use your legal name (as it appears on your passport or ID)."
    >
      <SectionSep>Identity</SectionSep>
      <div className="gov-field-row">
        <Field label="Legal surname" required error={errOf('legalSurname')}>
          <TextInput
            value={state.legalSurname || ''}
            onChange={set('legalSurname')}
            error={!!errOf('legalSurname')}
          />
        </Field>
        <Field label="Legal first name" required error={errOf('legalFirstName')}>
          <TextInput
            value={state.legalFirstName || ''}
            onChange={set('legalFirstName')}
            error={!!errOf('legalFirstName')}
          />
        </Field>
      </div>
      <div className="gov-field-row">
        <Field
          label="Date of birth"
          required
          prefilled
          prefillNote="Carried forward from the Personal Details page"
        >
          <TextInput type="date" prefilled value={personal.dob || ''} readOnly />
        </Field>
        <Field
          label="CSID"
          hint="Departmental Customer Service ID, if known. Leave blank if you don't have one yet."
        >
          <TextInput
            value={state.csid || ''}
            onChange={set('csid')}
            placeholder="If known"
          />
        </Field>
      </div>
      <Field
        label="Mobile number"
        required
        prefilled
        prefillNote="Carried forward from the Personal Details page"
      >
        <TextInput
          type="tel"
          inputMode="numeric"
          maxLength={10}
          prefilled
          value={personal.mobile || ''}
          readOnly
        />
      </Field>

      <SectionSep>Position</SectionSep>
      <div className="gov-field-row">
        <Field label="Position title" required error={errOf('positionTitle')}>
          <TextInput
            value={state.positionTitle || ''}
            onChange={set('positionTitle')}
            error={!!errOf('positionTitle')}
          />
        </Field>
        <Field
          label="APS level or equivalent"
          required
          prefilled={prefilledFields.apsLevel}
          prefillNote={prefilledFields.apsLevel ? 'Set by your reporting manager' : undefined}
          error={errOf('apsLevel')}
        >
          {prefilledFields.apsLevel ? (
            <TextInput prefilled value={state.apsLevel || ''} readOnly />
          ) : (
            <SelectInput
              value={state.apsLevel || ''}
              onChange={set('apsLevel')}
              error={!!errOf('apsLevel')}
            >
              <option value="">— Select —</option>
              {APS_LEVELS.map((l) => <option key={l}>{l}</option>)}
            </SelectInput>
          )}
        </Field>
      </div>

      <SectionSep>Clearance</SectionSep>
      <Field
        label="Clearance required"
        required
        prefilled={prefilledFields.clearanceRequired}
        prefillNote={prefilledFields.clearanceRequired ? 'Set by your reporting manager' : 'The AGSVA clearance level needed for this role.'}
        hint={prefilledFields.clearanceRequired ? undefined : 'The AGSVA clearance level needed for this role.'}
        error={errOf('clearanceRequired')}
      >
        {prefilledFields.clearanceRequired ? (
          <TextInput prefilled value={state.clearanceRequired || ''} readOnly />
        ) : (
          <SelectInput
            value={state.clearanceRequired || ''}
            onChange={set('clearanceRequired')}
            error={!!errOf('clearanceRequired')}
          >
            <option value="">— Select —</option>
            {CLEARANCE_REQUIRED.map((c) => <option key={c}>{c}</option>)}
          </SelectInput>
        )}
      </Field>
      <Field
        label="Existing / previous clearance level"
        hint="Leave blank if you have never held a clearance."
      >
        <SelectInput
          value={state.previousClearanceLevel || ''}
          onChange={set('previousClearanceLevel')}
        >
          <option value="">— None —</option>
          {CLEARANCE_REQUIRED.map((c) => <option key={c}>{c}</option>)}
        </SelectInput>
      </Field>
      <Field
        label="Existing / previous sponsor"
        hint="Agency or department that sponsored your prior clearance."
        error={errOf('previousSponsor')}
      >
        <TextInput
          placeholder="e.g. Department of Home Affairs"
          value={state.previousSponsor || ''}
          onChange={set('previousSponsor')}
          error={!!errOf('previousSponsor')}
        />
      </Field>
    </Card>
  );
}

function BuildingPassSection({ state, onChange, errOf, prefilledFields = {} }) {
  const set = (k) => (e) => onChange((s) => ({ ...s, [k]: e.target.value }));
  const setBool = (k) => (e) => onChange((s) => ({ ...s, [k]: e.target.checked }));
  const showContractDates = CONTRACT_DATE_TYPES.has(state.employmentType);
  return (
    <Card
      title="DSH Building Access Pass Application"
      subtitle="Apply for the building access pass required for your role. Fields marked 'Manager to complete' will be set by your reporting manager during approval."
    >
      <SectionSep>Section 1 — Details of Application</SectionSep>
      <Field label="Initial Access Pass Application" prefilled>
        <TextInput prefilled value="Yes" readOnly />
      </Field>
      <div className="gov-field-row">
        <Field label="First name" required prefilled prefillNote="Pre-filled from HR record">
          <TextInput prefilled value={state.firstName || ''} readOnly />
        </Field>
        <Field label="Other given name(s)" prefilled>
          <TextInput prefilled value={state.otherGivenNames || ''} readOnly />
        </Field>
      </div>
      <Field label="SURNAME" required prefilled prefillNote="Pre-filled from HR record">
        <TextInput prefilled value={state.surname || ''} readOnly />
      </Field>

      <SectionSep>Section 2 — Employment Type</SectionSep>
      <Field
        label="Employment type"
        required
        prefilled={prefilledFields.employmentType}
        prefillNote={prefilledFields.employmentType ? 'Set by your reporting manager' : undefined}
        error={errOf('employmentType')}
      >
        {prefilledFields.employmentType ? (
          <TextInput prefilled value={state.employmentType || ''} readOnly />
        ) : (
          <SelectInput
            value={state.employmentType || ''}
            onChange={set('employmentType')}
            error={!!errOf('employmentType')}
          >
            <option value="">— Select —</option>
            {EMPLOYMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </SelectInput>
        )}
      </Field>
      <div className="gov-field-row">
        <Field label="Start date" prefilled prefillNote="Pre-filled from HR commencement date">
          <TextInput type="date" prefilled value={state.startDate || ''} readOnly />
        </Field>
        <Field label="Agency / Organisation / Company" prefilled>
          <TextInput prefilled value="DSH" readOnly />
        </Field>
      </div>
      {showContractDates && (
        <>
          <p className="text-[12px] text-ink-soft mb-2 mt-2">
            Contract dates are required for Labour Hire, Non-Ongoing and External – Other employment types.
          </p>
          <div className="gov-field-row">
            <Field
              label="Contract start date"
              required
              prefilled={prefilledFields.contractStartDate}
              prefillNote={prefilledFields.contractStartDate ? 'Set by your reporting manager' : undefined}
              error={errOf('contractStartDate')}
            >
              <TextInput
                type="date"
                value={state.contractStartDate || ''}
                onChange={prefilledFields.contractStartDate ? undefined : set('contractStartDate')}
                readOnly={prefilledFields.contractStartDate}
                prefilled={prefilledFields.contractStartDate}
                error={!!errOf('contractStartDate')}
              />
            </Field>
            <Field
              label="Contract finish date"
              required
              prefilled={prefilledFields.contractEndDate}
              prefillNote={prefilledFields.contractEndDate ? 'Set by your reporting manager' : undefined}
              error={errOf('contractEndDate')}
            >
              <TextInput
                type="date"
                value={state.contractEndDate || ''}
                onChange={prefilledFields.contractEndDate ? undefined : set('contractEndDate')}
                readOnly={prefilledFields.contractEndDate}
                prefilled={prefilledFields.contractEndDate}
                error={!!errOf('contractEndDate')}
              />
            </Field>
          </div>
        </>
      )}

      <SectionSep>Section 3 — Access Required (Manager to complete)</SectionSep>
      <Alert kind="info" className="mb-3">
        Your reporting manager will complete this section during approval — you can leave it as-is.
      </Alert>
      <Field label="Building address (including any specific access such as SCIF)">
        <TextInput
          placeholder="To be set by manager"
          value={state.buildingAddress || ''}
          readOnly
          prefilled
        />
      </Field>
      <div className="gov-field-row">
        <Field label="Daytime access — weekdays 6:30am to 7:30pm">
          <TextInput
            placeholder="To be set by manager"
            value={state.daytimeAccess || ''}
            readOnly
            prefilled
          />
        </Field>
        <Field label="24/7 / public holiday access (building above only)">
          <TextInput
            placeholder="To be set by manager"
            value={state.publicHolidayAccess || ''}
            readOnly
            prefilled
          />
        </Field>
      </div>

      <SectionSep>Section 5 — Conditions of Issue</SectionSep>
      <p className="text-[12px] text-ink-soft leading-relaxed mb-2">
        All DSH building access passes require a passport-style photograph (head and shoulders, looking straight ahead, against a light plain background). All enquiries regarding this application process are to be directed to your DSH Regional Security Adviser: <strong>security@dhs.gov.au</strong> or <strong>1800 566 064</strong> (24/7).
      </p>

      <div
        className="border border-border rounded-md bg-slate-50 p-4 text-[12px] leading-relaxed
                   max-h-[280px] overflow-y-auto mb-3"
        role="region"
        aria-label="Conditions of Issue"
        tabIndex={0}
      >
        <p className="font-semibold mb-2">Statement by applicant — I have read and agreed to comply with the following conditions of being issued with a DSH building access pass:</p>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>My DSH building access pass remains the property of the issuing Agency, and it has been issued for my use only for the performance of my authorised work duties. I understand I am not to wear my access pass when not inside.</li>
          <li>I must prominently display the access pass when gaining access to, and when working from Agency premises, and designated secure areas for which I have been specifically authorised to access.</li>
          <li>I must always wear the pass in a visible manner whilst on Agency premises and present any issued pass for inspection by DSH staff or security guards when entering or leaving the premises where asked.</li>
          <li>
            I must comply with DSH security policies and procedures whilst on the premises, including:
            <ol className="list-[lower-alpha] pl-5 mt-1 space-y-0.5">
              <li>where I open any electronically controlled access door, no unauthorised person gains access.</li>
              <li>notifying the Issuing Authority if I have no further need or authority to continue accessing a secure area.</li>
            </ol>
          </li>
          <li>I must take every reasonable precaution to protect any issued pass from loss, damage or theft.</li>
          <li>It is my responsibility to identify the pass's expiry date and renew my access using the Agency application form.</li>
          <li>I must not alter, tamper or destroy any issued pass, nor provide my pass to another person for their use, or for any other reason.</li>
          <li>If my access pass is lost or stolen, I must report the loss immediately to the DSH Security Team and ensure that a security incident report is completed as soon as possible before a replacement access pass can be issued.</li>
          <li>
            Where I have received management approval to bring visitors onto the premises, I will be responsible for ensuring the visitor/s:
            <ol className="list-[lower-alpha] pl-5 mt-1 space-y-0.5">
              <li>are always escorted whilst on the premises by myself or another authorised employee</li>
              <li>comply with all applicable security policies, procedures and protocols relating to the premises</li>
              <li>obtain and wear a visitor pass in a visible manner at all times whilst on the premises, and return the pass to the Issuing Authority on departure</li>
              <li>complete all fields in the visitor pass register, including the number of the issued pass</li>
              <li>do not obtain unauthorised access to official information</li>
              <li>do not take any photographs, video or sound recordings within the premises without appropriate authorisation, and</li>
              <li>do not remove without appropriate authorisation any ICT assets, official information in the possession of the Agency, any plant or equipment in the premises, or any Australian Government property.</li>
            </ol>
          </li>
          <li>I acknowledge the access pass will be disabled after 90 days if I do not enter and swipe the access card at an Agency facility.</li>
          <li>If I am on long-term leave, I acknowledge that my access pass will be disabled for the period I am on leave and I will have to reapply for a new pass upon return.</li>
        </ol>

        <p className="font-semibold mt-4 mb-1">APP 5 notice for staff security purposes</p>
        <p>
          Your personal information is protected by law, including the Privacy Act 1988, and is collected by the Australian Government Department of Superheroes. This information is required under the Agency's Protective Security Policy Framework in order for you to gain unescorted building access. Your information, including your photograph, will be used by the Agency for identity verification purposes and to update your profile on Agency systems where required. Your information may be given to other parties for the purpose of investigation or where you have agreed or where it is required or authorised by law. Disclosures may include, but are not limited to, law enforcement and intelligence agencies.
        </p>

        <p className="font-semibold mt-4 mb-1">Properly displaying my DSH building access pass</p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>I am to wear my access pass at the front or side of my body.</li>
          <li>The whole access pass is to be clearly visible to others.</li>
          <li>For my personal safety I understand that I should remove my access pass, and anything else that identifies me as an Australian government employee, when I am outside the office in a public space.</li>
        </ul>
      </div>

      <Field
        label="I have read and agree to comply with the conditions of issue above"
        required
        error={errOf('conditionsAcknowledged')}
      >
        <label className="inline-flex items-start gap-2 text-[14px] mt-1">
          <input
            type="checkbox"
            checked={!!state.conditionsAcknowledged}
            onChange={setBool('conditionsAcknowledged')}
            className="w-4 h-4 mt-1"
          />
          <span>I acknowledge and agree to all conditions listed in Section 5.</span>
        </label>
      </Field>

      <div className="gov-field-row">
        <Field
          label="Applicant signature"
          required
          hint="Type your full name as your signature."
          error={errOf('applicantSignature')}
        >
          <TextInput
            value={state.applicantSignature || ''}
            onChange={set('applicantSignature')}
            error={!!errOf('applicantSignature')}
          />
        </Field>
        <Field label="Date" required error={errOf('applicantSignDate')}>
          <TextInput
            type="date"
            value={state.applicantSignDate || ''}
            onChange={set('applicantSignDate')}
            error={!!errOf('applicantSignDate')}
          />
        </Field>
      </div>
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
          ['Emergency Contact', dash(personal.emergencyName) + ' — ' + dash(personal.emergencyPhone) + ' (' + dash(personal.relationship) + ')'],
        ]}
      />
      <ReviewBlock
        title="Security Clearance"
        onEdit={() => onJump('security_clearance')}
        rows={[
          ['Legal Name', dash(securityClearance.legalFirstName) + ' ' + dash(securityClearance.legalSurname)],
          ['Date of Birth', dash(securityClearance.dob)],
          ['CSID', dash(securityClearance.csid)],
          ['Mobile Number', dash(securityClearance.mobile)],
          ['Position Title', dash(securityClearance.positionTitle)],
          ['APS Level', dash(securityClearance.apsLevel)],
          ['Clearance Required', dash(securityClearance.clearanceRequired)],
          ['Previous Clearance Level', dash(securityClearance.previousClearanceLevel)],
          ['Previous Sponsor', dash(securityClearance.previousSponsor)],
        ]}
      />
      <ReviewBlock
        title="Building Pass"
        onEdit={() => onJump('building_pass')}
        rows={[
          ['Initial Access Pass', 'Yes'],
          ['First Name', dash(buildingPass.firstName)],
          ['Other Given Names', dash(buildingPass.otherGivenNames)],
          ['Surname', dash(buildingPass.surname)],
          ['Employment Type', dash(buildingPass.employmentType)],
          ['Start Date', dash(buildingPass.startDate)],
          ['Agency', 'DSH'],
          ...(CONTRACT_DATE_TYPES.has(buildingPass.employmentType)
            ? [
                ['Contract Start', dash(buildingPass.contractStartDate)],
                ['Contract Finish', dash(buildingPass.contractEndDate)],
              ]
            : []),
          ['Building Address', dash(buildingPass.buildingAddress) || 'To be set by manager'],
          ['Daytime Access (weekdays)', dash(buildingPass.daytimeAccess) || 'To be set by manager'],
          ['24/7 / Public Holiday Access', dash(buildingPass.publicHolidayAccess) || 'To be set by manager'],
          ['Conditions Acknowledged', buildingPass.conditionsAcknowledged ? 'Yes' : 'No'],
          ['Applicant Signature', dash(buildingPass.applicantSignature)],
          ['Signed Date', dash(buildingPass.applicantSignDate)],
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
