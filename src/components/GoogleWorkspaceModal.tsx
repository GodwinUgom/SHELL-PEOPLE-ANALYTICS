import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  Check,
  ExternalLink,
  FileSpreadsheet,
  LogOut,
  RefreshCw,
  X,
} from 'lucide-react';
import { ScoredEmployee } from '../types/employee';
import {
  createSnapshotSpreadsheet,
  DriveSpreadsheetFile,
  extractSpreadsheetId,
  fetchSpreadsheetMetadata,
  listDriveSpreadsheets,
  SpreadsheetTabInfo,
  writeWatchlistToSheet,
} from '../services/googleSheets';
import { GOOGLE_SHEET_ID } from '../utils/csv';

interface GoogleWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  accessToken: string | null;
  isSigningIn: boolean;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  activeSpreadsheetId: string;
  activeTabTitle: string | null;
  onSelectSheetSource: (spreadsheetId: string, tabTitle?: string) => Promise<void>;
  filteredEmployees: ScoredEmployee[];
}

export function GoogleWorkspaceModal({
  isOpen,
  onClose,
  user,
  accessToken,
  isSigningIn,
  onSignIn,
  onSignOut,
  activeSpreadsheetId,
  activeTabTitle,
  onSelectSheetSource,
  filteredEmployees,
}: GoogleWorkspaceModalProps) {
  const [driveFiles, setDriveFiles] = useState<DriveSpreadsheetFile[]>([]);
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [sheetUrlInput, setSheetUrlInput] = useState(activeSpreadsheetId);
  const [selectedSpreadsheetId, setSelectedSpreadsheetId] = useState(activeSpreadsheetId);
  const [selectedSpreadsheetTitle, setSelectedSpreadsheetTitle] = useState<string>('');
  const [tabs, setTabs] = useState<SpreadsheetTabInfo[]>([]);
  const [chosenTab, setChosenTab] = useState<string>(activeTabTitle ?? '');
  const [loadingTabs, setLoadingTabs] = useState(false);

  const [actionBusy, setActionBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    message: string;
    url?: string;
  } | null>(null);

  // Explicit user confirmation state before any mutating write to an existing sheet
  const [confirmOverwriteOpen, setConfirmOverwriteOpen] = useState(false);
  const [watchlistTabName, setWatchlistTabName] = useState('FlightRisk_Watchlist');

  useEffect(() => {
    if (!isOpen) return;
    setModalError(null);
    setSuccessInfo(null);
    setConfirmOverwriteOpen(false);
    setSheetUrlInput(activeSpreadsheetId);
    setSelectedSpreadsheetId(activeSpreadsheetId);
  }, [isOpen, activeSpreadsheetId]);

  useEffect(() => {
    if (!isOpen || !accessToken) return;
    let cancelled = false;

    const loadDrive = async () => {
      setLoadingDrive(true);
      try {
        const files = await listDriveSpreadsheets(accessToken);
        if (!cancelled) setDriveFiles(files);
      } catch (err) {
        if (!cancelled) {
          setModalError(
            err instanceof Error
              ? err.message
              : 'Unable to list spreadsheets from Google Drive.'
          );
        }
      } finally {
        if (!cancelled) setLoadingDrive(false);
      }
    };

    const loadCurrentMeta = async () => {
      setLoadingTabs(true);
      try {
        const meta = await fetchSpreadsheetMetadata(activeSpreadsheetId, accessToken);
        if (!cancelled) {
          setSelectedSpreadsheetTitle(meta.title);
          setTabs(meta.sheets);
          setChosenTab(
            activeTabTitle && meta.sheets.some((s) => s.title === activeTabTitle)
              ? activeTabTitle
              : meta.sheets[0]?.title ?? ''
          );
        }
      } catch {
        // Non-fatal if user hasn't opened current sheet yet
      } finally {
        if (!cancelled) setLoadingTabs(false);
      }
    };

    void loadDrive();
    void loadCurrentMeta();

    return () => {
      cancelled = true;
    };
  }, [isOpen, accessToken, activeSpreadsheetId, activeTabTitle]);

  if (!isOpen) return null;

  const inspectSpreadsheet = async (rawIdOrUrl: string) => {
    if (!accessToken) return;
    const id = extractSpreadsheetId(rawIdOrUrl);
    if (!id) {
      setModalError('Enter a valid Google Sheets URL or Spreadsheet ID.');
      return;
    }
    setModalError(null);
    setSuccessInfo(null);
    setLoadingTabs(true);
    try {
      const meta = await fetchSpreadsheetMetadata(id, accessToken);
      setSelectedSpreadsheetId(meta.spreadsheetId);
      setSheetUrlInput(meta.spreadsheetId);
      setSelectedSpreadsheetTitle(meta.title);
      setTabs(meta.sheets);
      setChosenTab(meta.sheets[0]?.title ?? '');
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Unable to inspect spreadsheet tabs.'
      );
    } finally {
      setLoadingTabs(false);
    }
  };

  const handleLoadSelectedTab = async () => {
    setModalError(null);
    setSuccessInfo(null);
    setActionBusy(true);
    try {
      await onSelectSheetSource(selectedSpreadsheetId, chosenTab || undefined);
      setSuccessInfo({
        message: `Loaded data from "${selectedSpreadsheetTitle || selectedSpreadsheetId}" (${chosenTab || 'default tab'}).`,
      });
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Failed to load spreadsheet data.'
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleCreateSnapshot = async () => {
    if (!accessToken || filteredEmployees.length === 0) return;
    setModalError(null);
    setSuccessInfo(null);
    setActionBusy(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const created = await createSnapshotSpreadsheet(
        accessToken,
        `Shell People Analytics Snapshot (${stamp})`,
        filteredEmployees
      );
      setSuccessInfo({
        message: `Created new Google Sheet with ${filteredEmployees.length} filtered records.`,
        url: created.spreadsheetUrl,
      });
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Failed to create Google Sheet snapshot.'
      );
    } finally {
      setActionBusy(false);
    }
  };

  const top10ActiveWatchlist = filteredEmployees
    .filter((e) => e.Attrition === 'No')
    .sort(
      (a, b) =>
        b.flightRiskScore - a.flightRiskScore ||
        b.YearsSinceLastPromotion - a.YearsSinceLastPromotion
    )
    .slice(0, 10);

  const handleConfirmWriteWatchlist = async () => {
    if (!accessToken || top10ActiveWatchlist.length === 0) return;
    setConfirmOverwriteOpen(false);
    setModalError(null);
    setSuccessInfo(null);
    setActionBusy(true);
    try {
      await writeWatchlistToSheet(
        accessToken,
        selectedSpreadsheetId,
        watchlistTabName.trim() || 'FlightRisk_Watchlist',
        top10ActiveWatchlist
      );
      setSuccessInfo({
        message: `Updated "${watchlistTabName}" in "${selectedSpreadsheetTitle || selectedSpreadsheetId}" with ${top10ActiveWatchlist.length} watchlist rows.`,
        url: `https://docs.google.com/spreadsheets/d/${selectedSpreadsheetId}/edit`,
      });
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Failed to update Google Sheet tab.'
      );
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-modal-title"
    >
      <div className="w-full max-w-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="h-5 w-5 text-[#F58220] shrink-0" />
            <h2
              id="workspace-modal-title"
              className="text-base font-semibold text-neutral-950 dark:text-white"
            >
              Google Sheets & Drive Connection
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Google Sheets panel"
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-neutral-500 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm">
          {modalError && (
            <div
              role="alert"
              className="p-3.5 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-xs text-red-900 dark:text-red-200 flex items-start gap-2.5"
            >
              <AlertTriangle className="h-4 w-4 text-[#DD1D21] shrink-0 mt-0.5" />
              <span>{modalError}</span>
            </div>
          )}

          {successInfo && (
            <div className="p-3.5 rounded-md bg-neutral-100 dark:bg-neutral-800 border border-[#FFC800] text-xs text-neutral-950 dark:text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-[#D96B0A] dark:text-[#FFC800] shrink-0" />
                <span>{successInfo.message}</span>
              </div>
              {successInfo.url && (
                <a
                  href={successInfo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-[#D96B0A] dark:text-[#FFC800] hover:underline whitespace-nowrap shrink-0"
                >
                  <span>Open Sheet</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )}

          {!accessToken ? (
            <div className="py-4 space-y-4">
              <div className="space-y-1.5">
                <h3 className="text-base font-semibold text-neutral-950 dark:text-white">
                  Sign in with Google to access private spreadsheets
                </h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
                  Connect your Google account to sync directly through the Google Sheets API, browse spreadsheets from your Google Drive, switch tabs, or export filtered workforce snapshots.
                </p>
              </div>

              <button
                type="button"
                disabled={isSigningIn}
                onClick={() => void onSignIn()}
                className="inline-flex items-center gap-3 px-4 py-2.5 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-900 dark:text-white font-medium text-sm transition-colors cursor-pointer disabled:opacity-60"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 48 48"
                  className="h-5 w-5 shrink-0"
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
            </div>
          ) : (
            <>
              {/* Account Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-neutral-200 dark:border-neutral-800">
                <div className="text-xs">
                  <div className="font-semibold text-neutral-950 dark:text-white">
                    {user?.displayName || 'Connected Google Account'}
                  </div>
                  <div className="text-neutral-500 dark:text-neutral-400">
                    {user?.email}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void onSignOut()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign out</span>
                </button>
              </div>

              {/* Select Spreadsheet & Tab */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
                    Load Spreadsheet from Google Drive or URL
                  </h3>
                  <button
                    type="button"
                    onClick={() => void inspectSpreadsheet(GOOGLE_SHEET_ID)}
                    className="text-xs font-medium text-[#D96B0A] dark:text-[#FFC800] hover:underline cursor-pointer"
                  >
                    Use Default Shell UK Sheet
                  </button>
                </div>

                {driveFiles.length > 0 && (
                  <div className="space-y-1">
                    <label
                      htmlFor="drive-sheet-picker"
                      className="block text-xs text-neutral-500 dark:text-neutral-400"
                    >
                      Recent Google Sheets in your Drive
                    </label>
                    <select
                      id="drive-sheet-picker"
                      value={
                        driveFiles.some((f) => f.id === selectedSpreadsheetId)
                          ? selectedSpreadsheetId
                          : ''
                      }
                      onChange={(e) => {
                        if (e.target.value) {
                          void inspectSpreadsheet(e.target.value);
                        }
                      }}
                      disabled={loadingDrive}
                      className="w-full h-10 px-3 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 text-neutral-950 dark:text-white"
                    >
                      <option value="">Select a spreadsheet from Drive...</option>
                      {driveFiles.map((file) => (
                        <option key={file.id} value={file.id}>
                          {file.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={sheetUrlInput}
                    onChange={(e) => setSheetUrlInput(e.target.value)}
                    placeholder="Paste Google Sheets URL or Spreadsheet ID"
                    aria-label="Google Sheets URL or Spreadsheet ID"
                    className="flex-1 h-10 px-3 text-xs font-mono rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 text-neutral-950 dark:text-white"
                  />
                  <button
                    type="button"
                    disabled={loadingTabs}
                    onClick={() => void inspectSpreadsheet(sheetUrlInput)}
                    className="h-10 px-3.5 rounded-md border border-neutral-300 dark:border-neutral-700 text-xs font-semibold hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer whitespace-nowrap"
                  >
                    {loadingTabs ? 'Checking...' : 'Inspect Tabs'}
                  </button>
                </div>

                {tabs.length > 0 && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 pt-1">
                    <div className="flex-1 space-y-1">
                      <label
                        htmlFor="sheet-tab-select"
                        className="block text-xs text-neutral-500 dark:text-neutral-400"
                      >
                        Sheet Tab in{' '}
                        <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                          {selectedSpreadsheetTitle || selectedSpreadsheetId}
                        </span>
                      </label>
                      <select
                        id="sheet-tab-select"
                        value={chosenTab}
                        onChange={(e) => setChosenTab(e.target.value)}
                        className="w-full h-10 px-3 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 text-neutral-950 dark:text-white"
                      >
                        {tabs.map((tab) => (
                          <option key={tab.sheetId} value={tab.title}>
                            {tab.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleLoadSelectedTab()}
                      className="h-10 px-4 inline-flex items-center justify-center gap-2 rounded-md bg-[#FFC800] hover:bg-[#eab700] text-neutral-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${actionBusy ? 'animate-spin' : ''}`}
                      />
                      <span>Load Sheet Data</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Export & Watchlist Write Actions */}
              <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 space-y-4">
                <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
                  Export & Sync Reports to Google Sheets
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 space-y-2.5 flex flex-col justify-between">
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-neutral-950 dark:text-white">
                        Create New Snapshot Sheet
                      </div>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Creates a separate spreadsheet in your Drive with the{' '}
                        {filteredEmployees.length} filtered employees and flight-risk scores.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={actionBusy || filteredEmployees.length === 0}
                      onClick={() => void handleCreateSnapshot()}
                      className="h-9 px-3 rounded-md border border-neutral-300 dark:border-neutral-700 text-xs font-semibold hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 cursor-pointer"
                    >
                      Export Snapshot to New Sheet
                    </button>
                  </div>

                  <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 space-y-2.5 flex flex-col justify-between">
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-neutral-950 dark:text-white">
                        Write Top-10 Watchlist Tab
                      </div>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Writes the current Top-10 active flight-risk watchlist to a tab in the selected spreadsheet.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={actionBusy || top10ActiveWatchlist.length === 0}
                      onClick={() => setConfirmOverwriteOpen(true)}
                      className="h-9 px-3 rounded-md bg-neutral-950 dark:bg-neutral-800 text-white text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-700 disabled:opacity-40 cursor-pointer"
                    >
                      Update Watchlist Tab...
                    </button>
                  </div>
                </div>

                {/* Mandatory Confirmation Dialog for Mutating Spreadsheet Data */}
                {confirmOverwriteOpen && (
                  <div
                    role="alertdialog"
                    aria-labelledby="confirm-write-title"
                    className="p-4 rounded-lg border border-[#F58220] bg-orange-50/70 dark:bg-orange-950/30 space-y-3"
                  >
                    <div className="space-y-1">
                      <h4
                        id="confirm-write-title"
                        className="text-xs font-semibold text-neutral-950 dark:text-white"
                      >
                        Confirm Google Sheet Update
                      </h4>
                      <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">
                        This will create or overwrite the tab{' '}
                        <span className="font-mono font-semibold">
                          {watchlistTabName}
                        </span>{' '}
                        inside{' '}
                        <span className="font-semibold">
                          "{selectedSpreadsheetTitle || selectedSpreadsheetId}"
                        </span>{' '}
                        with {top10ActiveWatchlist.length} Top-10 Watchlist employee rows (plus header). Existing contents in that tab will be replaced.
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <input
                        type="text"
                        value={watchlistTabName}
                        onChange={(e) => setWatchlistTabName(e.target.value)}
                        aria-label="Target watchlist tab name"
                        className="h-9 px-3 text-xs font-mono rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-950 dark:text-white"
                      />
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setConfirmOverwriteOpen(false)}
                          className="h-9 px-3 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-medium cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleConfirmWriteWatchlist()}
                          className="h-9 px-3.5 rounded-md bg-[#F58220] hover:bg-[#df7214] text-white text-xs font-semibold cursor-pointer"
                        >
                          Confirm & Write Tab
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
