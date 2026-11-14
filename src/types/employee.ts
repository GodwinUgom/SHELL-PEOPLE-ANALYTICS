export type AttritionStatus = 'Yes' | 'No';

export interface Employee {
  EmployeeID: string;
  FirstName: string;
  LastName: string;
  FullName: string;
  Gender: string;
  Age: number;
  MaritalStatus: string;
  Department: string;
  JobTitle: string;
  JobLevel: number;
  EmploymentType: string;
  Location: string;
  HireDate: string;
  HireYear: number;
  YearsAtCompany: number;
  YearsInCurrentRole: number;
  YearsSinceLastPromotion: number;
  YearsWithCurrManager: number;
  Education: string;
  DistanceFromHome_km: number;
  BusinessTravel: string;
  MonthlyIncome_GBP: number;
  Attrition: AttritionStatus;
}

export type RiskTier = 'High' | 'Elevated' | 'Low';

export interface RiskBreakdown {
  promotionStagnation: number;
  travelIntensity: number;
  payGap: number;
  commuteStrain: number;
  roleMobility: number;
}

export interface ScoredEmployee extends Employee {
  flightRiskScore: number;
  flightRiskTier: RiskTier;
  riskDrivers: string[];
  riskBreakdown: RiskBreakdown;
  levelMedianPay: number;
  payDeltaPct: number;
}

export interface FilterState {
  department: string;
  location: string;
  employmentType: string;
  gender: string;
  attrition: 'All' | 'No' | 'Yes';
}

export type TabId = 'overview' | 'deep-dive' | 'insights';

export interface DataSourceInfo {
  type: 'google-sheet' | 'csv-upload';
  label: string;
  syncedAt: Date | null;
  rowCount: number;
}
