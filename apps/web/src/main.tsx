import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, AUTH_UNAUTHORIZED_EVENT } from './features/auth/AuthContext';
import { App } from './App';
import './index.css';

// Global fetch interceptor to catch 401 Unauthorized responses across the application
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  if (response.status === 401) {
    const rawUrl =
      typeof args[0] === 'string'
        ? args[0]
        : args[0] instanceof URL
        ? args[0].href
        : (args[0] as Request)?.url || '';
    // Exclude unauthenticated auth handshake endpoints like request-otp
    if (!rawUrl.includes('/auth/request-otp') && !rawUrl.includes('/auth/verify-otp')) {
      window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT));
    }
  }
  return response;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchOnWindowFocus: true,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
