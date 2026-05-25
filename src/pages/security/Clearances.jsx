import { useEffect, useMemo, useState } from 'react';
import ManagerLayout from '../../components/ManagerLayout';
import { Breadcrumb, PageHeader } from '../../components/Card';
import Alert from '../../components/Alert';
import { listSecurityClearances } from '../../lib/store';
import { formatDate } from '../../lib/format';

// Personal Security Officer view. Lists every identity_records row that
// has any security-clearance information attached, with a free-text
// search across name, email, position, and clearance level. Read-only.

export default function SecurityClearances() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listSecurityClearances();
        if (!cancelled) {
          setRows(data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err.message || 'Could not load security clearances.');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterLevel && (r.securityClearance || r.scDetails?.clearanceRequired || '') !== filterLevel) {
        return false;
      }
      if (!q) return true;
      const hay = [
        r.givenName, r.familyName, r.email, r.position,
        r.scDetails?.legalSurname, r.scDetails?.legalFirstName,
        r.scDetails?.csid, r.scDetails?.previousSponsor,
        r.securityClearance, r.scDetails?.clearanceRequired,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, filterLevel]);

  const stats = useMemo(() => {
    const out = { total: rows.length };
    for (const r of rows) {
      const lvl = r.securityClearance || r.scDetails?.clearanceRequired || 'Unknown';
      out[lvl] = (out[lvl] || 0) + 1;
    }
    return out;
  }, [rows]);

  return (
    <ManagerLayout pageTitle="Security Clearances" variant="manager">
      <Breadcrumb items={[{ label: 'Security', href: '#' }, { label: 'Clearances' }]} />
      <PageHeader
        title="Security Clearances"
        subtitle="Read-only register of every onboarded identity's security clearance information. Search by name, email, position, CSID, or sponsor."
      />

      {loadError && <Alert kind="error">Could not load records: {loadError}</Alert>}

      <div className="gov-card mb-4">
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_auto] gap-3 items-end">
          <label className="block">
            <span className="block text-[12px] font-semibold text-ink-mid mb-1">Search</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, email, CSID, sponsor..."
              className="gov-input"
            />
          </label>
          <label className="block">
            <span className="block text-[12px] font-semibold text-ink-mid mb-1">Clearance level</span>
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              className="gov-input"
            >
              <option value="">All levels</option>
              <option>Baseline</option>
              <option>Negative Vetting 1 (NV1)</option>
              <option>Negative Vetting 2 (NV2)</option>
              <option>Positive Vetting (PV)</option>
            </select>
          </label>
          <div className="text-[12px] text-ink-soft">
            Showing {filtered.length} of {stats.total}
          </div>
        </div>
      </div>

      <section className="gov-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="gov-table">
            <caption className="sr-only">Security clearance register</caption>
            <thead>
              <tr>
                <th scope="col">Candidate</th>
                <th scope="col">Position</th>
                <th scope="col">Clearance</th>
                <th scope="col">CSID</th>
                <th scope="col">Previous sponsor</th>
                <th scope="col">Onboarded</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="text-center text-ink-soft py-6">Loading...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center text-ink-soft py-6">No matching records.</td></tr>
              )}
              {!loading && filtered.map((r) => {
                const level = r.securityClearance || r.scDetails?.clearanceRequired || '—';
                const prevLevel = r.scDetails?.previousClearanceLevel || '';
                return (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.givenName} {r.familyName}</strong>
                      <br />
                      <span className="text-[11px] text-ink-soft">{r.email}</span>
                    </td>
                    <td>
                      {r.position || '—'}
                      <br />
                      <span className="text-[11px] text-ink-soft">{r.level || ''}</span>
                    </td>
                    <td>
                      <strong>{level}</strong>
                      {prevLevel && (
                        <>
                          <br />
                          <span className="text-[11px] text-ink-soft">Previously: {prevLevel}</span>
                        </>
                      )}
                    </td>
                    <td>{r.scDetails?.csid || '—'}</td>
                    <td>{r.scDetails?.previousSponsor || '—'}</td>
                    <td>{formatDate(r.submittedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </ManagerLayout>
  );
}
