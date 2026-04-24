import { useState } from 'react';
import { useMsal } from '@azure/msal-react';
import GovChrome from './GovChrome';
import Alert from './Alert';
import { LOGIN_REQUEST } from '../lib/msal';

export default function LoginScreen() {
  const { instance, inProgress } = useMsal();
  const [error, setError] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  const onSignIn = async () => {
    setError('');
    setSigningIn(true);
    try {
      console.log('[LoginScreen] calling loginPopup…');
      const result = await instance.loginPopup(LOGIN_REQUEST);
      console.log('[LoginScreen] loginPopup resolved. account:', result?.account?.username, 'all accounts now:', instance.getAllAccounts().map(a => a.username));

      // Belt-and-braces: explicitly mark the returned account as active.
      const account = result?.account || instance.getAllAccounts()[0];
      if (account) {
        instance.setActiveAccount(account);
        console.log('[LoginScreen] set active account:', account.username);
      } else {
        console.warn('[LoginScreen] no account on loginPopup result and no cached accounts!');
      }

      // Hard-navigate (rather than relying on React state propagation
      // from inside the popup callback). This forces a fresh app boot
      // where MSAL hydrates from cache, ProtectedRoute sees the cached
      // account, and the dashboard renders cleanly.
      console.log('[LoginScreen] navigating to /hr/dashboard');
      window.location.assign('/hr/dashboard');
    } catch (err) {
      console.error('Sign-in failed:', err);
      // user-cancelled popups are common — keep the message gentle
      if (err && (err.errorCode === 'user_cancelled' || err.errorCode === 'popup_window_error')) {
        setError(
          err.errorCode === 'user_cancelled'
            ? 'Sign-in was cancelled. Click the button to try again.'
            : 'Your browser blocked the sign-in popup. Please allow popups for this site and try again.'
        );
      } else {
        setError(
          err?.message ||
            'Sign-in failed. Please try again, or contact your IT administrator.'
        );
      }
      setSigningIn(false);
    }
  };

  const busy = signingIn || inProgress === 'login';

  return (
    <div className="min-h-screen flex flex-col">
      <GovChrome variant="login" />

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-[460px]">
          <div className="bg-white border border-border rounded-md shadow-sm px-8 py-10">
            <div className="text-center mb-7">
              <div
                className="w-[60px] h-[60px] bg-navy rounded-md mx-auto mb-4
                           flex items-center justify-center font-serif text-[22px]
                           font-bold text-gold-light"
              >
                ID
              </div>
              <h2 className="font-serif text-xl font-bold text-navy mb-1.5">
                HR Administration Sign-in
              </h2>
              <p className="text-[13px] text-ink-soft leading-relaxed">
                Use your departmental Microsoft account to access the
                Identity Onboarding Portal.
              </p>
            </div>

            {error && (
              <div className="mb-4">
                <Alert kind="error">{error}</Alert>
              </div>
            )}

            <button
              type="button"
              onClick={onSignIn}
              disabled={busy}
              className="w-full flex items-center justify-center gap-3 bg-white
                         border border-[#8C8C8C] hover:border-navy hover:bg-[#F5F7FA]
                         disabled:opacity-60 disabled:cursor-not-allowed
                         transition-colors px-4 py-3 rounded-sm
                         text-[14px] font-semibold text-ink"
            >
              <MicrosoftLogo />
              {busy ? 'Signing in…' : 'Sign in with Microsoft'}
            </button>

            <div className="mt-6 pt-5 border-t border-border text-center">
              <p className="text-[11px] text-ink-soft leading-relaxed">
                Restricted to authorised HR personnel.
                <br />
                All sign-in activity is logged for audit purposes.
              </p>
            </div>
          </div>

          <p className="text-center text-[11px] text-ink-soft mt-5 leading-[1.7]">
            This portal is operated by the Department of Human Services
            <br />
            under the <em>Public Service Act 1999</em>.
          </p>
        </div>
      </div>
    </div>
  );
}

function MicrosoftLogo() {
  // Official 4-square Microsoft mark.
  return (
    <svg width="18" height="18" viewBox="0 0 23 23" aria-hidden="true">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}
