import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource-variable/manrope'
import './index.css'
import App from './App'
import { Gate } from './components/Gate'
import { InstallPrompt } from './components/InstallPrompt'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Gate>
        <App />
      </Gate>
      <InstallPrompt />
    </QueryClientProvider>
  </StrictMode>,
)
