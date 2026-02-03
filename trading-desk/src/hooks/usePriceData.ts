/**
 * usePriceData Hook
 *
 * Fetches real ETH price data and generates trade markers from escrow events.
 */

import { useState, useEffect, useCallback } from 'react';
import { LineData, Time } from 'lightweight-charts';
import { getEthPrice, getEthPriceHistory } from '../lib/prices';
import type { EscrowEvent } from '../lib/monmouth';
import type { TradeMarker } from '../components/Chart/PriceChart';

export interface UsePriceDataReturn {
  priceData: LineData[];
  currentPrice: number;
  priceChange24h: number;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function usePriceData(): UsePriceDataReturn {
  const [priceData, setPriceData] = useState<LineData[]>([]);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [priceChange24h, setPriceChange24h] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPriceData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch current price and history in parallel
      const [current, history] = await Promise.all([
        getEthPrice(),
        getEthPriceHistory(1), // Last 24 hours
      ]);

      setCurrentPrice(current.price);
      setPriceChange24h(current.change24h);

      // Convert to LineData format
      const lineData: LineData[] = history.map((point) => ({
        time: point.time as Time,
        value: point.value,
      }));

      setPriceData(lineData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch price data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchPriceData();
  }, [fetchPriceData]);

  // Poll for current price every 30 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const current = await getEthPrice();
        setCurrentPrice(current.price);
        setPriceChange24h(current.change24h);

        // Append new price point to chart
        setPriceData((prev) => {
          if (prev.length === 0) return prev;

          const nowSeconds = Math.floor(Date.now() / 1000);
          const lastTime = prev[prev.length - 1]?.time as number;

          // Only add if enough time has passed (5 min intervals)
          if (nowSeconds - lastTime >= 300) {
            return [...prev.slice(1), { time: nowSeconds as Time, value: current.price }];
          }

          // Update the last point
          return [...prev.slice(0, -1), { time: lastTime as Time, value: current.price }];
        });
      } catch (err) {
        console.error('Price update failed:', err);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return {
    priceData,
    currentPrice,
    priceChange24h,
    isLoading,
    error,
    refresh: fetchPriceData,
  };
}

/**
 * Generate trade markers from escrow events
 * Maps escrow lifecycle to chart markers
 */
export function useTradeMarkers(
  escrowEvents: EscrowEvent[],
  priceData: LineData[]
): TradeMarker[] {
  const [markers, setMarkers] = useState<TradeMarker[]>([]);

  useEffect(() => {
    if (priceData.length === 0 || escrowEvents.length === 0) {
      setMarkers([]);
      return;
    }

    const newMarkers: TradeMarker[] = [];

    for (const event of escrowEvents) {
      // Find the closest price point to this event
      const eventTime = Math.floor(Date.now() / 1000); // Approximate - ideally use block timestamp
      const closestPoint = findClosestPricePoint(priceData, eventTime);

      if (!closestPoint) continue;

      switch (event.type) {
        case 'created':
          // Escrow created = funds committed (potential buy signal)
          newMarkers.push({
            time: closestPoint.time,
            position: 'belowBar',
            color: '#00D4FF', // Cyan for escrow creation
            shape: 'circle',
            text: `Escrow #${event.escrowId}`,
            type: 'buy',
          });
          break;

        case 'released':
          // Payment released = trade executed successfully
          newMarkers.push({
            time: closestPoint.time,
            position: 'belowBar',
            color: '#82D173', // Green for successful trade
            shape: 'arrowUp',
            text: `Trade #${event.escrowId}`,
            type: 'buy',
          });
          break;

        case 'expired':
          // Escrow expired = trade failed/cancelled
          newMarkers.push({
            time: closestPoint.time,
            position: 'aboveBar',
            color: '#FF2244', // Red for failed
            shape: 'arrowDown',
            text: `Expired #${event.escrowId}`,
            type: 'sell',
          });
          break;
      }
    }

    // Sort by time and dedupe
    const uniqueMarkers = newMarkers
      .sort((a, b) => (a.time as number) - (b.time as number))
      .filter(
        (marker, idx, arr) =>
          idx === 0 || marker.time !== arr[idx - 1].time || marker.type !== arr[idx - 1].type
      );

    setMarkers(uniqueMarkers);
  }, [escrowEvents, priceData]);

  return markers;
}

/**
 * Find the price point closest to a given timestamp
 */
function findClosestPricePoint(priceData: LineData[], targetTime: number): LineData | null {
  if (priceData.length === 0) return null;

  let closest = priceData[0];
  let minDiff = Math.abs((closest.time as number) - targetTime);

  for (const point of priceData) {
    const diff = Math.abs((point.time as number) - targetTime);
    if (diff < minDiff) {
      minDiff = diff;
      closest = point;
    }
  }

  // If closest point is too far (> 1 hour), use the last point
  if (minDiff > 3600) {
    return priceData[priceData.length - 1];
  }

  return closest;
}
