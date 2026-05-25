import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount, useMsal } from '@azure/msal-react';
import ManagerLayout from '../../components/ManagerLayout';
import { Breadcrumb, PageHeader } from '../../components/Card';
import Tag from '../../components/Tag';
import Alert from '../../components/Alert';
import { listPendingApprovals, listPendingManagerInput } from '../../lib/store';
import { formatDate } from '../../lib/format';

// Manager-facing dashboard. Two tabs:
//   1. Pending input    -- requests HR created that need the manager
//      to pre-fill role information before the candidate is invited.
//   2. Pending approval -- candidate submissions awaiting final approval.
//
// Filter defaults to the signed-in manager. Toggle "Show all" to see
// the queue for other managers too (handy when the prototype demo
// manager_email values don't match your Microsoft sign-in email).

const TABS = [
  { key: 'input',    label: 'Pending Input' },
  { key: 'approval', label: 'Pending Approval' },
];

export default function ManagerDashboard() {
  const { instance } = useMsal();
  const account = useAccount() || instance.getAllAccounts()[0];
  const myEmail = account?.username || '';

  const [tab, setTab] = useState('input');
  const [showAll, setShowAll] = useState(false);
  const [pendingInput, setPendingInput] = useState([]);
  const [pendingApproval, setPendingApproval] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const scope = showAll ? undefined : myEmail;
        const [input, approval] = await Promise.all([
          listPendingManagerInput(scope),
          listPendingApprovals(scope),
        ]);
        if (!cancelled) {
          setPendingInput(input);
          setPendingApproval(approval);
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

  const counts = useMemo(
    () => ({ input: pendingInput.length, approval: pendingApproval.length }),
    [pendingInput, pendingApproval],
  );

  return (
    <ManagerLayout pageTitle="Manager Dashboard">
      <Breadcrumb items={[{ label: 'Manager', href: '#' }, { label: 'Approvals queue' }]} />
      <PageHeader
        title="Manager Queue"
        subtitle={
          showAll
            ? 'Showing all candidates awaiting manager action.'
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

      <div className="gov-card p-0 overflow-hidden">
        <div className="px-6 pt-4">
          <div role="tablist" aria-label="Manager queue" className="flex border-b-2 border-border gap-0 -mb-0.5">
            {TABS.map((t) => (
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
                {t.label} <span className="ml-1 text-ink-soft">({counts[t.key]})</span>
              </button>
            ))}
          </div>
        </div>

        <div role="tabpanel" className="overflow-x-auto">
          {tab === 'input' && (
            <PendingInputTable
              loading={loading}
              rows={pendingInput}
              showAll={showAll}
            />
          )}
          {tab === 'approval' && (
            <PendingApprovalTable
              loading={loading}
              rows={pendingApproval}
              showAll={showAll}
            />
          )}
        </div>
      </div>
    </ManagerLayout>
  );
}

function PendingInputTable({ loading, rows, showAll }) {
  if (!loading && rows.length === 0) {
    return (
      <div className="p-6">
        <Alert kind="info">
          {showAll
            ? 'No candidates are awaiting manager pre-fill right now.'
            : 'No candidates are awaiting your input. Toggle "Show all" to see other managers\' queues.'}
        </Alert>
      </div>
    );
  }
  return (
    <table className="gov-table">
      <caption className="sr-only">Candidates pending manager pre-fill</caption>
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
        {loading && (
          <tr><td colSpan={6} className="text-center text-ink-soft py-6">Loading...</td></tr>
        )}
        {rows.map((r) => (
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
  );
}

function PendingApprovalTable({ loading, rows, showAll }) {
  if (!loading && rows.length === 0) {
    return (
      <div className="p-6">
        <Alert kind="info">
          {showAll
            ? 'No submissions are awaiting approval right now.'
            : 'You have no submissions awaiting your approval.'}
        </Alert>
      </div>
    );
  }
  return (
    <table className="gov-table">
      <caption className="sr-only">Candidate submissions awaiting manager approval</caption>
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
        {loading && (
          <tr><td colSpan={6} className="text-center text-ink-soft py-6">Loading...</td></tr>
        )}
        {rows.map(({ request, submission }) => (
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
  );
}
