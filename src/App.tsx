import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, UNAUTHORIZED_EVENT } from './api';
import { ConfirmProvider } from './components/Confirm';
import { Layout } from './components/Layout';
import { QuickAddProvider } from './components/QuickAdd';
import { ErrorState, Loading } from './components/States';
import { ToastProvider } from './components/Toast';
import { AppointmentPage } from './pages/AppointmentPage';
import { CalendarPage } from './pages/CalendarPage';
import { ClientProfilePage } from './pages/ClientProfilePage';
import { ClientsPage } from './pages/ClientsPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SettingsPage } from './pages/SettingsPage';
import { TodayPage } from './pages/TodayPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** Shows the password screen when the server asks for it; otherwise the app. */
function AuthGate() {
  const client = useQueryClient();
  const session = useQuery({ queryKey: ['session'], queryFn: api.session, staleTime: Infinity });

  useEffect(() => {
    const onUnauthorized = () => client.setQueryData(['session'], { authRequired: true, authenticated: false });
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [client]);

  if (session.isPending) return <Loading label="Opening Veronica…" />;
  if (session.isError) return <ErrorState error={session.error} onRetry={() => session.refetch()} />;
  if (session.data.authRequired && !session.data.authenticated) return <LoginPage />;

  return (
    <ToastProvider>
      <ConfirmProvider>
        <QuickAddProvider>
          <ScrollToTop />
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<TodayPage />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="clients/:id" element={<ClientProfilePage />} />
              <Route path="appointments/:id" element={<AppointmentPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </QuickAddProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthGate />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
