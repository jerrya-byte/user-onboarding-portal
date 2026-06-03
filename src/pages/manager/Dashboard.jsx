import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount, useMsal } from '@azure/msal-react';
import ManagerLayout from '../../components/ManagerLayout';
import { Breadcrumb, PageHeader } from '../../components/Card';
import Tag from '../../components/Tag';
import Alert from '../../components/Alert';
import { listPendingManagerInput } from '../../lib/store';
import { formatDate } from '../../lib/format';

// Manager-facing dashboard. Lists requests in 'pending_manager_input'
// that need the manager to pre-fill role information before the
// candidate is invited. The candidate's submit no longer requires
// manager approval, so this is the only manager-side queue.
//
// Filter defaults to the signed-in manager. Toggle "Show all" to see
// the queue for other managers too (handy when the demo
// manager_email values don't match your Microsoft sign-in email).

export default function ManagerDashboard() {
  const { instance } = useMsal();
  const account = useAccount() || instance.getAllAccounts()[0];
  const myEmail = account?.username || '';

  const [showAll, setShowAll] = useState(false);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const scope = showAll ? undefined : myEmail;
        const list = await listPendingManagerInput(scope);
        if (!cancelled) {
          setPending(list);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err.message || 'Could not load manager queue.');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [showAll, myEmail]);

  const stats = useMemo(() => ({ pending: pending.length }), [pending]);

  return (
    <ManagerLayout pageTitle="Manager Dashboard">
      <Breadcrumb items={[{ label: 'Manager', href: '#' }, { label: 'Pending input' }]} />
      <PageHeader
        title="Manager Queue"
        subtitle={
          showAll
            ? 'Showing all candidates awaiting manager pre-fill.'
            : `Showing candidates assigned to ${myEmail || 'you'}.`
        }
        right={
          <button
            type="button"
            className="gov-btn gov-btn-secondary gov-btn-sm"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? 'Only mine' : 'Show all'}
          </button>
        }
      />

      {loadError && <Alert kind="error">Could not load queue: {loadError}</Alert>}

      {!loading && pending.length === 0 && (
        <Alert kind="info">
          {showAll
            ? 'No candidates are awaiting manager pre-fill right now.'
            : 'No candidates are awaiting your input. Toggle "Show all" to see other managers\' queues.'}
        </Alert>
      )}

      {pending.length > 0 && (
        <section className="gov-card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="gov-table">
              <caption className="sr-only">
                Candidates pending manager pre-fill -- {stats.pending} total
              </caption>
              <thead>
                <tr>
                  <th scope="col">Candidate</th>
                  <th scope="col">Position</th>
                  <th scope="col">Created</th>
                  <th scope="col">Reporting manager</th>
                  <th scope="col">Status</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.givenName} {r.familyName}</strong>
                      <br />
                      <span className="text-[11px] text-ink-soft">{r.email}</span>
                    </td>
                    <td>{r.position}</td>
                    <td>{formatDate(r.createdAt)}</td>
                    <td>
                      {r.managerName}
                      <br />
                      <span className="text-[11px] text-ink-soft">{r.managerEmail}</span>
                    </td>
                    <td><Tag status="pending_manager_input" /></td>
                    <td>
                      <Link
                        to={`/manager/prepare/${r.id}`}
                        className="gov-btn gov-btn-primary gov-btn-sm"
                      >
                        Pre-fill & send
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </ManagerLayout>
  );
}
