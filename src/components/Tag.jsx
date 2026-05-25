const LABELS = {
  link_sent:              { cls: 'gov-tag-sent',     text: 'Link Sent' },
  pending:                { cls: 'gov-tag-pending',  text: 'Pending' },
  pending_manager_input:  { cls: 'gov-tag-pending',  text: 'Awaiting Manager Input' },
  pending_approval:       { cls: 'gov-tag-pending',  text: 'Pending Approval' },
  completed:              { cls: 'gov-tag-complete', text: 'Complete' },
  expired:                { cls: 'gov-tag-expired',  text: 'Expired' },
  rejected:               { cls: 'gov-tag-expired',  text: 'Rejected' },
};

export default function Tag({ status }) {
  const entry = LABELS[status] || { cls: 'gov-tag-pending', text: status };
  return <span className={'gov-tag ' + entry.cls}>{entry.text}</span>;
}
