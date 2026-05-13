import { useEffect } from 'react';
import GovChrome from './GovChrome';
import SkipLink from './SkipLink';

// Generic staff (non-HR) layout. The chrome's nav is role-aware now, so
// the same shell works for /manager/* and /me -- the `variant` prop just
// controls the header tagline.
//   variant: 'manager' (default) | 'me'
export default function ManagerLayout({ children, pageTitle, variant = 'manager' }) {
  useEffect(() => {
    if (pageTitle) {
      document.title = pageTitle + ' -- Identity Onboarding Portal';
    }
  }, [pageTitle]);

  return (
    <div className="min-h-screen">
      <SkipLink />
      <GovChrome variant={variant} />
      <main id="main-content" tabIndex={-1} className="px-8 py-8 max-w-[1120px] mx-auto focus:outline-none">
        {children}
      </main>
    </div>
  );
}
