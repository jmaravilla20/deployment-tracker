// ─── CONFIG ───────────────────────────────────────────────────────────────────
// 1. Go to https://console.cloud.google.com
// 2. Create a project → Enable "Google Sheets API"
// 3. Credentials → Create OAuth 2.0 Client ID (Web application)
// 4. Add your GitHub Pages URL to "Authorized JavaScript origins"
// 5. Paste the Client ID below
const CLIENT_ID      = 'YOUR_GOOGLE_OAUTH_CLIENT_ID';
const SPREADSHEET_ID = '1sFRKFBoHlrqswqsOkEFXIzFPmWBjakQNv2Zb0jCoPzw';
const SCOPES         = 'https://www.googleapis.com/auth/spreadsheets';

const SHEETS = {
  ACTIVITIES : 'Marketing Activities (DO NOT UPDATE)',
  REFRESH    : 'REFRESH SHEET (SEND UPDATES TO SFDC)',
  QA         : 'QA Week of',
  LOGO       : 'LOGO'
};

// ─── STATE ────────────────────────────────────────────────────────────────────
let tokenClient;
let allActivities = [];
let allQA         = [];
let allLogos      = [];
let currentEditRow = null;

// ─── INIT ─────────────────────────────────────────────────────────────────────
window.onload = () => {
  setDefaultWeekDate();
  gapi.load('client', () => {
    gapi.client.init({
      discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4']
    }).then(() => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: onTokenReceived
      });
      // Attempt silent sign-in (works if already logged into Google in browser)
      tokenClient.requestAccessToken({ prompt: '' });
    });
  });
};

function onTokenReceived(response) {
  if (response.error) return;
  document.getElementById('sign-in-btn').style.display = 'none';
  document.getElementById('user-info').textContent = '● Connected';
  loadAllData();
}

function handleAuthClick() {
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

// ─── DATA LOADING ─────────────────────────────────────────────────────────────
async function loadAllData() {
  await Promise.all([loadActivities(), loadQAData(), loadLogoData()]);
}

async function fetchSheet(sheetName) {
  const res = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'!A1:AZ5000`
  });
  return res.result.values || [];
}

async function loadActivities() {
  const rows = await fetchSheet(SHEETS.ACTIVITIES);
  if (!rows.length) return;
  const headers = rows[0];
  allActivities = rows.slice(1).map((row, i) => {
    const obj = { _rowIndex: i + 2 };
    headers.forEach((h, j) => { obj[h] = row[j] || ''; });
    return obj;
  });
  renderWeeklyTable();
  renderEditTable();
}

async function loadQAData() {
  const rows = await fetchSheet(SHEETS.QA);
  if (!rows.length) return;
  const headers = rows[0];
  allQA = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, j) => { obj[h] = row[j] || ''; });
    return obj;
  });
}

async function loadLogoData() {
  const rows = await fetchSheet(SHEETS.LOGO);
  if (!rows.length) return;
  const headers = rows[0];
  allLogos = rows.slice(1)
    .map(row => { const o = {}; headers.forEach((h,j) => o[h] = row[j]||''); return o; })
    .filter(r => r['Account Name']);
}

// ─── WEEKLY VIEW ──────────────────────────────────────────────────────────────
const WEEKLY_COLS = [
  'Account Name','Send Date','Touchpoint Type',
  'Marketing Activity Status','Campaign Template Type',
  'Marketing Activity Name','Enrollment Marketing Manager'
];

function setDefaultWeekDate() {
  const today = new Date();
  const diff  = today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1);
  const mon   = new Date(today.setDate(diff));
  document.getElementById('week-date').value = mon.toISOString().split('T')[0];
}

function renderWeeklyTable() {
  const input = document.getElementById('week-date').value;
  let filtered = allActivities;
  if (input) {
    const start = new Date(input + 'T00:00:00');
    const end   = new Date(start); end.setDate(end.getDate() + 6);
    filtered = allActivities.filter(r => {
      const d = new Date(r['Send Date']);
      return !isNaN(d) && d >= start && d <= end;
    });
  }
  buildTable('weekly-table', WEEKLY_COLS, filtered, false);
}

// ─── EDIT VIEW ────────────────────────────────────────────────────────────────
const EDIT_COLS = [
  'Account Name','Send Date','Marketing Activity Status',
  'Touchpoint Type','Sender','Launch Date','Marketing Activity Name'
];

function renderEditTable() {
  buildTable('edit-table', EDIT_COLS, allActivities, true);
}

// ─── TABLE BUILDER ────────────────────────────────────────────────────────────
function buildTable(tableId, cols, data, editable) {
  const table = document.getElementById(tableId);
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');

  thead.innerHTML = `<tr>
    ${editable ? '<th></th>' : ''}
    ${cols.map(c => `<th>${c}</th>`).join('')}
  </tr>`;

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="${cols.length + (editable?1:0)}" class="loading">No records for this period</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map((row, i) => `
    <tr>
      ${editable ? `<td><button class="edit-btn" onclick="openEditModal(${i})">Edit</button></td>` : ''}
      ${cols.map(c => `<td title="${esc(row[c])}">${formatCell(c, row[c])}</td>`).join('')}
    </tr>
  `).join('');
}

function formatCell(col, val) {
  if (col === 'Marketing Activity Status') {
    const v = val || '';
    let cls = 'badge-default';
    if (v.startsWith('Approved'))                         cls = 'badge-approved';
    else if (v.startsWith('Awaiting'))                    cls = 'badge-awaiting';
    else if (v.startsWith('Not Approved'))                cls = 'badge-rejected';
    else if (v === 'Throttled' || v === 'Deployed')       cls = 'badge-throttled';
    return `<span class="badge ${cls}">${v || '—'}</span>`;
  }
  return esc(val) || '—';
}

function esc(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function filterTable(tableId, query) {
  const q = query.toLowerCase();
  document.querySelectorAll(`#${tableId} tbody tr`).forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

// ─── EDIT MODAL ───────────────────────────────────────────────────────────────
const EDITABLE_FIELDS = [
  'Marketing Activity Status',
  'Send Date',
  'Sender',
  'Launch Date',
  'Launch 1 Date',
  'Launch 2 Date',
  'Automation Approved',
  'Comms Plan Status',
  'Custom GROMO Ticket Link',
  'Custom GROMO Ticket Submitted'
];

const STATUS_OPTIONS = [
  'Approved',
  'Throttled',
  'Deployed',
  'Awaiting Approval-High Likelihood',
  'Awaiting Approval-Low Likelihood',
  'Not Approved-Pitched & Rejected',
  'Not Approved-Not Pitched Yet'
];

function openEditModal(index) {
  currentEditRow = allActivities[index];
  document.getElementById('modal-title').textContent =
    `${currentEditRow['Account Name']} — ${currentEditRow['Marketing Activity Name']}`;

  document.getElementById('modal-fields').innerHTML = EDITABLE_FIELDS.map(f => {
    const val = currentEditRow[f] || '';
    const id  = 'field_' + f.replace(/\W/g,'_');
    if (f === 'Marketing Activity Status') {
      return `<div class="modal-field">
        <label>${f}</label>
        <select id="${id}">
          ${STATUS_OPTIONS.map(o => `<option${o===val?' selected':''}>${o}</option>`).join('')}
        </select>
      </div>`;
    }
    return `<div class="modal-field">
      <label>${f}</label>
      <input type="text" id="${id}" value="${esc(val)}">
    </div>`;
  }).join('') + `
    <div class="save-note">
      After saving, remember to manually trigger the Salesforce connector to push changes to SFDC.
    </div>`;

  document.getElementById('edit-modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('edit-modal').style.display = 'none';
  currentEditRow = null;
}

async function saveRecord() {
  if (!currentEditRow) return;

  const refreshRows = await fetchSheet(SHEETS.REFRESH);
  const headers     = refreshRows[0];
  const actId       = currentEditRow['18 Digit Marketing Activity Id'];
  const rowIdx      = refreshRows.findIndex((r, i) => i > 0 && r[0] === actId);

  if (rowIdx === -1) {
    alert('Record not found in REFRESH SHEET. It may not have been synced from Salesforce yet.');
    return;
  }

  const updatedRow = [...refreshRows[rowIdx]];
  EDITABLE_FIELDS.forEach(f => {
    const el  = document.getElementById('field_' + f.replace(/\W/g,'_'));
    const col = headers.indexOf(f);
    if (el && col >= 0) updatedRow[col] = el.value;
  });

  const range = `'${SHEETS.REFRESH}'!A${rowIdx + 1}`;
  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    resource: { values: [updatedRow] }
  });

  closeModal();
  await loadActivities();
  alert('Saved to REFRESH SHEET. Trigger the Salesforce connector when ready.');
}

// ─── QA VIEW ─────────────────────────────────────────────────────────────────
const QA_FIELDS = [
  'Campaign Template','Client Channel Restrictions','Approved for Custom Marketing',
  'Email Sender','Contracting Partner (HCSC Combined)','Approved Programs',
  'SMS Approved','Spanish CTA','Approved WPH Promo','Non-Cash Based Incentives Approved',
  'Allows Marketing Incentives','Use First Name Personalization','Employee Reference',
  'Eligibility Language (English)','Eligibility Language (Spanish)',
  'References to Drugs or Surgery','Enso','Enrollment Marketing Manager','Client Success Lead'
];

function filterQA(query) {
  const results = document.getElementById('qa-results');
  if (!query || query.length < 2) {
    results.innerHTML = '<p class="empty-hint">Type an account name or client ID to search</p>';
    return;
  }
  const q = query.toLowerCase();
  const matches = allQA.filter(r =>
    (r['Account Name']||'').toLowerCase().includes(q) ||
    (r['Client ID(text)']||'').toLowerCase().includes(q)
  );
  if (!matches.length) {
    results.innerHTML = '<p class="empty-hint">No accounts found</p>';
    return;
  }
  results.innerHTML = matches.map(r => {
    const logo = r['LOGO '] || r['LOGO'] || '';
    return `<div class="qa-card">
      <div class="qa-card-header">
        ${logo ? `<img src="${logo}" class="qa-logo" onerror="this.style.display='none'" alt="">` : ''}
        <h3>${esc(r['Account Name'])} <span class="qa-client-id">Client ID: ${esc(r['Client ID(text)']||'—')}</span></h3>
      </div>
      <div class="qa-grid">
        ${QA_FIELDS.map(f => `
          <div class="qa-field">
            <label>${f}</label>
            <span>${esc(r[f]||'—')}</span>
          </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

// ─── TOOLS: SLUG CHECKER ──────────────────────────────────────────────────────
function buildSlug() {
  const slug     = document.getElementById('slug-input').value.trim();
  const backHalf = document.getElementById('back-half').value;
  const result   = document.getElementById('slug-result');
  if (!slug) { result.innerHTML = ''; return; }
  const url = `hinge.health/${slug}-${backHalf}`;
  result.innerHTML = `<a href="https://${url}" target="_blank" rel="noopener">${url}</a>`;
}

// ─── TOOLS: LOGO LOOKUP ───────────────────────────────────────────────────────
function filterLogoTable(query) {
  const container = document.getElementById('logo-results');
  if (!query || query.length < 2) { container.innerHTML = ''; return; }
  const q = query.toLowerCase();
  const matches = allLogos
    .filter(r => (r['Account Name']||'').toLowerCase().includes(q))
    .slice(0, 25);

  if (!matches.length) {
    container.innerHTML = '<p style="color:#94a3b8;font-size:13px">No logos found</p>';
    return;
  }

  const logoTypes = [
    { key: 'Client Logo (single)', label: 'Single' },
    { key: 'Approved Partner Logo (dual)', label: 'Dual' },
    { key: 'Approved Partner Logo (tri)', label: 'Tri' }
  ];

  container.innerHTML = matches.flatMap(r =>
    logoTypes
      .filter(t => r[t.key] && r[t.key].startsWith('http'))
      .map(t => `
        <div class="logo-row">
          <img src="${r[t.key]}" onerror="this.style.display='none'" alt="${esc(r['Account Name'])}">
          <div class="logo-info">
            <div class="logo-name">${esc(r['Account Name'])} <span class="logo-type">(${t.label})</span></div>
            <div class="logo-url">${r[t.key]}</div>
          </div>
          <button class="copy-btn" onclick="copyUrl(this, '${r[t.key].replace(/'/g,"\\'")}')">Copy URL</button>
        </div>`)
  ).join('');
}

function copyUrl(btn, url) {
  navigator.clipboard.writeText(url).then(() => {
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy URL'; btn.classList.remove('copied'); }, 2000);
  });
}

// ─── NAV ─────────────────────────────────────────────────────────────────────
function showView(name, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(name + '-view').classList.add('active');
  btn.classList.add('active');
}
