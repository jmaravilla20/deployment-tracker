// ─── PASTE THIS ENTIRE FILE INTO GOOGLE APPS SCRIPT ──────────────────────────
// In your Google Sheet: Extensions → Apps Script → replace everything → Save → Deploy
//
// Deploy settings:
//   Execute as: Me
//   Who has access: Anyone
// Copy the Web App URL and paste it into app.js as API_URL

const SS_ID = '1sFRKFBoHlrqswqsOkEFXIzFPmWBjakQNv2Zb0jCoPzw';

function doGet(e) {
  const action = (e.parameter && e.parameter.action) || '';
  let result;

  try {
    if      (action === 'activities') result = getData('Marketing Activities (DO NOT UPDATE)');
    else if (action === 'qa')         result = getData('QA Week of');
    else if (action === 'logos')      result = getData('LOGO');
    else if (action === 'update')     result = updateRow(e.parameter);
    else result = { error: 'Unknown action: ' + action };
  } catch (err) {
    result = { error: err.toString() };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── READ a sheet and return array of row objects ─────────────────────────────
function getData(sheetName) {
  const ss    = SpreadsheetApp.openById(SS_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { error: 'Sheet not found: ' + sheetName };

  const values = sheet.getDataRange().getValues();
  if (!values.length) return [];

  const headers = values[0];
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = String(row[i] == null ? '' : row[i]); });
    return obj;
  });
}

// ─── UPDATE a row in REFRESH SHEET by 18-digit Activity ID ───────────────────
// Called with: ?action=update&activityId=xxx&fields={"Field Name":"value",...}
function updateRow(params) {
  const activityId = params.activityId;
  const fields     = JSON.parse(params.fields || '{}');

  const ss      = SpreadsheetApp.openById(SS_ID);
  const sheet   = ss.getSheetByName('REFRESH SHEET (SEND UPDATES TO SFDC)');
  const values  = sheet.getDataRange().getValues();
  const headers = values[0];

  const rowIdx = values.findIndex((r, i) => i > 0 && String(r[0]) === String(activityId));
  if (rowIdx === -1) return { error: 'Activity ID not found in REFRESH SHEET' };

  const row = values[rowIdx].slice();
  Object.entries(fields).forEach(([fieldName, value]) => {
    const colIdx = headers.indexOf(fieldName);
    if (colIdx >= 0) row[colIdx] = value;
  });

  sheet.getRange(rowIdx + 1, 1, 1, row.length).setValues([row]);
  return { success: true, rowUpdated: rowIdx + 1 };
}
