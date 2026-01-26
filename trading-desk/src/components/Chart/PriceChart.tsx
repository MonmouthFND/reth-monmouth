import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, IChartApi, ISeriesApi, LineData, Time } from 'lightweight-charts';
import styles from './PriceChart.module.css';

export interface TradeMarker {
  time: Time;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown' | 'circle';
  text: string;
  type: 'buy' | 'sell';
}

interface MarkerPosition {
  x: number;
  y: number;
  marker: TradeMarker;
}

interface PriceChartProps {
  symbol: string;
  currentPrice: number;
  priceChange24h: number;
  priceData: LineData[];
  trades: TradeMarker[];
}

export function PriceChart({
  symbol,
  currentPrice,
  priceChange24h,
  priceData,
  trades,
}: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const [markerPositions, setMarkerPositions] = useState<MarkerPosition[]>([]);

  const isPriceUp = priceChange24h >= 0;

  // Calculate marker positions
  const updateMarkerPositions = useCallback(() => {
    if (!chartRef.current || !seriesRef.current || priceData.length === 0) return;

    const chart = chartRef.current;
    const series = seriesRef.current;
    const timeScale = chart.timeScale();

    const positions: MarkerPosition[] = [];

    for (const marker of trades) {
      const x = timeScale.timeToCoordinate(marker.time);
      if (x === null) continue;

      // Find the price at this time
      const dataPoint = priceData.find((d) => d.time === marker.time);
      if (!dataPoint) continue;

      const y = series.priceToCoordinate(dataPoint.value);
      if (y === null) continue;

      positions.push({
        x,
        y: marker.position === 'aboveBar' ? y - 40 : y + 10,
        marker,
      });
    }

    setMarkerPositions(positions);
  }, [trades, priceData]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;

    // Create chart with cyberpunk styling
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: 'rgba(255, 255, 255, 0.5)',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: 1, // Magnet mode
        vertLine: {
          color: 'rgba(16, 52, 166, 0.4)',
          width: 1,
          style: 2, // Dashed
          labelBackgroundColor: '#1034A6',
        },
        horzLine: {
          color: 'rgba(16, 52, 166, 0.4)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#1034A6',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        scaleMargins: {
          top: 0.15,
          bottom: 0.15,
        },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        vertTouchDrag: false,
      },
    });

    // Create line series with gradient
    const lineSeries = chart.addLineSeries({
      color: isPriceUp ? '#82D173' : '#FF66CC',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: '#ffffff',
      crosshairMarkerBackgroundColor: isPriceUp ? '#82D173' : '#FF66CC',
      priceLineVisible: true,
      priceLineWidth: 1,
      priceLineColor: isPriceUp ? '#82D17360' : '#FF66CC60',
      priceLineStyle: 2,
      lastValueVisible: true,
    });

    chartRef.current = chart;
    seriesRef.current = lineSeries;

    // Subscribe to visible range changes to update marker positions
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      updateMarkerPositions();
    });

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        const { clientWidth, clientHeight } = chartContainerRef.current;
        chartRef.current.applyOptions({
          width: clientWidth,
          height: clientHeight,
        });
        updateMarkerPositions();
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    handleResize();

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  // Update line color when price direction changes
  useEffect(() => {
    if (seriesRef.current) {
      seriesRef.current.applyOptions({
        color: isPriceUp ? '#82D173' : '#FF66CC',
        crosshairMarkerBackgroundColor: isPriceUp ? '#82D173' : '#FF66CC',
        priceLineColor: isPriceUp ? '#82D17360' : '#FF66CC60',
      });
    }
  }, [isPriceUp]);

  // Update data
  useEffect(() => {
    if (seriesRef.current && priceData.length > 0) {
      seriesRef.current.setData(priceData);

      // Fit content
      chartRef.current?.timeScale().fitContent();

      // Update marker positions after data change
      setTimeout(updateMarkerPositions, 50);
    }
  }, [priceData, updateMarkerPositions]);

  // Update markers when trades change
  useEffect(() => {
    updateMarkerPositions();
  }, [trades, updateMarkerPositions]);

  return (
    <div className={styles.container}>
      {/* Header overlay */}
      <div className={styles.header}>
        <div className={styles.leftSection}>
          <div className={styles.symbolRow}>
            <span className={styles.symbol}>{symbol}</span>
            <span className={`${styles.price} font-mono`}>
              ${currentPrice.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span
              className={`${styles.change} font-mono ${isPriceUp ? styles.up : styles.down}`}
            >
              {isPriceUp ? '+' : ''}
              {priceChange24h.toFixed(2)}%
            </span>
          </div>
          <div className={styles.legend}>
            <div className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: '#82D173' }} />
              <span>Buy</span>
            </div>
            <div className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: '#FF66CC' }} />
              <span>Sell</span>
            </div>
          </div>
        </div>
      </div>

      {/* Chart container */}
      <div ref={chartContainerRef} className={styles.chart}>
        {/* Custom trade markers overlay */}
        {markerPositions.map((pos, idx) => (
          <div
            key={idx}
            className={`${styles.tradeMarker} ${pos.marker.type === 'buy' ? styles.buyMarker : styles.sellMarker}`}
            style={{
              left: pos.x,
              top: pos.y,
            }}
          >
            <span className={styles.markerIcon}>
              {pos.marker.type === 'buy' ? '↑' : '↓'}
            </span>
            <span className={styles.markerLabel}>
              {pos.marker.type === 'buy' ? 'BUY' : 'SELL'}
            </span>
            <span className={styles.markerAmount}>{pos.marker.text}</span>
          </div>
        ))}
      </div>

      {/* Glow effect at bottom */}
      <div
        className={styles.bottomGlow}
        style={{
          background: `radial-gradient(ellipse 50% 100% at 50% 100%, ${
            isPriceUp ? 'rgba(130, 209, 115, 0.15)' : 'rgba(255, 102, 204, 0.15)'
          }, transparent)`,
        }}
      />
    </div>
  );
}
