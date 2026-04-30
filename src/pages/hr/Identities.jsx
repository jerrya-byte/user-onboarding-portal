import { useEffect, useMemo, useState } from 'react';
import GovChrome from '../../components/GovChrome';
import { Breadcrumb, PageHeader } from '../../components/Card';
import Alert from '../../components/Alert';
import { listIdentityRecords, reissueRequest } from '../../lib/store';
import { hasSupabase } from '../../lib/supabase';
import { formatDate, formatDateTime } from '../../lib/format';

// All identity_records columns Jerry asked us to display, in order.
// `id` and `request_id` are intentionally omitted per requirements.
// TFN was removed (column dropped from DB).
const COLUMNS = [
  { key: 'reference',         label: 'Reference' },
  { key: 'submittedAt',       label: 'Submitted',          fmt: (v) => formatDateTime(v) },
  { key: 'givenName',         label: 'Given name' },
  { key: 'familyName',        label: 'Family name' },
  { key: 'preferredName',     label: 'Preferred name' },
  { key: 'dob',               label: 'Date of birth',      fmt: (v) => formatDate(v) },
  { key: 'email',             label: 'Email' },
  { key: 'mobile',            label: 'Mobile' },
  { key: 'position',          label: 'Position' },
  { key: 'positionNumber',    label: 'Position number' },
  { key: 'level',             label: 'Level' },
  { key: 'groupName',         label: 'Group' },
  { key: 'division',          label: 'Division' },
  { key: 'branch',            label: 'Branch' },
  { key: 'commencement',      label: 'Commencement',       fmt: (v) => formatDate(v) },
  { key: 'managerName',       label: 'Manager' },
  { key: 'location',          label: 'Location' },
  { key: 'securityClearance', label: 'Security clearance' },
  { key: 'emergencyName',     label: 'Emergency contact' },
  { key: 'emergencyPhone',    label: 'Emergency phone' },
  { key: 'relationship',      label: 'Relationship' },
  { key: 'identityState',     label: 'Identity state' },
  { key: 'onboardingStatus',  label: 'Onboarding status' },
  { key: 'terminationDate',   label: 'Termination date',   fmt: (v) => formatDate(v) },
];

// Columns whose values are searched when HR types in the search box.
const SEARCH_KEYS = [
  'reference',
  'givenName',
  'familyName',
  'preferredName',
  'email',
  'position',
  'positionNumber',
  'level',
  'groupName',
  'division',
  'branch',
  'managerName',
  'location',
  'securityClearance',
];

export default function Identities() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState(null); // { kind, text }
  const [reissuingId, setReissuingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listIdentityRecords();
        if (!cancelled) {
          setRecords(list);
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setLoadError(err.message || 'Could not load identities.');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter((rec) =>
      SEARCH_KEYS.some((k) => {
        const v = rec[k];
        return v && String(v).toLowerCase().includes(q);
      }),
    );
  }, [records, query]);

  const onReissue = async (rec) => {
    if (!rec.requestId) {
      setFeedback({
        kind: 'error',
        text: `No original onboarding request linked to ${rec.email} — cannot reissue. Use “New Request” instead.`,
      });
      return;
    }
    setFeedback(null);
    setReissuingId(rec.requestId);
    try {
      await reissueRequest(rec.requestId, {
        validityHours: 72,
        reason: 'Resent from Identities list',
      });
      setFeedback({
        kind: 'success',
        text: `Magic link reissued to ${rec.email}. Candidate should receive an email within ~30 seconds.`,
      });
    } catch (err) {
      console.error(err);
      setFeedback({
        kind: 'error',
        text: `Could not reissue link: ${err.message || err}`,
      });
    } finally {
      setReissuingId(null);
    }
  };

  return (
    <div className="min-h-screen">
      <GovChrome variant="hr" />
      <div className="px-8 py-8 max-w-[1400px] mx-auto">
        <Breadcrumb
          items={[{ label: 'Home', href: '#' }, { label: 'Identities' }]}
        />
        <PageHeader
          title="Identities"
          subtitle="All onboarded identities. Search to find a person quickly, then reissue a magic link if they need to update or re-verify their details."
        />

        {!hasSupabase && (
          <Alert kind="warn">
            Running in <strong>prototype mode</strong> (localStorage only). Records
            shown here are derived from completed onboarding requests in your
            local browser session.
          </Alert>
        )}

        {loadError && <Alert kind="error">Could not load identities: {loadError}</Alert>}

        {feedback && (
          <div className="mb-4">
            <Alert kind={feedback.kind}>{feedback.text}</Alert>
          </div>
        )}

        <div className="gov-card p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-1 min-w-[280px]">
              <SearchIcon />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, email, position, division, manager…"
                className="flex-1 bg-transparent border-0 outline-none text-[14px] placeholder:text-ink-soft"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-[11px] uppercase tracking-[0.4px] text-ink-soft hover:text-ink"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="text-[12px] text-ink-soft">
              Showing <strong>{filtered.length}</strong> of {records.length} identities
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="gov-table whitespace-nowrap">
              <thead>
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                  <th className="sticky right-0 bg-[#F4F6F9] shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.08)]">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={COLUMNS.length + 1} className="text-center text-ink-soft py-8">
                      Loading identities…
                    </td>
                  </tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNS.length + 1} className="text-center text-ink-soft py-8">
                      {records.length === 0
                        ? 'No identity records yet. Once a candidate completes the onboarding form, they will appear here.'
                        : 'No identities match your search.'}
                    </td>
                  </tr>
                )}
                {!loading && filtered.map((rec, i) => (
                  <tr key={`${rec.reference || rec.email}-${i}`}>
                    {COLUMNS.map((c) => {
                      const raw = rec[c.key];
                      const display = c.fmt ? c.fmt(raw) : (raw ?? '');
                      return (
                        <td key={c.key}>
                          {display || <span className="text-ink-soft">—</span>}
                        </td>
                      );
                    })}
                    <td className="sticky right-0 bg-white shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.08)]">
                      <button
                        type="button"
                        onClick={() => onReissue(rec)}
                        disabled={reissuingId === rec.requestId || !rec.requestId}
                        title={
                          rec.requestId
                            ? 'Send a fresh magic link to this person'
                            : 'No original onboarding request to reissue from'
                        }
                        className="gov-btn gov-btn-secondary gov-btn-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {reissuingId === rec.requestId ? 'Sending…' : 'Reissue Magic Link'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-ink-soft"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
