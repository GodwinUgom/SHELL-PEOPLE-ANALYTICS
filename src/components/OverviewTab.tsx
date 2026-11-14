import { useMemo } from 'react';
import { ChartConfiguration } from 'chart.js/auto';
import { ScoredEmployee } from '../types/employee';
import {
  formatGBP,
  formatNumber,
  formatPct,
  groupByField,
} from '../utils/analytics';
import { ChartCanvas } from './ChartCanvas';
import { KpiGrid, KpiItem } from './KpiGrid';

interface OverviewTabProps {
  employees: ScoredEmployee[];
  isDark: boolean;
}

export function OverviewTab({ employees, isDark }: OverviewTabProps) {
  const kpis = useMemo<KpiItem[]>(() => {
    const total = employees.length;
    const active = employees.filter((e) => e.Attrition === 'No');
    const leavers = employees.filter((e) => e.Attrition === 'Yes');
    const attritionRate = total > 0 ? (leavers.length / total) * 100 : 0;
    const retentionRate = total > 0 ? (active.length / total) * 100 : 0;
    const totalPayroll = employees.reduce(
      (sum, e) => sum + e.MonthlyIncome_GBP,
      0
    );
    const activePayroll = active.reduce(
      (sum, e) => sum + e.MonthlyIncome_GBP,
      0
    );
    const avgIncome = total > 0 ? totalPayroll / total : 0;

    return [
      {
        label: 'Headcount',
        value: formatNumber(total),
        subtext: `${formatNumber(active.length)} active · ${formatNumber(leavers.length)} departed`,
        accent: 'yellow',
      },
      {
        label: 'Attrition Rate',
        value: formatPct(attritionRate),
        subtext: `${formatNumber(leavers.length)} exits in filtered cohort`,
        accent: attritionRate >= 20 ? 'alert' : 'orange',
      },
      {
        label: 'Active Employees',
        value: formatNumber(active.length),
        subtext: `${formatPct(retentionRate)} active retention`,
        accent: 'neutral',
      },
      {
        label: 'Average Income',
        value: formatGBP(avgIncome),
        subtext: `${formatGBP(avgIncome * 12)} annualised mean`,
        accent: 'neutral',
      },
      {
        label: 'Monthly Payroll',
        value: formatGBP(totalPayroll),
        subtext: `${formatGBP(activePayroll)} active payroll`,
        accent: 'yellow',
      },
    ];
  }, [employees]);

  const deptConfig = useMemo<ChartConfiguration<'bar'>>(() => {
    const groups = groupByField(employees, (e) => e.Department).sort(
      (a, b) => b.total - a.total
    );
    return {
      type: 'bar',
      data: {
        labels: groups.map((g) => g.label),
        datasets: [
          {
            label: 'Active',
            data: groups.map((g) => g.active),
            backgroundColor: '#FFC800',
            borderRadius: 3,
          },
          {
            label: 'Attrition (Left)',
            data: groups.map((g) => g.left),
            backgroundColor: '#F58220',
            borderRadius: 3,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        scales: {
          x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
          y: { stacked: true, grid: { display: false } },
        },
        plugins: {
          legend: { position: 'top', align: 'end' },
          tooltip: {
            callbacks: {
              afterBody: (items) => {
                const idx = items[0]?.dataIndex ?? 0;
                const g = groups[idx];
                if (!g) return '';
                return `Total: ${g.total} · Attrition: ${g.attritionRate.toFixed(1)}%`;
              },
            },
          },
        },
      },
    };
  }, [employees]);

  const locationConfig = useMemo<ChartConfiguration<'bar'>>(() => {
    const groups = groupByField(employees, (e) => e.Location).sort(
      (a, b) => b.total - a.total
    );
    const activeColor = isDark ? '#E5E5E5' : '#171717';
    return {
      type: 'bar',
      data: {
        labels: groups.map((g) => g.label),
        datasets: [
          {
            label: 'Active',
            data: groups.map((g) => g.active),
            backgroundColor: activeColor,
            borderRadius: 3,
          },
          {
            label: 'Attrition (Left)',
            data: groups.map((g) => g.left),
            backgroundColor: '#F58220',
            borderRadius: 3,
          },
        ],
      },
      options: {
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
        },
        plugins: {
          legend: { position: 'top', align: 'end' },
          tooltip: {
            callbacks: {
              afterBody: (items) => {
                const idx = items[0]?.dataIndex ?? 0;
                const g = groups[idx];
                if (!g) return '';
                return `Total: ${g.total} · Attrition: ${g.attritionRate.toFixed(1)}%`;
              },
            },
          },
        },
      },
    };
  }, [employees, isDark]);

  const genderConfig = useMemo<ChartConfiguration<'doughnut'>>(() => {
    const groups = groupByField(employees, (e) => e.Gender).sort(
      (a, b) => b.total - a.total
    );
    const palette = isDark
      ? ['#FFC800', '#52525B', '#F58220']
      : ['#FFC800', '#18181B', '#F58220'];
    return {
      type: 'doughnut',
      data: {
        labels: groups.map((g) => g.label),
        datasets: [
          {
            data: groups.map((g) => g.total),
            backgroundColor: groups.map((_, i) => palette[i % palette.length]),
            borderColor: isDark ? '#171717' : '#FFFFFF',
            borderWidth: 2,
          },
        ],
      },
      options: {
        cutout: '64%',
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const val = Number(ctx.raw ?? 0);
                const pct =
                  employees.length > 0 ? (val / employees.length) * 100 : 0;
                return `${ctx.label}: ${val} (${pct.toFixed(1)}%)`;
              },
            },
          },
        },
      },
    };
  }, [employees, isDark]);

  const employmentTypeConfig = useMemo<ChartConfiguration<'doughnut'>>(() => {
    const order = ['Full-Time', 'Part-Time', 'Contract'];
    const groups = groupByField(employees, (e) => e.EmploymentType).sort(
      (a, b) => {
        const ia = order.indexOf(a.label);
        const ib = order.indexOf(b.label);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      }
    );
    const palette = ['#FFC800', '#F58220', isDark ? '#71717A' : '#18181B'];
    return {
      type: 'doughnut',
      data: {
        labels: groups.map((g) => g.label),
        datasets: [
          {
            data: groups.map((g) => g.total),
            backgroundColor: groups.map((_, i) => palette[i % palette.length]),
            borderColor: isDark ? '#171717' : '#FFFFFF',
            borderWidth: 2,
          },
        ],
      },
      options: {
        cutout: '64%',
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const val = Number(ctx.raw ?? 0);
                const pct =
                  employees.length > 0 ? (val / employees.length) * 100 : 0;
                return `${ctx.label}: ${val} (${pct.toFixed(1)}%)`;
              },
            },
          },
        },
      },
    };
  }, [employees, isDark]);

  const hiringTrendConfig = useMemo<ChartConfiguration<'line'>>(() => {
    const byYear = new Map<number, { total: number; active: number }>();
    for (const emp of employees) {
      const cur = byYear.get(emp.HireYear) ?? { total: 0, active: 0 };
      cur.total += 1;
      if (emp.Attrition === 'No') cur.active += 1;
      byYear.set(emp.HireYear, cur);
    }

    const years = Array.from(byYear.keys()).sort((a, b) => a - b);
    const minYear = years[0] ?? 2015;
    const maxYear = years[years.length - 1] ?? 2025;
    const continuousYears: number[] = [];
    for (let y = minYear; y <= maxYear; y += 1) {
      continuousYears.push(y);
    }

    return {
      type: 'line',
      data: {
        labels: continuousYears.map(String),
        datasets: [
          {
            label: 'Total Hires',
            data: continuousYears.map((y) => byYear.get(y)?.total ?? 0),
            borderColor: '#F58220',
            backgroundColor: 'rgba(245, 130, 32, 0.14)',
            fill: true,
            tension: 0.25,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: '#F58220',
          },
          {
            label: 'Still Active',
            data: continuousYears.map((y) => byYear.get(y)?.active ?? 0),
            borderColor: isDark ? '#FFC800' : '#171717',
            backgroundColor: 'transparent',
            borderDash: [4, 4],
            tension: 0.25,
            pointRadius: 2.5,
            pointHoverRadius: 5,
            pointBackgroundColor: isDark ? '#FFC800' : '#171717',
          },
        ],
      },
      options: {
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
        plugins: {
          legend: { position: 'top', align: 'end' },
        },
      },
    };
  }, [employees, isDark]);

  return (
    <div className="space-y-6">
      <KpiGrid items={kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <article className="lg:col-span-7 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-neutral-950 dark:text-white">
              Department Headcount & Attrition
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Active workforce vs departed employees across Shell UK functions
            </p>
          </div>
          <ChartCanvas
            config={deptConfig}
            isDark={isDark}
            heightClass="h-80"
            ariaLabel="Department headcount and attrition bar chart"
          />
        </article>

        <article className="lg:col-span-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-neutral-950 dark:text-white">
              UK Site Locations
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Headcount and attrition distribution by operational hub
            </p>
          </div>
          <ChartCanvas
            config={locationConfig}
            isDark={isDark}
            heightClass="h-80"
            ariaLabel="UK location distribution bar chart"
          />
        </article>

        <article className="lg:col-span-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-neutral-950 dark:text-white">
              Gender Split
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Workforce composition by gender
            </p>
          </div>
          <ChartCanvas
            config={genderConfig}
            isDark={isDark}
            heightClass="h-64"
            ariaLabel="Gender split doughnut chart"
          />
        </article>

        <article className="lg:col-span-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-neutral-950 dark:text-white">
              Employment Type
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Contractual arrangement mix
            </p>
          </div>
          <ChartCanvas
            config={employmentTypeConfig}
            isDark={isDark}
            heightClass="h-64"
            ariaLabel="Employment type doughnut chart"
          />
        </article>

        <article className="lg:col-span-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-neutral-950 dark:text-white">
              Annual Hiring Trend
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Intake volume by hire year compared with cohort still active
            </p>
          </div>
          <ChartCanvas
            config={hiringTrendConfig}
            isDark={isDark}
            heightClass="h-64"
            ariaLabel="Annual hiring trend line chart"
          />
        </article>
      </div>
    </div>
  );
}
