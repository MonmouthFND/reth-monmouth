import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { config } from './wagmi'
import App from './App'

// Mock wagmi hooks
vi.mock('wagmi', async () => {
  const actual = await vi.importActual('wagmi')
  return {
    ...actual,
    useAccount: () => ({ address: undefined, isConnected: false }),
    useConnect: () => ({ connect: vi.fn(), connectors: [], isPending: false }),
    useDisconnect: () => ({ disconnect: vi.fn() }),
    useBalance: () => ({ data: undefined }),
  }
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
})

const renderApp = () => {
  return render(
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  )
}

describe('App', () => {
  it('should render the app title', () => {
    renderApp()
    expect(screen.getByText('Porto Test App')).toBeInTheDocument()
  })

  it('should show "Not connected" when wallet is not connected', () => {
    renderApp()
    expect(screen.getByText('Not connected')).toBeInTheDocument()
  })

  it('should render the connection card', () => {
    renderApp()
    expect(screen.getByText('Connection')).toBeInTheDocument()
  })
})
