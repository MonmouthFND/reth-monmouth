import { useState, useEffect, useCallback } from 'react';
import {
  publicClient,
  getBalance,
  getEscrowCount,
  getTotalLocked,
  watchEscrowEvents,
  createEscrow,
  claimEscrow,
  deliverEscrow,
  releaseEscrow,
  TEST_ACCOUNTS,
  ESCROW_ADDRESS,
  type EscrowEvent,
} from '../lib/monmouth';
import type { Hash } from 'viem';

export interface ChainStatus {
  connected: boolean;
  chainId: number | null;
  blockNumber: bigint | null;
  escrowCount: bigint;
  totalLocked: string;
}

export interface AgentBalances {
  trader: string;
  research: string;
}

export function useChainStatus() {
  const [status, setStatus] = useState<ChainStatus>({
    connected: false,
    chainId: null,
    blockNumber: null,
    escrowCount: 0n,
    totalLocked: '0',
  });

  useEffect(() => {
    let mounted = true;

    async function checkStatus() {
      try {
        const chainId = await publicClient.getChainId();
        const blockNumber = await publicClient.getBlockNumber();
        const escrowCount = await getEscrowCount();
        const totalLocked = await getTotalLocked();

        if (mounted) {
          setStatus({
            connected: true,
            chainId,
            blockNumber,
            escrowCount,
            totalLocked,
          });
        }
      } catch (error) {
        console.error('Failed to connect to chain:', error);
        if (mounted) {
          setStatus((prev) => ({ ...prev, connected: false }));
        }
      }
    }

    checkStatus();
    const interval = setInterval(checkStatus, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return status;
}

export function useAgentBalances() {
  const [balances, setBalances] = useState<AgentBalances>({
    trader: '0',
    research: '0',
  });

  const refresh = useCallback(async () => {
    try {
      const [trader, research] = await Promise.all([
        getBalance(TEST_ACCOUNTS.trader.address),
        getBalance(TEST_ACCOUNTS.research.address),
      ]);
      setBalances({ trader, research });
    } catch (error) {
      console.error('Failed to fetch balances:', error);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { balances, refresh };
}

export function useEscrowEvents() {
  const [events, setEvents] = useState<EscrowEvent[]>([]);

  useEffect(() => {
    const unwatch = watchEscrowEvents((event) => {
      setEvents((prev) => [event, ...prev].slice(0, 50)); // Keep last 50 events
    });

    return () => unwatch();
  }, []);

  return events;
}

export function useEscrowActions() {
  const [loading, setLoading] = useState(false);
  const [lastTx, setLastTx] = useState<Hash | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(
    async (jobDescription: string, amountEth: string, timeoutSeconds: number) => {
      setLoading(true);
      setError(null);
      try {
        const hash = await createEscrow(
          TEST_ACCOUNTS.research.address,
          jobDescription,
          amountEth,
          timeoutSeconds
        );
        setLastTx(hash);
        await publicClient.waitForTransactionReceipt({ hash });
        return hash;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create escrow');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const claim = useCallback(async (escrowId: bigint) => {
    setLoading(true);
    setError(null);
    try {
      const hash = await claimEscrow(escrowId);
      setLastTx(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim escrow');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deliver = useCallback(async (escrowId: bigint, result: string) => {
    setLoading(true);
    setError(null);
    try {
      const hash = await deliverEscrow(escrowId, result);
      setLastTx(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deliver escrow');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const release = useCallback(async (escrowId: bigint) => {
    setLoading(true);
    setError(null);
    try {
      const hash = await releaseEscrow(escrowId);
      setLastTx(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to release escrow');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    create,
    claim,
    deliver,
    release,
    loading,
    lastTx,
    error,
  };
}

// Export contract address for linking
export { ESCROW_ADDRESS, TEST_ACCOUNTS };
