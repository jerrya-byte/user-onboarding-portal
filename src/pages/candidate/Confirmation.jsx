import { useEffect, useState } from 'react';
import CandidateChrome from '../../components/CandidateChrome';
import { getRequest } from '../../lib/store';

export default function Confirmation() {
  const [req, setReq] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = sessionStorage.getItem('onboarding.activeRequest');
      const resolved = id ? await getRequest(id) : null;
      if (!cancelled) {
        setReq(resolved);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const submission = req?.submission;
  const firstName = req?.givenName;

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="gov-breadcrumb max-w-[960px] mx-auto">
        <span>Candidate-facing screen (external view)</span>
      </div>
      <CandidateChrome>
        <div className="text-center py-10 px-8 pb-4">
          <div
            className="w-[72px] h-[72px] bg-success-bg border-2 border-success rounded-full
                       flex items-center justify-center text-[30px] mx-auto mb-5"
          >
            ✓
          </div>
          <h2 className="font-serif text-2xl font-bold text-success mb-2">
            {firstName ? `Thank you, ${firstName}` : 'Thank you'}
          </h2>
          <p className="text-base text-ink leading-relaxed max-w-[460px] mx-auto mb-2">
            Welcome to the Department of Human Services.
          </p>
          <p className="text-sm text-ink-soft max-w-[460px] mx-auto">
            {loading
              ? 'Loading confirmation…'
              : 'Your onboarding information has been received and your identity record has been securely created.'}
          </p>
        </div>

        {submission?.reference && (
          <div className="max-w-[420px] mx-auto mt-2 mb-10">
            <div className="bg-white border border-border rounded-md px-6 py-5 text-center shadow-sm">
              <div className="text-[11px] uppercase tracking-[0.6px] text-ink-soft mb-2">
                Your onboarding reference number
              </div>
              <div className="font-mono text-2xl font-semibold text-navy tracking-wide">
                {submission.reference}
              </div>
              <div className="text-[12px] text-ink-soft mt-3 leading-snug">
                Please keep this reference number for your records.
              </div>
            </div>
          </div>
        )}

        <div className="text-center pt-5 border-t border-border">
          <div className="text-[11px] text-ink-soft leading-[1.8]">
            This portal is operated by the Department of Human Services under the{' '}
            <em>Public Service Act 1999</em>.
            <br />
            Your information is protected under the <em>Privacy Act 1988</em>.
          </div>
        </div>
      </CandidateChrome>
    </div>
  );
}
