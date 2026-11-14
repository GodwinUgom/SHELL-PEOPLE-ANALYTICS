import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  Moon,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sun,
  Upload,
} from 'lucide-react';
import { DeepDiveTab } from './components/DeepDiveTab';
import { GoogleWorkspaceModal } from './components/GoogleWorkspaceModal';
import { InsightsTab } from './components/InsightsTab';
import { OverviewTab } from './components/OverviewTab';
import {
  clearAccessToken,
  getAccessToken,
  googleSignIn,
  googleSignOut,
  initAuth,
} from './services/googleAuth';
import { fetchSheetEmployeesViaApi } from './services/googleSheets';
import {
  DataSourceInfo,
  Employee,
  FilterState,
  TabId,
} from './types/employee';
import {
  applyFilters,
  formatNumber,
  scoreEmployees,
} from './utils/analytics';
import {
  fetchGoogleSheetEmployees,
  GOOGLE_SHEET_GID,
  GOOGLE_SHEET_ID,
  parseEmployeeCsv,
} from './utils/csv';

const INITIAL_FILTERS: FilterState = {
  department: 'All',
  location: 'All',
  employmentType: 'All',
  gender: 'All',
  attrition: 'All',
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'deep-dive', label: 'Deep Dive' },
  { id: 'insights', label: 'Insights' },
];

export default function App() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const saved = window.localStorage.getItem('shell-pa-theme');
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  const [rawEmployees, setRawEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sourceInfo, setSourceInfo] = useState<DataSourceInfo>({
    type: 'google-sheet',
    label: 'Google Sheets (Shell UK)',
    syncedAt: null,
    rowCount: 0,
  });

  // Google Workspace OAuth & Sheets API state (access token held in memory only)
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() => getAccessToken());
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState<boolean>(false);
  const [activeSpreadsheetId, setActiveSpreadsheetId] = useState<string>(GOOGLE_SHEET_ID);
  const [activeTabTitle, setActiveTabTitle] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      window.localStorage.setItem('shell-pa-theme', 'dark');
    } else {
      root.classList.remove('dark');
      window.localStorage.setItem('shell-pa-theme', 'light');
    }
  }, [isDark]);

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setAccessToken(token);
      },
      (user) => {
        setGoogleUser(user);
        setAccessToken(null);
      }
    );
    return unsubscribe;
  }, []);

  const syncFromGoogleSheet = useCallback(
    async (
      isInitial = false,
      overrideSpreadsheetId?: string,
      overrideTabTitle?: string,
      overrideToken?: string | null
    ) => {
      if (isInitial) setIsLoading(true);
      setIsSyncing(true);
      setErrorMessage(null);

      const targetId = overrideSpreadsheetId ?? activeSpreadsheetId;
      const targetTab = overrideTabTitle ?? activeTabTitle ?? undefined;
      const token = overrideToken !== undefined ? overrideToken : accessToken;

      try {
        if (token) {
          const gidNum =
            targetId === GOOGLE_SHEET_ID && !targetTab
              ? Number(GOOGLE_SHEET_GID)
              : undefined;
          const result = await fetchSheetEmployeesViaApi(
            targetId,
            token,
            gidNum,
            targetTab
          );
          setRawEmployees(result.employees);
          setActiveSpreadsheetId(targetId);
          setActiveTabTitle(result.tabTitle);
          setSourceInfo({
            type: 'google-sheet',
            label: `${result.spreadsheetTitle} (${result.tabTitle})`,
            syncedAt: new Date(),
            rowCount: result.employees.length,
          });
        } else if (targetId === GOOGLE_SHEET_ID) {
          const records = await fetchGoogleSheetEmployees();
          setRawEmployees(records);
          setSourceInfo({
            type: 'google-sheet',
            label: 'Google Sheets (Shell UK)',
            syncedAt: new Date(),
            rowCount: records.length,
          });
        } else {
          throw new Error(
            'Sign in with Google to sync custom or private Google Spreadsheets.'
          );
        }
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Unable to read the Google Sheet.';
        if (msg.toLowerCase().includes('expired') || msg.includes('401')) {
          clearAccessToken();
          setAccessToken(null);
        }
        setErrorMessage(msg);
      } finally {
        setIsLoading(false);
        setIsSyncing(false);
      }
    },
    [accessToken, activeSpreadsheetId, activeTabTitle]
  );

  useEffect(() => {
    void syncFromGoogleSheet(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setErrorMessage(null);
    try {
      const { user, accessToken: freshToken } = await googleSignIn();
      setGoogleUser(user);
      setAccessToken(freshToken);
      await syncFromGoogleSheet(false, activeSpreadsheetId, activeTabTitle ?? undefined, freshToken);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Google sign-in failed.';
      setErrorMessage(msg);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await googleSignOut();
    setGoogleUser(null);
    setAccessToken(null);
  };

  const handleSelectSheetSource = async (
    spreadsheetId: string,
    tabTitle?: string
  ) => {
    await syncFromGoogleSheet(false, spreadsheetId, tabTitle, accessToken);
    setFilters(INITIAL_FILTERS);
  };

  const handleCsvUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setErrorMessage(null);
    setIsSyncing(true);

    try {
      const text = await file.text();
      const records = parseEmployeeCsv(text);
      setRawEmployees(records);
      setSourceInfo({
        type: 'csv-upload',
        label: file.name,
        syncedAt: new Date(),
        rowCount: records.length,
      });
      setFilters(INITIAL_FILTERS);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Could not parse the uploaded CSV file.';
      setErrorMessage(msg);
    } finally {
      setIsSyncing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const scoredEmployees = useMemo(
    () => scoreEmployees(rawEmployees, rawEmployees),
    [rawEmployees]
  );

  const filterOptions = useMemo(() => {
    const uniq = (fn: (e: Employee) => string) =>
      Array.from(new Set(rawEmployees.map(fn)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

    return {
      departments: uniq((e) => e.Department),
      locations: uniq((e) => e.Location),
      employmentTypes: uniq((e) => e.EmploymentType),
      genders: uniq((e) => e.Gender),
    };
  }, [rawEmployees]);

  const filteredEmployees = useMemo(
    () => applyFilters(scoredEmployees, filters),
    [scoredEmployees, filters]
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.department !== 'All') count += 1;
    if (filters.location !== 'All') count += 1;
    if (filters.employmentType !== 'All') count += 1;
    if (filters.gender !== 'All') count += 1;
    if (filters.attrition !== 'All') count += 1;
    return count;
  }, [filters]);

  const handleExportFilteredCsv = () => {
    if (filteredEmployees.length === 0) return;
    const headers = [
      'EmployeeID',
      'FirstName',
      'LastName',
      'Gender',
      'Age',
      'Department',
      'JobTitle',
      'JobLevel',
      'EmploymentType',
      'Location',
      'HireDate',
      'YearsAtCompany',
      'YearsSinceLastPromotion',
      'MonthlyIncome_GBP',
      'Attrition',
      'FlightRiskScore',
      'FlightRiskTier',
    ];
    const escapeCell = (val: string | number) => {
      const str = String(val);
      return str.includes(',') || str.includes('"')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    };
    const rows = filteredEmployees.map((e) =>
      [
        e.EmployeeID,
        e.FirstName,
        e.LastName,
        e.Gender,
        e.Age,
        e.Department,
        e.JobTitle,
        e.JobLevel,
        e.EmploymentType,
        e.Location,
        e.HireDate,
        e.YearsAtCompany,
        e.YearsSinceLastPromotion,
        e.MonthlyIncome_GBP,
        e.Attrition,
        e.flightRiskScore,
        e.flightRiskTier,
      ]
        .map(escapeCell)
        .join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shell-people-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formattedSyncTime = sourceInfo.syncedAt
    ? sourceInfo.syncedAt.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : 'Not synced';

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-50 transition-colors duration-150">
      {/* Hidden CSV file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleCsvUpload}
        className="sr-only"
        aria-label="Upload employee CSV file"
      />

      {/* Top Navigation Bar (3-zone contract) */}
      <header className="bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4 lg:gap-8">
          {/* Zone 1: Brand Wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <svg
              aria-hidden="true"
              viewBox="0 0 32 32"
              className="h-7 w-7 shrink-0"
              fill="none"
            >
              <path
                d="M16 3L28 11.5L24 27H8L4 11.5L16 3Z"
                fill="#FFC800"
                stroke="#DD1D21"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
              <path
                d="M16 4V26.5M16 4L10 26.5M16 4L22 26.5"
                stroke="#DD1D21"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            <span className="font-display text-lg font-bold tracking-tight text-neutral-950 dark:text-white whitespace-nowrap shrink-0">
              Shell People Analytics
            </span>
          </div>

          {/* Zone 2: Primary View Tabs */}
          <nav
            aria-label="Dashboard sections"
            className="order-3 lg:order-2 w-full lg:w-auto flex items-center gap-1 p-1 rounded-lg bg-neutral-100 dark:bg-neutral-800/80 overflow-x-auto"
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex-1 lg:flex-none px-4 py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC800] ${
                    isActive
                      ? 'bg-neutral-950 text-[#FFC800] dark:bg-[#FFC800] dark:text-neutral-950'
                      : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Theme + Data Controls */}
          <div className="order-2 lg:order-3 flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsDark((d) => !d)}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="h-10 w-10 inline-flex items-center justify-center rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC800]"
            >
              {isDark ? (
                <Sun className="h-4 w-4 text-[#FFC800]" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>

            {accessToken ? (
              <button
                type="button"
                onClick={() => setWorkspaceModalOpen(true)}
                className="h-10 px-3.5 inline-flex items-center gap-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs sm:text-sm font-medium text-neutral-800 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC800]"
              >
                <FileSpreadsheet className="h-4 w-4 text-[#F58220] shrink-0" />
                <span>Google Sheets</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isSigningIn}
                onClick={() => void handleGoogleSignIn()}
                className="h-10 px-3.5 inline-flex items-center gap-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs sm:text-sm font-medium text-neutral-800 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC800]"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 48 48"
                  className="h-4 w-4 shrink-0"
                >
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
                <span>{isSigningIn ? 'Signing in...' : 'Sign in with Google'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-10 px-3.5 inline-flex items-center gap-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs sm:text-sm font-medium text-neutral-800 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC800]"
            >
              <Upload className="h-4 w-4 shrink-0" />
              <span>Upload CSV</span>
            </button>

            <button
              type="button"
              onClick={() => void syncFromGoogleSheet(false)}
              disabled={isSyncing}
              className="h-10 px-4 inline-flex items-center gap-2 rounded-md bg-[#FFC800] hover:bg-[#eab700] text-neutral-950 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 dark:focus-visible:ring-white"
            >
              <RefreshCw
                className={`h-4 w-4 shrink-0 ${isSyncing ? 'animate-spin' : ''}`}
              />
              <span>{isSyncing ? 'Syncing...' : 'Sync Sheet'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Error Banner */}
        {errorMessage && (
          <div
            role="alert"
            className="bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-[#DD1D21] dark:text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-red-950 dark:text-red-100">
                  Unable to load employee dataset
                </h2>
                <p className="text-xs sm:text-sm text-red-800 dark:text-red-200 leading-relaxed">
                  {errorMessage}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {!accessToken && (
                <button
                  type="button"
                  disabled={isSigningIn}
                  onClick={() => void handleGoogleSignIn()}
                  className="px-3.5 py-2 rounded-md bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-neutral-950 dark:text-white text-xs font-semibold hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer whitespace-nowrap"
                >
                  {isSigningIn ? 'Signing in...' : 'Sign in with Google'}
                </button>
              )}
              <button
                type="button"
                onClick={() => void syncFromGoogleSheet(false)}
                className="px-3.5 py-2 rounded-md bg-[#FFC800] text-neutral-950 text-xs font-semibold hover:bg-[#eab700] cursor-pointer whitespace-nowrap"
              >
                Retry Sync
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 rounded-md border border-red-300 dark:border-red-700 bg-white dark:bg-neutral-900 text-red-900 dark:text-red-100 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-900/40 cursor-pointer whitespace-nowrap"
              >
                Upload CSV Fallback
              </button>
            </div>
          </div>
        )}

        {/* Shared Filters Bar (above all three tabs) */}
        <section
          aria-label="Workforce Filters"
          className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 sm:p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400 tabular-nums">
              <span className="font-semibold text-neutral-950 dark:text-white">
                Shell UK Workforce
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Showing {formatNumber(filteredEmployees.length)} of{' '}
                {formatNumber(rawEmployees.length)} employees
              </span>
              <span aria-hidden="true">·</span>
              <span>Source: {sourceInfo.label}</span>
              <span aria-hidden="true">·</span>
              <span>Synced {formattedSyncTime}</span>
            </div>

            <div className="flex items-center gap-2">
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilters(INITIAL_FILTERS)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-[#D96B0A] dark:text-[#FFC800] hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset ({activeFilterCount})</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setMobileFiltersOpen((v) => !v)}
                aria-expanded={mobileFiltersOpen}
                className="md:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 text-xs font-medium text-neutral-800 dark:text-neutral-200 cursor-pointer whitespace-nowrap"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>
                  {mobileFiltersOpen ? 'Hide Filters' : 'Filters'}
                  {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                </span>
              </button>
            </div>
          </div>

          <div
            className={`${
              mobileFiltersOpen ? 'grid' : 'hidden md:grid'
            } grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3`}
          >
            <div className="space-y-1">
              <label
                htmlFor="filter-department"
                className="block text-xs font-medium text-neutral-600 dark:text-neutral-400"
              >
                Department
              </label>
              <select
                id="filter-department"
                value={filters.department}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, department: e.target.value }))
                }
                className="w-full h-10 px-3 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 text-neutral-950 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC800]"
              >
                <option value="All">All Departments</option>
                {filterOptions.departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="filter-location"
                className="block text-xs font-medium text-neutral-600 dark:text-neutral-400"
              >
                Location
              </label>
              <select
                id="filter-location"
                value={filters.location}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, location: e.target.value }))
                }
                className="w-full h-10 px-3 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 text-neutral-950 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC800]"
              >
                <option value="All">All Locations</option>
                {filterOptions.locations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="filter-employment-type"
                className="block text-xs font-medium text-neutral-600 dark:text-neutral-400"
              >
                Employment Type
              </label>
              <select
                id="filter-employment-type"
                value={filters.employmentType}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, employmentType: e.target.value }))
                }
                className="w-full h-10 px-3 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 text-neutral-950 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC800]"
              >
                <option value="All">All Types</option>
                {filterOptions.employmentTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="filter-gender"
                className="block text-xs font-medium text-neutral-600 dark:text-neutral-400"
              >
                Gender
              </label>
              <select
                id="filter-gender"
                value={filters.gender}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, gender: e.target.value }))
                }
                className="w-full h-10 px-3 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 text-neutral-950 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC800]"
              >
                <option value="All">All Genders</option>
                {filterOptions.genders.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="filter-attrition"
                className="block text-xs font-medium text-neutral-600 dark:text-neutral-400"
              >
                Attrition
              </label>
              <select
                id="filter-attrition"
                value={filters.attrition}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    attrition: e.target.value as FilterState['attrition'],
                  }))
                }
                className="w-full h-10 px-3 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 text-neutral-950 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC800]"
              >
                <option value="All">All (Active & Left)</option>
                <option value="No">Active Only (No)</option>
                <option value="Yes">Attrition Only (Yes)</option>
              </select>
            </div>
          </div>
        </section>

        {/* Main Content States */}
        {isLoading ? (
          <div className="space-y-6" aria-busy="true" aria-label="Loading analytics">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-32 rounded-lg bg-neutral-200/70 dark:bg-neutral-800/70 animate-pulse"
                />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="h-80 rounded-lg bg-neutral-200/70 dark:bg-neutral-800/70 animate-pulse" />
              <div className="h-80 rounded-lg bg-neutral-200/70 dark:bg-neutral-800/70 animate-pulse" />
            </div>
          </div>
        ) : rawEmployees.length === 0 ? (
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-10 text-center space-y-4">
            <h2 className="text-base font-semibold text-neutral-950 dark:text-white">
              No employee records loaded
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-md mx-auto">
              Sync directly from the public Google Sheet or upload a local Shell UK employee CSV export to populate the dashboard.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => void syncFromGoogleSheet(false)}
                className="px-4 py-2 rounded-md bg-[#FFC800] text-neutral-950 text-sm font-semibold hover:bg-[#eab700] cursor-pointer"
              >
                Sync Sheet
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
              >
                Upload CSV
              </button>
            </div>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-10 text-center space-y-4">
            <h2 className="text-base font-semibold text-neutral-950 dark:text-white">
              No employees match these filters
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-md mx-auto">
              Try broadening one or more of the Department, Location, Employment Type, Gender, or Attrition filters.
            </p>
            <button
              type="button"
              onClick={() => setFilters(INITIAL_FILTERS)}
              className="px-4 py-2 rounded-md bg-[#FFC800] text-neutral-950 text-sm font-semibold hover:bg-[#eab700] cursor-pointer"
            >
              Reset All Filters
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'overview' && (
              <OverviewTab employees={filteredEmployees} isDark={isDark} />
            )}
            {activeTab === 'deep-dive' && (
              <DeepDiveTab employees={filteredEmployees} isDark={isDark} />
            )}
            {activeTab === 'insights' && (
              <InsightsTab
                employees={filteredEmployees}
                allEmployees={scoredEmployees}
              />
            )}
          </>
        )}
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 mt-10">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-neutral-500 dark:text-neutral-400">
          <span>
            Shell People Analytics · {accessToken ? `Google Sheets API (${googleUser?.email ?? 'Connected'})` : 'Google Sheets gviz feed'} · Pay figures in GBP (£)
          </span>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => setWorkspaceModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white font-medium cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>{accessToken ? 'Manage Google Sheets' : 'Connect Google Account'}</span>
            </button>
            <button
              type="button"
              disabled={filteredEmployees.length === 0}
              onClick={handleExportFilteredCsv}
              className="inline-flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white font-medium disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Filtered CSV ({formatNumber(filteredEmployees.length)})</span>
            </button>
          </div>
        </div>
      </footer>

      <GoogleWorkspaceModal
        isOpen={workspaceModalOpen}
        onClose={() => setWorkspaceModalOpen(false)}
        user={googleUser}
        accessToken={accessToken}
        isSigningIn={isSigningIn}
        onSignIn={handleGoogleSignIn}
        onSignOut={handleGoogleSignOut}
        activeSpreadsheetId={activeSpreadsheetId}
        activeTabTitle={activeTabTitle}
        onSelectSheetSource={handleSelectSheetSource}
        filteredEmployees={filteredEmployees}
      />
    </div>
  );
}
