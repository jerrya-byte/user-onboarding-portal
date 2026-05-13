import { useEffect } from 'react';
import GovChrome from './GovChrome';
import SkipLink from './SkipLink';

// Mirror of HRLayout but with manager navigation chrome.
export default function ManagerLayout({ children, pageTitle }) {
  useEffect(() => {
    if (pageTitle) {
      document.title = `${pageTitle} — Identity Onboarding Portal`;
    }
  }, [pageTitle]);

  return (
    <div className="min-h-screen">
      <SkipLink />
      <GovChrome variant="manager" />
      <main id="main-content" tabIndex={-1} className="px-8 py-8 max-w-[1120px] mx-auto focus:outline-none">
        {children}
      </main>
    </div>
  );
}
