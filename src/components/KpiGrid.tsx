export interface KpiItem {
  label: string;
  value: string;
  subtext: string;
  accent?: 'yellow' | 'orange' | 'neutral' | 'alert';
}

interface KpiGridProps {
  items: KpiItem[];
}

export function KpiGrid({ items }: KpiGridProps) {
  return (
    <section
      aria-label="Key Performance Indicators"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
    >
      {items.map((item) => {
        const valueColor =
          item.accent === 'orange'
            ? 'text-[#D96B0A] dark:text-[#F58220]'
            : item.accent === 'alert'
            ? 'text-[#C8191D] dark:text-[#FF6B6B]'
            : item.accent === 'yellow'
            ? 'text-neutral-950 dark:text-[#FFC800]'
            : 'text-neutral-950 dark:text-white';

        return (
          <div
            key={item.label}
            className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 flex flex-col justify-between gap-3"
          >
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              {item.label}
            </span>
            <div
              className={`font-mono text-2xl xl:text-[26px] font-semibold tracking-tight tabular-nums leading-none ${valueColor}`}
            >
              {item.value}
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums leading-snug">
              {item.subtext}
            </p>
          </div>
        );
      })}
    </section>
  );
}
