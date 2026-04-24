import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MsalProvider } from '@azure/msal-react';
import './index.css';
import App from './App.jsx';
import { msalInstance, msalReady } from './lib/msal.js';

// Boot marker — bump this string whenever main.jsx changes so we can
// confirm in the browser console that the latest bundle is live.
console.log('[main] boot v3 (popup-skip, aggressive)');

// Detect: are we running inside the MSAL auth popup?
// We deliberately use the broadest possible test — any window that has
// an opener (i.e. was opened by another window) is treated as a popup
// and the SPA is NOT mounted. The URL-param refinement we tried before
// proved unreliable because by the time main.jsx runs the URL hash can
// already be empty in some browsers.
//
// False positives would only matter if we ever opened the app from
// another tab via window.open — which we don't, so this is safe.
//
// Why this matters: if React mounts inside the popup, React Router's
// "/" → "/hr/dashboard" redirect strips the auth params off the URL
// before MSAL's opener-side polling can read them, producing the
// BrowserAuthError: timed_out we've been hitting.
const isAuthPopup =
  typeof window !== 'undefined' &&
  window.opener != null &&
  window.opener !== window;

if (isAuthPopup) {
  console.log('[main] detected MSAL auth popup — skipping SPA render');
  // Initialise MSAL so its popup client can pick up the auth response
  // and hand it back to the opener via BroadcastChannel / URL polling.
  msalReady.catch((err) =>
    console.error('[main] popup MSAL init failed:', err)
  );
} else {
  console.log('[main] main window — mounting SPA');
  msalReady.then(() => {
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <MsalProvider instance={msalInstance}>
          <App />
        </MsalProvider>
      </StrictMode>
    );
  });
}
