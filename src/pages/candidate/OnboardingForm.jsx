import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import CandidateChrome from '../../components/CandidateChrome';
import { Card, SectionSep } from '../../components/Card';
import { Field, TextInput, SelectInput } from '../../components/Field';
import Alert from '../../components/Alert';
import ProgressSteps from '../../components/ProgressSteps';
import {
  getRequest,
  getRequestByEmail,
  parseMagicLinkToken,
  submitCandidateForm,
} from '../../lib/store';
import { hasSupabase, supabase } from '../../lib/supabase';

const RELATIONSHIPS = ['Spouse / Partner', 'Parent', 'Sibling', 'Friend', 'Other'];

// AGSVA security clearance levels in ascending order of vetting intensity.
// "None" covers candidates who have never held a clearance.
const CLEARANCE_LEVELS = [
  'None',
  'Baseline',
  'Negative Vetting 1 (NV1)',
  'Negative Vetting 2 (NV2)',
  'Positive Vetting (PV)',
];

/**
 * Outer component: resolves the active onboarding request (async), then
 * mounts <FormView> with the resolved req. Keeping the hydration in a
 * child keeps the form's useState() lazy initializer clean (no derived-
 * from-prop setState in an effect).
 */
export default function OnboardingForm() {
  const [search] = useSearchParams();
  const token = search.get('token');
  const requestIdParam = search.get('request_id');
  const isPreview = search.get('preview') === '1';

  const [req, setReq] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let resolved = null;

      if (requestIdParam) {
        resolved = await getRequest(requestIdParam);
      }
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

      if (!cancelled) {
        setReq(resolved);
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

  // Keyed on req.id so if the active request ever changes, the inner
  // form remounts with a fresh lazy init.
  return <FormView key={req.id} req={req} isPreview={isPreview} />;
}

/**
 * Inner component — seeds its state from `req` at mount and then owns it.
 */
function FormView({ req, isPreview }) {
  const navigate = useNavigate();

  const [form, setForm] = useState(() => ({
    givenName: req.givenName || '',
    familyName: req.familyName || '',
    preferredName: '',
    dob: '',
    position: req.position || '',
    positionNumber: req.positionNumber || '',
    level: req.level || '',
    division: req.division || '',
    branch: req.branch || '',
    groupName: req.groupName || '',
    commencement: req.commencement || '',
    managerName: req.managerName || '',
    location: req.location || '',
    mobile: '',
    emergencyName: '',
    emergencyPhone: '',
    relationship: '',
    securityClearance: '',
  }));

  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const onBlur = (k) => () => setTouched((t) => ({ ...t, [k]: true }));
  const errVisible = (k) => touched[k] && errors[k];

  const validate = () => {
    const e = {};
    if (!form.dob) e.dob = 'Required';
    if (!form.mobile.trim()) e.mobile = 'Required';
    else if (!/^(\+?\d[\d\s-]{6,})$/.test(form.mobile))
      e.mobile = 'Enter a valid phone number';
    if (!form.emergencyName.trim()) e.emergencyName = 'Required';
    if (!form.emergencyPhone.trim()) e.emergencyPhone = 'Required';
    else if (!/^(\+?\d[\d\s-]{6,})$/.test(form.emergencyPhone))
      e.emergencyPhone = 'Enter a valid phone number';
    if (!form.securityClearance) e.securityClearance = 'Required';
    return e;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    const es = validate();
    setErrors(es);
    setTouched(
      [
        'dob','mobile','emergencyName','emergencyPhone','securityClearance',
      ].reduce((acc, k) => ({ ...acc, [k]: true }), {})
    );
    if (Object.keys(es).length > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (isPreview) {
      alert('Preview mode — submission skipped. In a real flow, this would write to identity_records.');
      return;
    }
    setSubmitting(true);
    try {
      await submitCandidateForm(req.id, form);
      sessionStorage.setItem('onboarding.activeRequest', req.id);
      navigate(`/candidate/done`);
    } catch (err) {
      console.error(err);
      setSubmitError(err.message || 'Submission failed. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="gov-breadcrumb max-w-[960px] mx-auto">
        <span>Candidate-facing screen (external view)</span>
      </div>

      <CandidateChrome>
        {isPreview && (
          <Alert kind="warn" className="mb-5">
            <strong>Preview mode</strong> — this is how the candidate experience will look. Submission is disabled.
          </Alert>
        )}

        <Alert kind="success" className="mb-5">
          Identity verified successfully. Some fields below have been pre-filled
          from your employment record. Please review all information before submitting.
        </Alert>

        {submitError && <Alert kind="error">{submitError}</Alert>}

        <ProgressSteps
          steps={['Verify', 'Your Details', 'Review', 'Submit']}
          current={1}
        />

        <form onSubmit={onSubmit}>
          <Card
            title="Personal Information"
            subtitle="Pre-filled fields are marked. Please verify all information is correct and complete any blank fields."
          >
            <div className="gov-field-row">
              <Field label="Given Name" required prefilled>
                <TextInput prefilled value={form.givenName} readOnly />
              </Field>
              <Field label="Family Name" required prefilled>
                <TextInput prefilled value={form.familyName} readOnly />
              </Field>
            </div>
            <div className="gov-field-row">
              <Field label="Preferred Name">
                <TextInput
                  placeholder="If different from given name"
                  value={form.preferredName}
                  onChange={set('preferredName')}
                />
              </Field>
              <Field
                label="Date of Birth"
                required
                error={errVisible('dob') ? errors.dob : null}
              >
                <TextInput
                  type="date"
                  value={form.dob}
                  onChange={set('dob')}
                  onBlur={onBlur('dob')}
                  error={errVisible('dob')}
                />
              </Field>
            </div>

            <SectionSep>Employment Details</SectionSep>

            <div className="gov-field-row">
              <Field label="Position Title" prefilled>
                <TextInput prefilled value={form.position} readOnly />
              </Field>
              <Field label="Position Number / ID" prefilled>
                <TextInput prefilled value={form.positionNumber} readOnly />
              </Field>
            </div>
            <div className="gov-field-row">
              <Field label="Employment Level" prefilled>
                <TextInput prefilled value={form.level} readOnly />
              </Field>
              <Field label="Commencement Date" prefilled>
                <TextInput type="date" prefilled value={form.commencement} readOnly />
              </Field>
            </div>
            <div className="gov-field-row">
              <Field label="Group" prefilled>
                <TextInput prefilled value={form.groupName} readOnly />
              </Field>
              <Field label="Division" prefilled>
                <TextInput prefilled value={form.division} readOnly />
              </Field>
            </div>
            <Field label="Branch" prefilled>
              <TextInput prefilled value={form.branch} readOnly />
            </Field>

            <SectionSep>Manager & Location</SectionSep>

            <div className="gov-field-row">
              <Field label="Reporting Manager" prefilled>
                <TextInput prefilled value={form.managerName} readOnly />
              </Field>
              <Field label="Work Location" prefilled>
                <TextInput prefilled value={form.location} readOnly />
              </Field>
            </div>

            <SectionSep>Additional Information (Candidate to complete)</SectionSep>

            <div className="gov-field-row">
              <Field label="Personal Mobile Number" required error={errVisible('mobile') ? errors.mobile : null}>
                <TextInput
                  type="tel"
                  placeholder="04XX XXX XXX"
                  value={form.mobile}
                  onChange={set('mobile')}
                  onBlur={onBlur('mobile')}
                  error={errVisible('mobile')}
                />
              </Field>
              <Field label="Emergency Contact Name" required error={errVisible('emergencyName') ? errors.emergencyName : null}>
                <TextInput
                  placeholder="Full name"
                  value={form.emergencyName}
                  onChange={set('emergencyName')}
                  onBlur={onBlur('emergencyName')}
                  error={errVisible('emergencyName')}
                />
              </Field>
            </div>
            <div className="gov-field-row">
              <Field label="Emergency Contact Phone" required error={errVisible('emergencyPhone') ? errors.emergencyPhone : null}>
                <TextInput
                  type="tel"
                  placeholder="04XX XXX XXX"
                  value={form.emergencyPhone}
                  onChange={set('emergencyPhone')}
                  onBlur={onBlur('emergencyPhone')}
                  error={errVisible('emergencyPhone')}
                />
              </Field>
              <Field label="Relationship">
                <SelectInput value={form.relationship} onChange={set('relationship')}>
                  <option value="">— Select —</option>
                  {RELATIONSHIPS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </SelectInput>
              </Field>
            </div>
            <Field
              label="Security Clearance"
              required
              hint="Select your current AGSVA security clearance level. Choose 'None' if you have never held a clearance."
              error={errVisible('securityClearance') ? errors.securityClearance : null}
            >
              <SelectInput
                value={form.securityClearance}
                onChange={set('securityClearance')}
                onBlur={onBlur('securityClearance')}
                error={errVisible('securityClearance')}
              >
                <option value="">— Select —</option>
                {CLEARANCE_LEVELS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </SelectInput>
            </Field>
          </Card>

          <div className="flex gap-3 mt-6">
            <button type="submit" className="gov-btn gov-btn-primary" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit Onboarding Form'}
            </button>
            <button
              type="button"
              className="gov-btn gov-btn-secondary"
              onClick={() => alert('Saved (demo — in-memory only).')}
              disabled={submitting}
            >
              Save and return later
            </button>
          </div>
        </form>
      </CandidateChrome>
    </div>
  );
}
