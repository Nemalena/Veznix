import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from '@azure/msal-react'
import { Toaster } from 'sonner'
import { Dashboard } from '@/pages/Dashboard'
import { Tickets } from '@/pages/Tickets'
import { TicketDetail } from '@/pages/TicketDetail'
import { Templates } from '@/pages/Templates'
import { Settings } from '@/pages/Settings'
import { Users } from '@/pages/Users'
import { SentEmails } from '@/pages/SentEmails'
import { Layout } from '@/components/Layout/Layout'
import { ErrorBoundary } from '@/components/ErrorBoundary'

export function App() {
  const { instance, inProgress } = useMsal();

  const handleLogin = () => {
    instance.loginRedirect({ scopes: ["User.Read"] });
  };

  return (
    <>
      <Toaster position="top-right" richColors closeButton />
      <AuthenticatedTemplate>
        <BrowserRouter>
          <Routes>
            <Route element={<ErrorBoundary><Layout /></ErrorBoundary>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/tickets" element={<Tickets />} />
              <Route path="/tickets/:id" element={<TicketDetail />} />
              <Route path="/sent" element={<SentEmails />} />
              <Route path="/templates" element={<Templates />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/users" element={<Users />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthenticatedTemplate>

      <UnauthenticatedTemplate>
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <div className="text-center space-y-4 max-w-sm px-6">
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-6 text-primary-foreground shadow-lg shadow-primary/20">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-neutral-900">Veznix</h1>
            <p className="text-muted-foreground text-lg">Next-gen email ticketing for high-performance teams.</p>
            <div className="pt-4">
              {inProgress === 'login' ? (
                <div className="flex items-center justify-center gap-2 text-muted-foreground animate-pulse">
                  <div className="w-2 h-2 bg-primary rounded-full"></div>
                  <span>Logging in...</span>
                </div>
              ) : (
                <button
                  onClick={handleLogin}
                  className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-neutral-900 text-white rounded-xl hover:bg-neutral-800 font-semibold transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-neutral-200"
                >
                  <span>Sign in with Microsoft</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </UnauthenticatedTemplate>
    </>
  )
}
