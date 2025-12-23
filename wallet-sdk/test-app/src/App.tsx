import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi'

function App() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { data: balance } = useBalance({ address })

  return (
    <div className="container">
      <h1>Porto Test App</h1>
      <p className="subtitle">Testing on Base Sepolia</p>

      <div className="card">
        <h2>Connection</h2>
        {isConnected ? (
          <>
            <div className="status connected">
              <span className="dot"></span>
              Connected
            </div>
            <div className="info">
              <p><strong>Address:</strong> {address}</p>
              <p><strong>Balance:</strong> {balance?.formatted} {balance?.symbol}</p>
            </div>
            <button onClick={() => disconnect()}>Disconnect</button>
          </>
        ) : (
          <>
            <div className="status">
              <span className="dot"></span>
              Not connected
            </div>
            {connectors.map((connector) => (
              <button
                key={connector.uid}
                onClick={() => connect({ connector })}
                disabled={isPending}
              >
                {isPending ? 'Connecting...' : `Connect with ${connector.name}`}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

export default App
