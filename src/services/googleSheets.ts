import { Employee, ScoredEmployee } from '../types/employee';
import { parseEmployeeMatrix } from '../utils/csv';

export interface SpreadsheetTabInfo {
  sheetId: number;
  title: string;
  rowCount?: number;
  columnCount?: number;
}

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  sheets: SpreadsheetTabInfo[];
}

export interface DriveSpreadsheetFile {
  id: string;
  name: string;
  modifiedTime?: string;
}

async function handleGoogleApiResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    throw new Error(
      'Your Google session token expired or lacks permission. Please sign in with Google again.'
    );
  }
  if (res.status === 403) {
    const body = await res.json().catch(() => null);
    const msg = body?.error?.message;
    throw new Error(
      msg
        ? `Google API access denied (403): ${msg}`
        : 'Access denied (403). Verify you have permission to access this Google Sheet and approved the requested permissions.'
    );
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body?.error?.message || res.statusText || 'API error';
    throw new Error(`Google API error (${res.status}): ${msg}`);
  }
  return (await res.json()) as T;
}

export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match?.[1]) return match[1];
  return trimmed;
}

export async function listDriveSpreadsheets(
  accessToken: string
): Promise<DriveSpreadsheetFile[]> {
  const query = encodeURIComponent(
    "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
  );
  const fields = encodeURIComponent('files(id,name,modifiedTime)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime desc&pageSize=25&fields=${fields}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await handleGoogleApiResponse<{ files?: DriveSpreadsheetFile[] }>(
    res
  );
  return data.files ?? [];
}

export async function fetchSpreadsheetMetadata(
  spreadsheetId: string,
  accessToken: string
): Promise<SpreadsheetMetadata> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}?fields=spreadsheetId,properties.title,sheets.properties`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await handleGoogleApiResponse<{
    spreadsheetId: string;
    properties?: { title?: string };
    sheets?: Array<{
      properties?: {
        sheetId?: number;
        title?: string;
        gridProperties?: { rowCount?: number; columnCount?: number };
      };
    }>;
  }>(res);

  const sheets: SpreadsheetTabInfo[] = (data.sheets ?? []).map((s) => ({
    sheetId: s.properties?.sheetId ?? 0,
    title: s.properties?.title ?? 'Sheet',
    rowCount: s.properties?.gridProperties?.rowCount,
    columnCount: s.properties?.gridProperties?.columnCount,
  }));

  if (sheets.length === 0) {
    throw new Error('This Google Spreadsheet contains no readable tabs.');
  }

  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title ?? 'Untitled Spreadsheet',
    sheets,
  };
}

export async function fetchSheetEmployeesViaApi(
  spreadsheetId: string,
  accessToken: string,
  targetGid?: number,
  targetTabTitle?: string
): Promise<{
  employees: Employee[];
  spreadsheetTitle: string;
  tabTitle: string;
  tabId: number;
  allTabs: SpreadsheetTabInfo[];
}> {
  const meta = await fetchSpreadsheetMetadata(spreadsheetId, accessToken);

  let selectedTab = meta.sheets[0];
  if (targetTabTitle) {
    const byTitle = meta.sheets.find((s) => s.title === targetTabTitle);
    if (byTitle) selectedTab = byTitle;
  } else if (targetGid !== undefined) {
    const byGid = meta.sheets.find((s) => s.sheetId === targetGid);
    if (byGid) selectedTab = byGid;
  }

  const safeSheetName = `'${selectedTab.title.replace(/'/g, "''")}'`;
  const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values/${encodeURIComponent(safeSheetName)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;

  const res = await fetch(valuesUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await handleGoogleApiResponse<{ values?: unknown[][] }>(res);
  const matrix = (data.values ?? []).map((row) =>
    row.map((cell) => (cell === null || cell === undefined ? '' : String(cell)))
  );

  const employees = parseEmployeeMatrix(matrix);
  return {
    employees,
    spreadsheetTitle: meta.title,
    tabTitle: selectedTab.title,
    tabId: selectedTab.sheetId,
    allTabs: meta.sheets,
  };
}

export async function createSnapshotSpreadsheet(
  accessToken: string,
  title: string,
  employees: ScoredEmployee[]
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
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
    'PrimaryRiskDrivers',
  ];

  const rows = employees.map((e) => [
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
    e.riskDrivers.join(' | '),
  ]);

  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: 'Filtered Workforce' } }],
    }),
  });

  const created = await handleGoogleApiResponse<{
    spreadsheetId: string;
    spreadsheetUrl: string;
  }>(createRes);

  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      created.spreadsheetId
    )}/values/${encodeURIComponent("'Filtered Workforce'!A1")}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [headers, ...rows],
      }),
    }
  );
  await handleGoogleApiResponse(updateRes);

  return created;
}

export async function writeWatchlistToSheet(
  accessToken: string,
  spreadsheetId: string,
  tabTitle: string,
  watchlist: ScoredEmployee[]
): Promise<void> {
  const meta = await fetchSpreadsheetMetadata(spreadsheetId, accessToken);
  const existing = meta.sheets.find((s) => s.title === tabTitle);

  if (!existing) {
    const addTabRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [{ addSheet: { properties: { title: tabTitle } } }],
        }),
      }
    );
    await handleGoogleApiResponse(addTabRes);
  } else {
    const clearRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${encodeURIComponent(`'${tabTitle.replace(/'/g, "''")}'`)}:clear`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    await handleGoogleApiResponse(clearRes);
  }

  const headers = [
    'Rank',
    'EmployeeID',
    'FullName',
    'Department',
    'JobTitle',
    'JobLevel',
    'Location',
    'YearsAtCompany',
    'YearsSinceLastPromotion',
    'MonthlyIncome_GBP',
    'FlightRiskScore',
    'FlightRiskTier',
    'PrimaryRiskDrivers',
  ];

  const rows = watchlist.map((e, idx) => [
    idx + 1,
    e.EmployeeID,
    e.FullName,
    e.Department,
    e.JobTitle,
    e.JobLevel,
    e.Location,
    e.YearsAtCompany,
    e.YearsSinceLastPromotion,
    e.MonthlyIncome_GBP,
    e.flightRiskScore,
    e.flightRiskTier,
    e.riskDrivers.join(' · '),
  ]);

  const writeRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(
      `'${tabTitle.replace(/'/g, "''")}'!A1`
    )}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [headers, ...rows],
      }),
    }
  );
  await handleGoogleApiResponse(writeRes);
}
