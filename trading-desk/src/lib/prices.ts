/**
 * Real-time price feeds
 * Uses CoinGecko free API (no key required)
 */

export interface PriceData {
  price: number;
  change24h: number;
  timestamp: number;
}

export interface HistoricalPrice {
  time: number; // Unix timestamp in seconds
  value: number;
}

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

/**
 * Get current ETH price in USD
 */
export async function getEthPrice(): Promise<PriceData> {
  try {
    const res = await fetch(
      `${COINGECKO_BASE}/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true`
    );

    if (!res.ok) {
      throw new Error(`CoinGecko API error: ${res.status}`);
    }

    const data = await res.json();

    return {
      price: data.ethereum.usd,
      change24h: data.ethereum.usd_24h_change || 0,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('Failed to fetch ETH price:', error);
    // Return fallback price if API fails
    return {
      price: 3200,
      change24h: 0,
      timestamp: Date.now(),
    };
  }
}

/**
 * Get ETH price history for the last N days
 * CoinGecko free tier: 1 day = 5-minute intervals
 */
export async function getEthPriceHistory(days: number = 1): Promise<HistoricalPrice[]> {
  try {
    const res = await fetch(
      `${COINGECKO_BASE}/coins/ethereum/market_chart?vs_currency=usd&days=${days}`
    );

    if (!res.ok) {
      throw new Error(`CoinGecko API error: ${res.status}`);
    }

    const data = await res.json();

    // CoinGecko returns [timestamp_ms, price] pairs
    return data.prices.map(([timestamp, price]: [number, number]) => ({
      time: Math.floor(timestamp / 1000), // Convert to seconds for lightweight-charts
      value: price,
    }));
  } catch (error) {
    console.error('Failed to fetch ETH price history:', error);
    return generateFallbackHistory();
  }
}

/**
 * Generate fallback price history if API fails
 */
function generateFallbackHistory(): HistoricalPrice[] {
  const data: HistoricalPrice[] = [];
  const basePrice = 3200;
  const now = Math.floor(Date.now() / 1000);

  // Generate 24 hours of 5-minute candles
  for (let i = 288; i >= 0; i--) {
    const time = now - i * 300; // 5-minute intervals
    const randomWalk = (Math.random() - 0.48) * 15;
    const trend = (288 - i) * 0.1;
    const price = basePrice + trend + randomWalk + Math.sin(i / 20) * 30;
    data.push({ time, value: price });
  }

  return data;
}
