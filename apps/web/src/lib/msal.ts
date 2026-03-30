import { PublicClientApplication, Configuration, RedirectRequest } from "@azure/msal-browser";

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_ENTRA_CLIENT_ID || "replace-with-client-id",
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_ENTRA_TENANT_ID || "common"}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

// Initialize happens as soon as this file loads
msalInstance.initialize().catch(err => console.error('MSAL init failed', err));

export const loginRequest: RedirectRequest = {
  scopes: ["User.Read"] // Scopes to ask from Entra during sign-in
};
