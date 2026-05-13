import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount, useMsal } from '@azure/msal-react';
import ManagerLayout from '../../components/ManagerLayout';
import { Breadcrumb, PageHeader } from '../../components/Card';
import Tag from '../../components/Tag';
import Alert from '../../components/Alert';
import { listPendingApprovals } from '../../lib/store';
import { formatDate } from '../../lib/format';

// Manager-facing dashboard. Shows everything in onboarding_requests
// .status='pending_approval' that's assigned to the signed-in manager
// (filtered by manager_email matching the Microsoft account username).
//
// A "Show all" toggle is provided as an escape hatch — useful in
// the prototype where the manager's MS email may not match the seeded
// manager_email values exactly.

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
    (async () => {
      try {
        const list = await listPendingApprovals(showAll ? undefined : myEmail);
        if (!cancelled) {
          setPending(list);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err.message || 'Could not load pending approvals.');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [showAll, myEmail]);

  const stats = useMemo(
    () => ({
      pending: pending.length,
    }),
    [pending],
  );

  return (
    <ManagerLayout pageTitle="Manager Dashboard">
      <Breadcrumb items={[{ label: 'Manager', href: '#' }, { label: 'Pending Approvals' }]} />
      <PageHeader
        title="Pending Approvals"
        subtitle={
          showAll
            ? 'Showing all candidate submissions awaiting manager approval.'
            : `Showing submissions assigned to ${myEmail || 'you'}.`
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

      {loadError && <Alert kind="error">Could not load approvals: {loadError}</Alert>}

      {!loading && pending.length === 0 && (
        <Alert kind="info">
          {showAll
            ? 'No submissions are awaiting approval right now.'
            : 'You have no submissions awaiting your approval. Toggle "Show all" to see other managers\' queues.'}
        </Alert>
      )}

      {pending.length > 0 && (
        <section className="gov-card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="gov-table">
              <caption className="sr-only">
                Submissions pending approval — {stats.pending} total
              </caption>
              <thead>
                <tr>
                  <th scope="col">Candidate</th>
                  <th scope="col">Position</th>
                  <th scope="col">Submitted</th>
                  <th scope="col">Manager</th>
                  <th scope="col">Status</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {pending.map(({ request, submission }) => (
                  <tr key={request.id}>
                    <td>
                      <strong>{request.givenName} {request.familyName}</strong>
                      <br />
                      <span className="text-[11px] text-ink-soft">{request.email}</span>
                    </td>
                    <td>{request.position}</td>
                    <td>{formatDate(submission?.submittedAt)}</td>
                    <td>
                      {request.managerName}
                      <br />
                      <span className="text-[11px] text-ink-soft">{request.managerEmail}</span>
                    </td>
                    <td><Tag status="pending_approval" /></td>
                    <td>
                      <Link
                        to={`/manager/review/${request.id}`}
                        className="gov-btn gov-btn-primary gov-btn-sm"
                      >
                        Review
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
