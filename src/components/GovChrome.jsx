import { NavLink, useLocation, Link } from 'react-router-dom';
import { useMsal, useAccount } from '@azure/msal-react';
import { useUserRole } from '../lib/roles';

// Government chrome -- top status bar, app header, role-appropriate nav.
//
// `variant` controls the tagline. The nav rail is role-aware so it
// shows the right links for whoever is signed in, regardless of which
// page they happen to be on.
//   variant: 'hr' | 'manager' | 'me' | 'login'
export default function GovChrome({ variant = 'hr' }) {
  return (
    <>
      <GovBar />
      <AppHeader variant={variant} />
      {variant !== 'login' && <RoleNav />}
    </>
  );
}

function GovBar() {
  return (
    <div className="bg-navy-dark px-8 py-1.5 flex items-center gap-2.5">
      <div
        aria-hidden="true"
        className="w-7 h-7 border-2 border-gold-light rounded-full flex items-center justify-center text-[11px] font-bold text-gold-light tracking-[0.5px]"
      >
        AU
      </div>
      <span className="text-slate1 text-[12px] tracking-[0.3px]">
        Australian Government &nbsp;|&nbsp; Department of Superheroes
      </span>
    </div>
  );
}

function AppHeader({ variant }) {
  const { homePath } = useUserRole();
  const tagline =
    variant === 'hr'      ? 'HR Administration System'
    : variant === 'manager' ? 'Manager Approvals'
    : variant === 'me'      ? 'Employee Self-Service'
    : 'Department of Superheroes -- Australian Government';

  // Home target -- when signed in, route the user to *their* role's home.
  const home = variant === 'login' ? '/' : (homePath || '/');

  return (
    <header className="bg-navy px-8 flex items-stretch justify-between border-b-[3px] border-gold-light">
      <Link
        to={home}
        aria-label="Go to home"
        className="flex items-center gap-3.5 py-[18px] no-underline hover:opacity-90 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-light rounded-sm"
      >
        <div
          aria-hidden="true"
          className="w-[38px] h-[38px] bg-gold-light rounded-md flex items-center justify-center font-serif text-lg font-bold text-navy-dark"
        >
          ID
        </div>
        <div>
          <h1 className="font-serif text-[17px] font-bold text-white tracking-[0.2px] m-0">
            Identity Onboarding Portal
          </h1>
          <p className="text-[11px] text-slate1 tracking-[0.4px] uppercase m-0">
            {tagline}
          </p>
        </div>
      </Link>
      {variant !== 'login' && <SignedInUser />}
    </header>
  );
}

function SignedInUser() {
  const { instance } = useMsal();
  const account = useAccount() || instance.getAllAccounts()[0];
  if (!account) return null;

  const displayName = account.name || account.username;
  const email = account.username;
  const initials = getInitials(displayName);

  const onSignOut = () => {
    instance
      .logoutRedirect({ postLogoutRedirectUri: window.location.origin })
      .catch((err) => console.error('Sign-out failed:', err));
  };

  return (
    <div className="flex items-center gap-3 py-[18px]">
      <div
        aria-hidden="true"
        className="w-8 h-8 rounded-full bg-navy-light border-[1.5px] border-slate1 flex items-center justify-center text-xs font-semibold text-slate1"
      >
        {initials}
      </div>
      <div className="leading-tight">
        <div className="text-[13px] text-white">{displayName}</div>
        <div className="text-[11px] text-slate1">{email}</div>
      </div>
      <button
        type="button"
        onClick={onSignOut}
        aria-label={'Sign out of Microsoft account ' + displayName}
        className="ml-3 text-[12px] uppercase tracking-[0.4px] text-white hover:text-gold-light border border-slate1 hover:border-gold-light rounded-sm px-3 py-2 transition-colors min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-light"
      >
        Sign out
      </button>
    </div>
  );
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const NAV_ITEM_CLS = 'bg-transparent border-0 cursor-pointer py-3 px-4 text-[13px] font-semibold tracking-[0.3px] border-b-[3px] whitespace-nowrap transition-colors no-underline min-h-[44px] inline-flex items-center focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold-light';
const NAV_ACTIVE = 'text-gold-light border-gold-light';
const NAV_INACTIVE = 'text-slate1 border-transparent hover:text-white';
const navItemClass = ({ isActive }) => NAV_ITEM_CLS + ' ' + (isActive ? NAV_ACTIVE : NAV_INACTIVE);

// Single role-aware nav rail. Items shown follow the user's actual
// roles, not the page they happen to be on -- which is what makes
// the "Home" link reliably take a Manager to /manager/dashboard, etc.
function RoleNav() {
  const { isHRAdmin, isManager, isPSO, isEndUser, homePath } = useUserRole();
  return (
    <nav aria-label="Sections" className="bg-navy-light px-8 flex gap-0.5 overflow-x-auto">
      <NavLink to={homePath} end className={navItemClass}>Home</NavLink>

      {isHRAdmin && (
        <>
          <NavLink to="/hr/new" className={navItemClass}>HR &middot; Submit Email</NavLink>
          <NavLink to="/hr/identities" className={navItemClass}>HR &middot; Identities</NavLink>
          <NavLink to="/hr/termination" className={navItemClass}>HR &middot; Termination</NavLink>
          <ReissueNavLink />
        </>
      )}

      {(isManager || isHRAdmin) && (
        <NavLink to="/manager/dashboard" className={navItemClass}>Manager &middot; Approvals</NavLink>
      )}

      {(isPSO || isHRAdmin) && (
        <NavLink to="/security/clearances" className={navItemClass}>Security &middot; Clearances</NavLink>
      )}

      {(isEndUser || isManager || isPSO || isHRAdmin) && (
        <NavLink to="/me" className={navItemClass}>My Details</NavLink>
      )}
    </nav>
  );
}

function ReissueNavLink() {
  const loc = useLocation();
  const isActive = loc.pathname.startsWith('/hr/reissue');
  const cls = NAV_ITEM_CLS + ' ' + (isActive ? NAV_ACTIVE : NAV_INACTIVE);
  return (
    <NavLink to="/hr/reissue" className={cls}>
      HR &middot; Reissue Link
    </NavLink>
  );
}
