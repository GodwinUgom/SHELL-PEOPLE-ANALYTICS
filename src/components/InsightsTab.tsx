import { useMemo } from 'react';
import { ScoredEmployee } from '../types/employee';
import {
  formatGBP,
  formatNumber,
  generateInsightsAndActions,
} from '../utils/analytics';

interface InsightsTabProps {
  employees: ScoredEmployee[];
  allEmployees: ScoredEmployee[];
}

const SCORING_FACTORS = [
  {
    factor: 'Promotion Stagnation',
    maxPoints: 25,
    rule: '>= 7 yrs since promo (25) · 4–6 yrs (18) · 2–3 yrs (10)',
  },
  {
    factor: 'Travel Intensity',
    maxPoints: 20,
    rule: 'Frequent Travel (20) · Rare Travel (8) · Non-Travel (0)',
  },
  {
    factor: 'Pay vs Level Median',
    maxPoints: 20,
    rule: '<= -15% below UK Level median (20) · -5% to -15% below (12)',
  },
  {
    factor: 'Commute Strain',
    maxPoints: 15,
    rule: '>= 30 km from home (15) · 15–29 km (9) · < 15 km (0)',
  },
  {
    factor: 'Role & Manager Mobility',
    maxPoints: 20,
    rule: '>= 6y in role & >= 3y no promo (+10) · <= 1y or >= 8y with manager (+10)',
  },
];

export function InsightsTab({ employees, allEmployees }: InsightsTabProps) {
  const { findings, actions } = useMemo(
    () => generateInsightsAndActions(employees, allEmployees),
    [employees, allEmployees]
  );

  const watchlist = useMemo(() => {
    return employees
      .filter((e) => e.Attrition === 'No')
      .sort(
        (a, b) =>
          b.flightRiskScore - a.flightRiskScore ||
          b.YearsSinceLastPromotion - a.YearsSinceLastPromotion ||
          a.payDeltaPct - b.payDeltaPct
      )
      .slice(0, 10);
  }, [employees]);

  return (
    <div className="space-y-8">
      {/* 1. Auto-Generated Workforce Findings */}
      <section aria-labelledby="findings-heading" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2
              id="findings-heading"
              className="text-lg font-semibold text-neutral-950 dark:text-white"
            >
              Auto-Generated Workforce Findings
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Calculated dynamically from the {formatNumber(employees.length)}{' '}
              employees matching your active filters
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {findings.map((finding) => (
            <article
              key={finding.id}
              className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 flex flex-col justify-between gap-3"
            >
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-neutral-500 dark:text-neutral-400">
                  {finding.category}
                </span>
                <span className="font-mono font-semibold text-[#D96B0A] dark:text-[#FFC800] tabular-nums">
                  {finding.metric}
                </span>
              </div>
              <h3 className="text-base font-semibold text-neutral-950 dark:text-white leading-snug">
                {finding.headline}
              </h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
                {finding.detail}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* 2. Transparent Flight-Risk Scoring Rule + Top-10 Watchlist */}
      <section aria-labelledby="watchlist-heading" className="space-y-4">
        <div>
          <h2
            id="watchlist-heading"
            className="text-lg font-semibold text-neutral-950 dark:text-white"
          >
            Top-10 Active Flight-Risk Watchlist
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Highest-scoring active employees ranked using our transparent 100-point retention model
          </p>
        </div>

        {/* Transparent Scoring Rubric */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-4 border-b border-neutral-200 dark:border-neutral-800">
            <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
              Transparent Flight-Risk Scoring Rubric (0–100 Points)
            </h3>
            <span className="text-xs font-mono text-neutral-600 dark:text-neutral-300 tabular-nums">
              High Risk: 60–100 · Elevated: 40–59 · Low: 0–39
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {SCORING_FACTORS.map((item) => (
              <div key={item.factor} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-neutral-900 dark:text-white">
                    {item.factor}
                  </span>
                  <span className="font-mono text-xs font-semibold text-[#D96B0A] dark:text-[#FFC800] tabular-nums shrink-0">
                    {item.maxPoints} pts
                  </span>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                  {item.rule}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Watchlist Table */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/60 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                  <th className="py-3 px-4 whitespace-nowrap">#</th>
                  <th className="py-3 px-4 whitespace-nowrap">Employee</th>
                  <th className="py-3 px-4 whitespace-nowrap">Department & Site</th>
                  <th className="py-3 px-4 whitespace-nowrap text-right">
                    Tenure / Promo Gap
                  </th>
                  <th className="py-3 px-4 whitespace-nowrap text-right">
                    Monthly Pay
                  </th>
                  <th className="py-3 px-4 whitespace-nowrap text-right">
                    Risk Score
                  </th>
                  <th className="py-3 px-4 whitespace-nowrap">Primary Risk Drivers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {watchlist.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-10 px-4 text-center text-sm text-neutral-500 dark:text-neutral-400"
                    >
                      No active employees remain in this filtered view. Clear the Attrition filter to evaluate retention risk among active staff.
                    </td>
                  </tr>
                ) : (
                  watchlist.map((emp, idx) => (
                    <tr
                      key={emp.EmployeeID}
                      className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-neutral-500 dark:text-neutral-400 tabular-nums">
                        {String(idx + 1).padStart(2, '0')}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-medium text-neutral-950 dark:text-white">
                          {emp.FullName}{' '}
                          <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
                            · {emp.EmployeeID}
                          </span>
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">
                          {emp.JobTitle} · Level {emp.JobLevel}
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                          {emp.Department}
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">
                          {emp.Location}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-right tabular-nums whitespace-nowrap text-neutral-800 dark:text-neutral-200">
                        {emp.YearsAtCompany}y tenure · {emp.YearsSinceLastPromotion}y promo
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-right tabular-nums whitespace-nowrap">
                        <div className="font-medium text-neutral-950 dark:text-white">
                          {formatGBP(emp.MonthlyIncome_GBP)}
                        </div>
                        <div
                          className={`text-[11px] ${
                            emp.payDeltaPct <= -10
                              ? 'text-[#C8191D] dark:text-[#FF6B6B]'
                              : 'text-neutral-500 dark:text-neutral-400'
                          }`}
                        >
                          {emp.payDeltaPct >= 0 ? '+' : ''}
                          {Math.round(emp.payDeltaPct)}% vs L{emp.JobLevel} med
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-right tabular-nums whitespace-nowrap">
                        <span
                          className={`font-semibold ${
                            emp.flightRiskScore >= 60
                              ? 'text-[#C8191D] dark:text-[#FF6B6B]'
                              : emp.flightRiskScore >= 40
                              ? 'text-[#D96B0A] dark:text-[#F58220]'
                              : 'text-neutral-700 dark:text-neutral-300'
                          }`}
                        >
                          {emp.flightRiskScore}/100 · {emp.flightRiskTier}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-neutral-600 dark:text-neutral-300">
                        {emp.riskDrivers.join(' · ')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 3. Recommended HR Actions */}
      <section aria-labelledby="actions-heading" className="space-y-4">
        <div>
          <h2
            id="actions-heading"
            className="text-lg font-semibold text-neutral-950 dark:text-white"
          >
            Recommended HR Actions
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Prioritised interventions sized to the active employees in your current filter scope
          </p>
        </div>

        {actions.length === 0 ? (
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-6 text-sm text-neutral-500 dark:text-neutral-400">
            No immediate retention interventions triggered for the current selection.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {actions.map((action) => (
              <article
                key={action.id}
                className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 flex flex-col justify-between gap-3"
              >
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span
                    className={`font-semibold ${
                      action.priority === 'Immediate'
                        ? 'text-[#C8191D] dark:text-[#FF6B6B]'
                        : action.priority === 'Near-Term'
                        ? 'text-[#D96B0A] dark:text-[#F58220]'
                        : 'text-neutral-600 dark:text-neutral-300'
                    }`}
                  >
                    {action.priority} Priority
                  </span>
                  <span className="font-mono font-semibold text-neutral-900 dark:text-[#FFC800] tabular-nums">
                    {formatNumber(action.affectedCount)} active affected
                  </span>
                </div>
                <h3 className="text-base font-semibold text-neutral-950 dark:text-white leading-snug">
                  {action.title}
                </h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
                  {action.rationale}
                </p>
                <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 text-xs text-neutral-500 dark:text-neutral-400">
                  Target cohort: {action.targetGroup}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
