import { AttritionStatus, Employee } from '../types/employee';

export const GOOGLE_SHEET_ID = '1RlJq1N7m38oGHestQQnoEfGnS5jb9K9X2oBHsHgAqks';
export const GOOGLE_SHEET_GID = '891316034';
export const GOOGLE_SHEET_GVIZ_URL = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GOOGLE_SHEET_GID}`;

const REQUIRED_COLUMNS = [
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
] as const;

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

function toSafeNumber(value: string | undefined, fallback = 0): number {
  if (!value) return fallback;
  const cleaned = value.replace(/[£$,\s]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseEmployeeMatrix(matrix: string[][]): Employee[] {
  if (matrix.length === 0) {
    throw new Error('The spreadsheet contains no rows.');
  }
  if (matrix.length < 2) {
    throw new Error('The spreadsheet contains a header row but no employee records.');
  }

  const rawHeaders = matrix[0].map((h) => h.replace(/^"|"$/g, '').trim());
  const headerIndex = new Map<string, number>();
  rawHeaders.forEach((header, idx) => {
    headerIndex.set(header, idx);
  });

  const missingColumns = REQUIRED_COLUMNS.filter((col) => !headerIndex.has(col));
  if (missingColumns.length > 0) {
    throw new Error(
      `Missing expected column(s): ${missingColumns.join(', ')}. Please verify the sheet matches the Shell UK employee schema.`
    );
  }

  const getField = (row: string[], col: string): string => {
    const idx = headerIndex.get(col);
    if (idx === undefined) return '';
    return (row[idx] ?? '').trim();
  };

  const employees: Employee[] = [];
  for (let i = 1; i < matrix.length; i += 1) {
    const row = matrix[i];
    const id = getField(row, 'EmployeeID');
    if (!id) continue;

    const firstName = getField(row, 'FirstName');
    const lastName = getField(row, 'LastName');
    const hireDate = getField(row, 'HireDate');
    const parsedYear = Number(hireDate.slice(0, 4));
    const hireYear = Number.isFinite(parsedYear) && parsedYear > 1950 ? parsedYear : 2020;

    const rawAttrition = getField(row, 'Attrition').toLowerCase();
    const attrition: AttritionStatus =
      rawAttrition === 'yes' || rawAttrition === 'true' || rawAttrition === '1'
        ? 'Yes'
        : 'No';

    employees.push({
      EmployeeID: id,
      FirstName: firstName,
      LastName: lastName,
      FullName: `${firstName} ${lastName}`.trim() || id,
      Gender: getField(row, 'Gender') || 'Unspecified',
      Age: toSafeNumber(getField(row, 'Age'), 0),
      MaritalStatus: getField(row, 'MaritalStatus') || 'Unspecified',
      Department: getField(row, 'Department') || 'Unassigned',
      JobTitle: getField(row, 'JobTitle') || 'Staff',
      JobLevel: toSafeNumber(getField(row, 'JobLevel'), 1),
      EmploymentType: getField(row, 'EmploymentType') || 'Full-Time',
      Location: getField(row, 'Location') || 'Unspecified',
      HireDate: hireDate,
      HireYear: hireYear,
      YearsAtCompany: toSafeNumber(getField(row, 'YearsAtCompany'), 0),
      YearsInCurrentRole: toSafeNumber(getField(row, 'YearsInCurrentRole'), 0),
      YearsSinceLastPromotion: toSafeNumber(getField(row, 'YearsSinceLastPromotion'), 0),
      YearsWithCurrManager: toSafeNumber(getField(row, 'YearsWithCurrManager'), 0),
      Education: getField(row, 'Education') || 'Unspecified',
      DistanceFromHome_km: toSafeNumber(getField(row, 'DistanceFromHome_km'), 0),
      BusinessTravel: getField(row, 'BusinessTravel') || 'Non-Travel',
      MonthlyIncome_GBP: toSafeNumber(getField(row, 'MonthlyIncome_GBP'), 0),
      Attrition: attrition,
    });
  }

  if (employees.length === 0) {
    throw new Error('No valid employee records could be parsed from the sheet.');
  }

  return employees;
}

export function parseEmployeeCsv(csvText: string): Employee[] {
  const normalized = csvText.replace(/^\uFEFF/, '').trim();
  if (!normalized) {
    throw new Error('The CSV payload is empty.');
  }

  const lowerHead = normalized.slice(0, 400).toLowerCase();
  if (lowerHead.includes('<!doctype html') || lowerHead.includes('<html')) {
    throw new Error(
      'Google Sheets returned an HTML login or permission page instead of CSV. Sign in with Google to read private sheets via the Sheets API, or use Upload CSV.'
    );
  }

  const lines = normalized.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('The CSV file contains a header row but no employee records.');
  }

  const matrix = lines.map((line) => parseCsvLine(line));
  return parseEmployeeMatrix(matrix);
}

export async function fetchGoogleSheetEmployees(): Promise<Employee[]> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);

  try {
    const cacheBustedUrl = `${GOOGLE_SHEET_GVIZ_URL}&_ts=${Date.now()}`;
    const response = await fetch(cacheBustedUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'text/csv,text/plain,*/*',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Google Sheets endpoint responded with HTTP ${response.status} (${response.statusText || 'Error'}). Confirm the sheet is published/shared publicly or use Upload CSV.`
      );
    }

    const csvText = await response.text();
    return parseEmployeeCsv(csvText);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(
        'Request to Google Sheets timed out after 15 seconds. Check your internet connection or use Upload CSV.'
      );
    }
    if (error instanceof TypeError) {
      throw new Error(
        'Network or CORS error while reaching Google Sheets. Check connectivity or load a local export using Upload CSV.'
      );
    }
    throw error instanceof Error
      ? error
      : new Error('Unable to read the Google Sheet CSV endpoint.');
  } finally {
    window.clearTimeout(timeoutId);
  }
}
