import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAccount, useMsal } from '@azure/msal-react';
import ManagerLayout from '../../components/ManagerLayout';
import { Breadcrumb, Card, PageHeader, SectionSep } from '../../components/Card';
import { Field, TextInput, SelectInput, TextArea } from '../../components/Field';
import Alert from '../../components/Alert';
import Tag from '../../components/Tag';
import {
  approveSubmission,
  getApprovalDetail,
  managerEditSection,
  rejectSubmission,
  requestChanges,
} from '../../lib/store';
import { formatDate } from '../../lib/format';

// Manager review + approval page. The manager can edit any of the four
// section blobs in-place; on Save & Approve we:
//   1. Push any pending edits via managerEditSection (per section).
//   2. Compute a per-field diff vs. the candidate's original answers
//      so we can write an audit row in form_submissions / approvals.
//   3. Call approveSubmission, which inserts into identity_records and
//      flips both onboarding_requests.status and form_submissions.status.

const SECTION_TABS = [
  { key: 'personal', label: 'Personal' },
  { key: 'security_clearance', label: 'Security Clearance' },
  { key: 'building_pass', label: 'Building Pass' },
  { key: 'conflict_of_interest', label: 'Conflict of Interest' },
];

const RELATIONSHIPS = ['Spouse / Partner', 'Parent', 'Sibling', 'Friend', 'Other'];
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
const EMPLOYMENT_TYPES = [
  'APS Employee (on-going)',
  'APS Employee (non-ongoing)',
  'Contractor/Labor Hire',
  'External – Government',
  'External – Other (ie. Trades, Technicians, Cleaners)',
];

export default function ReviewSubmission() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { instance } = useMsal();
  const account = useAccount() || instance.getAllAccounts()[0];

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState('personal');

  // Local editable copies of each section (initialised from the
  // submission once it loads). The "original" is kept separately so
  // we can compute a field-level diff for the audit log.
  const [original, setOriginal] = useState(null);
  const [edited, setEdited] = useState(null);
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showRequestChanges, setShowRequestChanges] = useState(false);
  const [showReject, setShowReject] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await getApprovalDetail(id);
        if (!cancelled) {
          if (!d) {
            setLoadError('Submission not found.');
          } else {
            setDetail(d);
            setOriginal({
              personal: d.submission?.personal || {},
              securityClearance: d.submission?.securityClearance || {},
              buildingPass: d.submission?.buildingPass || {},
              conflictOfInterest: d.submission?.conflictOfInterest || {},
            });
            setEdited({
              personal: { ...(d.submission?.personal || {}) },
              securityClearance: { ...(d.submission?.securityClearance || {}) },
              buildingPass: { ...(d.submission?.buildingPass || {}) },
              conflictOfInterest: { ...(d.submission?.conflictOfInterest || {}) },
            });
          }
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err.message || 'Could not load submission.');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const fieldChanges = useMemo(() => {
    if (!original || !edited) return [];
    const out = [];
    const compare = (sectionKey, before, after) => {
      const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
      for (const k of keys) {
        const a = before?.[k];
        const b = after?.[k];
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          out.push({ section: sectionKey, field: k, from: a ?? null, to: b ?? null });
        }
      }
    };
    compare('personal', original.personal, edited.personal);
    compare('security_clearance', original.securityClearance, edited.securityClearance);
    compare('building_pass', original.buildingPass, edited.buildingPass);
    compare('conflict_of_interest', original.conflictOfInterest, edited.conflictOfInterest);
    return out;
  }, [original, edited]);

  const setSection = (sectionCamel) => (updater) =>
    setEdited((prev) => ({
      ...prev,
      [sectionCamel]:
        typeof updater === 'function' ? updater(prev[sectionCamel]) : updater,
    }));

  const persistEdits = async () => {
    // Save each edited section back to form_submissions. We send all
    // four sections every time — cheap, and it keeps the row consistent
    // even if the manager toggles between tabs.
    await managerEditSection(id, 'personal', edited.personal);
    await managerEditSection(id, 'security_clearance', edited.securityClearance);
    await managerEditSection(id, 'building_pass', edited.buildingPass);
    await managerEditSection(id, 'conflict_of_interest', edited.conflictOfInterest);
  };

  const onApprove = async () => {
    if (!account?.username) {
      setErrorMsg('Could not read manager identity. Please sign in again.');
      return;
    }
    setBusy(true);
    setErrorMsg('');
    try {
      await persistEdits();
      await approveSubmission(id, {
        manager: { email: account.username, name: account.name },
        comments,
        fieldChanges,
      });
      navigate('/manager/dashboard?approved=1');
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Approval failed. Please try again.');
      setBusy(false);
    }
  };

  const onRequestChanges = async () => {
    if (!comments.trim()) {
      setErrorMsg('Please enter a comment explaining what needs to change.');
      return;
    }
    setBusy(true);
    setErrorMsg('');
    try {
      await persistEdits();
      await requestChanges(id, {
        manager: { email: account.username, name: account.name },
        comments,
      });
      navigate('/manager/dashboard?changes_requested=1');
    } catch (err) {
      setErrorMsg(err.message || 'Could not send back. Please try again.');
      setBusy(false);
    }
  };

  const onReject = async () => {
    if (!comments.trim()) {
      setErrorMsg('Please enter a reason for rejection.');
      return;
    }
    setBusy(true);
    setErrorMsg('');
    try {
      await rejectSubmission(id, {
        manager: { email: account.username, name: account.name },
        comments,
      });
      navigate('/manager/dashboard?rejected=1');
    } catch (err) {
      setErrorMsg(err.message || 'Could not reject. Please try again.');
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <ManagerLayout pageTitle="Review Submission">
        <Alert kind="info">Loading submission…</Alert>
      </ManagerLayout>
    );
  }

  if (loadError || !detail) {
    return (
      <ManagerLayout pageTitle="Review Submission">
        <Alert kind="error">{loadError || 'Submission not found.'}</Alert>
        <Link to="/manager/dashboard" className="gov-btn gov-btn-secondary mt-4">← Back to dashboard</Link>
      </ManagerLayout>
    );
  }

  const { request, submission } = detail;

  return (
    <ManagerLayout pageTitle={`Review ${request.givenName} ${request.familyName}`}>
      <Breadcrumb
        items={[
          { label: 'Manager', href: '#' },
          { label: 'Pending Approvals', href: '/manager/dashboard' },
          { label: `${request.givenName} ${request.familyName}` },
        ]}
      />
      <PageHeader
        title={`${request.givenName} ${request.familyName}`}
        subtitle={`${request.position} · ${request.level} · ${request.division}`}
        right={<Tag status={request.status} />}
      />

      <Card title="Submission Summary">
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
          <SummaryRow k="Candidate email" v={request.email} />
          <SummaryRow k="Submitted" v={formatDate(submission?.submittedAt)} />
          <SummaryRow k="Manager" v={`${request.managerName} (${request.managerEmail})`} />
          <SummaryRow k="Work location" v={request.location} />
          <SummaryRow k="Position number" v={request.positionNumber} />
          <SummaryRow k="Commencement" v={request.commencement} />
        </dl>
      </Card>

      {errorMsg && <Alert kind="error">{errorMsg}</Alert>}
      {fieldChanges.length > 0 && (
        <Alert kind="info">
          You have <strong>{fieldChanges.length}</strong> pending edit{fieldChanges.length === 1 ? '' : 's'} that will be saved alongside this approval.
        </Alert>
      )}

      <div className="gov-card p-0 overflow-hidden mt-4">
        <div className="px-6 pt-4">
          <div role="tablist" aria-label="Form sections" className="flex border-b-2 border-border gap-0 -mb-0.5">
            {SECTION_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`bg-transparent border-0 cursor-pointer py-3 px-[18px]
                            text-[13px] font-semibold border-b-2 transition-colors -mb-[2px]
                            min-h-[44px]
                            focus-visible:outline-2 focus-visible:outline-offset-[-2px]
                            focus-visible:outline-gold-light ${
                              tab === t.key
                                ? 'text-navy border-navy'
                                : 'text-ink-mid border-transparent hover:text-ink'
                            }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {tab === 'personal' && (
            <PersonalEditor state={edited.personal} onChange={setSection('personal')} />
          )}
          {tab === 'security_clearance' && (
            <SecurityClearanceEditor
              state={edited.securityClearance}
              onChange={setSection('securityClearance')}
            />
          )}
          {tab === 'building_pass' && (
            <BuildingPassEditor state={edited.buildingPass} onChange={setSection('buildingPass')} />
          )}
          {tab === 'conflict_of_interest' && (
            <ConflictOfInterestEditor
              state={edited.conflictOfInterest}
              onChange={setSection('conflictOfInterest')}
            />
          )}
        </div>
      </div>

      {fieldChanges.length > 0 && (
        <Card title="Pending changes" className="mt-4">
          <ul className="text-[13px] space-y-1 m-0 list-disc pl-5">
            {fieldChanges.map((c, i) => (
              <li key={i}>
                <code>{c.section}.{c.field}</code>{' '}
                <span className="text-ink-soft">from</span>{' '}
                <em>{c.from == null || c.from === '' ? '∅' : String(c.from)}</em>{' '}
                <span className="text-ink-soft">to</span>{' '}
                <strong>{c.to == null || c.to === '' ? '∅' : String(c.to)}</strong>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Manager notes" className="mt-4">
        <Field
          label="Comments"
          hint="Optional for Approve. Required when requesting changes or rejecting."
        >
          <TextArea
            rows={3}
            value={comments}
            onChange={(e) => setComments(e.target.value)}
          />
        </Field>

        <div className="flex flex-wrap gap-3 mt-2">
          <button
            type="button"
            className="gov-btn gov-btn-primary"
            onClick={onApprove}
            disabled={busy}
          >
            {busy ? 'Working…' : `Approve${fieldChanges.length > 0 ? ' with edits' : ''}`}
          </button>
          <button
            type="button"
            className="gov-btn gov-btn-secondary"
            onClick={() => { setShowRequestChanges(true); setShowReject(false); }}
            disabled={busy}
          >
            Request changes from candidate
          </button>
          <button
            type="button"
            className="gov-btn gov-btn-danger"
            onClick={() => { setShowReject(true); setShowRequestChanges(false); }}
            disabled={busy}
          >
            Reject
          </button>
          <Link to="/manager/dashboard" className="gov-btn gov-btn-secondary">
            Cancel
          </Link>
        </div>

        {showRequestChanges && (
          <Alert kind="warn" className="mt-3">
            This will send the form back to the candidate. They will receive an email and can re-open their magic link to edit.
            <div className="mt-2">
              <button type="button" className="gov-btn gov-btn-primary gov-btn-sm" onClick={onRequestChanges} disabled={busy}>
                Confirm — send back for changes
              </button>
            </div>
          </Alert>
        )}
        {showReject && (
          <Alert kind="error" className="mt-3">
            This will permanently reject the submission. No identity record will be created.
            <div className="mt-2">
              <button type="button" className="gov-btn gov-btn-danger gov-btn-sm" onClick={onReject} disabled={busy}>
                Confirm rejection
              </button>
            </div>
          </Alert>
        )}
      </Card>
    </ManagerLayout>
  );
}

function SummaryRow({ k, v }) {
  return (
    <div className="contents">
      <dt className="text-ink-soft">{k}</dt>
      <dd className="m-0">{v || '—'}</dd>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Section editors (Manager-side mirrors of the candidate forms,
// with everything editable).
// ─────────────────────────────────────────────────────────────

function PersonalEditor({ state, onChange }) {
  const set = (k) => (e) => onChange((s) => ({ ...s, [k]: e.target.value }));
  return (
    <>
      <div className="gov-field-row">
        <Field label="Preferred Name">
          <TextInput value={state.preferredName || ''} onChange={set('preferredName')} />
        </Field>
        <Field label="Date of Birth">
          <TextInput type="date" value={state.dob || ''} onChange={set('dob')} />
        </Field>
      </div>
      <div className="gov-field-row">
        <Field label="Personal Mobile Number">
          <TextInput type="tel" value={state.mobile || ''} onChange={set('mobile')} />
        </Field>
        <Field label="Emergency Contact Name">
          <TextInput value={state.emergencyName || ''} onChange={set('emergencyName')} />
        </Field>
      </div>
      <div className="gov-field-row">
        <Field label="Emergency Contact Phone">
          <TextInput type="tel" value={state.emergencyPhone || ''} onChange={set('emergencyPhone')} />
        </Field>
        <Field label="Relationship">
          <SelectInput value={state.relationship || ''} onChange={set('relationship')}>
            <option value="">— Select —</option>
            {RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}
          </SelectInput>
        </Field>
      </div>
    </>
  );
}

function SecurityClearanceEditor({ state, onChange }) {
  const set = (k) => (e) => onChange((s) => ({ ...s, [k]: e.target.value }));
  return (
    <>
      <div className="gov-field-row">
        <Field label="Legal surname">
          <TextInput value={state.legalSurname || ''} onChange={set('legalSurname')} />
        </Field>
        <Field label="Legal first name">
          <TextInput value={state.legalFirstName || ''} onChange={set('legalFirstName')} />
        </Field>
      </div>
      <div className="gov-field-row">
        <Field label="Date of birth">
          <TextInput type="date" value={state.dob || ''} onChange={set('dob')} />
        </Field>
        <Field label="Australian Citizen">
          <SelectInput value={state.australianCitizen || ''} onChange={set('australianCitizen')}>
            <option value="">— Select —</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </SelectInput>
        </Field>
      </div>
      <Field label="Mobile number">
        <TextInput type="tel" maxLength={10} value={state.mobile || ''} onChange={set('mobile')} />
      </Field>
      <div className="gov-field-row">
        <Field label="Position title">
          <TextInput value={state.positionTitle || ''} onChange={set('positionTitle')} />
        </Field>
        <Field label="APS level or equivalent">
          <SelectInput value={state.apsLevel || ''} onChange={set('apsLevel')}>
            <option value="">— Select —</option>
            {APS_LEVELS.map((l) => <option key={l}>{l}</option>)}
          </SelectInput>
        </Field>
      </div>
      <Field label="Clearance required">
        <SelectInput value={state.clearanceRequired || ''} onChange={set('clearanceRequired')}>
          <option value="">— Select —</option>
          {CLEARANCE_REQUIRED.map((c) => <option key={c}>{c}</option>)}
        </SelectInput>
      </Field>
      <Field label="Existing / previous clearance level">
        <SelectInput
          value={state.previousClearanceLevel || ''}
          onChange={set('previousClearanceLevel')}
        >
          <option value="">— None —</option>
          {CLEARANCE_REQUIRED.map((c) => <option key={c}>{c}</option>)}
        </SelectInput>
      </Field>
      <Field label="Existing / previous sponsor">
        <TextInput value={state.previousSponsor || ''} onChange={set('previousSponsor')} />
      </Field>
    </>
  );
}

function BuildingPassEditor({ state, onChange }) {
  const set = (k) => (e) => onChange((s) => ({ ...s, [k]: e.target.value }));
  return (
    <>
      <SectionSep>Section 3 — Access Required (manager to complete)</SectionSep>
      <Field
        label="Building address (including any specific access such as SCIF)"
      >
        <TextInput
          placeholder="e.g. Level 4, 26 Narellan St Canberra — SCIF Zone B"
          value={state.buildingAddress || ''}
          onChange={set('buildingAddress')}
        />
      </Field>
      <div className="gov-field-row">
        <Field label="Daytime access — weekdays 6:30am to 7:30pm">
          <SelectInput value={state.daytimeAccess || ''} onChange={set('daytimeAccess')}>
            <option value="">— Select —</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </SelectInput>
        </Field>
        <Field label="24/7 / public holiday access (building above only)">
          <SelectInput value={state.publicHolidayAccess || ''} onChange={set('publicHolidayAccess')}>
            <option value="">— Select —</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </SelectInput>
        </Field>
      </div>
      <Field label="Manager sign-off date">
        <TextInput type="date" value={state.managerSignDate || ''} onChange={set('managerSignDate')} />
      </Field>

      <SectionSep>Section 1 — Applicant details (candidate filled)</SectionSep>
      <Field label="Initial Access Pass Application" prefilled>
        <TextInput prefilled value={state.initialAccessPass || 'Yes'} readOnly />
      </Field>
      <div className="gov-field-row">
        <Field label="First name">
          <TextInput value={state.firstName || ''} onChange={set('firstName')} />
        </Field>
        <Field label="Other given name(s)">
          <TextInput value={state.otherGivenNames || ''} onChange={set('otherGivenNames')} />
        </Field>
      </div>
      <Field label="Surname">
        <TextInput value={state.surname || ''} onChange={set('surname')} />
      </Field>

      <SectionSep>Section 2 — Employment type (candidate filled)</SectionSep>
      <Field label="Employment type">
        <SelectInput value={state.employmentType || ''} onChange={set('employmentType')}>
          <option value="">— Select —</option>
          {EMPLOYMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </SelectInput>
      </Field>
      <div className="gov-field-row">
        <Field label="Start date">
          <TextInput type="date" value={state.startDate || ''} onChange={set('startDate')} />
        </Field>
        <Field label="Agency" prefilled>
          <TextInput prefilled value={state.agency || 'DSH'} readOnly />
        </Field>
      </div>
      <div className="gov-field-row">
        <Field label="Contract start (if applicable)">
          <TextInput type="date" value={state.contractStartDate || ''} onChange={set('contractStartDate')} />
        </Field>
        <Field label="Contract finish (if applicable)">
          <TextInput type="date" value={state.contractEndDate || ''} onChange={set('contractEndDate')} />
        </Field>
      </div>

      <SectionSep>Section 5 — Applicant declaration</SectionSep>
      <Field label="Conditions of issue acknowledged">
        <SelectInput
          value={state.conditionsAcknowledged ? 'yes' : 'no'}
          onChange={(e) => onChange((s) => ({ ...s, conditionsAcknowledged: e.target.value === 'yes' }))}
        >
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </SelectInput>
      </Field>
      <div className="gov-field-row">
        <Field label="Applicant signature">
          <TextInput value={state.applicantSignature || ''} onChange={set('applicantSignature')} />
        </Field>
        <Field label="Signed date">
          <TextInput type="date" value={state.applicantSignDate || ''} onChange={set('applicantSignDate')} />
        </Field>
      </div>
    </>
  );
}

function ConflictOfInterestEditor({ state, onChange }) {
  const set = (k) => (e) => onChange((s) => ({ ...s, [k]: e.target.value }));
  return (
    <>
      <Field label="Has external paid employment">
        <SelectInput value={state.hasExternalEmployment || ''} onChange={set('hasExternalEmployment')}>
          <option value="">— Select —</option>
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </SelectInput>
      </Field>
      <div className="gov-field-row">
        <Field label="External employer">
          <TextInput value={state.externalEmployer || ''} onChange={set('externalEmployer')} />
        </Field>
        <Field label="Role / hours">
          <TextInput value={state.externalRole || ''} onChange={set('externalRole')} />
        </Field>
      </div>

      <Field label="Has conflicting financial interests">
        <SelectInput value={state.hasFinancialInterests || ''} onChange={set('hasFinancialInterests')}>
          <option value="">— Select —</option>
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </SelectInput>
      </Field>
      <Field label="Financial interest details">
        <TextArea
          rows={3}
          value={state.financialInterestDetails || ''}
          onChange={set('financialInterestDetails')}
        />
      </Field>

      <Field label="Has family members in this agency">
        <SelectInput value={state.hasFamilyInAgency || ''} onChange={set('hasFamilyInAgency')}>
          <option value="">— Select —</option>
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </SelectInput>
      </Field>
      <Field label="Family details">
        <TextArea rows={3} value={state.familyDetails || ''} onChange={set('familyDetails')} />
      </Field>

      <Field label="Candidate acknowledged declaration">
        <SelectInput
          value={state.declaration ? 'yes' : 'no'}
          onChange={(e) => onChange((s) => ({ ...s, declaration: e.target.value === 'yes' }))}
        >
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </SelectInput>
      </Field>
    </>
  );
}
