import { NavLink, useLocation } from 'react-router-dom';
import { useMsal, useAccount } from '@azure/msal-react';

// Gov bar + app header + screen nav (HR side only)
export default function GovChrome({ variant = 'hr' }) {
  return (
    <>
      <GovBar />
      <AppHeader variant={variant} />
      {variant === 'hr' && <HRNav />}
      {variant === 'manager' && <ManagerNav />}
    </>
  );
}

function GovBar() {
  return (
    <div className="bg-navy-dark px-8 py-1.5 flex items-center gap-2.5">
      <div
        aria-hidden="true"
        className="w-7 h-7 border-2 border-gold-light rounded-full flex items-center justify-center
                   text-[11px] font-bold text-gold-light tracking-[0.5px]"
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
  const tagline =
    variant === 'hr'
      ? 'HR Administration System'
      : variant === 'manager'
        ? 'Manager Approvals'
        : 'Department of Superheroes — Australian Government';
  return (
    <header
      className="bg-navy px-8 flex items-stretch justify-between border-b-[3px] border-gold-light"
    >
      <div className="flex items-center gap-3.5 py-[18px]">
        <div
          aria-hidden="true"
          className="w-[38px] h-[38px] bg-gold-light rounded-md flex items-center justify-center
                     font-serif text-lg font-bold text-navy-dark"
        >
          ID
        </div>
        <div>
          <h1 className="font-serif text-[17px] font-bold text-white tracking-[0.2px]">
            Identity Onboarding Portal
          </h1>
          <p className="text-[11px] text-slate1 tracking-[0.4px] uppercase">
            {tagline}
          </p>
        </div>
      </div>
      {(variant === 'hr' || variant === 'manager') && <SignedInUser />}
    </header>
  );
}

function SignedInUser() {
  const { instance } = useMsal();
  // Pass undefined (not null) so useAccount uses the active account.
  const account = useAccount() || instance.getAllAccounts()[0];

  if (!account) return null;

  const displayName = account.name || account.username;
  const email = account.username;
  const initials = getInitials(displayName);

  const onSignOut = () => {
    // Use logoutRedirect to match the loginRedirect flow — full-page
    // navigation to Microsoft's logout endpoint, then back to our origin
    // where the user will see the LoginScreen because they're signed out.
    instance
      .logoutRedirect({
        postLogoutRedirectUri: window.location.origin,
      })
      .catch((err) => {
        console.error('Sign-out failed:', err);
      });
  };

  return (
    <div className="flex items-center gap-3 py-[18px]">
      <div
        aria-hidden="true"
        className="w-8 h-8 rounded-full bg-navy-light border-[1.5px] border-slate1
                   flex items-center justify-center text-xs font-semibold text-slate1"
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
        aria-label={`Sign out of Microsoft account ${displayName}`}
        className="ml-3 text-[12px] uppercase tracking-[0.4px] text-white
                   hover:text-gold-light border border-slate1 hover:border-gold-light
                   rounded-sm px-3 py-2 transition-colors min-h-[44px]
                   focus-visible:outline-2 focus-visible:outline-offset-2
                   focus-visible:outline-gold-light"
      >
        Sign out
      </button>
    </div>
  );
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name
    .replace(/\(.*?\)/g, '') // strip "(External)" etc.
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function HRNav() {
  // Inactive items now use slate1 (#CBD5E1) on navy-light (#243654) — ~9.4:1
  // (was slate2 ~4.4:1 which failed 4.5:1). Active items keep gold-light.
  const navClass = ({ isActive }) =>
    `bg-transparent border-0 cursor-pointer py-3 px-4 text-[13px] font-semibold
     tracking-[0.3px] border-b-[3px] whitespace-nowrap transition-colors no-underline
     min-h-[44px] inline-flex items-center
     focus-visible:outline-2 focus-visible:outline-offset-[-2px]
     focus-visible:outline-gold-light ${
       isActive
         ? 'text-gold-light border-gold-light'
         : 'text-slate1 border-transparent hover:text-white'
     }`;
  return (
    <nav aria-label="HR sections" className="bg-navy-light px-8 flex gap-0.5 overflow-x-auto">
      <NavLink to="/hr/new" className={navClass}>HR · Submit Email</NavLink>
      <NavLink to="/hr/dashboard" className={navClass}>HR · Dashboard</NavLink>
      <NavLink to="/hr/identities" className={navClass}>HR · Identities</NavLink>
      <NavLink to="/hr/termination" className={navClass}>HR · Termination</NavLink>
      <ReissueNavLink />
      <NavLink to="/manager/dashboard" className={navClass}>Manager · Approvals</NavLink>
    </nav>
  );
}

function ManagerNav() {
  const navClass = ({ isActive }) =>
    `bg-transparent border-0 cursor-pointer py-3 px-4 text-[13px] font-semibold
     tracking-[0.3px] border-b-[3px] whitespace-nowrap transition-colors no-underline
     min-h-[44px] inline-flex items-center
     focus-visible:outline-2 focus-visible:outline-offset-[-2px]
     focus-visible:outline-gold-light ${
       isActive
         ? 'text-gold-light border-gold-light'
         : 'text-slate1 border-transparent hover:text-white'
     }`;
  return (
    <nav aria-label="Manager sections" className="bg-navy-light px-8 flex gap-0.5 overflow-x-auto">
      <NavLink to="/manager/dashboard" className={navClass}>Manager · Pending Approvals</NavLink>
    </nav>
  );
}

function ReissueNavLink() {
  const loc = useLocation();
  const isActive = loc.pathname.startsWith('/hr/reissue');
  return (
    <NavLink
      to="/hr/reissue"
      className={
        `bg-transparent border-0 cursor-pointer py-3 px-4 text-[13px] font-semibold
         tracking-[0.3px] border-b-[3px] whitespace-nowrap transition-colors no-underline
         min-h-[44px] inline-flex items-center
         focus-visible:outline-2 focus-visible:outline-offset-[-2px]
         focus-visible:outline-gold-light ${
           isActive
             ? 'text-gold-light border-gold-light'
             : 'text-slate1 border-transparent hover:text-white'
         }`
      }
    >
      HR · Reissue Link
    </NavLink>
  );
}
