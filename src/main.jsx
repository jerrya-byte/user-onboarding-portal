import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MsalProvider } from '@azure/msal-react';
import './index.css';
import App from './App.jsx';
import { msalInstance, msalReady } from './lib/msal.js';

// Detect: are we running inside the MSAL auth popup?
//   - window.opener is set when this window was opened by another window
//     (loginPopup uses window.open, which sets opener)
//   - The auth response from Microsoft arrives in the URL hash or query
//     (?code=… / #code=… / ?error=… / #state=…)
// If both are true, this tab IS the popup and we MUST NOT mount the SPA.
// Mounting React would let React Router immediately redirect "/" to
// "/hr/dashboard", which strips the auth params off the URL before MSAL's
// opener-side polling can read them — producing the exact "popup loops
// back to login screen" symptom we hit. Instead, just initialize MSAL;
// its popup client will detect the response and hand it back to the
// opener via BroadcastChannel / URL polling, then close this window.
const isAuthPopup =
  typeof window !== 'undefined' &&
  window.opener != null &&
  window.opener !== window &&
  (window.location.hash.length > 1 ||
    /[?&](code|error|state)=/.test(window.location.search) ||
    /[#&](code|error|state)=/.test(window.location.hash));

if (isAuthPopup) {
  console.log('[main] detected MSAL auth popup — skipping SPA render');
  msalReady.catch((err) =>
    console.error('[main] popup MSAL init failed:', err)
  );
} else {
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
