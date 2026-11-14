import {
  Employee,
  FilterState,
  RiskBreakdown,
  RiskTier,
  ScoredEmployee,
} from '../types/employee';

export const formatGBP = (value: number): string =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(Math.round(value));

export const formatPct = (value: number, decimals = 1): string =>
  `${value.toFixed(decimals)}%`;

export const formatNumber = (value: number, decimals = 0): string =>
  new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);

export const formatTravelLabel = (raw: string): string => {
  switch (raw) {
    case 'Travel_Frequently':
      return 'Frequent Travel';
    case 'Travel_Rarely':
      return 'Rare Travel';
    case 'Non-Travel':
      return 'Non-Travel';
    default:
      return raw.replace(/_/g, ' ');
  }
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computeLevelMedians(employees: Employee[]): Map<number, number> {
  const byLevel = new Map<number, number[]>();
  for (const emp of employees) {
    const arr = byLevel.get(emp.JobLevel) ?? [];
    arr.push(emp.MonthlyIncome_GBP);
    byLevel.set(emp.JobLevel, arr);
  }
  const medians = new Map<number, number>();
  for (const [level, incomes] of byLevel.entries()) {
    medians.set(level, median(incomes));
  }
  return medians;
}

/**
 * Transparent 100-point Flight-Risk Scoring Rubric:
 * 1. Promotion Stagnation (max 25 pts): >=7y (25), 4-6y (18), 2-3y (10), <2y (0)
 * 2. Travel Intensity (max 20 pts): Travel_Frequently (20), Travel_Rarely (8), Non-Travel (0)
 * 3. Pay vs Level Median (max 20 pts): <= -15% (20), -5% to -15% (12), >= -5% (0)
 * 4. Commute Strain (max 15 pts): >=30 km (15), 15-29 km (9), <15 km (0)
 * 5. Role & Manager Mobility (max 20 pts):
 *    - Role stagnation: >=6y in role with >=3y no promo (10), else >=4y in role (5)
 *    - Manager change / tenure inflection: <=1y or >=8y with current manager (10), else <2y at company (6)
 */
export function scoreEmployees(
  employees: Employee[],
  referenceCohort: Employee[] = employees
): ScoredEmployee[] {
  const levelMedians = computeLevelMedians(
    referenceCohort.length > 0 ? referenceCohort : employees
  );

  return employees.map((emp) => {
    const drivers: string[] = [];

    // 1. Promotion stagnation (0-25)
    let promotionStagnation = 0;
    if (emp.YearsSinceLastPromotion >= 7) {
      promotionStagnation = 25;
      drivers.push(`${emp.YearsSinceLastPromotion}y since promotion`);
    } else if (emp.YearsSinceLastPromotion >= 4) {
      promotionStagnation = 18;
      drivers.push(`${emp.YearsSinceLastPromotion}y since promotion`);
    } else if (emp.YearsSinceLastPromotion >= 2) {
      promotionStagnation = 10;
    }

    // 2. Travel intensity (0-20)
    let travelIntensity = 0;
    if (emp.BusinessTravel === 'Travel_Frequently') {
      travelIntensity = 20;
      drivers.push('Frequent travel');
    } else if (emp.BusinessTravel === 'Travel_Rarely') {
      travelIntensity = 8;
    }

    // 3. Pay vs level median (0-20)
    const levelMedianPay = levelMedians.get(emp.JobLevel) ?? emp.MonthlyIncome_GBP;
    const payDeltaPct =
      levelMedianPay > 0
        ? ((emp.MonthlyIncome_GBP - levelMedianPay) / levelMedianPay) * 100
        : 0;
    let payGap = 0;
    if (payDeltaPct <= -15) {
      payGap = 20;
      drivers.push(`${Math.abs(Math.round(payDeltaPct))}% below L${emp.JobLevel} median`);
    } else if (payDeltaPct <= -5) {
      payGap = 12;
      drivers.push(`${Math.abs(Math.round(payDeltaPct))}% below L${emp.JobLevel} median`);
    }

    // 4. Commute strain (0-15)
    let commuteStrain = 0;
    if (emp.DistanceFromHome_km >= 30) {
      commuteStrain = 15;
      drivers.push(`${emp.DistanceFromHome_km} km commute`);
    } else if (emp.DistanceFromHome_km >= 15) {
      commuteStrain = 9;
    }

    // 5. Role & manager mobility (0-20)
    let rolePart = 0;
    if (emp.YearsInCurrentRole >= 6 && emp.YearsSinceLastPromotion >= 3) {
      rolePart = 10;
      drivers.push(`${emp.YearsInCurrentRole}y in same role`);
    } else if (emp.YearsInCurrentRole >= 4) {
      rolePart = 5;
    }

    let managerPart = 0;
    if (emp.YearsWithCurrManager <= 1) {
      managerPart = 10;
      drivers.push('New manager (<2y)');
    } else if (emp.YearsWithCurrManager >= 8) {
      managerPart = 10;
    } else if (emp.YearsAtCompany < 2) {
      managerPart = 6;
      drivers.push('Early tenure (<2y)');
    }

    const roleMobility = rolePart + managerPart;
    const riskBreakdown: RiskBreakdown = {
      promotionStagnation,
      travelIntensity,
      payGap,
      commuteStrain,
      roleMobility,
    };

    const flightRiskScore = Math.min(
      100,
      promotionStagnation + travelIntensity + payGap + commuteStrain + roleMobility
    );

    const flightRiskTier: RiskTier =
      flightRiskScore >= 60 ? 'High' : flightRiskScore >= 40 ? 'Elevated' : 'Low';

    return {
      ...emp,
      flightRiskScore,
      flightRiskTier,
      riskDrivers: drivers.length > 0 ? drivers.slice(0, 3) : ['Baseline factors'],
      riskBreakdown,
      levelMedianPay,
      payDeltaPct,
    };
  });
}

export function applyFilters(
  employees: ScoredEmployee[],
  filters: FilterState
): ScoredEmployee[] {
  return employees.filter((emp) => {
    if (filters.department !== 'All' && emp.Department !== filters.department) {
      return false;
    }
    if (filters.location !== 'All' && emp.Location !== filters.location) {
      return false;
    }
    if (
      filters.employmentType !== 'All' &&
      emp.EmploymentType !== filters.employmentType
    ) {
      return false;
    }
    if (filters.gender !== 'All' && emp.Gender !== filters.gender) {
      return false;
    }
    if (filters.attrition !== 'All' && emp.Attrition !== filters.attrition) {
      return false;
    }
    return true;
  });
}

export interface GroupStats {
  label: string;
  total: number;
  active: number;
  left: number;
  attritionRate: number;
  avgIncome: number;
}

export function groupByField(
  employees: ScoredEmployee[],
  getter: (e: ScoredEmployee) => string
): GroupStats[] {
  const map = new Map<
    string,
    { total: number; active: number; left: number; incomeSum: number }
  >();

  for (const emp of employees) {
    const key = getter(emp);
    const cur = map.get(key) ?? { total: 0, active: 0, left: 0, incomeSum: 0 };
    cur.total += 1;
    if (emp.Attrition === 'Yes') cur.left += 1;
    else cur.active += 1;
    cur.incomeSum += emp.MonthlyIncome_GBP;
    map.set(key, cur);
  }

  return Array.from(map.entries()).map(([label, d]) => ({
    label,
    total: d.total,
    active: d.active,
    left: d.left,
    attritionRate: d.total > 0 ? (d.left / d.total) * 100 : 0,
    avgIncome: d.total > 0 ? d.incomeSum / d.total : 0,
  }));
}

export function groupByOrderedBands(
  employees: ScoredEmployee[],
  bands: { label: string; match: (e: ScoredEmployee) => boolean }[]
): GroupStats[] {
  return bands.map((band) => {
    const matching = employees.filter(band.match);
    const total = matching.length;
    const left = matching.filter((e) => e.Attrition === 'Yes').length;
    const active = total - left;
    const incomeSum = matching.reduce((acc, e) => acc + e.MonthlyIncome_GBP, 0);
    return {
      label: band.label,
      total,
      active,
      left,
      attritionRate: total > 0 ? (left / total) * 100 : 0,
      avgIncome: total > 0 ? incomeSum / total : 0,
    };
  });
}

export interface AutoFinding {
  id: string;
  category: string;
  headline: string;
  detail: string;
  metric: string;
}

export interface RecommendedAction {
  id: string;
  priority: 'Immediate' | 'Near-Term' | 'Structural';
  title: string;
  rationale: string;
  targetGroup: string;
  affectedCount: number;
}

export function generateInsightsAndActions(
  filtered: ScoredEmployee[],
  baselineAll: ScoredEmployee[]
): { findings: AutoFinding[]; actions: RecommendedAction[] } {
  if (filtered.length === 0) {
    return { findings: [], actions: [] };
  }

  const total = filtered.length;
  const active = filtered.filter((e) => e.Attrition === 'No');
  const leavers = filtered.filter((e) => e.Attrition === 'Yes');
  const attritionRate = (leavers.length / total) * 100;
  const baseAttritionRate =
    baselineAll.length > 0
      ? (baselineAll.filter((e) => e.Attrition === 'Yes').length / baselineAll.length) * 100
      : 0;

  const avgIncome =
    filtered.reduce((s, e) => s + e.MonthlyIncome_GBP, 0) / total;

  const findings: AutoFinding[] = [];

  // 1. Attrition Pulse vs UK Benchmark
  const diff = attritionRate - baseAttritionRate;
  const diffLabel =
    Math.abs(diff) < 0.5
      ? 'aligned with the overall Shell UK baseline'
      : diff > 0
      ? `${diff.toFixed(1)} pp above the overall Shell UK baseline (${baseAttritionRate.toFixed(1)}%)`
      : `${Math.abs(diff).toFixed(1)} pp below the overall Shell UK baseline (${baseAttritionRate.toFixed(1)}%)`;

  findings.push({
    id: 'pulse',
    category: 'Attrition Pulse',
    headline: `${leavers.length} of ${total} employees (${attritionRate.toFixed(1)}%) recorded attrition`,
    detail: `Current filtered selection is ${diffLabel}. Active workforce stands at ${active.length} employees with an average monthly pay of ${formatGBP(avgIncome)}.`,
    metric: `${attritionRate.toFixed(1)}% attrition`,
  });

  // 2. Department Hotspot
  const deptGroups = groupByField(filtered, (e) => e.Department).filter(
    (g) => g.total >= (total >= 15 ? 3 : 1)
  );
  if (deptGroups.length > 0) {
    const topDept = [...deptGroups].sort(
      (a, b) => b.attritionRate - a.attritionRate || b.left - a.left
    )[0];
    const topLocs = groupByField(filtered, (e) => e.Location)
      .filter((g) => g.total >= (total >= 15 ? 3 : 1))
      .sort((a, b) => b.attritionRate - a.attritionRate || b.left - a.left);
    const topLoc = topLocs[0];

    findings.push({
      id: 'hotspot',
      category: 'Org & Site Hotspots',
      headline: `${topDept.label} leads departmental turnover at ${topDept.attritionRate.toFixed(1)}%`,
      detail: `${topDept.left} of ${topDept.total} staff exited in ${topDept.label}${
        topLoc
          ? `, while ${topLoc.label} shows the highest regional attrition at ${topLoc.attritionRate.toFixed(1)}% (${topLoc.left}/${topLoc.total}).`
          : '.'
      }`,
      metric: `${topDept.left}/${topDept.total} exits`,
    });
  }

  // 3. Promotion Stagnation Signal
  const stalled = filtered.filter((e) => e.YearsSinceLastPromotion >= 4);
  const recentPromo = filtered.filter((e) => e.YearsSinceLastPromotion < 4);
  if (stalled.length > 0 && recentPromo.length > 0) {
    const stalledRate =
      (stalled.filter((e) => e.Attrition === 'Yes').length / stalled.length) * 100;
    const recentRate =
      (recentPromo.filter((e) => e.Attrition === 'Yes').length / recentPromo.length) *
      100;
    findings.push({
      id: 'promotion',
      category: 'Career Progression',
      headline: `Employees 4+ years without promotion show ${stalledRate.toFixed(1)}% attrition`,
      detail: `${stalled.length} employees have gone 4 or more years since their last promotion, compared with ${recentRate.toFixed(1)}% attrition among ${recentPromo.length} recently promoted peers.`,
      metric: `${stalled.length} stalled`,
    });
  }

  // 4. Travel & Commute Strain
  const freqTravel = filtered.filter((e) => e.BusinessTravel === 'Travel_Frequently');
  const otherTravel = filtered.filter((e) => e.BusinessTravel !== 'Travel_Frequently');
  if (freqTravel.length > 0 && otherTravel.length > 0) {
    const freqRate =
      (freqTravel.filter((e) => e.Attrition === 'Yes').length / freqTravel.length) * 100;
    const otherRate =
      (otherTravel.filter((e) => e.Attrition === 'Yes').length / otherTravel.length) *
      100;
    findings.push({
      id: 'travel',
      category: 'Travel & Mobility',
      headline: `Frequent business travellers record ${freqRate.toFixed(1)}% attrition vs ${otherRate.toFixed(1)}% for peers`,
      detail: `${freqTravel.length} employees in this selection travel frequently. Combining frequent travel with commutes >= 30 km compounds retention pressure.`,
      metric: `${freqTravel.length} frequent flyers`,
    });
  }

  // 5. Gender & Seniority Representation
  const females = filtered.filter((e) => e.Gender === 'Female');
  const femalePct = (females.length / total) * 100;
  const seniorCohort = filtered.filter((e) => e.JobLevel >= 4);
  const seniorFemalePct =
    seniorCohort.length > 0
      ? (seniorCohort.filter((e) => e.Gender === 'Female').length / seniorCohort.length) *
        100
      : 0;
  findings.push({
    id: 'diversity',
    category: 'Representation & Pay',
    headline: `Female workforce share is ${femalePct.toFixed(1)}% overall and ${seniorFemalePct.toFixed(1)}% at Levels 4–5`,
    detail: `${females.length} female employees in selection (${seniorCohort.length} total staff in Job Levels 4–5). Average monthly pay across the cohort is ${formatGBP(avgIncome)}.`,
    metric: `${femalePct.toFixed(1)}% female`,
  });

  // Recommended Actions (dynamically sized to current active filtered cohort)
  const actions: RecommendedAction[] = [];

  const highRiskActive = active.filter((e) => e.flightRiskScore >= 60);
  const underpaidActive = active.filter((e) => e.payDeltaPct <= -10);
  const stalledActive = active.filter((e) => e.YearsSinceLastPromotion >= 4);
  const travelCommuteActive = active.filter(
    (e) => e.BusinessTravel === 'Travel_Frequently' || e.DistanceFromHome_km >= 30
  );

  if (highRiskActive.length > 0) {
    const topDepts = groupByField(highRiskActive, (e) => e.Department)
      .sort((a, b) => b.total - a.total)
      .slice(0, 2)
      .map((d) => d.label)
      .join(' & ');
    actions.push({
      id: 'act-stay-interviews',
      priority: 'Immediate',
      title: 'Conduct targeted stay interviews for High Flight-Risk staff',
      rationale: `Schedule structured career and workload check-ins with HRBP and line managers for active employees scoring 60+/100, prioritising ${topDepts || 'top-scoring hubs'}.`,
      targetGroup: 'Active employees with risk score >= 60',
      affectedCount: highRiskActive.length,
    });
  }

  if (underpaidActive.length > 0) {
    actions.push({
      id: 'act-comp-review',
      priority: 'Immediate',
      title: 'Run an off-cycle pay equity audit against Job Level medians',
      rationale: `${underpaidActive.length} active employees earn at least 10% below their UK Job Level median. Bringing critical roles within +/-5% of peer bands reduces poached exits.`,
      targetGroup: 'Active staff >=10% below Job Level median',
      affectedCount: underpaidActive.length,
    });
  }

  if (stalledActive.length > 0) {
    actions.push({
      id: 'act-career-path',
      priority: 'Near-Term',
      title: 'Unlock progression & lateral mobility tracks for long-stalled talent',
      rationale: `${stalledActive.length} active employees have not been promoted in 4+ years. Introduce technical specialist steps or cross-hub rotations (e.g. Upstream to Renewables).`,
      targetGroup: 'Active staff >= 4 years since promotion',
      affectedCount: stalledActive.length,
    });
  }

  if (travelCommuteActive.length > 0) {
    actions.push({
      id: 'act-travel-flex',
      priority: 'Structural',
      title: 'Rebalance travel rotas & expand hybrid flexibility for long commutes',
      rationale: `${travelCommuteActive.length} active employees face frequent travel or 30+ km daily commutes. Rotating site travel duties and formalising hybrid schedules protects retention.`,
      targetGroup: 'Frequent travellers or >=30 km commuters',
      affectedCount: travelCommuteActive.length,
    });
  }

  return { findings, actions };
}
