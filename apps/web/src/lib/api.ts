import { msalInstance, loginRequest } from './msal';

async function getAccessToken() {
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) return null;

  try {
    const response = await msalInstance.acquireTokenSilent({
      ...loginRequest,
      account: accounts[0]
    });
    return response.idToken;
  } catch (error) {
    console.error('Silent token acquisition failed', error);
    return null;
  }
}

export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const baseUrl = import.meta.env.VITE_API_URL || '/api';
  const token = await getAccessToken();
  console.log(`[apiFetch] endpoint: ${endpoint}, hasToken: ${!!token}, tokenStart: ${token?.substring(0, 10)}`);

  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  headers.set('Content-Type', 'application/json');

  // Ensure body is present for mutations if Content-Type is JSON
  const isMutation = ['POST', 'PATCH', 'PUT'].includes(options.method?.toUpperCase() || '');
  const body = options.body || (isMutation ? JSON.stringify({}) : undefined);

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers,
    body
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'An error occurred' }));
    throw new Error(error.message || 'API request failed');
  }

  return response.json();
}
