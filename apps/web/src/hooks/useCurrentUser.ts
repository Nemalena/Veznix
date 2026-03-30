import { useEffect, useState } from 'react';
import { useMsal } from '@azure/msal-react';

export function useCurrentUser() {
  const { instance, accounts, inProgress } = useMsal();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    async function getToken() {
      if (accounts.length > 0) {
        try {
          const response = await instance.acquireTokenSilent({
            scopes: ["User.Read"],
            account: accounts[0]
          });
          setToken(response.accessToken);
        } catch (error) {
          console.warn('Silent token aquisition failed. Falling back to interaction.', error);
          if (inProgress === 'none') {
             // In severe cases you might trigger interaction, but usually msal handles redirects
             instance.acquireTokenRedirect({ scopes: ["User.Read"]});
          }
        }
      }
    }
    getToken();
  }, [accounts, instance, inProgress]);

  return {
    account: accounts[0] || null,
    token,
    isAuthenticated: accounts.length > 0,
    inProgress
  };
}
