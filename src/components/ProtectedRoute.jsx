import {
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
  useMsal,
} from '@azure/msal-react';
import LoginScreen from './LoginScreen';
import NoAccess from './NoAccess';
import { useUserRole, isAuthorizedFor } from '../lib/roles';

// Wrap any route element that should require Microsoft sign-in.
// Pass `requiredRoles` to additionally enforce EntraID-group-based RBAC.
// If `requiredRoles` is omitted, any signed-in user can view the page
// (subject to the dev-mode fallback in useUserRole when no group GUIDs
// are configured).
export default function ProtectedRoute({ children, requiredRoles }) {
  const { inProgress } = useMsal();

  if (inProgress === 'startup' || inProgress === 'handleRedirect') {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-soft text-sm">
        Loading...
      </div>
    );
  }

  return (
    <>
      <AuthenticatedTemplate>
        <RoleGuard requiredRoles={requiredRoles}>{children}</RoleGuard>
      </AuthenticatedTemplate>
      <UnauthenticatedTemplate>
        <LoginScreen />
      </UnauthenticatedTemplate>
    </>
  );
}

function RoleGuard({ children, requiredRoles }) {
  const { roles, hasAccess, rbacDisabled } = useUserRole();
  // RBAC disabled (no group GUIDs configured) -> preserve old behaviour:
  // any authed user gets in. The useUserRole hook returns full roles in
  // that case so `hasAccess` is true.
  if (rbacDisabled) return children;
  if (!hasAccess) return <NoAccess />;
  if (!isAuthorizedFor(roles, requiredRoles)) return <NoAccess />;
  return children;
}
