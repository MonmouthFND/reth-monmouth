import { describe, it, expect } from 'vitest'
import { config } from './wagmi'

describe('wagmi config', () => {
  it('should have baseSepolia chain configured', () => {
    expect(config.chains).toBeDefined()
    expect(config.chains.length).toBeGreaterThan(0)
    expect(config.chains[0].id).toBe(84532) // Base Sepolia chain ID
  })

  it('should have porto connector', () => {
    expect(config.connectors).toBeDefined()
    expect(config.connectors.length).toBeGreaterThan(0)
  })

  it('should have transport for baseSepolia', () => {
    expect(config._internal.transports[84532]).toBeDefined()
  })
})
