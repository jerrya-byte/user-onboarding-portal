import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ManagerLayout from '../../components/ManagerLayout';
import { Breadcrumb, Card, PageHeader, SectionSep } from '../../components/Card';
import { Field, TextInput, SelectInput } from '../../components/Field';
import Alert from '../../components/Alert';
import Tag from '../../components/Tag';
import { getRequest, sendLinkToCandidate } from '../../lib/store';

// Manager pre-fill page. The manager arrives here for any onboarding
// request in 'pending_manager_input' and fills the role attributes the
// candidate will see as read-only:
//   * APS level or equivalent
//   * Employment type
//   * Contract dates (if employment type requires them)
//   * Section 3 access decisions (building address, daytime + 24/7)
// On submit the request flips to 'link_sent' and the magic link goes
// out to the candidate.

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
const CONTRACT_DATE_TYPES = new Set([
  'APS Employee (non-ongoing)',
  'Contractor/Labor Hire',
  'External – Other (ie. Trades, Technicians, Cleaners)',
]);

export default function PrepareSubmission() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [apsLevel, setApsLevel] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [contractStartDate, setContractStartDate] = useState('');
  const [contractEndDate, setContractEndDate] = useState('');
  const [buildingAddress, setBuildingAddress] = useState('');
  const [daytimeAccess, setDaytimeAccess] = useState('');
  const [publicHolidayAccess, setPublicHolidayAccess] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await getRequest(id);
        if (!cancelled) {
          if (!r) {
            setLoadError('Request not found.');
          } else {
            setRequest(r);
            // Seed APS level from HR's `level` value if HR populated it.
            setApsLevel(r.level || '');
            setContractStartDate(r.commencement || '');
          }
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err.message || 'Could not load request.');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const showContractDates = CONTRACT_DATE_TYPES.has(employmentType);

  const validate = () => {
    const e = {};
    if (!apsLevel) e.apsLevel = 'Required';
    if (!employmentType) e.employmentType = 'Required';
    if (showContractDates) {
      if (!contractStartDate) e.contractStartDate = 'Required for this employment type';
      if (!contractEndDate) e.contractEndDate = 'Required for this employment type';
    }
    // Section 3 manager-fill fields are encouraged but not strictly required
    // -- the manager can revise them at final approval if needed.
    return e;
  };

  const onSubmit = async () => {
    setErrorMsg('');
    const es = validate();
    setErrors(es);
    if (Object.keys(es).length > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setBusy(true);
    try {
      const prefill = {
        securityClearance: { apsLevel },
        buildingPass: {
          employmentType,
          ...(showContractDates && {
            contractStartDate: contractStartDate || null,
            contractEndDate: contractEndDate || null,
          }),
          buildingAddress: buildingAddress || '',
          daytimeAccess: daytimeAccess || '',
          publicHolidayAccess: publicHolidayAccess || '',
        },
      };
      const { magicLinkEmailSent, emailError } = await sendLinkToCandidate(id, prefill);
      navigate(
        '/manager/dashboard?invited=1' +
          (magicLinkEmailSent ? '&emailSent=1' : (emailError ? '&emailError=' + encodeURIComponent(emailError) : '')),
      );
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Could not send link.');
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <ManagerLayout pageTitle="Prepare candidate onboarding">
        <Alert kind="info">Loading request...</Alert>
      </ManagerLayout>
    );
  }
  if (loadError || !request) {
    return (
      <ManagerLayout pageTitle="Prepare candidate onboarding">
        <Alert kind="error">{loadError || 'Request not found.'}</Alert>
        <Link to="/manager/dashboard" className="gov-btn gov-btn-secondary mt-4">
          &larr; Back to dashboard
        </Link>
      </ManagerLayout>
    );
  }

  const errOf = (k) => errors[k];

  return (
    <ManagerLayout pageTitle={`Prepare ${request.givenName} ${request.familyName}`}>
      <Breadcrumb
        items={[
          { label: 'Manager', href: '#' },
          { label: 'Queue', href: '/manager/dashboard' },
          { label: `${request.givenName} ${request.familyName}` },
        ]}
      />
      <PageHeader
        title={`Prepare ${request.givenName} ${request.familyName}`}
        subtitle="Fill the role attributes below. When you submit, the candidate will receive their magic-link email and these fields will appear as read-only on their form."
        right={<Tag status={request.status} />}
      />

      <Card title="Candidate (from HR)">
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
          <Row k="Name" v={`${request.givenName} ${request.familyName}`} />
          <Row k="Email" v={request.email} />
          <Row k="Position" v={request.position} />
          <Row k="Division" v={request.division} />
          <Row k="Commencement (HR)" v={request.commencement} />
          <Row k="Work location" v={request.location} />
        </dl>
      </Card>

      {errorMsg && <Alert kind="error">{errorMsg}</Alert>}

      <Card title="Role attributes" subtitle="These will be shown as read-only to the candidate.">
        <Field label="APS level or equivalent" required error={errOf('apsLevel')}>
          <SelectInput
            value={apsLevel}
            onChange={(e) => setApsLevel(e.target.value)}
            error={!!errOf('apsLevel')}
          >
            <option value="">— Select —</option>
            {APS_LEVELS.map((l) => <option key={l}>{l}</option>)}
          </SelectInput>
        </Field>

        <Field label="Employment type" required error={errOf('employmentType')}>
          <SelectInput
            value={employmentType}
            onChange={(e) => setEmploymentType(e.target.value)}
            error={!!errOf('employmentType')}
          >
            <option value="">— Select —</option>
            {EMPLOYMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </SelectInput>
        </Field>

        {showContractDates && (
          <>
            <p className="text-[12px] text-ink-soft mb-2">
              Contract dates are required for Labour Hire, Non-Ongoing and External – Other employment types.
            </p>
            <div className="gov-field-row">
              <Field label="Contract start date" required error={errOf('contractStartDate')}>
                <TextInput
                  type="date"
                  value={contractStartDate}
                  onChange={(e) => setContractStartDate(e.target.value)}
                  error={!!errOf('contractStartDate')}
                />
              </Field>
              <Field label="Contract finish date" required error={errOf('contractEndDate')}>
                <TextInput
                  type="date"
                  value={contractEndDate}
                  onChange={(e) => setContractEndDate(e.target.value)}
                  error={!!errOf('contractEndDate')}
                />
              </Field>
            </div>
          </>
        )}
      </Card>

      <Card
        title="Building access (Section 3)"
        subtitle="Optional at this step — you can confirm or revise these at final approval. Filling them now means the candidate sees a fully-pre-completed Section 3."
      >
        <Field label="Building address (including any specific access such as SCIF)">
          <TextInput
            placeholder="e.g. Level 4, 26 Narellan St Canberra — SCIF Zone B"
            value={buildingAddress}
            onChange={(e) => setBuildingAddress(e.target.value)}
          />
        </Field>
        <div className="gov-field-row">
          <Field label="Daytime access — weekdays 6:30am–7:30pm">
            <SelectInput value={daytimeAccess} onChange={(e) => setDaytimeAccess(e.target.value)}>
              <option value="">— Select —</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </SelectInput>
          </Field>
          <Field label="24/7 / public holiday access">
            <SelectInput value={publicHolidayAccess} onChange={(e) => setPublicHolidayAccess(e.target.value)}>
              <option value="">— Select —</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </SelectInput>
          </Field>
        </div>
      </Card>

      <SectionSep>Send to candidate</SectionSep>
      <Alert kind="info">
        On submit, <strong>{request.givenName} {request.familyName}</strong> will receive a magic-link email at <strong>{request.email}</strong> and your pre-filled values will appear on their form as read-only.
      </Alert>
      <div className="flex gap-3 mt-2">
        <button type="button" className="gov-btn gov-btn-primary" onClick={onSubmit} disabled={busy}>
          {busy ? 'Sending...' : 'Save & send link to candidate'}
        </button>
        <Link to="/manager/dashboard" className="gov-btn gov-btn-secondary">
          Cancel
        </Link>
      </div>
    </ManagerLayout>
  );
}

function Row({ k, v }) {
  return (
    <div className="contents">
      <dt className="text-ink-soft">{k}</dt>
      <dd className="m-0">{v || '—'}</dd>
    </div>
  );
}
