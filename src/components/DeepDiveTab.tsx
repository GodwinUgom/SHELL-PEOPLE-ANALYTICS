import { useMemo, useState } from 'react';
import { ChartConfiguration } from 'chart.js/auto';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { ScoredEmployee } from '../types/employee';
import {
  formatGBP,
  formatNumber,
  formatPct,
  formatTravelLabel,
  groupByField,
  groupByOrderedBands,
} from '../utils/analytics';
import { ChartCanvas } from './ChartCanvas';
import { KpiGrid, KpiItem } from './KpiGrid';

interface DeepDiveTabProps {
  employees: ScoredEmployee[];
  isDark: boolean;
}

type SortKey =
  | 'EmployeeID'
  | 'FullName'
  | 'Department'
  | 'Location'
  | 'JobLevel'
  | 'EmploymentType'
  | 'YearsAtCompany'
  | 'YearsSinceLastPromotion'
  | 'MonthlyIncome_GBP'
  | 'flightRiskScore'
  | 'Attrition';

const PAGE_SIZE = 15;

export function DeepDiveTab({ employees, isDark }: DeepDiveTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('flightRiskScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const kpis = useMemo<KpiItem[]>(() => {
    const total = employees.length;
    const avgTenure =
      total > 0
        ? employees.reduce((s, e) => s + e.YearsAtCompany, 0) / total
        : 0;
    const femaleCount = employees.filter((e) => e.Gender === 'Female').length;
    const femaleShare = total > 0 ? (femaleCount / total) * 100 : 0;

    const nonFullTime = employees.filter(
      (e) => e.EmploymentType !== 'Full-Time'
    ).length;
    const nonFullTimeShare = total > 0 ? (nonFullTime / total) * 100 : 0;

    const avgYearsPromo =
      total > 0
        ? employees.reduce((s, e) => s + e.YearsSinceLastPromotion, 0) / total
        : 0;

    const active = employees.filter((e) => e.Attrition === 'No');
    const highRiskActive = active.filter((e) => e.flightRiskScore >= 60).length;
    const highRiskPct =
      active.length > 0 ? (highRiskActive / active.length) * 100 : 0;

    return [
      {
        label: 'Average Tenure',
        value: `${avgTenure.toFixed(1)} yrs`,
        subtext: 'Mean years at Shell UK',
        accent: 'neutral',
      },
      {
        label: 'Female Share',
        value: formatPct(femaleShare),
        subtext: `${formatNumber(femaleCount)} of ${formatNumber(total)} employees`,
        accent: 'yellow',
      },
      {
        label: 'Non-Full-Time Share',
        value: formatPct(nonFullTimeShare),
        subtext: `${formatNumber(nonFullTime)} part-time or contract`,
        accent: 'neutral',
      },
      {
        label: 'Years Since Promotion',
        value: `${avgYearsPromo.toFixed(1)} yrs`,
        subtext: 'Mean time since last advancement',
        accent: 'orange',
      },
      {
        label: 'High Flight-Risk Count',
        value: formatNumber(highRiskActive),
        subtext: `${formatPct(highRiskPct)} of ${formatNumber(active.length)} active staff`,
        accent: highRiskActive > 0 ? 'alert' : 'neutral',
      },
    ];
  }, [employees]);

  const ageBandConfig = useMemo<ChartConfiguration>(() => {
    const bands = groupByOrderedBands(employees, [
      { label: '20–29', match: (e) => e.Age < 30 },
      { label: '30–39', match: (e) => e.Age >= 30 && e.Age < 40 },
      { label: '40–49', match: (e) => e.Age >= 40 && e.Age < 50 },
      { label: '50+', match: (e) => e.Age >= 50 },
    ]);
    return {
      type: 'bar',
      data: {
        labels: bands.map((b) => b.label),
        datasets: [
          {
            type: 'bar',
            label: 'Headcount',
            data: bands.map((b) => b.total),
            backgroundColor: '#FFC800',
            borderRadius: 3,
            yAxisID: 'y',
            order: 2,
          },
          {
            type: 'line',
            label: 'Attrition %',
            data: bands.map((b) => Number(b.attritionRate.toFixed(1))),
            borderColor: '#F58220',
            backgroundColor: '#F58220',
            borderWidth: 2.5,
            pointRadius: 4,
            tension: 0.2,
            yAxisID: 'y1',
            order: 1,
          },
        ],
      },
      options: {
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            position: 'left',
            ticks: { precision: 0 },
            title: { display: true, text: 'Employees' },
          },
          y1: {
            beginAtZero: true,
            max: 100,
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { callback: (v) => `${v}%` },
            title: { display: true, text: 'Attrition %' },
          },
        },
        plugins: { legend: { position: 'top', align: 'end' } },
      },
    };
  }, [employees]);

  const tenureBandConfig = useMemo<ChartConfiguration>(() => {
    const bands = groupByOrderedBands(employees, [
      { label: '< 2 yrs', match: (e) => e.YearsAtCompany < 2 },
      {
        label: '2–5 yrs',
        match: (e) => e.YearsAtCompany >= 2 && e.YearsAtCompany <= 5,
      },
      {
        label: '6–10 yrs',
        match: (e) => e.YearsAtCompany >= 6 && e.YearsAtCompany <= 10,
      },
      {
        label: '11–15 yrs',
        match: (e) => e.YearsAtCompany >= 11 && e.YearsAtCompany <= 15,
      },
      { label: '16+ yrs', match: (e) => e.YearsAtCompany >= 16 },
    ]);
    const barColor = isDark ? '#E5E5E5' : '#171717';
    return {
      type: 'bar',
      data: {
        labels: bands.map((b) => b.label),
        datasets: [
          {
            type: 'bar',
            label: 'Headcount',
            data: bands.map((b) => b.total),
            backgroundColor: barColor,
            borderRadius: 3,
            yAxisID: 'y',
            order: 2,
          },
          {
            type: 'line',
            label: 'Attrition %',
            data: bands.map((b) => Number(b.attritionRate.toFixed(1))),
            borderColor: '#F58220',
            backgroundColor: '#F58220',
            borderWidth: 2.5,
            pointRadius: 4,
            tension: 0.2,
            yAxisID: 'y1',
            order: 1,
          },
        ],
      },
      options: {
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            position: 'left',
            ticks: { precision: 0 },
            title: { display: true, text: 'Employees' },
          },
          y1: {
            beginAtZero: true,
            max: 100,
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { callback: (v) => `${v}%` },
            title: { display: true, text: 'Attrition %' },
          },
        },
        plugins: { legend: { position: 'top', align: 'end' } },
      },
    };
  }, [employees, isDark]);

  const incomeByLevelConfig = useMemo<ChartConfiguration<'bar'>>(() => {
    const groups = groupByField(employees, (e) => `Level ${e.JobLevel}`).sort(
      (a, b) => a.label.localeCompare(b.label)
    );
    return {
      type: 'bar',
      data: {
        labels: groups.map((g) => g.label),
        datasets: [
          {
            label: 'Avg Monthly Income (GBP)',
            data: groups.map((g) => Math.round(g.avgIncome)),
            backgroundColor: '#FFC800',
            borderRadius: 3,
          },
        ],
      },
      options: {
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            ticks: {
              callback: (v) => `£${Number(v).toLocaleString('en-GB')}`,
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const idx = ctx.dataIndex;
                const g = groups[idx];
                return `Avg Pay: ${formatGBP(g?.avgIncome ?? 0)} (${g?.total ?? 0} staff)`;
              },
            },
          },
        },
      },
    };
  }, [employees]);

  const incomeByDeptConfig = useMemo<ChartConfiguration<'bar'>>(() => {
    const groups = groupByField(employees, (e) => e.Department).sort(
      (a, b) => b.avgIncome - a.avgIncome
    );
    return {
      type: 'bar',
      data: {
        labels: groups.map((g) => g.label),
        datasets: [
          {
            label: 'Avg Monthly Income (GBP)',
            data: groups.map((g) => Math.round(g.avgIncome)),
            backgroundColor: '#F58220',
            borderRadius: 3,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              callback: (v) => `£${Number(v).toLocaleString('en-GB')}`,
            },
          },
          y: { grid: { display: false } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const g = groups[ctx.dataIndex];
                return `Avg Pay: ${formatGBP(g?.avgIncome ?? 0)} (${g?.total ?? 0} staff)`;
              },
            },
          },
        },
      },
    };
  }, [employees]);

  const educationConfig = useMemo<ChartConfiguration<'bar'>>(() => {
    const order = [
      'Below College',
      'College',
      "Bachelor's",
      "Master's",
      'Doctorate',
    ];
    const groups = groupByField(employees, (e) => e.Education).sort((a, b) => {
      const ia = order.indexOf(a.label);
      const ib = order.indexOf(b.label);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    return {
      type: 'bar',
      data: {
        labels: groups.map((g) => g.label),
        datasets: [
          {
            label: 'Active',
            data: groups.map((g) => g.active),
            backgroundColor: isDark ? '#E5E5E5' : '#171717',
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
                const g = groups[items[0]?.dataIndex ?? 0];
                return g
                  ? `Attrition: ${g.attritionRate.toFixed(1)}% · Avg Pay: ${formatGBP(g.avgIncome)}`
                  : '';
              },
            },
          },
        },
      },
    };
  }, [employees, isDark]);

  const travelConfig = useMemo<ChartConfiguration>(() => {
    const order = ['Non-Travel', 'Travel_Rarely', 'Travel_Frequently'];
    const groups = groupByField(employees, (e) => e.BusinessTravel).sort(
      (a, b) => {
        const ia = order.indexOf(a.label);
        const ib = order.indexOf(b.label);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      }
    );
    return {
      type: 'bar',
      data: {
        labels: groups.map((g) => formatTravelLabel(g.label)),
        datasets: [
          {
            type: 'bar',
            label: 'Headcount',
            data: groups.map((g) => g.total),
            backgroundColor: '#FFC800',
            borderRadius: 3,
            yAxisID: 'y',
            order: 2,
          },
          {
            type: 'line',
            label: 'Attrition %',
            data: groups.map((g) => Number(g.attritionRate.toFixed(1))),
            borderColor: '#DD1D21',
            backgroundColor: '#DD1D21',
            borderWidth: 2.5,
            pointRadius: 4,
            yAxisID: 'y1',
            order: 1,
          },
        ],
      },
      options: {
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            position: 'left',
            ticks: { precision: 0 },
            title: { display: true, text: 'Employees' },
          },
          y1: {
            beginAtZero: true,
            max: 100,
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { callback: (v) => `${v}%` },
            title: { display: true, text: 'Attrition %' },
          },
        },
        plugins: { legend: { position: 'top', align: 'end' } },
      },
    };
  }, [employees]);

  const scatterConfig = useMemo<ChartConfiguration<'scatter'>>(() => {
    const activePoints = employees
      .filter((e) => e.Attrition === 'No')
      .map((e) => ({
        x: e.YearsAtCompany,
        y: e.MonthlyIncome_GBP,
        meta: e,
      }));

    const leftPoints = employees
      .filter((e) => e.Attrition === 'Yes')
      .map((e) => ({
        x: e.YearsAtCompany,
        y: e.MonthlyIncome_GBP,
        meta: e,
      }));

    return {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Active',
            data: activePoints,
            backgroundColor: isDark
              ? 'rgba(255, 200, 0, 0.72)'
              : 'rgba(23, 23, 23, 0.65)',
            borderColor: isDark ? '#FFC800' : '#0B0B0C',
            pointRadius: 4.5,
            pointHoverRadius: 7,
          },
          {
            label: 'Attrition (Left)',
            data: leftPoints,
            backgroundColor: 'rgba(245, 130, 32, 0.85)',
            borderColor: '#DD1D21',
            borderWidth: 1.5,
            pointRadius: 5.5,
            pointHoverRadius: 8,
          },
        ],
      },
      options: {
        scales: {
          x: {
            beginAtZero: true,
            title: { display: true, text: 'Years at Company' },
          },
          y: {
            beginAtZero: false,
            title: { display: true, text: 'Monthly Income (GBP)' },
            ticks: {
              callback: (v) => `£${Number(v).toLocaleString('en-GB')}`,
            },
          },
        },
        plugins: {
          legend: { position: 'top', align: 'end' },
          tooltip: {
            callbacks: {
              title: (items) => {
                const raw = items[0]?.raw as
                  | { meta?: ScoredEmployee }
                  | undefined;
                return raw?.meta
                  ? `${raw.meta.FullName} (${raw.meta.EmployeeID})`
                  : '';
              },
              label: (ctx) => {
                const raw = ctx.raw as { meta?: ScoredEmployee } | undefined;
                const m = raw?.meta;
                if (!m) return '';
                return [
                  `${m.JobTitle} · L${m.JobLevel} · ${m.Department}`,
                  `Pay: ${formatGBP(m.MonthlyIncome_GBP)}/mo · Tenure: ${m.YearsAtCompany} yrs`,
                  `Status: ${m.Attrition === 'Yes' ? 'Departed' : `Active (Risk ${m.flightRiskScore}/100)`}`,
                ];
              },
            },
          },
        },
      },
    };
  }, [employees, isDark]);

  // Table search, sort, and pagination
  const searchedAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = q
      ? employees.filter(
          (e) =>
            e.FullName.toLowerCase().includes(q) ||
            e.EmployeeID.toLowerCase().includes(q) ||
            e.JobTitle.toLowerCase().includes(q) ||
            e.Department.toLowerCase().includes(q) ||
            e.Location.toLowerCase().includes(q)
        )
      : employees;

    const sorted = [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp = 0;
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [employees, searchQuery, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(searchedAndSorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = useMemo(
    () =>
      searchedAndSorted.slice(
        (safePage - 1) * PAGE_SIZE,
        safePage * PAGE_SIZE
      ),
    [searchedAndSorted, safePage]
  );

  const handleSort = (key: SortKey) => {
    setPage(1);
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(
        key === 'EmployeeID' ||
          key === 'FullName' ||
          key === 'Department' ||
          key === 'Location' ||
          key === 'EmploymentType'
          ? 'asc'
          : 'desc'
      );
    }
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="h-3.5 w-3.5 opacity-40 shrink-0" />;
    }
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-[#D96B0A] dark:text-[#FFC800] shrink-0" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-[#D96B0A] dark:text-[#FFC800] shrink-0" />
    );
  };

  return (
    <div className="space-y-6">
      <KpiGrid items={kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <article className="lg:col-span-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-neutral-950 dark:text-white">
              Age Bands & Attrition Rate
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Headcount volume and exit rate across age cohorts
            </p>
          </div>
          <ChartCanvas
            config={ageBandConfig}
            isDark={isDark}
            heightClass="h-64"
            ariaLabel="Age bands and attrition chart"
          />
        </article>

        <article className="lg:col-span-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-neutral-950 dark:text-white">
              Tenure Bands & Attrition Rate
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Exit patterns by length of service at Shell UK
            </p>
          </div>
          <ChartCanvas
            config={tenureBandConfig}
            isDark={isDark}
            heightClass="h-64"
            ariaLabel="Tenure bands and attrition chart"
          />
        </article>

        <article className="lg:col-span-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-neutral-950 dark:text-white">
              Monthly Income by Job Level
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Average GBP monthly salary progression across Levels 1–5
            </p>
          </div>
          <ChartCanvas
            config={incomeByLevelConfig}
            isDark={isDark}
            heightClass="h-72"
            ariaLabel="Monthly income by job level bar chart"
          />
        </article>

        <article className="lg:col-span-7 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-neutral-950 dark:text-white">
              Average Monthly Income by Department
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Functional pay comparison ranked from highest to lowest mean GBP
            </p>
          </div>
          <ChartCanvas
            config={incomeByDeptConfig}
            isDark={isDark}
            heightClass="h-72"
            ariaLabel="Average monthly income by department bar chart"
          />
        </article>

        <article className="lg:col-span-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-neutral-950 dark:text-white">
              Education & Attrition
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Qualification mix showing active staff vs departures
            </p>
          </div>
          <ChartCanvas
            config={educationConfig}
            isDark={isDark}
            heightClass="h-64"
            ariaLabel="Education and attrition chart"
          />
        </article>

        <article className="lg:col-span-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-neutral-950 dark:text-white">
              Business Travel & Attrition
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Impact of travel cadence on workforce turnover
            </p>
          </div>
          <ChartCanvas
            config={travelConfig}
            isDark={isDark}
            heightClass="h-64"
            ariaLabel="Business travel and attrition chart"
          />
        </article>

        <article className="lg:col-span-12 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-neutral-950 dark:text-white">
              Income vs. Tenure Scatter
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Individual employee monthly income plotted against years at company; hover any point for role and risk details
            </p>
          </div>
          <ChartCanvas
            config={scatterConfig}
            isDark={isDark}
            heightClass="h-80"
            ariaLabel="Income versus tenure scatter plot"
          />
        </article>
      </div>

      {/* Searchable, Sortable Employee Table */}
      <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        <div className="p-5 border-b border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-neutral-950 dark:text-white">
              Employee Directory & Risk Ledger
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 tabular-nums">
              {formatNumber(searchedAndSorted.length)} matching records · Click any column header to sort
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search
              aria-hidden="true"
              className="h-4 w-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, ID, role, site..."
              aria-label="Search employee table"
              className="w-full h-10 pl-9 pr-3 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 text-neutral-950 dark:text-white placeholder:text-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC800]"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/60 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                <th className="py-3 px-4 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('EmployeeID')}
                    className="inline-flex items-center gap-1.5 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
                  >
                    ID {renderSortIcon('EmployeeID')}
                  </button>
                </th>
                <th className="py-3 px-4 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('FullName')}
                    className="inline-flex items-center gap-1.5 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
                  >
                    Employee {renderSortIcon('FullName')}
                  </button>
                </th>
                <th className="py-3 px-4 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('Department')}
                    className="inline-flex items-center gap-1.5 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
                  >
                    Department {renderSortIcon('Department')}
                  </button>
                </th>
                <th className="py-3 px-4 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('Location')}
                    className="inline-flex items-center gap-1.5 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
                  >
                    Location {renderSortIcon('Location')}
                  </button>
                </th>
                <th className="py-3 px-4 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('EmploymentType')}
                    className="inline-flex items-center gap-1.5 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
                  >
                    Type {renderSortIcon('EmploymentType')}
                  </button>
                </th>
                <th className="py-3 px-4 whitespace-nowrap text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('JobLevel')}
                    className="inline-flex items-center justify-end gap-1.5 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
                  >
                    Level {renderSortIcon('JobLevel')}
                  </button>
                </th>
                <th className="py-3 px-4 whitespace-nowrap text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('YearsAtCompany')}
                    className="inline-flex items-center justify-end gap-1.5 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
                  >
                    Tenure {renderSortIcon('YearsAtCompany')}
                  </button>
                </th>
                <th className="py-3 px-4 whitespace-nowrap text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('YearsSinceLastPromotion')}
                    className="inline-flex items-center justify-end gap-1.5 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
                  >
                    Promo Gap {renderSortIcon('YearsSinceLastPromotion')}
                  </button>
                </th>
                <th className="py-3 px-4 whitespace-nowrap text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('MonthlyIncome_GBP')}
                    className="inline-flex items-center justify-end gap-1.5 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
                  >
                    Monthly Pay {renderSortIcon('MonthlyIncome_GBP')}
                  </button>
                </th>
                <th className="py-3 px-4 whitespace-nowrap text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('flightRiskScore')}
                    className="inline-flex items-center justify-end gap-1.5 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
                  >
                    Risk Score {renderSortIcon('flightRiskScore')}
                  </button>
                </th>
                <th className="py-3 px-4 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('Attrition')}
                    className="inline-flex items-center gap-1.5 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
                  >
                    Status {renderSortIcon('Attrition')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {paginatedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="py-10 px-4 text-center text-sm text-neutral-500 dark:text-neutral-400"
                  >
                    No employee records match your current search and filter criteria.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((emp) => (
                  <tr
                    key={emp.EmployeeID}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                  >
                    <td className="py-2.5 px-4 font-mono text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                      {emp.EmployeeID}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <div className="font-medium text-neutral-950 dark:text-white">
                        {emp.FullName}
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        {emp.JobTitle}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                      {emp.Department}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                      {emp.Location}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                      {emp.EmploymentType}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-right tabular-nums text-neutral-900 dark:text-neutral-200">
                      L{emp.JobLevel}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-right tabular-nums text-neutral-900 dark:text-neutral-200 whitespace-nowrap">
                      {emp.YearsAtCompany} yrs
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-right tabular-nums text-neutral-900 dark:text-neutral-200 whitespace-nowrap">
                      {emp.YearsSinceLastPromotion} yrs
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-right tabular-nums font-medium text-neutral-950 dark:text-white whitespace-nowrap">
                      {formatGBP(emp.MonthlyIncome_GBP)}
                    </td>
                    <td
                      className={`py-2.5 px-4 font-mono text-xs text-right tabular-nums font-semibold whitespace-nowrap ${
                        emp.flightRiskScore >= 60
                          ? 'text-[#C8191D] dark:text-[#FF6B6B]'
                          : emp.flightRiskScore >= 40
                          ? 'text-[#D96B0A] dark:text-[#F58220]'
                          : 'text-neutral-700 dark:text-neutral-300'
                      }`}
                    >
                      {emp.flightRiskScore}/100 ({emp.flightRiskTier})
                    </td>
                    <td
                      className={`py-2.5 px-4 text-xs font-medium whitespace-nowrap ${
                        emp.Attrition === 'Yes'
                          ? 'text-[#C8191D] dark:text-[#FF6B6B]'
                          : 'text-neutral-700 dark:text-neutral-300'
                      }`}
                    >
                      {emp.Attrition === 'Yes' ? 'Departed' : 'Active'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-5 py-3.5 border-t border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-600 dark:text-neutral-400">
          <span className="tabular-nums">
            Showing{' '}
            {searchedAndSorted.length === 0
              ? 0
              : (safePage - 1) * PAGE_SIZE + 1}
            –{Math.min(safePage * PAGE_SIZE, searchedAndSorted.length)} of{' '}
            {formatNumber(searchedAndSorted.length)} employees
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 disabled:opacity-40 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
            >
              Previous
            </button>
            <span className="font-mono tabular-nums px-2">
              Page {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 disabled:opacity-40 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
