import { useEffect, useRef } from 'react';
import Chart, { ChartConfiguration, ChartType } from 'chart.js/auto';

interface ChartCanvasProps<TType extends ChartType = ChartType> {
  config: ChartConfiguration<TType>;
  isDark: boolean;
  heightClass?: string;
  ariaLabel: string;
}

export function ChartCanvas<TType extends ChartType = ChartType>({
  config,
  isDark,
  heightClass = 'h-72',
  ariaLabel,
}: ChartCanvasProps<TType>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const textColor = isDark ? '#E5E5E5' : '#262626';
    const mutedColor = isDark ? '#A3A3A3' : '#525252';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.07)';
    const tooltipBg = isDark ? '#171717' : '#0B0B0C';

    Chart.defaults.color = mutedColor;
    Chart.defaults.font.family = "'Public Sans', system-ui, sans-serif";
    Chart.defaults.font.size = 11;

    const rawConfig = config as ChartConfiguration;
    const rawOptions = (rawConfig.options ?? {}) as Record<string, unknown>;
    const rawPlugins = (rawOptions.plugins ?? {}) as Record<string, unknown>;
    const rawLegend = (rawPlugins.legend ?? {}) as Record<string, unknown>;
    const rawTooltip = (rawPlugins.tooltip ?? {}) as Record<string, unknown>;
    const rawScales = rawOptions.scales as
      | Record<string, Record<string, unknown> | undefined>
      | undefined;

    const mergedScales = rawScales
      ? Object.fromEntries(
          Object.entries(rawScales).map(([key, scale]) => {
            if (!scale) return [key, scale];
            const existingGrid = (scale.grid ?? {}) as Record<string, unknown>;
            const existingTicks = (scale.ticks ?? {}) as Record<string, unknown>;
            const existingTitle = scale.title as Record<string, unknown> | undefined;
            return [
              key,
              {
                ...scale,
                grid: {
                  color: gridColor,
                  ...existingGrid,
                },
                ticks: {
                  color: mutedColor,
                  font: {
                    family: "'IBM Plex Mono', monospace",
                    size: 11,
                  },
                  ...existingTicks,
                },
                ...(existingTitle
                  ? {
                      title: {
                        color: textColor,
                        font: {
                          family: "'Public Sans', system-ui, sans-serif",
                          size: 11,
                          weight: 600,
                        },
                        ...existingTitle,
                      },
                    }
                  : {}),
              },
            ];
          })
        )
      : undefined;

    const mergedConfig: ChartConfiguration = {
      ...rawConfig,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 200,
        },
        ...rawOptions,
        plugins: {
          ...rawPlugins,
          legend: {
            labels: {
              color: textColor,
              boxWidth: 10,
              boxHeight: 10,
              padding: 14,
              font: {
                family: "'Public Sans', system-ui, sans-serif",
                size: 11,
                weight: 500,
              },
            },
            ...rawLegend,
          },
          tooltip: {
            backgroundColor: tooltipBg,
            titleColor: '#FFC800',
            bodyColor: '#FFFFFF',
            borderColor: 'rgba(255, 200, 0, 0.35)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 6,
            titleFont: {
              family: "'Plus Jakarta Sans', system-ui, sans-serif",
              size: 12,
              weight: 600,
            },
            bodyFont: {
              family: "'IBM Plex Mono', monospace",
              size: 11,
            },
            ...rawTooltip,
          },
        },
        ...(mergedScales ? { scales: mergedScales } : {}),
      } as ChartConfiguration['options'],
    };

    chartRef.current = new Chart(canvas, mergedConfig);

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [config, isDark]);

  return (
    <div className={`relative w-full ${heightClass}`}>
      <canvas ref={canvasRef} aria-label={ariaLabel} role="img" />
    </div>
  );
}
