import { useEffect, useState } from 'react';
import ManagerLayout from '../../components/ManagerLayout';
import { Breadcrumb, Card, PageHeader, SectionSep } from '../../components/Card';
import { Field, TextInput, SelectInput } from '../../components/Field';
import Alert from '../../components/Alert';
import { useUserRole } from '../../lib/roles';
import { getMyIdentityRecord, updateMyIdentityRecord } from '../../lib/store';

// End User self-service page (/me). Loads the identity_records row that
// matches the signed-in user's email, then exposes a small allow-list
// of editable fields. Everything else is shown read-only so the user
// can confirm what's on file but can't impersonate updates HR/Manager
// are responsible for.
//
// Reusing ManagerLayout's shell keeps the chrome consistent — the
// "Home" link in the role-aware nav already lives there.

const RELATIONSHIPS = ['Spouse / Partner', 'Parent', 'Sibling', 'Friend', 'Other'];

export default function SelfService() {
  const { account } = useUserRole();
  const email = account?.username;

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    familyName: '',
    mobile: '',
    emergencyName: '',
    emergencyPhone: '',
    relationship: '',
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await getMyIdentityRecord(email);
        if (!cancelled) {
          setRecord(r);
          if (r) {
            setForm({
              familyName: r.familyName || '',
              mobile: r.mobile || '',
              emergencyName: r.emergencyName || '',
              emergencyPhone: r.emergencyPhone || '',
              relationship: r.relationship || '',
            });
          }
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err.message || 'Could not load your record.');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [email]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSave = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    // Light validation: mobile (10 digits, if changed) and required
    // emergency contact fields.
    if (!form.familyName.trim()) {
      setErrorMsg('Family name is required.');
      return;
    }
    if (form.mobile && !/^\d{10}$/.test(form.mobile.replace(/[\s-]/g, ''))) {
      setErrorMsg('Mobile must be 10 digits.');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateMyIdentityRecord(record.id, form);
      setRecord(updated);
      setEditing(false);
      setSuccessMsg('Your details have been updated.');
    } catch (err) {
      setErrorMsg(err.message || 'Could not save your changes.');
    } finally {
      setSaving(false);
    }
  };

  const onCancel = () => {
    setEditing(false);
    setErrorMsg('');
    if (record) {
      setForm({
        familyName: record.familyName || '',
        mobile: record.mobile || '',
        emergencyName: record.emergencyName || '',
        emergencyPhone: record.emergencyPhone || '',
        relationship: record.relationship || '',
      });
    }
  };

  if (loading) {
    return (
      <ManagerLayout pageTitle="My Details" variant="me">
        <Alert kind="info">Loading your details…</Alert>
      </ManagerLayout>
    );
  }

  if (!record) {
    return (
      <ManagerLayout pageTitle="My Details" variant="me">
        <PageHeader
          title="My Details"
          subtitle="Self-service for your identity record."
        />
        <Alert kind="warn">
          No identity record was found for <strong>{email}</strong>.
          {' '}This usually means you haven't been onboarded yet, or your
          Microsoft sign-in email doesn't match the email HR used. Please
          contact your HR administrator.
        </Alert>
      </ManagerLayout>
    );
  }

  return (
    <ManagerLayout pageTitle="My Details" variant="me">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'My Details' }]} />
      <PageHeader
        title="My Details"
        subtitle="Review the information held about you. You can update the fields highlighted as editable; the rest are managed by HR."
        right={
          !editing ? (
            <button type="button" className="gov-btn gov-btn-primary gov-btn-sm" onClick={() => setEditing(true)}>
              Edit my details
            </button>
          ) : null
        }
      />

      {errorMsg && <Alert kind="error">{errorMsg}</Alert>}
      {successMsg && <Alert kind="success">{successMsg}</Alert>}

      <Card title="Identity (read-only)" subtitle="These fields are managed by HR. Contact your HR administrator to request changes.">
        <div className="gov-field-row">
          <Field label="Given Name" prefilled>
            <TextInput prefilled value={record.givenName || ''} readOnly />
          </Field>
          <Field label="Preferred Name" prefilled>
            <TextInput prefilled value={record.preferredName || ''} readOnly />
          </Field>
        </div>
        <div className="gov-field-row">
          <Field label="Date of Birth" prefilled>
            <TextInput prefilled value={record.dob || ''} readOnly />
          </Field>
          <Field label="Email" prefilled>
            <TextInput prefilled value={record.email || ''} readOnly />
          </Field>
        </div>
        <SectionSep>Employment</SectionSep>
        <div className="gov-field-row">
          <Field label="Position Title" prefilled>
            <TextInput prefilled value={record.position || ''} readOnly />
          </Field>
          <Field label="Level" prefilled>
            <TextInput prefilled value={record.level || ''} readOnly />
          </Field>
        </div>
        <div className="gov-field-row">
          <Field label="Reporting Manager" prefilled>
            <TextInput prefilled value={record.managerName || ''} readOnly />
          </Field>
          <Field label="Work Location" prefilled>
            <TextInput prefilled value={record.location || ''} readOnly />
          </Field>
        </div>
        <div className="gov-field-row">
          <Field label="Security Clearance" prefilled>
            <TextInput prefilled value={record.securityClearance || ''} readOnly />
          </Field>
          <Field label="Reference" prefilled>
            <TextInput prefilled value={record.reference || ''} readOnly />
          </Field>
        </div>
      </Card>

      <Card
        title="Editable details"
        subtitle="You can update these yourself. Changes save immediately when you click Save."
        accent="#1A5E42"
      >
        <Field label="Family Name (Surname)" required>
          {editing ? (
            <TextInput value={form.familyName} onChange={set('familyName')} />
          ) : (
            <TextInput value={record.familyName || ''} readOnly />
          )}
        </Field>
        <Field
          label="Personal Mobile Number"
          hint="10 digits — no country code or spaces."
        >
          {editing ? (
            <TextInput
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={form.mobile}
              onChange={set('mobile')}
            />
          ) : (
            <TextInput value={record.mobile || ''} readOnly />
          )}
        </Field>

        <SectionSep>Emergency Contact</SectionSep>
        <div className="gov-field-row">
          <Field label="Emergency Contact Name">
            {editing ? (
              <TextInput value={form.emergencyName} onChange={set('emergencyName')} />
            ) : (
              <TextInput value={record.emergencyName || ''} readOnly />
            )}
          </Field>
          <Field label="Emergency Contact Phone">
            {editing ? (
              <TextInput type="tel" value={form.emergencyPhone} onChange={set('emergencyPhone')} />
            ) : (
              <TextInput value={record.emergencyPhone || ''} readOnly />
            )}
          </Field>
        </div>
        <Field label="Relationship">
          {editing ? (
            <SelectInput value={form.relationship} onChange={set('relationship')}>
              <option value="">— Select —</option>
              {RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}
            </SelectInput>
          ) : (
            <TextInput value={record.relationship || ''} readOnly />
          )}
        </Field>

        {editing && (
          <div className="flex gap-3 mt-2">
            <button
              type="button"
              className="gov-btn gov-btn-primary"
              onClick={onSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              className="gov-btn gov-btn-secondary"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        )}
      </Card>
    </ManagerLayout>
  );
}
