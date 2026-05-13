// Role-based access control, driven by EntraID security groups.
//
// On the Entra side, the admin creates three security groups (HR Admins,
// Managers, End Users) and configures the App Registration's "Token
// configuration" → "Groups claim" to emit group Object IDs in the ID
// token. Each group's Object ID is then dropped into a Vercel env var:
//
//   VITE_GROUP_HR_ADMINS   — full-control admins
//   VITE_GROUP_MANAGERS    — approve onboarding submissions, manage reportees
//   VITE_GROUP_END_USERS   — self-service: update own attributes
//
// At runtime we read `account.idTokenClaims.groups` (an array of GUIDs)
// and intersect it with the three configured GUIDs to derive roles.
//
// Backwards compatibility: if NONE of the env vars are set, the app runs
// in "dev mode" — any signed-in user is treated as having full access.
// This keeps the existing demo working without forcing the Entra-side
// configuration first.

import { useAccount, useMsal } from '@azure/msal-react';

export const ROLES = Object.freeze({
  HR_ADMIN: 'HR_ADMIN',
  MANAGER:  'MANAGER',
  END_USER: 'END_USER',
});

const GROUP_HR_ADMINS = (import.meta.env.VITE_GROUP_HR_ADMINS || '').trim();
const GROUP_MANAGERS  = (import.meta.env.VITE_GROUP_MANAGERS  || '').trim();
const GROUP_END_USERS = (import.meta.env.VITE_GROUP_END_USERS || '').trim();

// True when no group GUIDs are configured at all — RBAC is effectively
// disabled and the app falls back to its pre-RBAC behaviour.
export const RBAC_DISABLED =
  !GROUP_HR_ADMINS && !GROUP_MANAGERS && !GROUP_END_USERS;

// Default landing page per role. HR_ADMIN wins if a user is in multiple
// groups, since they have the broadest access.
const ROLE_HOME = {
  [ROLES.HR_ADMIN]: '/hr/dashboard',
  [ROLES.MANAGER]:  '/manager/dashboard',
  [ROLES.END_USER]: '/me',
};

const PRIORITY = [ROLES.HR_ADMIN, ROLES.MANAGER, ROLES.END_USER];

function rolesFromGroups(groupIds) {
  if (!Array.isArray(groupIds)) return [];
  const set = new Set(groupIds.map((g) => String(g).toLowerCase()));
  const out = [];
  if (GROUP_HR_ADMINS && set.has(GROUP_HR_ADMINS.toLowerCase())) out.push(ROLES.HR_ADMIN);
  if (GROUP_MANAGERS  && set.has(GROUP_MANAGERS.toLowerCase()))  out.push(ROLES.MANAGER);
  if (GROUP_END_USERS && set.has(GROUP_END_USERS.toLowerCase())) out.push(ROLES.END_USER);
  return out;
}

/**
 * Hook returning the signed-in user's account + derived roles.
 *
 * Use the boolean flags (isHRAdmin / isManager / isEndUser / hasAccess)
 * for conditional rendering; use `homePath` for "Home" navigation that
 * lands the user on the right page for their role.
 */
export function useUserRole() {
  const { instance } = useMsal();
  const account = useAccount() || instance.getAllAccounts()[0] || null;

  const claims = account?.idTokenClaims || {};
  // MSAL puts the groups claim (when emitted by Entra) on `groups`.
  // When a user is in > 200 groups Entra sends `_claim_names` instead
  // and the app would need a Graph call to resolve — we don't support
  // that here. For workforce scenarios this is virtually never an issue.
  const groups = claims.groups || [];

  const roles = RBAC_DISABLED
    ? [ROLES.HR_ADMIN, ROLES.MANAGER, ROLES.END_USER] // dev mode = full access
    : rolesFromGroups(groups);

  const primary = PRIORITY.find((r) => roles.includes(r)) || null;

  return {
    account,
    roles,
    primary,
    isHRAdmin: roles.includes(ROLES.HR_ADMIN),
    isManager: roles.includes(ROLES.MANAGER),
    isEndUser: roles.includes(ROLES.END_USER),
    hasAccess: roles.length > 0,
    homePath: primary ? ROLE_HOME[primary] : '/no-access',
    rbacDisabled: RBAC_DISABLED,
    // Surface the raw claim for debugging
    rawGroups: groups,
  };
}

export function isAuthorizedFor(userRoles, requiredRoles) {
  if (!requiredRoles || requiredRoles.length === 0) return true;
  return requiredRoles.some((r) => userRoles.includes(r));
}
