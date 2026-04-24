import { PublicClientApplication, EventType } from '@azure/msal-browser';

// Same Entra app registration that the Identity Proofing Solution uses,
// so HR staff get the same single-sign-on experience across both apps.
// Override per-deployment by setting VITE_ENTRA_TENANT_ID and
// VITE_ENTRA_CLIENT_ID in Vercel (or .env.local for local dev).
const TENANT_ID =
  import.meta.env.VITE_ENTRA_TENANT_ID || 'a3a371db-020d-48f0-8410-b59ac56ccc3e';
const CLIENT_ID =
  import.meta.env.VITE_ENTRA_CLIENT_ID || '131f0637-b48c-475b-894f-588e501aa42e';

export const LOGIN_REQUEST = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
  prompt: 'select_account',
};

export const msalInstance = new PublicClientApplication({
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
    navigateToLoginRequestUrl: false,
  },
  cache: {
    // localStorage (not sessionStorage) so the session survives page
    // navigations cleanly and isn't lost between popup window and main
    // window contexts.
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
});

// Initialise — required in msal-browser v3+ before any other call.
// We surface a promise so the React provider can await it.
export const msalReady = msalInstance.initialize().then(() => {
  // Hydrate active account from cache so useAccount() / AuthenticatedTemplate
  // report the right state on the very first render after a refresh.
  try {
    const accounts = msalInstance.getAllAccounts();
    console.log('[MSAL] init complete. cached accounts:', accounts.length, accounts.map(a => a.username));
    if (accounts.length > 0 && !msalInstance.getActiveAccount()) {
      msalInstance.setActiveAccount(accounts[0]);
      console.log('[MSAL] set active account:', accounts[0].username);
    }
  } catch (err) {
    console.error('[MSAL] failed to hydrate active account', err);
  }

  // Keep activeAccount in sync after a successful login or token acquisition.
  msalInstance.addEventCallback((event) => {
    try {
      console.log('[MSAL] event:', event.eventType, event.payload?.account?.username);
      if (
        (event.eventType === EventType.LOGIN_SUCCESS ||
          event.eventType === EventType.ACQUIRE_TOKEN_SUCCESS) &&
        event.payload &&
        event.payload.account
      ) {
        msalInstance.setActiveAccount(event.payload.account);
      }
      if (event.eventType === EventType.LOGOUT_SUCCESS) {
        msalInstance.setActiveAccount(null);
      }
    } catch (err) {
      console.error('[MSAL] event callback error', err);
    }
  });
});
