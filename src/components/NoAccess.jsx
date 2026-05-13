import { useMsal } from '@azure/msal-react';
import GovChrome from './GovChrome';
import SkipLink from './SkipLink';
import Alert from './Alert';
import { useUserRole } from '../lib/roles';

// Shown when the user is signed in to Microsoft but isn't a member of
// any of the three EntraID security groups (HR Admins / Managers /
// End Users). We don't blank-redirect to the login screen because they
// ARE authenticated — the issue is authorisation, not authentication.
export default function NoAccess() {
  const { instance } = useMsal();
  const { account, rawGroups } = useUserRole();

  const onSignOut = () => {
    instance
      .logoutRedirect({ postLogoutRedirectUri: window.location.origin })
      .catch((err) => console.error('Sign-out failed:', err));
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SkipLink />
      <GovChrome variant="login" />
      <main id="main-content" tabIndex={-1} className="flex-1 flex items-center justify-center px-4 py-16 focus:outline-none">
        <div className="w-full max-w-[520px]">
          <div className="bg-white border border-border rounded-md shadow-sm px-8 py-10">
            <div className="text-center mb-5">
              <div
                aria-hidden="true"
                className="w-[60px] h-[60px] bg-warn-bg border-2 border-warn rounded-full mx-auto mb-4
                           flex items-center justify-center text-[28px]"
              >
                ⚠
              </div>
              <h2 className="font-serif text-xl font-bold text-ink mb-1.5">
                You don't have access to this portal
              </h2>
              <p className="text-[13px] text-ink-soft leading-relaxed">
                You are signed in as <strong>{account?.username}</strong>,
                but your account isn't a member of any of the access groups
                for the Identity Onboarding Portal.
              </p>
            </div>

            <Alert kind="info">
              Contact your IT administrator and ask to be added to one of:
              <ul className="list-disc pl-5 mt-2 mb-0">
                <li><code>IDP-Onboarding-HRAdmins</code> — for HR staff</li>
                <li><code>IDP-Onboarding-Managers</code> — for reporting managers</li>
                <li><code>IDP-Onboarding-EndUsers</code> — for self-service</li>
              </ul>
            </Alert>

            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={onSignOut}
                className="gov-btn gov-btn-secondary"
              >
                Sign out
              </button>
            </div>

            {rawGroups?.length === 0 && (
              <p className="text-[11px] text-ink-soft mt-4 leading-relaxed">
                Tip for admins: if you see this even after being added to a
                group, your App Registration may be missing the "groups"
                token claim configuration. See <em>ENTRA_GROUPS_SETUP.md</em>.
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
