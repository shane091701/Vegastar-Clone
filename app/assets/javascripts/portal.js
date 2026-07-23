let expenseTypeDictionary = {}; // Holds { "Type": ["Item1", "Item2"] }
let allData = [];
let currentFilteredData = [];
let approvalQueueRaw = [];
let bidDataRaw = [];
let bidSupplierNamesCache = [];   // populated once when Encode Quotes section loads
let poDataRaw = [];
let pendingChecksRaw = [];
let currentCanvasData = {};
let rtbApprovalsRaw = [];
let collectionRTBsRaw = [];
let activeCollectionRtbId = null; 

let globalRfqData = [];
let globalBidData = {};
let globalCanvasData = [];

// --- EXPENSE STATE ---
let expenseSummary = { totalBudget: 0, totalExpenses: 0, totalRemaining: 0, totalMrfUtilized: 0 };
let expenseCategories = [];

// --- SUKI & RECEIVING STATE ---
let sukiItemsData = [];
let sukiSupplierName = "";
let receivingData = { projects: [], pos: {} };

// Display-only thousands-separator formatting for plain quantity/count
// numbers (money fields already use .toLocaleString(...) with 2 decimals
// throughout this file -- this is for bare quantities like BOQ/MRF/PO qty,
// ordered/received/remaining, and record-count badges). Never use this on
// a value that feeds back into an <input> or an HTML numeric attribute
// (max=, data-qty=, etc.) -- those must stay plain numbers.
function fmtNum(n) {
  var num = Number(n);
  return isNaN(num) ? (n == null ? '' : n) : num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// --- INITIALIZATION & AUTHENTICATION ---
let userProfile = null;
let _resubmitReturnedId = null;   // set when editing a Returned BOQ for resubmission

// --- PROJECT COLOR CODING BY COMPANY ---
let projectCompanyMap = {};   // { projectCode: company }, loaded once at login
const COMPANY_COLORS = {
  'ct': '#1d3461',              // Navy Blue
  'vegastar': '#b8860b',       // Dark Yellow / gold
  'krone konstruct': '#16a34a' // Green
};

function getCompanyColor_(projectCode) {
  const company = (projectCompanyMap[projectCode] || '').toString().trim().toLowerCase();
  return COMPANY_COLORS[company] || '';
}

// Applies company font-color to every <option> in a select that represents a project.
// Skips the first placeholder option (value === '').
function colorizeProjectSelect(selectEl) {
  if (!selectEl) return;
  Array.from(selectEl.options).forEach(function(opt) {
    if (!opt.value) { opt.style.color = ''; return; }
    const color = getCompanyColor_(opt.value);
    opt.style.color = color || '';
    if (color) opt.style.fontWeight = '600';
  });
}

// Convenience: colorize one or more selects by id.
function colorizeProjectSelectsById() {
  for (let i = 0; i < arguments.length; i++) {
    colorizeProjectSelect(document.getElementById(arguments[i]));
  }
}

// ── Generic project-dropdown company highlight (reused across many sections) ──
// Distinct from Expense Log's dedicated implementation — does not touch or
// interfere with it. Safe to call multiple times on the same element.

function whenProjectMapReady(callback) {
  if (projectCompanyMap && Object.keys(projectCompanyMap).length > 0) {
    callback();
  } else {
    loadProjectCompanyMap(callback);
  }
}

function applyDropdownCompanyHighlight(selectEl) {
  if (!selectEl) return;
  selectEl.classList.remove('proj-hl-ct', 'proj-hl-vegastar', 'proj-hl-krone');
  const val = selectEl.value;
  if (!val || val === 'All') return; // no selection or "All" filter state → default look
  const company = (projectCompanyMap[val] || '').toString().trim().toLowerCase();
  if (company === 'ct') selectEl.classList.add('proj-hl-ct');
  else if (company === 'vegastar') selectEl.classList.add('proj-hl-vegastar');
  else if (company === 'krone konstruct') selectEl.classList.add('proj-hl-krone');
}

// Colors option font (bonus, when list is open) + applies closed-box highlight now
// + binds a change listener ONCE (guarded, so repeated calls on re-populated
// dropdowns never stack duplicate listeners).
function setupProjectDropdownHighlight(selectEl) {
  if (!selectEl) return;
  colorizeProjectSelect(selectEl);
  applyDropdownCompanyHighlight(selectEl);
  if (!selectEl.dataset.projHlBound) {
    selectEl.dataset.projHlBound = '1';
    selectEl.addEventListener('change', function() {
      applyDropdownCompanyHighlight(selectEl);
    });
  }
}

// Applies a background-highlight CSS class to the CLOSED Expense Log project
// dropdown, based on the selected project's company. Per-option font coloring
// alone does not reliably show on a closed <select> in most browsers, so this
// highlights the box itself instead — matches the requested "highlight the
// whole word/row" fallback behavior.
function applyExpenseProjectHighlight() {
  const select = document.getElementById('expenseProjectSelect');
  if (!select) return;

  // Clear any previously applied highlight classes first
  select.classList.remove('company-highlight-ct', 'company-highlight-vegastar', 'company-highlight-krone');

  const projectCode = select.value;
  if (!projectCode) return; // no selection — leave default appearance

  const company = (projectCompanyMap[projectCode] || '').toString().trim().toLowerCase();
  if (company === 'ct') {
    select.classList.add('company-highlight-ct');
  } else if (company === 'vegastar') {
    select.classList.add('company-highlight-vegastar');
  } else if (company === 'krone konstruct') {
    select.classList.add('company-highlight-krone');
  }
  // any other/blank company → no class added → default appearance (per your spec)
}

function loadProjectCompanyMap(callback) {
  google.script.run
    .withSuccessHandler(function(map) {
      projectCompanyMap = map || {};
      if (typeof callback === 'function') callback();
    })
    .withFailureHandler(function() {
      projectCompanyMap = {};
      if (typeof callback === 'function') callback();
    })
    .getProjectCompanyMap();
}

// ---RECEIVING HISTORY---
let globalReceivingHistory = [];
let receivingHistoryFiltered = [];   // globalReceivingHistory after PO filter is applied

// ---HISTORICAL PRICING AUTOCOMPLETE CACHE---
let cachedHistoricalItems = [];  // populated once when the section first opens
let showAllReceiving = false;
let recentExpensesRaw = [];

// --- UTILITY: FILE TO BASE64 ---
const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

// Shared text-cleaning helper: strips numbered/lettered/roman-numeral list prefixes
// (e.g. "1. ", "A. ", "II. ") from Phase/Scope/Item display strings. Used by the
// Material Request builder, Approval Queue grouping, and History grouping.
function cleanBullets(text) {
  return (text || '').toString()
             .replace(/^(\d+[\.\)\-]?\s+)+/, '')
             .replace(/^([a-zA-Z][\.\)\-]\s+)+/, '')
             .replace(/^([IVXLCDMivxlcdm]+[\.\)\-]\s+)+/, '')
             .trim();
}

window.onload = () => {
  document.getElementById('app-content').style.display = 'none';

  // Fetch the structured dictionary from the backend
  google.script.run.withSuccessHandler(dict => {
    expenseTypeDictionary = dict;
  }).getExpenseTypesAndItems();

  // SUKI_PO and RESET_TOKEN URL params always take priority over saved session.
  if (typeof SUKI_PO !== 'undefined' && SUKI_PO !== '') {
    document.getElementById('login-screen').setAttribute('style', 'display:none !important');
    const resetScreen = document.getElementById('reset-screen');
    if (resetScreen) resetScreen.setAttribute('style', 'display:none !important');

    document.getElementById('supplier-screen').setAttribute('style', 'display:flex !important');
    document.getElementById('suki-po-subtitle').innerText = `PO Number: ${SUKI_PO}`;

    google.script.run.withSuccessHandler(res => {
      if (res.error) {
        document.getElementById('suki-item-body').innerHTML = `<tr><td colspan="5" class="text-danger text-center fw-bold">${res.error}</td></tr>`;
        document.getElementById('sukiSubmitBtn').style.display = 'none';
      } else {
        sukiSupplierName = res.supplier;
        sukiItemsData = res.items;
        renderSukiTable();
      }
    }).getSukiItems(SUKI_PO);
    return;
  }

  if (typeof RESET_TOKEN !== 'undefined' && RESET_TOKEN !== '') {
    document.getElementById('login-screen').setAttribute('style', 'display:none !important');
    document.getElementById('reset-screen').setAttribute('style', 'display:flex !important');
    return;
  }

  // Restore session from localStorage if a saved profile exists.
  const savedProfile = localStorage.getItem('alphaErpUser');
  if (savedProfile) {
    try {
      const profile = JSON.parse(savedProfile);
      userProfile = profile;

      document.getElementById('login-screen').setAttribute('style', 'display:none !important');
      const resetScreen = document.getElementById('reset-screen');
      if (resetScreen) resetScreen.setAttribute('style', 'display:none !important');
      document.getElementById('app-content').style.display = 'block';

      const profileDiv = document.getElementById('user-display-name');
      if (profileDiv) {
        profileDiv.innerHTML = `${profile.name} <span class="admin-badge">${profile.role}</span>`;
      }

      const firstSection = applyPermissions(profile.allowedTabs);
      loadProjectCompanyMap(function() {
        initApp();
        if (firstSection) showSection(firstSection);
      });
      return;
    } catch (e) {
      // Corrupt entry — clear it and fall through to the login screen.
      localStorage.removeItem('alphaErpUser');
    }
  }

  // No saved session: show the login screen.
  document.getElementById('login-screen').style.display = 'flex';
  const resetScreen = document.getElementById('reset-screen');
  if (resetScreen) resetScreen.setAttribute('style', 'display:none !important');
};

// --- AUTHENTICATION LOGIC ---
function attemptLogin() {
  const email = document.getElementById('loginEmail').value;
  const pass = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');
  const alertBox = document.getElementById('login-alert');

  if (!email || !pass) {
    alertBox.innerText = "Please enter both your email and password.";
    alertBox.style.display = 'block';
    return;
  }

  alertBox.style.display = 'none';
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Verifying...';

  if (typeof google !== 'undefined') {
    google.script.run
      .withSuccessHandler(profile => {
        btn.disabled = false;
        btn.innerHTML = 'Log In';

        if (profile.authorized) {
          userProfile = profile;
          localStorage.setItem('alphaErpUser', JSON.stringify(profile));

          document.getElementById('login-screen').setAttribute('style', 'display:none !important');
          document.getElementById('app-content').style.display = 'block';

          const profileDiv = document.getElementById('user-display-name');
          if (profileDiv) {
            profileDiv.innerHTML = `${profile.name} <span class="admin-badge">${profile.role}</span>`;
          }

          const firstSection = applyPermissions(profile.allowedTabs);
          loadProjectCompanyMap(function() {
            initApp();
            if (firstSection) showSection(firstSection);
          });

        } else {
          alertBox.innerText = profile.message;
          alertBox.style.display = 'block';
        }
      })
      .withFailureHandler(err => {
        btn.disabled = false;
        btn.innerHTML = 'Log In';
        alertBox.innerText = "Server Error: " + err.message;
        alertBox.style.display = 'block';
      })
      .verifyLogin(email, pass);
  }
}

function forgotPassword() {
  const email = document.getElementById('loginEmail').value;
  const alertBox = document.getElementById('login-alert');
  
  if (!email) {
    alertBox.innerText = "Please enter your email address above, then click 'Forgot password?'.";
    alertBox.style.display = 'block';
    return;
  }

  alertBox.style.display = 'none';
  const btn = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sending Link...';

  if (typeof google !== 'undefined') {
    google.script.run
      .withSuccessHandler(msg => {
        btn.disabled = false;
        btn.innerHTML = 'Log In';
        alertBox.innerText = msg;
        alertBox.className = "alert alert-success py-2";
        alertBox.style.display = 'block';
      })
      .withFailureHandler(err => {
        btn.disabled = false;
        btn.innerHTML = 'Log In';
        alertBox.innerText = "Error: " + err.message;
        alertBox.className = "alert alert-danger py-2";
        alertBox.style.display = 'block';
      })
      .handleForgotPassword(email);
  }
}

function submitNewPassword() {
  const pass1 = document.getElementById('newPassword').value;
  const pass2 = document.getElementById('confirmPassword').value;
  const btn = document.getElementById('resetSubmitBtn');
  const alertBox = document.getElementById('reset-alert');

  if (!pass1 || !pass2) {
    alertBox.innerText = "Please fill in both password fields.";
    alertBox.className = "alert alert-danger py-2";
    alertBox.style.display = 'block';
    return;
  }
  if (pass1 !== pass2) {
    alertBox.innerText = "Passwords do not match.";
    alertBox.className = "alert alert-danger py-2";
    alertBox.style.display = 'block';
    return;
  }
  if (pass1.length < 6) {
    alertBox.innerText = "Password must be at least 6 characters.";
    alertBox.className = "alert alert-danger py-2";
    alertBox.style.display = 'block';
    return;
  }

  alertBox.style.display = 'none';
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Updating...';

  if (typeof google !== 'undefined') {
    google.script.run
      .withSuccessHandler(res => {
        btn.disabled = false;
        btn.innerHTML = 'Update Password';
        if (res.success) {
          alertBox.innerText = res.message;
          alertBox.className = "alert alert-success py-2";
          alertBox.style.display = 'block';
          document.getElementById('newPassword').value = '';
          document.getElementById('confirmPassword').value = '';
          setTimeout(() => {
             window.top.location.href = window.top.location.href.split('?')[0];
          }, 2500);
        } else {
          alertBox.innerText = res.message;
          alertBox.className = "alert alert-danger py-2";
          alertBox.style.display = 'block';
        }
      })
      .withFailureHandler(err => {
        btn.disabled = false;
        btn.innerHTML = 'Update Password';
        alertBox.innerText = "Server Error: " + err.message;
        alertBox.className = "alert alert-danger py-2";
        alertBox.style.display = 'block';
      })
      .processPasswordReset(RESET_TOKEN, pass1);
  }
}

function logout() {
  userProfile = null;
  localStorage.removeItem('alphaErpUser');
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('login-alert').style.display = 'none';

  allData = [];
  currentFilteredData = [];
  approvalQueueRaw = [];
  
const tablesToClear = ['itemBody', 'historyBody', 'approvalQueueContainer', 'rfqTableBody', 'bidTableBody', 'poTableBody', 'expenseItemBody', 'pendingChecksTableBody', 'canvasContainer', 'pricing-table-body'];
  tablesToClear.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.innerHTML = ''; 
  });

  document.getElementById('app-content').setAttribute('style', 'display:none !important');
  document.getElementById('login-screen').setAttribute('style', 'display:flex !important');
}

// --- NAVIGATION LOGIC ---

/**
 * Applies RBAC to the nav bar.
 * @param {string[]} allowedTabs - Array of lowercase permission keys from verifyLogin.
 * @returns {string|null} - The section id to navigate to on login, or null.
 */
function applyPermissions(allowedTabs) {
  // Maps each permission key to the section id it should open on first load.
  // Order defines priority when a user has multiple permissions.
  const SECTION_MAP = [
    { perm: 'boq',                  section: 'boq'           },
    { perm: 'expense',              section: 'expense'       },
    { perm: 'site engineer',        section: 'material'      },
    { perm: 'record petty cash',    section: 'petty-cash'    },
    { perm: 'material requests',    section: 'approvals'     },
    { perm: 'payments',             section: 'payments'      },
    { perm: 'petty cash ledger',    section: 'pc-ledger'     },
    { perm: 'boq-adjust',           section: 'boq-adjust'    },
    { perm: 'compute project cost', section: 'compute-cost'  },
    { perm: 'supplier data',        section: 'supplier-data' },
    { perm: 'issue payments',       section: 'issue-payments'       },
    { perm: 'accounting',           section: 'refundable-expenses'  },
    { perm: 'material requests',    section: 'build-boq'            },
    { perm: 'project engineer',     section: 'project-engineer'     },
    { perm: 'admin',                section: 'rtb-approvals'        },
    { perm: 'payments',             section: 'collections'          },
    { perm: 'subcontractor',        section: 'subcontractor-ap'     },
    { perm: 'subcontractor reports',section: 'subcontractor-reports'},
    { perm: 'subcontractor',        section: 'subcontract-budget'   },
    { perm: 'payments',             section: 'subcon-payables'      }
  ];

  const allowed = allowedTabs.map(t => t.trim().toLowerCase());

  // ── Step 1: Show/hide every individual nav item that carries data-permission.
  // The attribute value may be a pipe-separated list of alternatives, e.g.
  // "site engineer|record petty cash" — the item shows if the user has ANY of them.
  document.querySelectorAll('#app-content [data-permission]').forEach(el => {
    const required = el.getAttribute('data-permission')
                       .split('|')
                       .map(p => p.trim().toLowerCase());
    el.style.display = required.some(p => allowed.includes(p)) ? '' : 'none';
  });

  // ── Step 2: Collapse entire dropdown groups whose every permissioned <li> is hidden.
  // The group wrapper itself has no data-permission — it is driven by its children.
  ['nav-group-boq', 'nav-group-site-engineer', 'nav-group-project-engineer', 'nav-group-subcontractor', 'nav-group-material-requests', 'nav-group-payments'].forEach(groupId => {
    const group = document.getElementById(groupId);
    if (!group) return;
    const permItems = group.querySelectorAll('li[data-permission]');
    const anyVisible = Array.from(permItems).some(li => li.style.display !== 'none');
    group.style.display = anyVisible ? 'inline-block' : 'none';
  });

  // ── Step 3: Return the first section the user is allowed to see (for post-login redirect).
  for (const entry of SECTION_MAP) {
    if (allowed.includes(entry.perm)) return entry.section;
  }
  return null;
}

// applyPermissions() above only runs once, right after login -- but several
// admin-only nav items (Manage Data/Users/Companies, the consolidated
// "Manage" tab, the BOQ Upload Projects panel) are built by separate
// deferred scripts that finish AFTER that point, since each waits on its own
// DOMContentLoaded + async setup. Those elements' [data-permission="admin"]
// attribute is never re-checked, so they stayed visible to every role
// regardless of permission. Those scripts call this right after inserting
// their element to re-run the same filtering pass.
window.reapplyPermissions = function () {
  if (!userProfile || !userProfile.allowedTabs) return;
  applyPermissions(userProfile.allowedTabs);
};

function showSection(sectionId) {
  document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
  document.querySelectorAll('.nav-links a').forEach(link => link.classList.remove('active'));
  
  const targetSection = document.getElementById('section-' + sectionId);
  const targetNav = document.getElementById('nav-' + sectionId);
  
  if(targetSection) targetSection.classList.add('active');
  if(targetNav) {
    targetNav.classList.add('active');
    
    // Highlight the parent dropdown if the item is inside one
    const dropdownParent = targetNav.closest('.dropdown');
    if(dropdownParent) {
      const toggle = dropdownParent.querySelector('.dropdown-toggle');
      if(toggle) toggle.classList.add('active');
    }
  }

  // Load appropriate data based on section
  if (sectionId === 'approvals') loadApprovalQueue();
  else if (sectionId === 'rfq') loadRFQs();
  else if (sectionId === 'history') loadHistory();
  else if (sectionId === 'material') initApp();
  else if (sectionId === 'bid-tab') loadBidTabulation();
  else if (sectionId === 'canvas') loadCanvasMRFs();
  else if (sectionId === 'purchase-orders') loadPurchaseOrders();
  else if (sectionId === 'receiving') loadReceiving();
  else if (sectionId === 'expense') initExpense();
  else if (sectionId === 'payments') initPayments(); 
  else if (sectionId === 'checks') initChecks();
    else if (sectionId === 'petty-cash') initPettyCash();
    else if (sectionId === 'pc-ledger') initPCLedger();
    else if (sectionId === 'boq-adjust') { initBoqAdjust(); loadPendingBoqApprovals(); }
    else if (sectionId === 'compute-cost') initComputeCost();
    else if (sectionId === 'supplier-data') loadSuppliers();
    else if (sectionId === 'issue-payments') initIssuePayments();
    else if (sectionId === 'historical-pricing') { initHistoricalPricing(); }
    else if (sectionId === 'refundable-expenses') loadRefundables();
    else if (sectionId === 'build-boq') initBoqBuilder();
    else if (sectionId === 'project-engineer') initProjectEngineer();
    else if (sectionId === 'rtb-approvals')    loadRTBApprovals();
    else if (sectionId === 'collections')      loadCollections();
    else if (sectionId === 'subcontractor-ap')      initSubcontractorAP();
    else if (sectionId === 'assign-wp')             initAssignWp();
    else if (sectionId === 'subcontractor-reports') initSubconReports();
    else if (sectionId === 'subcontract-budget')    initSubconBudget();
    else if (sectionId === 'subcon-payables')       initSubconPayables();
}

// --- MRF LOGIC ---
function initApp() {
  if (typeof google !== 'undefined') {
    google.script.run.withSuccessHandler(data => {
      if(data) {
        allData = data.items || [];
        const projectSelect = document.getElementById('projectSelect');
        if(projectSelect) {
          projectSelect.innerHTML = '<option value="">— Select project —</option>';
          if(data.projects) {
            data.projects.forEach(p => {
              let opt = document.createElement('option');
              opt.value = p;
              opt.innerHTML = p;
              projectSelect.appendChild(opt);
            });
          }
          whenProjectMapReady(function(){ setupProjectDropdownHighlight(projectSelect); });
        }
        const container = document.getElementById('mrf-phases-container');
        if (container) container.innerHTML = '<div id="mrf-no-project-msg" class="text-center py-5 text-muted">Select a project to view available phases and items.</div>';
        const submitBtn = document.getElementById('mrfSubmitBtn');
        if (submitBtn) submitBtn.style.display = 'none';
      }
    }).getInitialData();
  }
}

function onMrfProjectChange() {
  const project = document.getElementById('projectSelect').value;
  const searchInput  = document.getElementById('mrfItemSearch');
  const searchList   = document.getElementById('mrfItemSearchList');
  const container    = document.getElementById('mrf-phases-container');
  const submitBtn    = document.getElementById('mrfSubmitBtn');
  const phaseFilter  = document.getElementById('mrfPhaseFilter');
  const scopeFilter  = document.getElementById('mrfScopeFilter');

  if (!project) {
    container.innerHTML = '<div id="mrf-no-project-msg" class="text-center py-5 text-muted">Select a project to view available phases and items.</div>';
    if (searchInput) { searchInput.value = ''; searchInput.disabled = true; }
    if (searchList) searchList.innerHTML = '';
    if (submitBtn) submitBtn.style.display = 'none';
    if (phaseFilter) { phaseFilter.innerHTML = '<option value="">— All Phases —</option>'; phaseFilter.disabled = true; }
    if (scopeFilter) { scopeFilter.innerHTML = '<option value="">— All Scopes —</option>'; scopeFilter.disabled = true; }
    return;
  }

  currentFilteredData = allData.filter(i => i.project === project);

  if (searchList) {
    const items = [...new Set(currentFilteredData.map(i => i.item))].sort();
    searchList.innerHTML = items.map(name => `<option value="${name.replace(/"/g, '&quot;')}">`).join('');
  }
  if (searchInput) { searchInput.value = ''; searchInput.disabled = false; }

  populateMrfPhaseFilter();

  buildMrfPhaseAccordions();
  if (submitBtn) submitBtn.style.display = currentFilteredData.length ? 'inline-block' : 'none';
}

function populateMrfPhaseFilter() {
  const phaseFilter = document.getElementById('mrfPhaseFilter');
  const scopeFilter = document.getElementById('mrfScopeFilter');
  if (!phaseFilter) return;

  const phases = [...new Set(currentFilteredData.map(i => i.phase || 'Uncategorized Phase'))].sort();
  phaseFilter.innerHTML = '<option value="">— All Phases —</option>' +
    phases.map(p => `<option value="${p.replace(/"/g, '&quot;')}">${p}</option>`).join('');
  phaseFilter.disabled = phases.length === 0;
  phaseFilter.value = '';

  if (scopeFilter) {
    scopeFilter.innerHTML = '<option value="">— All Scopes —</option>';
    scopeFilter.disabled = true;
    scopeFilter.value = '';
  }
}

function populateMrfScopeFilter(selectedPhase) {
  const scopeFilter = document.getElementById('mrfScopeFilter');
  if (!scopeFilter) return;

  if (!selectedPhase) {
    scopeFilter.innerHTML = '<option value="">— All Scopes —</option>';
    scopeFilter.disabled = true;
    scopeFilter.value = '';
    return;
  }

  const scopesInPhase = [...new Set(
    currentFilteredData
      .filter(i => (i.phase || 'Uncategorized Phase') === selectedPhase)
      .map(i => i.scope ? cleanBullets(i.scope) : 'General / Uncategorized')
  )].sort();

  scopeFilter.innerHTML = '<option value="">— All Scopes —</option>' +
    scopesInPhase.map(s => `<option value="${s.replace(/"/g, '&quot;')}">${s}</option>`).join('');
  scopeFilter.disabled = scopesInPhase.length === 0;
  scopeFilter.value = '';
}

function onMrfPhaseFilterChange() {
  const selectedPhase = document.getElementById('mrfPhaseFilter').value;
  populateMrfScopeFilter(selectedPhase);
  applyMrfPhaseScopeFilter();
}

function onMrfScopeFilterChange() {
  applyMrfPhaseScopeFilter();
}

// Pure visual narrowing: shows/hides phase blocks and scope rows in the
// already-built accordion. Does NOT alter currentFilteredData or restrict
// what can be entered/submitted — a user can still fill in values on hidden
// rows via search, and everything already filled in remains part of the
// submission regardless of filter state.
function applyMrfPhaseScopeFilter() {
  const selectedPhase = document.getElementById('mrfPhaseFilter').value;
  const selectedScope = document.getElementById('mrfScopeFilter').value;

  document.querySelectorAll('.mrf-phase-block').forEach(block => {
    const headerSpan = block.querySelector('.card-header span');
    const blockPhase = headerSpan ? headerSpan.textContent.trim() : '';
    const matchesPhase = !selectedPhase || blockPhase === selectedPhase;

    block.style.display = matchesPhase ? '' : 'none';
    if (!matchesPhase) return;

    // Auto-expand the matching phase when a filter narrows to it
    const collapseDiv = block.querySelector('.mrf-phase-collapse');
    if (selectedPhase && collapseDiv && collapseDiv.style.display === 'none') {
      collapseDiv.style.display = 'block';
    }

    // Show/hide scope header rows + their item rows within this phase
    const scopeHeaders = block.querySelectorAll('tbody tr td[colspan="6"].bg-secondary');
    scopeHeaders.forEach(scopeHeaderCell => {
      const scopeHeaderRow = scopeHeaderCell.closest('tr');
      const scopeName = scopeHeaderCell.textContent.trim();
      const matchesScope = !selectedScope || scopeName === selectedScope;
      scopeHeaderRow.style.display = matchesScope ? '' : 'none';

      // Walk subsequent sibling rows until the next scope header (or end of tbody),
      // showing/hiding each item row that belongs to this scope.
      let sib = scopeHeaderRow.nextElementSibling;
      while (sib && !sib.querySelector('td[colspan="6"].bg-secondary')) {
        sib.style.display = matchesScope ? '' : 'none';
        sib = sib.nextElementSibling;
      }
    });
  });
}

function buildMrfPhaseAccordions() {
  const container = document.getElementById('mrf-phases-container');
  if (!currentFilteredData.length) {
    container.innerHTML = '<div class="text-center py-5 text-muted">No items found for this project.</div>';
    return;
  }

  // Group: phase -> scope -> [ {item, originalIdx} ]
  const phaseMap = {};
  const phaseOrder = [];
  currentFilteredData.forEach((item, idx) => {
    const phase = item.phase || 'Uncategorized Phase';
    const scope = item.scope ? cleanBullets(item.scope) : 'General / Uncategorized';
    if (!phaseMap[phase]) { phaseMap[phase] = {}; phaseOrder.push(phase); }
    if (!phaseMap[phase][scope]) phaseMap[phase][scope] = [];
    phaseMap[phase][scope].push({ item, originalIdx: idx });
  });

  let html = '';
  phaseOrder.forEach((phase, pIdx) => {
    const collapseId = 'mrf-phase-body-' + pIdx;
    html += `
      <div class="card mb-3 mrf-phase-block">
        <div class="card-header mrf-phase-header d-flex justify-content-between align-items-center flex-wrap gap-2"
             style="cursor:pointer;"
             onclick="toggleMrfPhase('${collapseId}', this)">
          <span class="fw-bold text-uppercase" style="font-size:0.85rem;">${phase}</span>
          <select class="form-select form-select-sm mrf-phase-apply-all" style="width:230px;"
                  onclick="event.stopPropagation()" onchange="applyToAllInPhase(this, ${pIdx})">
            <option value="">Apply to All (this phase)</option>
            <option value="base">Base Unit</option>
            <option value="mat">Materials Cost</option>
            <option value="oth">Labor Cost</option>
            <option value="tot">Total Cost</option>
          </select>
        </div>
        <div class="mrf-phase-collapse" id="${collapseId}" data-phase-idx="${pIdx}" style="display:${pIdx === 0 ? 'block' : 'none'};">
          <div class="table-responsive">
            <table class="table table-bordered table-sm align-middle mb-0">
              <thead class="table-light text-nowrap">
                <tr>
                  <th class="ps-3">Item</th><th>Unit</th><th>Budget</th><th>Remaining</th>
                  <th style="width:150px;">Qty to Request</th>
                  <th style="width:220px;">Remarks / Specs <span class="text-muted fw-normal small">(Optional)</span></th>
                </tr>
              </thead>
              <tbody>`;

    Object.keys(phaseMap[phase]).sort().forEach(scope => {
      html += `<tr><td colspan="6" class="bg-secondary text-white fw-bold py-2 ps-3 text-uppercase" style="font-size:0.78rem;">${scope}</td></tr>`;
      phaseMap[phase][scope].forEach(({ item, originalIdx }) => {
        const isLot = item.unit.toLowerCase() === 'lot';
        const ratio = item.budgetBase > 0 ? (item.remBase / item.budgetBase) : 1;
        let rowStyle = '';
        if (item.budgetBase > 0 && ratio <= 0.10) rowStyle = ' style="background-color:#fde8e8;"';
        else if (item.budgetBase > 0 && ratio <= 0.30) rowStyle = ' style="background-color:#fff8e1;"';

        let inputControl = isLot
          ? `<div class="form-check d-flex justify-content-center"><input type="checkbox" class="form-check-input req-check" data-idx="${originalIdx}"></div>`
          : `<input type="number" class="form-control form-control-sm req-qty" placeholder="0" data-idx="${originalIdx}">`;

        html += `
          <tr${rowStyle} id="mrf-row-${originalIdx}">
            <td class="ps-4"><span class="fw-bold text-dark">${cleanBullets(item.item)}</span></td>
            <td style="width: 180px;">
              <select class="form-select form-select-sm unit-select" onchange="onUnitChange(this, ${originalIdx})">
                <option value="base">${item.unit}</option>
                <option value="mat">Materials Cost</option>
                <option value="oth">Labor Cost</option>
                <option value="tot">Total Cost</option>
              </select>
            </td>
            <td class="budget-cell">${item.budgetBase.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            <td class="rem-cell ${item.remBase <= 0 ? 'text-danger fw-bold' : ''}">${item.remBase.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            <td class="action-cell">${inputControl}</td>
            <td><input type="text" class="form-control form-control-sm mrf-remarks" placeholder="Optional remarks"></td>
          </tr>`;
      });
    });

    html += `
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  });

  container.innerHTML = html;
  applyMrfPhaseScopeFilter();
}

function toggleMrfPhase(collapseId, headerEl) {
  const el = document.getElementById(collapseId);
  if (!el) return;
  el.style.display = (el.style.display === 'none') ? 'block' : 'none';
}

function applyToAllInPhase(selectEl, phaseIdx) {
  const value = selectEl.value;
  if (!value) return;
  const collapseDiv = document.querySelector(`.mrf-phase-collapse[data-phase-idx="${phaseIdx}"]`);
  if (!collapseDiv) return;
  const rows = collapseDiv.querySelectorAll('tbody tr');
  rows.forEach(row => {
    const select = row.querySelector('.unit-select');
    if (!select) return;
    const onchangeAttr = select.getAttribute('onchange') || '';
    const match = onchangeAttr.match(/onUnitChange\(this,\s*(\d+)\)/);
    if (!match) return;
    const idx = parseInt(match[1]);
    select.value = value;
    onUnitChange(select, idx);
    const checkInput = row.querySelector('.req-check');
    if (checkInput) checkInput.checked = true;
  });
}

function onUnitChange(select, idx) {
  const item = currentFilteredData[idx];
  const type = select.value;
  let b, r;

  if (type === 'base') { b = item.budgetBase; r = item.remBase; }
  else if (type === 'mat') { b = item.budgetMat; r = item.remMat; }
  else if (type === 'oth') { b = item.budgetOth; r = item.remOth; }
  else if (type === 'tot') { b = item.budgetTot; r = item.remTot; }

  const tr = select.closest('tr');

  tr.querySelector('.budget-cell').innerText = b.toLocaleString(undefined, {minimumFractionDigits: 2});
  const remCell = tr.querySelector('.rem-cell');
  remCell.innerText = r.toLocaleString(undefined, {minimumFractionDigits: 2});

  if (r <= 0) remCell.classList.add('text-danger', 'fw-bold');
  else remCell.classList.remove('text-danger', 'fw-bold');

  const actionCell = tr.querySelector('.action-cell');

  const isCheckboxMode = (item.unit.toLowerCase() === 'lot' && type === 'base') || type === 'mat' || type === 'oth' || type === 'tot';

  if (isCheckboxMode) {
    actionCell.innerHTML = `<div class="form-check d-flex justify-content-center"><input type="checkbox" class="form-check-input req-check" data-idx="${idx}"></div>`;
  } else {
    actionCell.innerHTML = `<input type="number" class="form-control form-control-sm req-qty" placeholder="0" data-idx="${idx}">`;
  }
}

function onMrfSearchChange() {
  const project   = document.getElementById('projectSelect').value;
  const searchVal = (document.getElementById('mrfItemSearch').value || '').trim();
  if (!project || !searchVal) return;

  const foundIdx = currentFilteredData.findIndex(i => i.item === searchVal);
  if (foundIdx === -1) return;

  const row = document.getElementById('mrf-row-' + foundIdx);
  if (!row) return;

  const phaseBlock = row.closest('.mrf-phase-block');
  const collapseDiv = phaseBlock ? phaseBlock.querySelector('.mrf-phase-collapse') : null;
  if (collapseDiv && collapseDiv.style.display === 'none') {
    collapseDiv.style.display = 'block';
  }

  setTimeout(function() {
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.style.backgroundColor = 'rgba(232,168,32,0.15)';
    setTimeout(function() { row.style.backgroundColor = ''; }, 2000);
  }, 200);
}

function submitData() {
  const btn = document.getElementById('mrfSubmitBtn');
  const project = document.getElementById('projectSelect').value;
  const rows = document.querySelectorAll('#mrf-phases-container tbody tr[id^="mrf-row-"]');

  const submissions = [];

  rows.forEach(row => {
     const select = row.querySelector('.unit-select');
     if (!select) return;

     const phaseBlock = row.closest('.mrf-phase-block');
     const phaseSpan = phaseBlock ? phaseBlock.querySelector('.card-header span') : null;
     const phase = phaseSpan ? phaseSpan.textContent.trim() : '';

     const type = select.value;
     const qtyInput = row.querySelector('.req-qty');
     const checkInput = row.querySelector('.req-check');
     const remarksInput = row.querySelector('.mrf-remarks');
     const remarks = remarksInput ? remarksInput.value.trim() : '';

     const idx = qtyInput ? qtyInput.dataset.idx : (checkInput ? checkInput.dataset.idx : null);
     if (idx === null) return;

     const item = currentFilteredData[idx];

     let reqUnit = item.unit;
     let remaining = item.remBase;
     if (type === 'mat') { reqUnit = 'Materials Cost'; remaining = item.remMat; }
     else if (type === 'oth') { reqUnit = 'Labor Cost'; remaining = item.remOth; }
     else if (type === 'tot') { reqUnit = 'Total Cost'; remaining = item.remTot; }

     if (qtyInput) {
        const val = parseFloat(qtyInput.value);
        if (val > 0) submissions.push({ item: item.item, unit: reqUnit, qty: val, project, phase, remarks });
     } else if (checkInput && checkInput.checked) {
        const isCostToggle = (type === 'mat' || type === 'oth' || type === 'tot');
        const defaultQty = isCostToggle ? (remaining > 0 ? remaining : 0) : (remaining > 0 ? remaining : 1);
        submissions.push({ item: item.item, unit: reqUnit, qty: defaultQty, project, phase, remarks });
     }
  });

  if (submissions.length === 0) {
    alert("No items selected.");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Submitting...';

  if (typeof google !== 'undefined') {
    google.script.run.withSuccessHandler((res) => {
      document.getElementById('mrf-form-view').style.display = 'none';
      document.getElementById('success-view').style.display = 'block';
    }).submitRequest(submissions, userProfile.email);
  }
}

function resetMRF() {
  document.getElementById('success-view').style.display = 'none';
  document.getElementById('mrf-form-view').style.display = 'block';
  const btn = document.getElementById('mrfSubmitBtn');
  btn.disabled = false;
  btn.innerText = 'Submit Request';

  document.getElementById('projectSelect').value = '';
  onMrfProjectChange();

  initApp();
}

function loadHistory() {
  const body = document.getElementById('historyBody');
  if(!body) return;
  body.innerHTML = '<tr><td><div class="skeleton-box"></div></td></tr>';

  if (typeof google !== 'undefined') {
    google.script.run.withSuccessHandler(data => {
      renderHistoryGrouped(data || []);
    }).getRequestHistory();
  }
}

function renderHistoryGrouped(rows) {
  const body = document.getElementById('historyBody');
  if (!rows.length) {
    body.innerHTML = '<tr><td class="text-center py-4 text-muted">No history found.</td></tr>';
    return;
  }

  const groups = {};
  const order = [];
  rows.forEach(r => {
    const code = r.mrfCode || '(No MRF Code)';
    if (!groups[code]) { groups[code] = []; order.push(code); }
    groups[code].push(r);
  });

  const statusBadge = s => {
    const cls = s === 'Approved' ? 'bg-success' : (s === 'Rejected' ? 'bg-danger' : 'bg-warning text-dark');
    return `<span class="badge ${cls}">${s}</span>`;
  };

  body.innerHTML = order.map((code, gi) => {
    const items = groups[code];
    const first = items[0];
    const statuses = [...new Set(items.map(i => i.status))];
    const headerBadge = statuses.length === 1 ? statusBadge(statuses[0]) : '<span class="badge bg-secondary">Mixed</span>';
    const collapseId = 'hist-group-' + gi;

    const innerRows = items.map(it => `
      <tr>
        <td class="ps-4">${it.phase || '—'}</td>
        <td>${it.scope ? cleanBullets(it.scope) : '—'}</td>
        <td class="fw-bold">${cleanBullets(it.item)}</td>
        <td>${it.unit}</td>
        <td class="text-end">${fmtNum(it.qty)}</td>
        <td class="text-muted">${it.remarks || '—'}</td>
        <td class="text-center">${statusBadge(it.status)}</td>
      </tr>`).join('');

    return `
      <tr style="cursor:pointer; background:#f8f9fa;" onclick="toggleHistoryGroup('${collapseId}')">
        <td class="fw-bold">
          <span class="me-2">▸</span>${code}
          <span class="text-muted small ms-2">${first.project} · ${first.date}</span>
          <span class="float-end">${headerBadge}</span>
        </td>
      </tr>
      <tr id="${collapseId}" style="display:none;">
        <td class="p-0">
          <table class="table table-sm mb-0">
            <thead class="table-light" style="font-size:0.72rem; text-transform:uppercase;">
              <tr><th class="ps-4">Phase</th><th>Scope</th><th>Item</th><th>Unit</th><th class="text-end">Qty</th><th>Remarks</th><th class="text-center">Status</th></tr>
            </thead>
            <tbody>${innerRows}</tbody>
          </table>
        </td>
      </tr>`;
  }).join('');
}

function toggleHistoryGroup(id) {
  const row = document.getElementById(id);
  if (!row) return;
  row.style.display = (row.style.display === 'none') ? 'table-row' : 'none';
}

// --- RFQ TAB LOGIC ---
function loadRFQs() {
    const tbody = document.getElementById('rfqTableBody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Fetching RFQs...</td></tr>';

    google.script.run.withSuccessHandler(data => {
        globalRfqData = data;
        
        // Populate Project Filter
        const projFilter = document.getElementById('rfqProjectFilter');
        const projects = [...new Set(data.map(r => r.project))].sort();
        projFilter.innerHTML = '<option value="">— All Projects —</option>' + projects.map(p => `<option value="${p}">${p}</option>`).join('');
        colorizeProjectSelect(projFilter);
        whenProjectMapReady(function(){ setupProjectDropdownHighlight(projFilter); });

        filterRFQs();
    }).getRFQsList();
}

function filterRFQs() {
    const proj = document.getElementById('rfqProjectFilter').value;
    const status = document.getElementById('rfqStatusFilter').value;
    const tbody = document.getElementById('rfqTableBody');

    let filtered = globalRfqData;
    if (proj) filtered = filtered.filter(r => r.project === proj);
    if (status === 'Active') filtered = filtered.filter(r => !r.hasPo);
    else if (status === 'Finished') filtered = filtered.filter(r => r.hasPo);

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No RFQs found.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(r => {
        const badge = r.hasPo
            ? `<span class="badge bg-secondary ms-2">Bidding Finished</span>`
            : `<span class="badge bg-success ms-2">Active</span>`;

        const voidBtn = !r.hasPo
            ? `<button class="btn btn-sm btn-outline-danger ms-1" onclick="voidRFQ('${r.mrfId}')">Void</button>`
            : '';

        // PDF generation can fail transiently (e.g. a storage outage) even
        // though the approval itself already went through -- offer a retry
        // instead of hiding the row (see regenerateRfqPdf below).
        const pdfBtn = r.url
            ? `<a href="${r.url}" target="_blank" class="btn btn-sm btn-primary">Download PDF</a>`
            : `<button class="btn btn-sm btn-outline-warning" onclick="regenerateRfqPdf('${r.mrfId}')">Generate PDF</button>`;

        return `
        <tr>
            <td class="align-middle fw-bold text-dark">${r.mrfId} ${badge}</td>
            <td class="align-middle">${r.createdBy || '—'}</td>
            <td class="align-middle">${r.project}</td>
            <td class="align-middle">${r.date}</td>
            <td class="align-middle">
                ${pdfBtn}${voidBtn}
            </td>
        </tr>`;
    }).join('');
}

function regenerateRfqPdf(mrfId) {
    google.script.run
        .withSuccessHandler(() => { loadRFQs(); })
        .withFailureHandler(err => { alert('Error generating PDF: ' + err.message); })
        .regenerateRfqPdf(mrfId);
}

function voidRFQ(mrfId) {
    const reason = prompt(
        `WARNING: You are about to void RFQ "${mrfId}" and restore all items to the BOQ budget.\n\n` +
        `This cannot be undone. Please enter a reason:`
    );

    if (reason === null) return; // user cancelled
    if (!reason.trim()) {
        alert('A reason is required to void an RFQ.');
        return;
    }

    const tbody = document.getElementById('rfqTableBody');
    // Dim the matching row so the user sees feedback immediately
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
        if (row.textContent.includes(mrfId)) {
            row.style.opacity = '0.4';
            row.style.pointerEvents = 'none';
        }
    });

    google.script.run
        .withSuccessHandler(msg => {
            alert(msg);
            loadRFQs();
        })
        .withFailureHandler(err => {
            alert('Error: ' + err.message);
            loadRFQs(); // refresh to restore row state
        })
        .voidAlphaRFQ(mrfId, reason.trim(), userProfile.email);
}

// --- APPROVAL QUEUE LOGIC ---
function loadApprovalQueue() {
  const container = document.getElementById('approvalQueueContainer');
  if(!container) return;
  
  container.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary"></div><p class="mt-2 text-muted">Fetching pending requests...</p></div>';

  if (typeof google !== 'undefined') {
    google.script.run.withSuccessHandler(data => {
      approvalQueueRaw = data.requests || [];
      
      const approvalProjFilter = document.getElementById('approvalProjectFilter');
      if (approvalProjFilter) {
        approvalProjFilter.innerHTML = '<option value="">All Projects</option>';
        data.projects.forEach(p => {
          let opt = document.createElement('option');
          opt.value = p;
          opt.innerHTML = p;
          approvalProjFilter.appendChild(opt);
        });
      }
      
      renderApprovalQueue(approvalQueueRaw);
    }).getApprovalQueueData();
  }
}

function updateApprovalPhaseFilter() {
  const project = document.getElementById('approvalProjectFilter').value;
  const phaseFilter = document.getElementById('approvalPhaseFilter');
  if (!phaseFilter) return;

  phaseFilter.innerHTML = '<option value="">Filter by phase...</option>';
  
  if (!project) {
    applyApprovalFilters();
    return;
  }

  const filteredPhases = new Set();
  approvalQueueRaw.filter(req => req.code === project).forEach(req => {
    req.items.forEach(item => filteredPhases.add(item.phase));
  });

  Array.from(filteredPhases).sort().forEach(p => {
    let opt = document.createElement('option');
    opt.value = p;
    opt.innerHTML = p;
    phaseFilter.appendChild(opt);
  });

  applyApprovalFilters();
}

function applyApprovalFilters() {
  const project = document.getElementById('approvalProjectFilter').value;
  const phase = document.getElementById('approvalPhaseFilter').value;

  let filtered = approvalQueueRaw;

  if (project) {
    filtered = filtered.filter(req => req.code === project);
  }

  if (phase) {
    filtered = filtered.filter(req => req.items.some(item => item.phase === phase));
  }

  renderApprovalQueue(filtered);
}

function renderApprovalQueue(requests) {
  const container = document.getElementById('approvalQueueContainer');
  if (!requests || requests.length === 0) {
    container.innerHTML = '<div class="alert alert-light border text-center p-5">No matching pending requests found.</div>';
    return;
  }

  container.innerHTML = requests.map(req => {
    // Group items by Phase -> Scope, but retain each item's ORIGINAL index (idx)
    // within req.items so existing element IDs / data-req wiring in
    // updateRemaining() and processQueueAction() keep working unchanged.
    const grouped = {};
    const phaseOrder = [];
    req.items.forEach((item, idx) => {
      const phase = item.phase || 'Uncategorized Phase';
      const scope = item.scope ? cleanBullets(item.scope) : 'General / Uncategorized';
      if (!grouped[phase]) { grouped[phase] = {}; phaseOrder.push(phase); }
      if (!grouped[phase][scope]) grouped[phase][scope] = [];
      grouped[phase][scope].push({ item, idx });
    });

    let rowsHtml = '';
    phaseOrder.forEach(phase => {
      rowsHtml += `<tr><td colspan="8" class="bg-dark text-white fw-bold py-2 ps-3 text-uppercase" style="font-size:0.75rem;">${phase}</td></tr>`;
      Object.keys(grouped[phase]).sort().forEach(scope => {
        rowsHtml += `<tr><td colspan="8" class="bg-light text-secondary fw-bold py-1 ps-4 text-uppercase" style="font-size:0.72rem;">${scope}</td></tr>`;
        grouped[phase][scope].forEach(({ item, idx }) => {
          rowsHtml += `
              <tr class="item-row-${req.id}">
                <td class="ps-3">${cleanBullets(item.description)}</td>
                <td class="text-center">${item.budget.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td class="text-center fw-bold">${item.reqQty === 0 ? '<span class="badge bg-warning text-dark">TBD</span>' : item.reqQty}</td>
                <td class="text-center">${item.unit}</td>
                <td style="width: 120px;">
                  <input type="number" class="form-control form-control-sm text-center req-qty" data-req="${req.id}"
                         value="${item.reqQty === 0 ? '' : item.reqQty}" placeholder="Amount" id="qty-${req.id}-${idx}"
                         oninput="updateRemaining('${req.id}', ${idx}, ${item.remainingBeforeApprove})">
                </td>
                <td class="text-center fw-bold ${(item.remainingBeforeApprove - item.reqQty) <= 0 ? 'text-danger' : ''}" id="rem-${req.id}-${idx}">
                  ${(item.remainingBeforeApprove - item.reqQty).toLocaleString(undefined, {minimumFractionDigits: 2})}
                </td>
                <td class="pe-3" style="width: 250px;">
                  <input type="text" class="form-control form-control-sm req-remarks mb-1 bg-light" data-req="${req.id}" id="remarks-${req.id}-${idx}"
                         value="${(item.remarks || '').replace(/"/g, '&quot;')}" readonly tabindex="-1" style="cursor:default;">
                  ${item.reqQty === 0 ? `<div class="mt-1"><label style="font-size:0.68rem;color:#6c757d;margin-bottom:2px;display:block;">Attachment (Optional)</label><input type="file" class="form-control form-control-sm cost-file" data-req="${req.id}" data-idx="${idx}" accept=".pdf,.png,.jpg,.dwg"></div>` : ''}
                </td>
                <td class="pe-3 align-middle" style="min-width: 210px;">
                  <div class="brand-tags-container d-flex flex-wrap gap-1" id="tags-${req.id}-${idx}"></div>
                  <input type="text" class="form-control form-control-sm brand-tag-field" data-req="${req.id}" data-idx="${idx}" placeholder="Type brand, press Enter or ," onkeydown="handleBrandTagInput(event, '${req.id}', ${idx})">
                </td>
              </tr>`;
        });
      });
    });

    return `
    <div class="card mb-4 border-0 shadow-sm" id="card-${req.id}">
      <div class="card-header bg-white py-3 border-bottom-0">
        <div class="row align-items-center">
          <div class="col-md-12">
            <div class="fw-bold text-dark">${req.code}</div>
            <span class="text-muted small">${req.id} · ${req.user} · ${req.date}</span>
          </div>
        </div>
      </div>
      <div class="table-responsive">
        <table class="table table-sm align-middle mb-0" style="font-size: 0.82rem;">
          <thead class="bg-light text-muted small">
            <tr>
              <th class="ps-3 py-2">ITEM</th>
              <th class="py-2 text-center">BUDGET</th>
              <th class="py-2 text-center">REQ QTY</th>
              <th class="py-2 text-center">UNIT</th>
              <th class="py-2 text-center">APP. QTY / COST</th>
              <th class="py-2 text-center">REMAINING</th>
              <th class="py-2 pe-3">REMARKS / SPECS <span class="text-muted fw-normal" style="font-size:0.68rem;text-transform:none;">(from requestor)</span></th>
              <th class="py-2 pe-3" style="min-width: 210px;">PREFERRED BRANDS</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
      <div class="card-footer bg-white border-top-0 py-3 ps-3">
        <button class="btn btn-success btn-sm px-4 fw-bold me-2" onclick="processQueueAction('${req.id}', 'Approve')">Approve & Generate RFQ</button>
        <button class="btn btn-danger btn-sm px-4 fw-bold" onclick="processQueueAction('${req.id}', 'Reject')">Reject</button>
      </div>
    </div>
  `}).join('');
}

function updateRemaining(reqId, idx, remainingBeforeApprove) {
  const input = document.getElementById(`qty-${reqId}-${idx}`);
  const displayCell = document.getElementById(`rem-${reqId}-${idx}`); 
  
  const approvedVal = parseFloat(input.value) || 0;
  const newRemaining = remainingBeforeApprove - approvedVal;
  
  displayCell.innerText = newRemaining.toLocaleString(undefined, {minimumFractionDigits: 2});
  
  if (newRemaining <= 0) {
    displayCell.classList.add('text-danger');
  } else {
    displayCell.classList.remove('text-danger');
  }
}

async function processQueueAction(requestId, action) {
  if(!confirm(`Are you sure you want to ${action} request ${requestId}?`)) return;
  
  const card = document.getElementById(`card-${requestId}`);
  if(card) {
    card.style.opacity = '0.4';
    card.style.pointerEvents = 'none';
  }

  const remarkInputs = document.querySelectorAll(`.req-remarks[data-req="${requestId}"]`);
  const qtyInputs = document.querySelectorAll(`.req-qty[data-req="${requestId}"]`);
  const fileInputs = document.querySelectorAll(`.cost-file[data-req="${requestId}"]`);
  const brandTagInputs = document.querySelectorAll(`.brand-tag-field[data-req="${requestId}"]`);

  const remarksArray = Array.from(remarkInputs).map(input => input.value || "");
  const qtysArray = Array.from(qtyInputs).map(input => parseFloat(input.value) || 0);
  const preferredBrandsArray = Array.from(brandTagInputs).map(input => {
    const container = document.getElementById(`tags-${requestId}-${input.dataset.idx}`);
    const brands = [];
    if (container) {
      Array.from(container.querySelectorAll('.brand-chip')).forEach(c => brands.push(c.dataset.brand));
    }
    // Also capture text typed into the field but not yet converted into a chip
    const leftover = (input.value || '').trim().replace(/,+$/, '');
    if (leftover) brands.push(leftover);
    return brands.join(', ');
  });
  
  let filesData = [];
  if (action === 'Approve') {
     for (let input of fileInputs) {
         if (input.files.length > 0) {
             let file = input.files[0];
             let base64 = await toBase64(file);
             filesData.push({ idx: input.dataset.idx, name: file.name, mimeType: file.type, data: base64.split(',')[1] });
         }
     }
  }

  google.script.run
    .withSuccessHandler((rfqPdfUrl) => { 
        if(rfqPdfUrl && typeof rfqPdfUrl === 'string') {
           alert(`Approved! RFQ generated. You can view and download it in the RFQs tab.`);
        } else if (action === 'Reject') {
           alert("Request rejected.");
        }
        loadApprovalQueue(); 
    })
    .withFailureHandler((err) => {
        alert("Error processing action: " + err.message);
        if(card) {
          card.style.opacity = '1';
          card.style.pointerEvents = 'auto';
        }
    })
    .processApproval(requestId, action, remarksArray, qtysArray, filesData, userProfile.email, preferredBrandsArray);
}

// --- BRAND TAG INPUT HELPERS ---
function handleBrandTagInput(event, reqId, idx) {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault();
    const input = event.target;
    const value = input.value.trim().replace(/,+$/, '');
    if (!value) return;
    addBrandTag(reqId, idx, value);
    input.value = '';
  }
}

function addBrandTag(reqId, idx, brand) {
  const container = document.getElementById(`tags-${reqId}-${idx}`);
  if (!container) return;
  const chip = document.createElement('span');
  chip.className = 'brand-chip d-inline-flex align-items-center gap-1 px-2 py-1 rounded-pill fw-normal';
  chip.style.cssText = 'background:#dbeafe;color:#1d4ed8;font-size:0.72rem;border:1px solid #bfdbfe;line-height:1.5;white-space:nowrap;';
  chip.dataset.brand = brand;
  chip.innerHTML = brand + ' <button type="button" onclick="this.parentElement.remove()" style="background:none;border:none;color:#1d4ed8;font-size:1rem;padding:0;line-height:1;cursor:pointer;font-weight:bold;">&times;</button>';
  container.appendChild(chip);
}

// --- BID TAB (ENCODE QUOTES) LOGIC ---
function loadBidTabulation() {
    const tableBody = document.getElementById('bidTableBody');
    tableBody.innerHTML = '<tr><td colspan="2" class="text-center">Fetching data...</td></tr>';

    google.script.run.withSuccessHandler(data => {
        globalBidData = data;
        bidDataRaw = data.items;

        const projFilter = document.getElementById('bidProjectFilter');
        projFilter.innerHTML = '<option value="">— Select Project —</option>' + data.projects.map(p => `<option value="${p}">${p}</option>`).join('');
        colorizeProjectSelect(projFilter);
        whenProjectMapReady(function(){ setupProjectDropdownHighlight(projFilter); });

        updateBidMrfDropdown();
        tableBody.innerHTML = '<tr><td colspan="2" class="text-center">Please select a Project and MRF</td></tr>';
    }).getPendingQuoteMRFs();

    loadBidSupplierNames();
}

function loadBidSupplierNames() {
    const datalist = document.getElementById('bidSupplierDatalist');
    const input = document.getElementById('supplierNameInput');
    const feedback = document.getElementById('bidSupplierNameFeedback');

    google.script.run
        .withSuccessHandler(function(suppliers) {
            bidSupplierNamesCache = (suppliers || []).map(s => s.name).filter(Boolean).sort();

            if (bidSupplierNamesCache.length === 0) {
                if (datalist) datalist.innerHTML = '';
                if (input) {
                    input.placeholder = 'No suppliers found';
                    input.disabled = true;
                }
                if (feedback) {
                    feedback.innerHTML = 'No suppliers found — add one in <strong>Accounting → Supplier Data</strong> first.';
                    feedback.className = 'small mt-1 text-danger fw-bold';
                    feedback.style.display = 'block';
                }
                return;
            }

            if (datalist) {
                datalist.innerHTML = bidSupplierNamesCache.map(name => `<option value="${name.replace(/"/g, '&quot;')}">`).join('');
            }
            if (input) {
                input.disabled = false;
                input.placeholder = 'Type to search suppliers...';
            }
            if (feedback) feedback.style.display = 'none';
        })
        .withFailureHandler(function(err) {
            if (feedback) {
                feedback.innerText = 'Error loading suppliers: ' + err.message;
                feedback.className = 'small mt-1 text-danger fw-bold';
                feedback.style.display = 'block';
            }
        })
        .getSuppliersList();
}

// Validates that the typed supplier name exactly matches one from the Supplier
// Database. Shows an inline message instead of allowing a free-text mismatch,
// which previously caused quotes to be saved under supplier names that don't
// exist in Supplier Data.
function validateBidSupplierInput() {
    const input = document.getElementById('supplierNameInput');
    const feedback = document.getElementById('bidSupplierNameFeedback');
    if (!input || !feedback || input.disabled) return;

    const typed = input.value.trim();
    if (!typed) { feedback.style.display = 'none'; return; }

    const isValid = bidSupplierNamesCache.some(function(name) {
        return name.toLowerCase() === typed.toLowerCase();
    });

    if (!isValid) {
        feedback.innerHTML = 'Please add "' + typed.replace(/</g, '&lt;') + '" in Supplier Data first, or select an existing supplier from the list.';
        feedback.className = 'small mt-1 text-danger fw-bold';
        feedback.style.display = 'block';
    } else {
        feedback.style.display = 'none';
    }
}

function updateBidMrfDropdown() {
    const proj = document.getElementById('bidProjectFilter').value;
    const mrfSelect = document.getElementById('mrfSelectDropdown');
    
    mrfSelect.innerHTML = '<option value="">— Select MRF —</option>';
    
    // MRFs that have a PO are ALREADY excluded by the backend
    Object.keys(globalBidData.mrfMap).forEach(mrfId => {
        if (!proj || globalBidData.mrfMap[mrfId] === proj) {
            mrfSelect.innerHTML += `<option value="${mrfId}">${mrfId}</option>`;
        }
    });
}

//payment term row
function addPaymentTermRow() {
    const container = document.getElementById('paymentTermsContainer');
    const currentRows = container.querySelectorAll('.term-row').length;
    
    if (currentRows >= 5) {
        alert("Maximum of 5 payment terms allowed.");
        return;
    }

    const row = document.createElement('div');
    row.className = 'input-group input-group-sm mb-2 term-row';
    row.innerHTML = `
         <input type="text" class="form-control term-desc" list="termOptions" placeholder="Select or type term...">
         <input type="number" class="form-control term-pct" placeholder="%" style="max-width: 80px;" oninput="calcTermTotal()">
         <button class="btn btn-outline-danger" onclick="this.parentElement.remove(); calcTermTotal();" tabindex="-1">✕</button>
    `;
    container.appendChild(row);
}


function calcTermTotal() {
    const pcts = document.querySelectorAll('.term-pct');
    let total = 0;
    pcts.forEach(inp => {
        const val = parseFloat(inp.value) || 0;
        total += val;
    });
    
    const badge = document.getElementById('termTotalBadge');
    badge.innerText = `Total: ${total}%`;
    
    if (total === 100) {
        badge.className = 'badge bg-success';
    } else if (total > 100) {
        badge.className = 'badge bg-danger';
    } else {
        badge.className = 'badge bg-secondary';
    }
    return total;
}
function filterBids() {
    const mrfId = document.getElementById('mrfSelectDropdown').value;
    const tableBody = document.getElementById('bidTableBody');

    if (!mrfId) {
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">Please select an MRF to encode bids</td></tr>';
        return;
    }

    const items = bidDataRaw.filter(b => b.mrfId === mrfId);
    if (items.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">No pending items found for this MRF.</td></tr>';
        return;
    }

    // 1. Process items and split comma-separated brands
    let finalItemsToQuote = [];
    
    items.forEach((item, originalIdx) => {
        let itemName = item.description || item.item || "Unknown Item";
        let approvedQty = item.quantity || item.approvedAmount || item.qty || "0";
        let brands = item.brand || item.preferredBrands || "";

        if (!brands || brands.trim() === "" || brands.trim().toUpperCase() === "N/A") {
            finalItemsToQuote.push({ 
                description: itemName, quantity: approvedQty, brand: "—", originalId: originalIdx 
            });
        } else {
            let brandArray = brands.toString().split(',');
            brandArray.forEach(singleBrand => {
                finalItemsToQuote.push({ 
                    description: itemName, quantity: approvedQty, brand: singleBrand.trim(), originalId: originalIdx 
                });
            });
        }
    });

    // 2. Inject ONLY the 4 columns for the items (NO extra headers, NO extra buttons)
    tableBody.innerHTML = finalItemsToQuote.map((item) => `
        <tr>
            <td class="align-middle fw-medium">${item.description}</td>
            <td class="align-middle">${fmtNum(item.quantity)}</td>
            <td class="align-middle text-muted">${item.brand}</td>
            <td class="align-middle">
                <input type="number" class="form-control form-control-sm text-end quote-amt" data-original-idx="${item.originalId}" data-brand="${item.brand}" placeholder="0.00" min="0" step="0.01">
            </td>
        </tr>
    `).join('');
}

//submit-quotes
function submitQuotes(mrfId) {
    // 1. Read from the NEW static HTML inputs (outside the table)
    const supplierInput = document.getElementById('supplierNameInput');
    const supplier = supplierInput ? supplierInput.value.trim() : "";
    if(!supplier) { alert("Please select a supplier name."); return; }

    // Enforce exact match against the Supplier Database — prevents saving quotes
    // under a misspelled/unregistered supplier name.
    const isValidSupplier = bidSupplierNamesCache.some(function(name) {
        return name.toLowerCase() === supplier.toLowerCase();
    });
    if (!isValidSupplier) {
        alert('"' + supplier + '" was not found in the Supplier Database. Please add it in Supplier Data first, or select an existing supplier from the list.');
        return;
    }

    // --- Validation 1: Term Count ---
    const termRows = document.querySelectorAll('.term-row');
    if (termRows.length > 5) { alert("Maximum of 5 payment terms allowed."); return; }

    // --- Validation 2: Must be exactly 100% ---
    const termTotal = calcTermTotal();
    if (termTotal !== 100) { alert(`Payment terms must equal exactly 100%. Current total is ${termTotal}%.`); return; }

    let paymentTerms = [];
    let hasEmptyDesc = false;

    termRows.forEach(row => {
        const desc = row.querySelector('.term-desc').value.trim();
        const pct = parseFloat(row.querySelector('.term-pct').value) || 0;
        
        if (desc === "") hasEmptyDesc = true;
        if(desc && pct > 0) paymentTerms.push({ description: desc, percentage: pct });
    });

    if (hasEmptyDesc) { alert("Payment term descriptions cannot be empty. Please select or type a valid term."); return; }
    if(paymentTerms.length === 0) { alert("Please add at least one valid payment term."); return; }

    const inputs = document.querySelectorAll('.quote-amt');
    let quotes = [];
    const items = bidDataRaw.filter(b => b.mrfId === mrfId);

    // 2. Extract quotes and read the mapped dataset attributes
    inputs.forEach((inp) => {
        const amt = parseFloat(inp.value);
        if(!isNaN(amt) && amt > 0) {
            const originalIndex = parseInt(inp.dataset.originalIdx);
            const originalItemName = items[originalIndex].description || items[originalIndex].item;
            const brandVal = inp.dataset.brand || "—"; 
            quotes.push({ item: originalItemName, amount: amt, brand: brandVal }); 
        }
    });

    // 3. Read the delivery fee from the NEW static HTML input
    const deliveryFeeInput = document.getElementById('deliveryFeeInput');
    const deliveryFee = deliveryFeeInput ? (parseFloat(deliveryFeeInput.value) || 0) : 0;

    if(quotes.length === 0) { alert("Enter at least one quoted amount."); return; }

    // 4. Safely target the save button
    const saveBtn = document.querySelector('button[onclick^="submitQuotes"]');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = "Saving...";
    }

    google.script.run.withSuccessHandler(() => {
        alert("Quotes and Payment Terms saved successfully.");

        // Reset UI
        document.getElementById('paymentTermsContainer').innerHTML = `
            <div class="input-group input-group-sm mb-2 term-row">
              <input type="text" class="form-control term-desc" list="termOptions" placeholder="Select or type term...">
              <input type="number" class="form-control term-pct" placeholder="%" style="max-width: 80px;" oninput="calcTermTotal()">
              <button class="btn btn-outline-danger" onclick="this.parentElement.remove(); calcTermTotal();" tabindex="-1">✕</button>
            </div>
        `;
        
        // Clear out the new static inputs
        if (supplierInput) supplierInput.value = "";
        if (deliveryFeeInput) deliveryFeeInput.value = "";
        
        calcTermTotal();
        filterBids(); // Refreshes the table
        
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerText = "Save Quotes";
        }
    }).saveSupplierQuotes(mrfId, supplier, quotes, paymentTerms, userProfile.email, deliveryFee);
}


// --- CANVAS SHEET LOGIC ---
function loadCanvasMRFs() {
    google.script.run.withSuccessHandler(data => {
        globalCanvasData = data;

        const projFilter = document.getElementById('canvasProjectFilter');
        const projects = [...new Set(data.map(r => r.project))].sort();
        projFilter.innerHTML = '<option value="">— All Projects —</option>' + projects.map(p => `<option value="${p}">${p}</option>`).join('');
        colorizeProjectSelect(projFilter);
        whenProjectMapReady(function(){ setupProjectDropdownHighlight(projFilter); });

        updateCanvasMrfDropdown();
    }).getCanvasMRFList();
}

function updateCanvasMrfDropdown() {
    const proj = document.getElementById('canvasProjectFilter').value;
    const status = document.getElementById('canvasStatusFilter').value;
    const mrfSelect = document.getElementById('canvasMrfSelect');

    mrfSelect.innerHTML = '<option value="">— Select MRF —</option>';
    document.getElementById('canvasContainer').innerHTML = 'Select an MRF to view canvass sheet';
    document.getElementById('canvasSubmitBtn').style.display = 'none';

    globalCanvasData.forEach(r => {
        const matchesProj = (!proj || r.project === proj);
        const matchesStatus = (status === 'All' || !r.hasPo);
        
        if (matchesProj && matchesStatus) {
            const label = r.hasPo ? `${r.mrfId} (Finished)` : r.mrfId;
            mrfSelect.innerHTML += `<option value="${r.mrfId}">${label}</option>`;
        }
    });
}

function loadCanvasPivot() {
    const mrfId = document.getElementById('canvasMrfSelect').value;
    const container = document.getElementById('canvasContainer');
    const btn = document.getElementById('canvasSubmitBtn');

    if(!mrfId) { container.innerHTML = 'Select an MRF to view canvass sheet'; btn.style.display = 'none'; return; }
    container.innerHTML = 'Calculating Remaining Costs and Loading Bids...';

    google.script.run.withSuccessHandler(data => {
        currentCanvasData = data;
        if(data.suppliers.length === 0) {
            container.innerHTML = 'No quotes encoded for this MRF yet.';
            btn.style.display = 'none';
            return;
        }

        const isReadOnly = data.items.some(it => it.hasPo);

        let html = `
            <div class="d-flex justify-content-end align-items-center mb-3">
                <h5 class="mb-0 text-success fw-bold p-2 border border-success rounded bg-light">Running Total: <span id="canvasRunningTotal">₱0.00</span></h5>
            </div>
            <div class="table-responsive"><table class="table table-bordered table-sm align-middle">
            <thead class="table-light"><tr><th>Item Description</th><th class="text-center">Qty / Unit</th>`;
        
        data.suppliers.forEach(sup => html += `<th class="text-center">${sup}</th>`);
        html += `</tr></thead><tbody>`;

        let lockedRunningTotal = 0;
        const lockedFeeSuppliers = new Set();

        data.items.forEach((it, rIdx) => {
            const remDisplay = `₱${(it.remainingCost || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}`;

            html += `<tr>
                <td><span class="fw-bold">${it.desc}</span><br><small class="text-danger fw-bold">Rem: ${remDisplay}</small></td>
                <td class="text-center">${it.qty === 0 ? 'Lot/Cost' : it.qty} ${it.unit}</td>`;

            data.suppliers.forEach((sup, cIdx) => {
                const quote = it.quotes[sup];
                const amt = quote ? `₱${quote.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}` : '-';
                const brandLine = (quote && quote.brand) ? `<br><small class="text-muted">${quote.brand}</small>` : '';
                const safeDesc = it.desc.replace(/"/g, '&quot;');
                const safeSup = sup.replace(/"/g, '&quot;');
                const rawAmt = quote ? quote.amount : 0;

                const isWinningCell = (it.winningSupplier === sup);
                if (isWinningCell) {
                    lockedRunningTotal += rawAmt;
                    // Delivery fee is a flat per-supplier shipment cost, not per item --
                    // add it once per winning supplier, not once per item they won.
                    if (!lockedFeeSuppliers.has(sup)) {
                        lockedFeeSuppliers.add(sup);
                        lockedRunningTotal += (data.deliveryFees[sup] || 0);
                    }
                }

                let cellClasses = `text-center canvas-cell row-${rIdx}`;
                if (isWinningCell) cellClasses += ' bg-success text-white fw-bold';

                let isClickable = '';
                let cursor = '';

                // Only allow clicking if NOT read-only
                if (!isReadOnly && quote) {
                    isClickable = `onclick="selectWinner(this)" data-item="${safeDesc}" data-sup="${safeSup}" data-amt="${rawAmt}" data-qty="${it.qty}"`;
                    cursor = 'cursor:pointer;';
                }

                html += `<td class="${cellClasses}" ${isClickable} style="${cursor}">${amt}${brandLine}</td>`;
            });
            html += `</tr>`;
        });

        html += `<tr class="table-light"><td class="fw-bold">Delivery Fee</td><td></td>`;
        data.suppliers.forEach(sup => {
            const fee = data.deliveryFees[sup] || 0;
            html += `<td class="text-center fw-bold">₱${fee.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>`;
        });
        html += `</tr>`;

        html += `</tbody></table></div>`;
        
        if (isReadOnly) {
            html += `<p class="text-danger fw-bold small text-center mt-3">Bidding is closed. Purchase Orders have already been generated for this MRF.</p>`;
            btn.style.display = 'none';
        } else {
            html += `<p class="text-muted small text-center mt-2">Click on an amount to select the winning supplier for that item.</p>`;
            btn.style.display = 'block';
        }
        
        container.innerHTML = html;

        // Auto-update running total if viewing a finished/read-only Canvas
        if (isReadOnly) {
            document.getElementById('canvasRunningTotal').innerText = `₱${lockedRunningTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        }
        
    }).getCanvasPivotData(mrfId);
}

function selectWinner(cell) {
    const rowCells = cell.parentElement.querySelectorAll('.canvas-cell');
    
    rowCells.forEach(c => {
        c.classList.remove('bg-success', 'text-white', 'fw-bold', 'selected-winner');
        delete c.dataset.winnerData;
    });

    cell.classList.add('bg-success', 'text-white', 'fw-bold', 'selected-winner');
    
    cell.dataset.winnerData = JSON.stringify({ 
        item: cell.dataset.item, 
        supplier: cell.dataset.sup, 
        amount: parseFloat(cell.dataset.amt), 
        qty: parseFloat(cell.dataset.qty) 
    });

    // Compute and update the Running Total, including each distinct winning
    // supplier's delivery fee once -- it's a flat per-shipment cost, not per item.
    let runningTotal = 0;
    const feeSuppliers = new Set();
    document.querySelectorAll('.selected-winner').forEach(winnerCell => {
        const data = JSON.parse(winnerCell.dataset.winnerData);
        runningTotal += data.amount;
        if (!feeSuppliers.has(data.supplier)) {
            feeSuppliers.add(data.supplier);
            runningTotal += (currentCanvasData.deliveryFees[data.supplier] || 0);
        }
    });

    document.getElementById('canvasRunningTotal').innerText = `₱${runningTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
}

function submitCanvasWinners() {
  const mrfId = document.getElementById('canvasMrfSelect').value;
  const winningCells = document.querySelectorAll('.selected-winner');
  
  if (winningCells.length === 0) { alert("Please select at least one winning bid."); return; }
  
  const winners = Array.from(winningCells).map(c => JSON.parse(c.dataset.winnerData));
  
  if(!confirm(`Generate POs for ${winners.length} awarded items?`)) return;
  
  const btn = document.getElementById('canvasSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Generating POs...';

  google.script.run.withSuccessHandler((res) => {
      alert(res);
      btn.disabled = false;
      btn.innerHTML = "Finalize & Generate POs";
      loadCanvasMRFs();
      document.getElementById('canvasContainer').innerHTML = '';
      btn.style.display = 'none';
  }).awardCanvasWinners(mrfId, winners, userProfile.email);
}

// --- SUKI LOGIC (Maintained from before) ---
function renderSukiTable() {
   const body = document.getElementById('suki-item-body');
   body.innerHTML = sukiItemsData.map((it, idx) => {
      const isCost = it.unit.toLowerCase().includes('cost');
      const qtyDisplay = isCost ? "1" : it.qty; 
      const placeholder = isCost ? "Total Amount" : "Price per Unit";
      
      return `
         <tr>
           <td>${it.name}</td>
           <td>${it.unit}</td>
           <td class="text-center">${fmtNum(qtyDisplay)}</td>
           <td><input type="number" class="form-control form-control-sm suki-price-input" data-idx="${idx}" placeholder="${placeholder}" oninput="calcSuki()"></td>
           <td class="suki-line-total fw-bold text-end" id="suki-total-${idx}">₱0.00</td>
         </tr>
      `;
   }).join('');
}

function calcSuki() {
   let grandTotal = 0;
   const inputs = document.querySelectorAll('.suki-price-input');
   inputs.forEach(inp => {
      const idx = inp.dataset.idx;
      const it = sukiItemsData[idx];
      const isCost = it.unit.toLowerCase().includes('cost') || it.unit.toLowerCase().includes('labor') || it.unit.toLowerCase().includes('others') || it.unit.toLowerCase().includes('total');
      const price = parseFloat(inp.value) || 0;
      
      const lineTotal = isCost ? price : (price * it.qty);
      document.getElementById(`suki-total-${idx}`).innerText = `₱${lineTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
      grandTotal += lineTotal;
   });
   document.getElementById('suki-grand-total').innerText = `₱${grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
}

function submitSuki() {
   const inputs = document.querySelectorAll('.suki-price-input');
   const finalItems = [];
   let hasEmpty = false;
   
   inputs.forEach(inp => {
      const idx = inp.dataset.idx;
      const it = sukiItemsData[idx];
      const price = parseFloat(inp.value);
      if (isNaN(price) || price <= 0) hasEmpty = true;
      
      const isCost = it.unit.toLowerCase().includes('cost') || it.unit.toLowerCase().includes('labor') || it.unit.toLowerCase().includes('others') || it.unit.toLowerCase().includes('total');
      finalItems.push({
         name: it.name,
         unit: it.unit,
         qty: isCost ? 1 : it.qty,
         unitPrice: price 
      });
   });
   
   if (hasEmpty) { alert("Please enter a valid price/amount for all items."); return; }
   
   const btn = document.getElementById('sukiSubmitBtn');
   btn.disabled = true;
   btn.innerHTML = 'Sending...';
   
   google.script.run.withSuccessHandler(res => {
      document.getElementById('suki-item-body').innerHTML = `<tr><td colspan="5" class="text-success text-center fw-bold py-4">Submitted successfully! You may safely close this page.</td></tr>`;
      btn.style.display = 'none';
   }).submitSukiPricing(SUKI_PO, sukiSupplierName, finalItems);
}

// --- RECEIVING LOGIC ---
function loadReceiving() {
    loadReceivingHistory();
    const body = document.getElementById('receivingTableBody');
    body.innerHTML = ' Fetching active deliveries...';

    google.script.run
        .withSuccessHandler(res => {
            receivingData = res;
            const pSelect = document.getElementById('receivingProjectSelect');
            pSelect.innerHTML = '<option value="">— Select Project —</option>';
            
            res.projects.forEach(p => {
                let opt = document.createElement('option');
                opt.value = p;
                opt.innerHTML = p;
                pSelect.appendChild(opt);
            });
            colorizeProjectSelect(pSelect);
            whenProjectMapReady(function(){ setupProjectDropdownHighlight(pSelect); });

            body.innerHTML = 'Select a project and PO';
        })
        .withFailureHandler(err => {
            // This prevents the infinite loading freeze if the backend fails
            body.innerHTML = `<tr><td colspan="6" class="text-danger text-center fw-bold py-4">Error fetching data: ${err.message}</td></tr>`;
        })
        .getReceivingData();
}
function updateReceivingPoDropdown() {
   const proj = document.getElementById('receivingProjectSelect').value;
   const poSelect = document.getElementById('receivingPoSelect');
   poSelect.innerHTML = '<option value="">— Select PO —</option>';
   document.getElementById('receivingTableBody').innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Select a PO</td></tr>';
   
   if(proj && receivingData.pos[proj]) {
      Object.keys(receivingData.pos[proj]).forEach(po => {
         let opt = document.createElement('option');
         opt.value = po; opt.innerHTML = po;
         poSelect.appendChild(opt);
      });
   }
}

function renderReceivingTable() {
    const proj = document.getElementById('receivingProjectSelect').value;
    const po = document.getElementById('receivingPoSelect').value;
    const body = document.getElementById('receivingTableBody');

    if (!proj || !po) {
        body.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Select a PO</td></tr>';
        return;
    }

    const items = receivingData.pos[proj][po];

    // REPLACEMENT IN javascript.html (Inside renderReceivingTable)
    body.innerHTML = items.map((it, idx) => {
        // Safely escape quotes in the item name to prevent HTML attribute breaking
        const safeName = it.name.replace(/"/g, '&quot;');
        
        // Add a clean badge/subtitle if a brand exists
        const brandDisplay = it.brand ? `<br><small class="text-muted text-uppercase" style="font-size: 0.75rem; font-weight: 600;">BRAND: ${it.brand}</small>` : '';
        
        return `
        <tr>
            <td class="align-middle fw-bold">${it.name}${brandDisplay}</td> <td class="align-middle text-center">${fmtNum(it.ordered)}</td>
            <td class="align-middle text-center text-primary fw-bold">${fmtNum(it.remaining)}</td>
            <td width="20%">
                <input type="number" class="form-control form-control-sm text-center rcv-qty" 
                       data-name="${safeName}" 
                       placeholder="0" 
                       max="${it.remaining}">
            </td>
            <td width="30%">
                <input type="text" class="form-control form-control-sm rcv-rem" placeholder="Condition / Remarks">
            </td>
        </tr>
        `;
    }).join('');
}

async function submitReceiving(btn) {
   const proj = document.getElementById('receivingProjectSelect').value;
   const poCode = document.getElementById('receivingPoSelect').value;
   const docNum = document.getElementById('receivingDocNum').value;
   
   if (!poCode || !docNum) {
      alert("Please select a PO and enter the Delivery Document Number.");
      return;
   }
   
   const qtyInputs = document.querySelectorAll('.rcv-qty');
   const remInputs = document.querySelectorAll('.rcv-rem');
   const items = [];
   
   for(let i=0; i<qtyInputs.length; i++) {
      const qty = parseFloat(qtyInputs[i].value);
      if (qty > 0) {
         items.push({
            name: qtyInputs[i].dataset.name,
            qty: qty,
            remarks: remInputs[i].value || "" 
         });
      }
   }
   
   if (items.length === 0) {
      alert("Please enter a received quantity for at least one item.");
      return;
   }
   
   // Handle UI State
   btn.disabled = true;
   btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Processing Uploads...';

   try {
     // Fetch Files
     const receiptInput = document.getElementById('receivingReceiptFile');
     const photoInput = document.getElementById('receivingPhotoFile');
     
     let receiptData = null;
     if (receiptInput.files.length > 0) {
       const file = receiptInput.files[0];
       const base64 = await toBase64(file);
       receiptData = { name: file.name, mimeType: file.type, data: base64.split(',')[1] };
     }

     let photoData = null;
     if (photoInput.files.length > 0) {
       const file = photoInput.files[0];
       const base64 = await toBase64(file);
       photoData = { name: file.name, mimeType: file.type, data: base64.split(',')[1] };
     }
     
     const payload = { 
       project: proj, 
       poCode: poCode, 
       docNum: docNum, 
       email: userProfile.email, 
       items: items,
       receiptFile: receiptData,
       photoFile: photoData
     };
     
     google.script.run
       .withSuccessHandler(res => {
          alert("Delivery recorded successfully!");
          document.getElementById('receivingDocNum').value = '';
          document.getElementById('receivingReceiptFile').value = '';
          document.getElementById('receivingPhotoFile').value = '';
          btn.disabled = false;
          btn.innerHTML = "Confirm Delivery";
          loadReceiving(); 
          loadReceivingHistory();
       })
       .withFailureHandler(err => {
          alert("Error: " + err.message);
          btn.disabled = false;
          btn.innerHTML = "Confirm Delivery";
       })
       .submitReceivingToBackend(payload); // Calling the new backend function

   } catch (error) {
     alert("Error processing files: " + error.message);
     btn.disabled = false;
     btn.innerHTML = "Confirm Delivery";
   }
}

// --- RECEIVING HISTORY LOGIC ---
function loadReceivingHistory() {
    const tbody = document.getElementById('receivingHistoryBody');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm"></div> Fetching history...</td></tr>';

    google.script.run.withSuccessHandler(data => {
        globalReceivingHistory = data || [];
        showAllReceiving = false; // Reset to default view (10 items)

        const poFilter = document.getElementById('receivingHistoryPoFilter');
        if (poFilter) {
            const uniquePOs = [...new Set(globalReceivingHistory.map(r => r.poCode).filter(Boolean))].sort();
            poFilter.innerHTML = '<option value="All">All POs</option>' + uniquePOs.map(po => `<option value="${po}">${po}</option>`).join('');
            poFilter.value = 'All';
        }

        receivingHistoryFiltered = globalReceivingHistory;
        renderReceivingHistory();
    }).getReceivingHistoryData();
}

function filterReceivingHistory() {
    const selected = document.getElementById('receivingHistoryPoFilter').value;
    receivingHistoryFiltered = (selected === 'All')
        ? globalReceivingHistory
        : globalReceivingHistory.filter(r => r.poCode === selected);
    showAllReceiving = false; // reset pagination whenever the filter changes
    renderReceivingHistory();
}

function renderReceivingHistory() {
    const tbody = document.getElementById('receivingHistoryBody');
    const footer = document.getElementById('receivingHistoryFooter');
    const btn = document.getElementById('showMoreReceivingBtn');
    const source = receivingHistoryFiltered.length || globalReceivingHistory.length === 0 ? receivingHistoryFiltered : globalReceivingHistory;

    if (source.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">No deliveries recorded yet.</td></tr>';
        footer.style.display = 'none';
        return;
    }

    const displayLimit = showAllReceiving ? source.length : 10;
    const itemsToDisplay = source.slice(0, displayLimit);

    tbody.innerHTML = itemsToDisplay.map(row => {
        // Smart URL Parser: Distinguishes between Receipt and Photo badges based on string pattern saved in DB
        let attachmentHtml = '<span class="text-muted small italic">None</span>';
        if (row.urls) {
            const links = row.urls.split('\n').map(u => {
                if (u.includes('Receipt:')) return `<a href="${u.replace('Receipt:', '').trim()}" target="_blank" class="badge bg-info text-dark text-decoration-none me-1">Receipt</a>`;
                if (u.includes('Photo:')) return `<a href="${u.replace('Photo:', '').trim()}" target="_blank" class="badge bg-secondary text-decoration-none">Photo</a>`;
                return `<a href="${u.trim()}" target="_blank" class="badge bg-primary text-decoration-none">Link</a>`;
            }).join('');
            attachmentHtml = links;
        }

        return `
        <tr>
            <td class="ps-4 text-nowrap">${row.date}</td>
            <td class="fw-bold text-primary">${row.poCode}</td>
            <td>${row.docNum}</td>
            <td class="fw-bold">${row.item}</td>
            <td class="text-center fw-bold">${fmtNum(row.qty)}</td>
            <td>${row.receiver}</td>
            <td class="text-muted">${row.remarks || '—'}</td>
            <td>${attachmentHtml}</td>
        </tr>`;
    }).join('');

    // Toggle Button Logic
    if (source.length > 10) {
        footer.style.display = 'block';
        btn.innerText = showAllReceiving ? "Show Less" : `Show All (${fmtNum(source.length)})`;
    } else {
        footer.style.display = 'none';
    }
}

function toggleReceivingHistory() {
    showAllReceiving = !showAllReceiving;
    renderReceivingHistory();
}

// --- BOQ INGESTOR LOGIC ---
function startUpload() {
  const fileInput = document.getElementById('fileInput');
  const projectCode   = document.getElementById('projectCode').value.trim();
  const customerName  = document.getElementById('customerName').value.trim();
  const assignCompany = document.getElementById('assignCompany').value;
  const btn    = document.getElementById('uploadBtn');
  const loader = document.getElementById('loader');
  const btnText = document.getElementById('btnText');

  if (!fileInput.files[0] || !projectCode || !customerName) {
    updateStatus('Please provide a Project Code, Customer Name, and a File.', 'text-danger');
    return;
  }

  if (!assignCompany) {
    updateStatus('Please select an Assigned Company before uploading.', 'text-danger');
    return;
  }

  if (!/^[A-Za-z0-9 ]+$/.test(projectCode)) {
    updateStatus('Project Code may contain only letters, numbers, and spaces — no hyphens or symbols.', 'text-danger');
    return;
  }

  // Milestone validation
  const _milestonePayload = extractMilestonePayload('boq');
  if (!_milestonePayload.valid) {
    updateStatus(_milestonePayload.error, 'text-danger');
    return;
  }

  // Package the customer data
  const customerData = {
    name:    customerName,
    phone:   document.getElementById('customerPhone').value.trim(),
    email:   document.getElementById('customerEmail').value.trim(),
    site:    document.getElementById('customerSite').value.trim(),
    billing: document.getElementById('customerBilling').value.trim(),
    birthday: document.getElementById('customerBirthday').value,
    tin:     document.getElementById('customerTin').value.trim(),
    company: assignCompany,
    quotedCost:     _milestonePayload.quotedCost,
    milestoneTerms: _milestonePayload.milestoneTerms
  };

  const file = fileInput.files[0];
  const reader = new FileReader();

  btn.disabled = true;
  if(loader) loader.style.display = 'inline-block';
  btnText.innerText = 'PROCESSING...';
  updateStatus('Reading file...', 'text-primary');
  
  const progCont = document.getElementById('progressContainer');
  if(progCont) progCont.style.display = 'flex';
  updateProgress(20);

  reader.onload = function(e) {
    const bytes = e.target.result.split(',')[1];
    updateStatus('Uploading to server...', 'text-primary');
    updateProgress(50);

    if (typeof google !== 'undefined') {
      google.script.run
        .withSuccessHandler(res => {
          if (typeof res === 'string' && res.toLowerCase().indexOf('error') === 0) {
            updateStatus(res, 'text-danger');
            btn.disabled = false;
            if(loader) loader.style.display = 'none';
            btnText.innerText = 'RETRY UPLOAD';
            return;
          }
          updateProgress(100);
          updateStatus('Success: BOQ and Customer Profile saved!', 'text-success');
          setTimeout(resetUI, 3000);
        })
        .withFailureHandler(err => {
          updateStatus('Error: ' + err.message, 'text-danger');
          btn.disabled = false;
          if(loader) loader.style.display = 'none';
          btnText.innerText = 'RETRY UPLOAD';
        })
        .processBOQ(bytes, file.name, projectCode, customerData); // Pass customerData to backend
    }
  };
  
  reader.readAsDataURL(file);
}

function updateStatus(msg, className) {
  const statusDiv = document.getElementById('status');
  if(statusDiv) statusDiv.innerHTML = `<span class="${className}">${msg}</span>`;
}

function updateProgress(percent) {
  const bar = document.getElementById('progressBar');
  if(bar) bar.style.width = percent + '%';
}

function resetUI() {
  const btn = document.getElementById('uploadBtn');
  const loader = document.getElementById('loader');
  const btnText = document.getElementById('btnText');
  
  if(btn) btn.disabled = false;
  if(loader) loader.style.display = 'none';
  if(btnText) btnText.innerText = 'UPLOAD & CONSOLIDATE';
  
  const progCont = document.getElementById('progressContainer');
  if(progCont) progCont.style.display = 'none';
  updateProgress(0);
  updateStatus('', '');
  
  // Clear all inputs
  document.getElementById('fileInput').value = '';
  document.getElementById('projectCode').value = '';
  document.getElementById('customerName').value = '';
  document.getElementById('customerPhone').value = '';
  document.getElementById('customerEmail').value = '';
  document.getElementById('customerSite').value = '';
  document.getElementById('customerBilling').value = '';
  document.getElementById('customerBirthday').value = '';
  document.getElementById('customerTin').value = '';
  document.getElementById('assignCompany').value = '';

  // Clear milestone fields
  const boqQC = document.getElementById('boq-quotedCost');
  if (boqQC) boqQC.value = '';
  const boqMC = document.getElementById('boq-milestonesContainer');
  if (boqMC) boqMC.innerHTML = '';
  calcMilestoneTotal('boq');
  const boqMillapseEl = document.getElementById('boqMilestoneCollapse');
  if (boqMillapseEl && boqMillapseEl.classList.contains('show')) {
    new bootstrap.Collapse(boqMillapseEl, { toggle: false }).hide();
  }

  // Close the collapsible section if it's open
  const collapseEl = document.getElementById('optionalCustomerFields');
  if(collapseEl && collapseEl.classList.contains('show')) {
     new bootstrap.Collapse(collapseEl, {toggle: false}).hide();
  }
}

// --- PO LOGIC ---
function loadPurchaseOrders() {
  const tableBody = document.getElementById('poTableBody');
  const projFilter = document.getElementById('poProjectFilter');
  
  if(tableBody) tableBody.innerHTML = '<tr><td colspan="10" class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary"></div> Loading...</td></tr>';

  google.script.run.withSuccessHandler(data => {
    poDataRaw = data || [];
    
    if (projFilter) {
      const projects = [...new Set(poDataRaw.map(po => po.projectName).filter(p => p))].sort();
      projFilter.innerHTML = '<option value="">— All Projects —</option>' +
        projects.map(p => `<option value="${p}">${p}</option>`).join('');
      colorizeProjectSelect(projFilter);
      whenProjectMapReady(function(){ setupProjectDropdownHighlight(projFilter); });
    }

    renderPOTable(poDataRaw);
  }).getPurchaseOrders();
}

function filterPOs() {
  const status = document.getElementById('poStatusFilter').value;
  const project = document.getElementById('poProjectFilter').value;
  
  let filtered = poDataRaw;
  if (status) filtered = filtered.filter(po => po.status === status);
  if (project) filtered = filtered.filter(po => po.projectName === project);
  
  renderPOTable(filtered);
}

function renderPOTable(data) {
  const tableBody = document.getElementById('poTableBody');
  if (!data || data.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-muted">No purchase orders found.</td></tr>';
    return;
  }

  tableBody.innerHTML = data.map(po => {
    // UPDATED COLOR LOGIC
    let statusClass = 'bg-secondary';
    if (po.status === 'Draft') statusClass = 'bg-secondary'; // Gray
    else if (po.status === 'Sent') statusClass = 'bg-warning text-dark'; // Yellow
    else if (po.status === 'Partial delivery') statusClass = 'bg-primary'; // Blue
    else if (po.status === 'Received all') statusClass = 'bg-success'; // Green
    else if (po.status === 'Voided') statusClass = 'bg-danger'; // Red

    let paymentBadgeClass = 'bg-secondary';
    if (po.paymentStatus === 'Partially Paid') paymentBadgeClass = 'bg-info text-dark';
    else if (po.paymentStatus === 'Fully Paid') paymentBadgeClass = 'bg-success';

    let actionButtons = '';
    const userRole = (userProfile && userProfile.role) ? String(userProfile.role).trim().toLowerCase() : '';
    
    if (userRole === 'admin' || userRole === 'accounting') {
        // UPDATED BUTTON LOGIC
        if (po.status === 'Draft') {
            // Draft = Dispatch & Void
            actionButtons = `
              <button class="btn btn-sm btn-primary py-0 me-1 fw-bold" onclick="dispatchPO('${po.poNumber}')">Dispatch</button>
              <button class="btn btn-sm btn-outline-danger py-0 fw-bold" onclick="voidPO('${po.poNumber}')">Void</button>
            `;
        } else if (po.status === 'Sent') {
            // Sent = Void Only
            actionButtons = `<button class="btn btn-sm btn-outline-danger py-0 fw-bold" onclick="voidPO('${po.poNumber}')">Void</button>`;
        } else if (po.status === 'Partial delivery' || po.status === 'Received all') {
            // Delivered = Green Locked Badge (Processing/Completed)
            actionButtons = `<span class="badge bg-success text-white border" title="Action Denied: Items from this PO have already arrived on site. It is now locked in the financial ledger and cannot be voided."><i class="bi bi-lock-fill"></i> Locked</span>`;
        } else if (po.status === 'Voided') {
            actionButtons = `<span class="text-muted small italic">Cancelled</span>`;
        }
    } else {
        actionButtons = `<span class="text-muted small">Restricted</span>`; 
    }
    
  const rowClass = po.status === 'Sent' ? 'table-danger' : '';

  // Return EVERYTHING in a single block
  return `
    <tr class="${rowClass}">
      <td class="fw-bold text-primary">${po.poNumber}</td>
      <td>${po.supplier}</td>
      <td>${po.projectName}</td>
      <td>${po.phase}</td>
      <td class="fw-bold">₱${Number(po.total).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
      <td><span class="badge ${statusClass}" style="font-size: 0.7rem; padding: 0.5em 0.8em;">${po.status}</span></td>
      <td><span class="badge ${paymentBadgeClass}" style="font-size: 0.7rem; padding: 0.5em 0.8em;">${po.paymentStatus || 'Not Yet Paid'}</span></td>
      <td>
        ${po.pdfUrl ? 
          `<a href="${po.pdfUrl}" target="_blank" class="btn btn-sm btn-outline-secondary py-0" style="font-size: 0.75rem;">View PDF</a>` : 
          `<span class="text-muted italic small">N/A</span>`}
      </td>
      <td style="min-width: 140px;">${actionButtons}</td>
    </tr>
  `;
}).join('');
}

// --- PAYMENTS & CHECKS LOGIC ---
function initPayments() {
  const pSelect = document.getElementById('paymentProjectSelect');
  pSelect.innerHTML = '<option value="">— Loading —</option>';
  google.script.run.withSuccessHandler(projects => {
    pSelect.innerHTML = '<option value="">— Select project —</option>';
    projects.forEach(p => {
      let opt = document.createElement('option');
      opt.value = p; opt.innerHTML = p;
      pSelect.appendChild(opt);
    });
    colorizeProjectSelect(pSelect);
    whenProjectMapReady(function(){ setupProjectDropdownHighlight(pSelect); });
  }).getProjectsListOnly();
}

function generateBulkRows() {
  const project = document.getElementById('paymentProjectSelect').value;
  const count = parseInt(document.getElementById('bulkCount').value) || 0;
  const startDateStr = document.getElementById('paymentDate').value;
  const amount = parseFormattedNumber(document.getElementById('paymentAmount').value);
  const body = document.getElementById('bulkPaymentBody');

  if (!project || !startDateStr || count <= 0) {
    alert("Please select a project, first date, and number of checks.");
    return;
  }

  body.innerHTML = '';
  document.getElementById('paymentSubmitBtn').style.display = 'block';

  let startDate = new Date(startDateStr);

  for (let i = 0; i < count; i++) {
    let currentDate = new Date(startDate);
    currentDate.setMonth(startDate.getMonth() + i);
    
    if (currentDate.getDate() !== startDate.getDate()) {
       currentDate.setDate(0); 
    }

    const dateStr = currentDate.toISOString().split('T')[0];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${project}</td>
      <td><input type="date" class="form-control form-control-sm bulk-date" value="${dateStr}"></td>
      <td><input type="text" class="form-control form-control-sm bulk-bank" placeholder="e.g. BDO, BPI"></td>
      <td><input type="text" class="form-control form-control-sm bulk-check-num" placeholder="Check #"></td>
      <td><input type="text" inputmode="decimal" class="form-control form-control-sm bulk-amt" oninput="formatThousands(this)"></td>
      <td><button class="btn btn-link text-danger p-0" onclick="this.closest('tr').remove()">✕</button></td>
    `;
    tr.dataset.project = project;
    body.appendChild(tr);
    const amtEl = tr.querySelector('.bulk-amt');
    amtEl.value = amount;
    formatThousands(amtEl);
  }
}

function submitBulkPayments() {
  const rows = document.querySelectorAll('#bulkPaymentBody tr');
  const btn = document.getElementById('paymentSubmitBtn');
  const alertBox = document.getElementById('payment-alert');
  const submissions = [];

  rows.forEach(row => {
    const date = row.querySelector('.bulk-date').value;
    const bank = row.querySelector('.bulk-bank').value.trim();
    const checkNum = row.querySelector('.bulk-check-num').value.trim();
    const amount = parseFormattedNumber(row.querySelector('.bulk-amt').value);

    if (date && !isNaN(amount) && amount > 0) {
      submissions.push({ 
        project: row.dataset.project, 
        date: date, 
        bank: bank || "N/A", 
        checkNum: checkNum || "N/A", 
        amount: amount 
      });
    }
  });

  if (submissions.length === 0) {
    alert("No valid payment rows found.");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = 'Saving...';

  google.script.run
    .withSuccessHandler(() => {
      btn.disabled = false;
      btn.innerHTML = 'Save All Payments';
      alertBox.innerText = `Successfully logged ${submissions.length} payment(s)!`;
      alertBox.className = "alert alert-success py-2";
      alertBox.style.display = 'block';
      document.getElementById('bulkPaymentBody').innerHTML = '';
      btn.style.display = 'none';
      setTimeout(() => alertBox.style.display = 'none', 4000);
    })
    .withFailureHandler(err => {
      btn.disabled = false;
      btn.innerHTML = 'Save All Payments';
      alertBox.innerText = "Error: " + err.message;
      alertBox.className = "alert alert-danger py-2";
      alertBox.style.display = 'block';
    })
    .logBulkPaymentData(submissions, userProfile.email);
}

function initChecks() {
  const monitorFilter = document.getElementById('pendingCheckProjectFilter');
  google.script.run.withSuccessHandler(projects => {
    monitorFilter.innerHTML = '<option value="">All Projects</option>';
    projects.forEach(p => {
      let opt = document.createElement('option');
      opt.value = p; opt.innerHTML = p;
      monitorFilter.appendChild(opt);
    });
    colorizeProjectSelect(monitorFilter);
    whenProjectMapReady(function(){ setupProjectDropdownHighlight(monitorFilter); });
  }).getProjectsListOnly();
  loadPendingChecks();
}

function loadPendingChecks() {
  const body = document.getElementById('pendingChecksTableBody');
  body.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm"></div> Loading...</td></tr>';
  
  google.script.run.withSuccessHandler(data => {
    pendingChecksRaw = data || [];
    renderPendingChecksTable(pendingChecksRaw);
  }).getPendingChecks();
}

function renderPendingChecksTable(data) {
  const body = document.getElementById('pendingChecksTableBody');
  if (data.length === 0) {
    body.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No pending checks found.</td></tr>';
    return;
  }

  const todayMs = new Date().setHours(0, 0, 0, 0);

  body.innerHTML = data.map(check => {
    const checkMs   = check.date ? new Date(check.date).setHours(0, 0, 0, 0) : null;
    const isOverdue = checkMs !== null && checkMs < todayMs;
    const isToday   = checkMs !== null && checkMs === todayMs;
    const dateBadge = isOverdue
      ? `<span class="badge bg-danger ms-1" style="font-size:0.65rem;">Overdue</span>`
      : isToday
        ? `<span class="badge bg-warning text-dark ms-1" style="font-size:0.65rem;">Due Today</span>`
        : '';
    return `
      <tr${isOverdue ? ' class="table-danger"' : isToday ? ' class="table-warning"' : ''}>
        <td class="text-center"><input type="checkbox" class="check-select-item" data-row="${check.rowIdx}"></td>
        <td>${check.project || ''}</td>
        <td class="text-nowrap">${check.date || ''}${dateBadge}</td>
        <td>${check.bank || ''}</td>
        <td><code style="font-size:0.85em;">${check.checkNumber || ''}</code></td>
        <td class="fw-bold text-end">₱${(check.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
      </tr>`;
  }).join('');
}

function filterPendingChecks() {
  const project = document.getElementById('pendingCheckProjectFilter').value;
  let filtered = pendingChecksRaw;
  if (project) {
    filtered = pendingChecksRaw.filter(c => c.project === project);
  }
  renderPendingChecksTable(filtered);
}

function toggleAllChecks(master) {
  const checkboxes = document.querySelectorAll('.check-select-item');
  checkboxes.forEach(cb => cb.checked = master.checked);
}

function processDepositedChecks() {
  const selectedCheckboxes = document.querySelectorAll('.check-select-item:checked');
  const rowIndices = Array.from(selectedCheckboxes).map(cb => parseInt(cb.dataset.row));

  if (rowIndices.length === 0) {
    alert("Please select at least one check to mark as deposited.");
    return;
  }

  if (!confirm(`Mark ${rowIndices.length} check(s) as deposited?`)) return;

  const btn = event.target;
  btn.disabled = true;
  btn.innerHTML = 'Processing...';

  google.script.run.withSuccessHandler(res => {
    alert("Checks updated successfully.");
    btn.disabled = false;
    btn.innerHTML = 'Mark Selected as Deposited';
    document.getElementById('checkSelectAll').checked = false;
    loadPendingChecks();
  }).updateCheckStatus(rowIndices, "Deposited");
}

// --- EXPENSES LOGIC ---
function initExpense() {
  const pSelect = document.getElementById('expenseProjectSelect');
  pSelect.innerHTML = '<option value="">— Loading Projects —</option>';

  const manageWrap = document.getElementById('expense-manage-projects-wrap');
  if (manageWrap) {
    manageWrap.style.display = isAdminUser_() ? '' : 'none';
  }

  // Ensure the company map is loaded BEFORE we populate + colorize the dropdown,
  // fixing the race condition where colorizeProjectSelect ran against an empty map.
  loadProjectCompanyMap(function() {
    google.script.run.withSuccessHandler(data => {
      expenseCategories = data.categories;
      pSelect.innerHTML = '<option value="">— Select project —</option>';
      data.projects.forEach(p => {
        let opt = document.createElement('option');
        opt.value = p; opt.innerHTML = p;
        pSelect.appendChild(opt);
      });
      colorizeProjectSelect(pSelect);
      applyExpenseProjectHighlight();
    }).getExpenseInitialData();
  });
}

function openManageExpenseProjectsModal() {
  const listEl = document.getElementById('manage-expense-projects-list');
  const alertEl = document.getElementById('manage-expense-projects-alert');
  alertEl.style.display = 'none';
  listEl.innerHTML = '<p class="text-muted small py-3 text-center"><span class="spinner-border spinner-border-sm me-1"></span>Loading...</p>';
  new bootstrap.Modal(document.getElementById('manageExpenseProjectsModal')).show();

  google.script.run
    .withSuccessHandler(function(data) {
      renderManageExpenseProjectsList(data.allProjects || [], data.hiddenProjects || []);
    })
    .withFailureHandler(function(err) {
      listEl.innerHTML = '<p class="text-danger small py-3">' + err.message + '</p>';
    })
    .getExpenseProjectManageData();
}

function renderManageExpenseProjectsList(allProjects, hiddenProjects) {
  const listEl = document.getElementById('manage-expense-projects-list');
  if (!allProjects.length) {
    listEl.innerHTML = '<p class="text-muted small py-3 text-center">No projects found.</p>';
    return;
  }
  const hiddenSet = new Set(hiddenProjects);
  listEl.innerHTML = allProjects.map(function(p) {
    const isHidden = hiddenSet.has(p);
    const safeId = 'mep-' + p.replace(/[^a-zA-Z0-9]/g, '_');
    return '<div class="form-check d-flex align-items-center justify-content-between py-2 border-bottom">' +
      '<label class="form-check-label small fw-bold" for="' + safeId + '">' + p + '</label>' +
      '<input class="form-check-input mt-0" type="checkbox" id="' + safeId + '" ' + (isHidden ? '' : 'checked') + ' ' +
      'onchange="toggleExpenseProjectVisibility(this, \'' + p.replace(/'/g, "\\'") + '\')">' +
      '</div>';
  }).join('');
}

function toggleExpenseProjectVisibility(checkbox, projectName) {
  const hide = !checkbox.checked; // unchecked = hidden from dropdown
  checkbox.disabled = true;
  const alertEl = document.getElementById('manage-expense-projects-alert');
  alertEl.style.display = 'none';

  google.script.run
    .withSuccessHandler(function() {
      checkbox.disabled = false;
      showToast(hide ? ('"' + projectName + '" hidden from Expense Log dropdown.') : ('"' + projectName + '" restored to Expense Log dropdown.'), 'success');
      initExpense();
    })
    .withFailureHandler(function(err) {
      checkbox.disabled = false;
      checkbox.checked = !checkbox.checked;
      alertEl.textContent = err.message;
      alertEl.className = 'alert alert-danger py-2 mb-3';
      alertEl.style.display = '';
    })
    .toggleHiddenExpenseProject(projectName, hide, userProfile.email);
}

function loadExpenseItems() {
  const proj = document.getElementById('expenseProjectSelect').value;
  const workspace = document.getElementById('expense-workspace');
  
  if (!proj) {
    workspace.style.display = 'none';
    return;
  }
  
  workspace.style.display = 'block';
  document.getElementById('expenseItemBody').innerHTML = '<tr><td colspan="3" class="text-center py-3">Preparing forms...</td></tr>';
  
  google.script.run.withSuccessHandler(res => {
    expenseSummary = res;
    document.getElementById('exp-summary-budget').innerText = `₱${res.totalBudget.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('exp-summary-mrf').innerText = `₱${res.totalMrfUtilized.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('exp-summary-rem').innerText = `₱${res.totalRemaining.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('exp-summary-manual').innerText = `₱${res.totalExpenses.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    
    document.getElementById('expenseItemBody').innerHTML = '';
    for(let i=0; i<3; i++) addExpenseRow(); 
  }).getExpenseSummaryForProject(proj);
}

function addExpenseRow() {
  const tbody = document.getElementById('expenseItemBody');
  const tr = document.createElement('tr');
  const uniqueId = 'row-' + Date.now() + Math.floor(Math.random() * 1000); // Unique ID for datalists

  // 1. Build the options for the Expense Type Dropdown
  let typeOptions = `<option value="">-- Select Type --</option>`;
  Object.keys(expenseTypeDictionary).forEach(type => {
    typeOptions += `<option value="${type}">${type}</option>`;
  });

  // 2. Generate the row HTML — Type, Particular, Total Amount (editable), Delete
  tr.innerHTML = `
    <td>
      <select class="form-select exp-type-input" onchange="updateParticularDatalist(this, '${uniqueId}')">
        ${typeOptions}
      </select>
    </td>

    <td>
      <input type="text" class="form-control exp-particular-input" list="datalist-${uniqueId}" placeholder="Select or type particular...">
      <datalist id="datalist-${uniqueId}">
        </datalist>
    </td>

    <td>
      <input type="number" class="form-control exp-total-input text-end" placeholder="0.00" step="0.01" min="0" oninput="validateExpenseRow(this)">
    </td>

    <td class="text-center">
      <button class="btn btn-sm btn-outline-danger" onclick="this.closest('tr').remove(); syncExpenseSubmitBtn();">
        <i class="bi bi-trash"></i> Delete
      </button>
    </td>
  `;
  
  tbody.appendChild(tr);
}

// Valid numeric formats: plain integers (10000), comma-thousands (10,000 / 1,000,000),
// and an optional single decimal (10.50 / 10,000.50).
// Rejected: bad comma groups (1,00), multiple decimals (5..00), non-numeric chars.
const EXPENSE_NUM_RE = /^(\d{1,3}(,\d{3})*|\d+)(\.\d+)?$/;

// 3. Real-time validation fired on every keystroke in Total Amount.
function validateExpenseRow(inputEl) {
  const val     = (inputEl.value || '').trim().replace(/,/g, '');
  const isValid = val === '' || EXPENSE_NUM_RE.test(val);
  inputEl.classList.toggle('is-invalid', !isValid);
  syncExpenseSubmitBtn();
}

// Disables the Save Expenses button while any field in the table carries the
// is-invalid class; re-enables it as soon as all fields are clean.
function syncExpenseSubmitBtn() {
  const btn = document.getElementById('expenseSubmitBtn');
  if (!btn) return;
  const hasInvalid = document.querySelectorAll('#expenseItemBody .is-invalid').length > 0;
  btn.disabled = hasInvalid;
}

// 4. Helper Function to dynamically populate the datalist when Type changes
function updateParticularDatalist(typeSelectElement, uniqueId) {
  const selectedType = typeSelectElement.value;
  const datalist = document.getElementById(`datalist-${uniqueId}`);
  const particularInput = typeSelectElement.closest('tr').querySelector('.exp-particular-input');
  
  // Clear existing options
  datalist.innerHTML = '';
  particularInput.value = ''; // Reset particular input when type changes

  // Populate new options if they exist
  if (selectedType && expenseTypeDictionary[selectedType]) {
    expenseTypeDictionary[selectedType].forEach(item => {
      const option = document.createElement('option');
      option.value = item;
      datalist.appendChild(option);
    });
  }
}


function submitExpense() {
  const proj = document.getElementById('expenseProjectSelect').value;
  if (!proj) return alert("Please select a project first.");

  const btn = document.getElementById('expenseSubmitBtn');
  const submissions = [];

  const rows = document.querySelectorAll('#expenseItemBody tr');
  rows.forEach(row => {
    const typeSelect = row.querySelector('.exp-type-input');
    const partInput  = row.querySelector('.exp-particular-input');
    const totalInput = row.querySelector('.exp-total-input');
    if (typeSelect && partInput && totalInput) {
      const type        = typeSelect.value;
      const particular  = partInput.value.trim();
      const totalAmount = parseFloat((totalInput.value || '').replace(/,/g, ''));
      if (type !== "" && particular !== "" && !isNaN(totalAmount) && totalAmount > 0) {
        submissions.push({ project: proj, type: type, particular: particular, totalAmount: totalAmount });
      }
    }
  });

  if (submissions.length === 0) {
    alert("Please enter a valid Expense Type, Particular, and Amount for at least one row.");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

  google.script.run
    .withSuccessHandler(() => {
      alert("Expenses successfully logged.");
      btn.disabled = false;
      btn.innerHTML = 'Save Expenses';
      loadExpenseItems(); // Refresh the table and balances
    })
    .withFailureHandler((err) => {
      alert("Error saving expenses: " + err.message);
      btn.disabled = false;
      btn.innerHTML = 'Save Expenses';
    })
    .submitExpenses(submissions, userProfile.email);
}

// --- REFUNDABLE EXPENSES ---
// Module-level cache so filterRefundsByProject() can re-render without a second network call.
let refundableData = [];

function loadRefundables() {
  const tbody    = document.getElementById('refundable-table-body');
  const dropdown = document.getElementById('filter-refund-project');

  tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm me-2"></div> Loading...</td></tr>';

  // Reset dropdown to "All Projects" on every fresh load
  if (dropdown) dropdown.innerHTML = '<option value="all">All Projects</option>';

  google.script.run
    .withSuccessHandler(function(data) {
      refundableData = data || [];

      if (refundableData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-5 text-muted"><div style="font-size:2rem;">✅</div>No pending refunds. All refundable items have been processed.</td></tr>';
        return;
      }

      // Populate dropdown with sorted unique project names
      if (dropdown) {
        [...new Set(refundableData.map(r => r.project))].sort().forEach(proj => {
          const opt = document.createElement('option');
          opt.value = proj;
          opt.textContent = proj;
          dropdown.appendChild(opt);
        });
      }

      renderRefundRows(refundableData);
    })
    .withFailureHandler(function(err) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger fw-bold">Error: ${err.message}</td></tr>`;
    })
    .getPendingRefunds();
}

// Shared renderer — used by both the initial load and the filter.
function renderRefundRows(data) {
  const tbody = document.getElementById('refundable-table-body');
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No refunds match the selected project.</td></tr>';
    return;
  }
  const fmt = n => Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  tbody.innerHTML = data.map(r => `
    <tr>
      <td class="ps-4 text-nowrap text-muted small">${r.date}</td>
      <td>${r.project}</td>
      <td class="fw-bold">${r.particular}</td>
      <td class="text-end fw-bold text-danger">₱${fmt(r.originalAmount)}</td>
      <td class="text-center">
        <input type="text"
               id="refund-input-${r.rowIndex}"
               class="form-control form-control-sm text-end"
               placeholder="e.g. ${fmt(r.originalAmount)}"
               value="${r.originalAmount.toFixed(2)}"
               style="border-radius: 8px;">
      </td>
      <td class="text-center">
        <button class="btn btn-sm btn-success fw-bold px-3"
                style="border-radius: 8px;"
                onclick="processRefund(${r.rowIndex}, '${r.project.replace(/'/g, "\\'")}', '${r.particular.replace(/'/g, "\\'")}', ${r.originalAmount})">
          Credit Back
        </button>
      </td>
    </tr>`).join('');
}

// Filters the cached data by the selected project and re-renders — no network call.
function filterRefundsByProject() {
  const selected = document.getElementById('filter-refund-project').value;
  const filtered = selected === 'all'
    ? refundableData
    : refundableData.filter(r => r.project === selected);
  renderRefundRows(filtered);
}

function processRefund(rowIndex, project, particular, originalAmount) {
  const inputEl = document.getElementById('refund-input-' + rowIndex);
  if (!inputEl) { alert("Could not locate the refund amount input. Please refresh."); return; }

  const refundAmount = parseFloat(inputEl.value.replace(/,/g, ''));
  if (isNaN(refundAmount) || refundAmount <= 0) {
    alert("Please enter a valid refund amount greater than zero.");
    inputEl.focus();
    return;
  }

  const fmtAmt = refundAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 });
  if (!confirm(`Credit back ₱${fmtAmt} for "${particular}" in project "${project}"?\n\nThis will mark the item as Refunded and post a negative Refund Credit entry to the Expense Log.`)) return;

  const btn = inputEl.closest('tr').querySelector('button');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; }

  google.script.run
    .withSuccessHandler(function() {
      alert('Refund credited successfully! The budget has been adjusted.');
      loadRefundables();
    })
    .withFailureHandler(function(err) {
      alert('Error processing refund: ' + err.message);
      if (btn) { btn.disabled = false; btn.innerText = 'Credit Back'; }
    })
    .submitRefundCredit(rowIndex, refundAmount, project, particular, userProfile.email);
}

// --- RECENT EXPENSE LOG ---
function toggleRecentExpenses() {
  const container = document.getElementById('recent-expenses-container');
  const btn       = document.getElementById('btn-show-recent-expenses');
  const tbody     = document.getElementById('recent-expenses-body');
  const isHidden  = container.style.display === 'none' || container.style.display === '';

  if (isHidden) {
    container.style.display = 'block';
    btn.innerText = 'Hide Expense Log';

    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm me-2"></div> Loading your submissions...</td></tr>';

    google.script.run
      .withSuccessHandler(function(data) {
        recentExpensesRaw = data || [];
        populateRecentExpenseTypeFilter(recentExpensesRaw);
        if (recentExpensesRaw.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No expense records found for your account.</td></tr>';
          return;
        }
        renderRecentExpensesTable(recentExpensesRaw);
      })
      .withFailureHandler(function(err) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger fw-bold">Error: ${err.message}</td></tr>`;
      })
      .getMyRecentExpenses(userProfile.email);
  } else {
    container.style.display = 'none';
    btn.innerText = 'Show recent Expense Log';
  }
}

function renderRecentExpensesTable(data) {
  const tbody = document.getElementById('recent-expenses-body');
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No expense records match this filter.</td></tr>';
    return;
  }
  const fmt = n => '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  tbody.innerHTML = data.map(r => `
    <tr>
      <td class="ps-3 text-nowrap">${r.date}</td>
      <td>${r.project}</td>
      <td><span class="badge bg-secondary" style="font-weight:500;">${r.type}</span></td>
      <td>${r.particular}</td>
      <td class="text-end fw-bold" style="color:#16a34a;">${fmt(r.totalAmount)}</td>
      <td class="text-muted small">${r.encoder}</td>
    </tr>`).join('');
}

function populateRecentExpenseTypeFilter(data) {
  const select = document.getElementById('recentExpenseTypeFilter');
  if (!select) return;
  const types = [...new Set(data.map(r => r.type).filter(Boolean))].sort();
  select.innerHTML = '<option value="All">All Types</option>' + types.map(t => `<option value="${t}">${t}</option>`).join('');
}

function filterRecentExpenses() {
  const selected = document.getElementById('recentExpenseTypeFilter').value;
  const filtered = selected === 'All' ? recentExpensesRaw : recentExpensesRaw.filter(r => r.type === selected);
  renderRecentExpensesTable(filtered);
}

// --- PETTY CASH LOGIC ---
function initPettyCash() {
  const pSelect = document.getElementById('pcProjectSelect');
  pSelect.innerHTML = '<option value="">— Loading Projects —</option>';
  
  // We can reuse your existing getProjectsListOnly() function!
  google.script.run.withSuccessHandler(projects => {
    pSelect.innerHTML = '<option value="">— Select project —</option>';
    projects.forEach(p => {
      let opt = document.createElement('option');
      opt.value = p; opt.innerHTML = p;
      pSelect.appendChild(opt);
    });
    colorizeProjectSelect(pSelect);
    whenProjectMapReady(function(){ setupProjectDropdownHighlight(pSelect); });
  }).getProjectsListOnly();
}

async function submitPettyCash() {
  const project = document.getElementById('pcProjectSelect').value;
  const expenseType = document.getElementById('pcExpenseType').value;
  const particulars = document.getElementById('pcParticulars').value.trim();
  const amount = parseFormattedNumber(document.getElementById('pcAmount').value);
  const fileInput = document.getElementById('pcReceiptFile');
  const alertBox = document.getElementById('pc-alert');
  const btn = document.getElementById('pcSubmitBtn');

  // Basic validation
  if (!project || !expenseType || !particulars || isNaN(amount) || amount <= 0 || fileInput.files.length === 0) {
    alertBox.innerText = "Please fill in all fields and attach a receipt photo.";
    alertBox.className = "alert alert-danger py-2";
    alertBox.style.display = 'block';
    return;
  }

  alertBox.style.display = 'none';
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Submitting...';

  try {
    // We reuse your excellent toBase64 utility here
    const file = fileInput.files[0];
    const base64 = await toBase64(file);
    const fileData = {
      name: file.name,
      mimeType: file.type,
      data: base64.split(',')[1] // Strip out the Data URL prefix
    };

    const payload = {
      project: project,
      expenseType: expenseType,
      particulars: particulars,
      amount: amount,
      file: fileData
    };

    google.script.run
      .withSuccessHandler(res => {
        btn.disabled = false;
        btn.innerHTML = 'Submit Record';
        alertBox.innerText = "Reimbursement request recorded successfully!";
        alertBox.className = "alert alert-success py-2";
        alertBox.style.display = 'block';
        
        // Reset the form (but keep the selected Project to speed up rapid entry)
        document.getElementById('pcExpenseType').value = '';
        document.getElementById('pcParticulars').value = '';
        document.getElementById('pcAmount').value = '';
        fileInput.value = '';
        
        setTimeout(() => alertBox.style.display = 'none', 4000);
      })
      .withFailureHandler(err => {
        btn.disabled = false;
        btn.innerHTML = 'Submit Record';
        alertBox.innerText = "Error: " + err.message;
        alertBox.className = "alert alert-danger py-2";
        alertBox.style.display = 'block';
      })
      .submitPettyCashRecord(payload, userProfile.email); // Calling backend

  } catch (error) {
    btn.disabled = false;
    btn.innerHTML = 'Submit Record';
    alertBox.innerText = "Error processing file: " + error.message;
    alertBox.className = "alert alert-danger py-2";
    alertBox.style.display = 'block';
  }
}

// --- ADMIN PETTY CASH LEDGER LOGIC ---
let globalPCLedgerData = [];
let replenishModalInstance = null;

function initPCLedger() {
  document.getElementById('pcBalanceTableBody').innerHTML = '<tr><td colspan="3" class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary"></div> Loading...</td></tr>';
  document.getElementById('pcTransactionsTableBody').innerHTML = '<tr><td colspan="7" class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary"></div> Loading...</td></tr>';

  google.script.run.withSuccessHandler(data => {
    globalPCLedgerData = data.records;

    const populateDropdown = (id, list) => {
      const select = document.getElementById(id);
      select.innerHTML = '<option value="All">All</option>' + list.map(i => `<option value="${i}">${i}</option>`).join('');
    };

    populateDropdown('ledgerFilterProject', data.projects);
    populateDropdown('ledgerFilterType', data.types);
    populateDropdown('ledgerFilterSubmitter', data.submitters);
    whenProjectMapReady(function(){ setupProjectDropdownHighlight(document.getElementById('ledgerFilterProject')); });

    // Balances are now computed dynamically on the frontend by filterPCLedger()
    filterPCLedger();
  }).getPCLedgerData();
}

function renderPCBalances(debtByProject) {
  const tbody = document.getElementById('pcBalanceTableBody');
  const projectKeys = Object.keys(debtByProject).sort();

  if (projectKeys.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-muted">No reimbursement records match the current filters.</td></tr>';
    return;
  }

  tbody.innerHTML = projectKeys.map(proj => {
    const debt = debtByProject[proj];
    const hasDebt = debt > 0;

    const badge = hasDebt
      ? `<span class="badge bg-danger ms-2" style="font-size: 0.65rem;">UNPAID DEBT</span>`
      : `<span class="badge bg-success ms-2" style="font-size: 0.65rem;">SETTLED</span>`;

    const formattedAmt = `₱${Math.abs(debt).toLocaleString(undefined, {minimumFractionDigits: 2})}`;

    const settleBtn = hasDebt
      ? `<button class="btn btn-primary btn-sm fw-bold px-3" onclick="openReplenishModal('${proj}')">Settle Debt</button>`
      : `<button class="btn btn-secondary btn-sm fw-bold px-3" disabled>Settle Debt</button>`;

    return `
      <tr>
        <td class="ps-4 align-middle">${proj}</td>
        <td class="align-middle fw-bold ${hasDebt ? 'text-danger' : 'text-success'}">${formattedAmt} ${badge}</td>
        <td class="text-end pe-4">${settleBtn}</td>
      </tr>
    `;
  }).join('');
}

function filterPCLedger() {
  const proj      = document.getElementById('ledgerFilterProject').value;
  const type      = document.getElementById('ledgerFilterType').value;
  const submitter = document.getElementById('ledgerFilterSubmitter').value;
  const from      = document.getElementById('ledgerFilterFrom').value;
  const to        = document.getElementById('ledgerFilterTo').value;

  let filtered = globalPCLedgerData;

  if (proj      !== 'All') filtered = filtered.filter(r => r.project   === proj);
  if (type      !== 'All') filtered = filtered.filter(r => r.type      === type);
  if (submitter !== 'All') filtered = filtered.filter(r => r.submitter === submitter);

  if (from) filtered = filtered.filter(r => new Date(r.rawDate) >= new Date(from));
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    filtered = filtered.filter(r => new Date(r.rawDate) <= toDate);
  }

  // ── Compute Amount Owed per project from the filtered set ──────────────────
  // Expenses / non-settlement rows ADD to the debt; Settlement / Replenishment
  // rows SUBTRACT from it (i.e. they are payouts by Accounting).
  const debtByProject = {};
  filtered.forEach(r => {
    if (!debtByProject[r.project]) debtByProject[r.project] = 0;
    const isSettlement = ['settlement', 'replenishment'].includes(r.type.toLowerCase());
    debtByProject[r.project] += isSettlement ? -r.amount : r.amount;
  });
  renderPCBalances(debtByProject);

  // ── Render transactions table ──────────────────────────────────────────────
  const tbody = document.getElementById('pcTransactionsTableBody');
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No transactions match filters.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(r => {
    const isSettlement = ['settlement', 'replenishment'].includes(r.type.toLowerCase());

    // Expenses are red "+₱" (adds to debt); Settlements are green "-₱" (reduces debt).
    const amountHtml = isSettlement
      ? `<span class="text-success fw-bold">-₱${r.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>`
      : `<span class="text-danger fw-bold">+₱${r.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>`;

    const typeLabel = isSettlement ? 'Settlement' : 'Expense';
    const fileHtml  = r.fileUrl ? `<a href="${r.fileUrl}" target="_blank" class="text-decoration-none">View Attachment</a>` : '—';

    return `
      <tr>
        <td class="ps-4 align-middle">${r.date}</td>
        <td class="align-middle">${typeLabel}</td>
        <td class="align-middle">${r.project}</td>
        <td class="align-middle">${r.submitter}</td>
        <td class="align-middle">${r.particulars}</td>
        <td class="align-middle">${amountHtml}</td>
        <td class="align-middle">${fileHtml}</td>
      </tr>
    `;
  }).join('');
}

function openReplenishModal(project) {
  document.getElementById('replenishProject').value = project;
  document.getElementById('replenishAmount').value = '';
  document.getElementById('replenishFile').value = '';
  document.getElementById('replenish-alert').style.display = 'none';
  
  if(!replenishModalInstance) {
    replenishModalInstance = new bootstrap.Modal(document.getElementById('replenishModal'));
  }
  replenishModalInstance.show();
}

async function submitReplenishment() {
  const project = document.getElementById('replenishProject').value;
  const amount = parseFormattedNumber(document.getElementById('replenishAmount').value);
  const fileInput = document.getElementById('replenishFile');
  const alertBox = document.getElementById('replenish-alert');
  const btn = document.getElementById('replenishSubmitBtn');

  if (isNaN(amount) || amount <= 0 || fileInput.files.length === 0) {
    alertBox.innerText = "Please enter a valid amount and attach a deposit slip.";
    alertBox.className = "alert alert-danger py-2";
    alertBox.style.display = 'block';
    return;
  }

  alertBox.style.display = 'none';
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Submitting...';

  try {
    const file = fileInput.files[0];
    const base64 = await toBase64(file);
    const fileData = { name: file.name, mimeType: file.type, data: base64.split(',')[1] };

    const payload = {
      project: project,
      expenseType: 'Settlement',
      particulars: 'Reimbursement Settlement',
      amount: amount,
      file: fileData
    };

    google.script.run
      .withSuccessHandler(res => {
        btn.disabled = false;
        btn.innerHTML = 'Settle Debt';
        replenishModalInstance.hide();
        initPCLedger();
      })
      .withFailureHandler(err => {
        btn.disabled = false;
        btn.innerHTML = 'Settle Debt';
        alertBox.innerText = "Error: " + err.message;
        alertBox.className = "alert alert-danger py-2";
        alertBox.style.display = 'block';
      })
      .submitPettyCashRecord(payload, userProfile.email);
  } catch (error) {
    btn.disabled = false;
    btn.innerHTML = 'Settle Debt';
    alertBox.innerText = "Error processing file: " + error.message;
    alertBox.className = "alert alert-danger py-2";
    alertBox.style.display = 'block';
  }
}

// --- BOQ ADJUSTMENT LOGIC ---
let adjustModalInstance = null;
let currentBoqItemsData = [];

function initBoqAdjust() {
  const pSelect = document.getElementById('boqAdjustProjectSelect');
  pSelect.innerHTML = '<option value="">— Loading Projects —</option>';
  
  google.script.run.withSuccessHandler(projects => {
    pSelect.innerHTML = '<option value="">— Select project —</option>';
    projects.forEach(p => {
      let opt = document.createElement('option');
      opt.value = p; opt.innerHTML = p;
      pSelect.appendChild(opt);
    });
    colorizeProjectSelect(pSelect);
    whenProjectMapReady(function(){ setupProjectDropdownHighlight(pSelect); });
  }).getProjectsListOnly();
}

function loadBoqAdjustItems() {
  const proj = document.getElementById('boqAdjustProjectSelect').value;
  const workspace = document.getElementById('boq-adjust-workspace');
  const tbody = document.getElementById('boqAdjustTableBody');
  
  if (!proj) {
    workspace.style.display = 'none';
    return;
  }
  
  workspace.style.display = 'block';
  tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary"></div> Fetching data...</td></tr>';
  
  google.script.run.withSuccessHandler(data => {
    currentBoqItemsData = data;
    if(data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No items found.</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map(item => `
      <tr>
        <td class="ps-3">
           <span class="fw-bold d-block text-truncate" style="max-width: 250px;" title="${item.item}">${item.item}</span>
           <span class="small text-muted d-block text-truncate" style="max-width: 250px;">${item.phase}</span>
        </td>
        <td>${item.unit}</td>
        <td class="text-end">₱${item.matCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
        <td class="text-end">₱${item.labCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
        <td class="text-center">
          <button class="btn btn-sm btn-outline-warning fw-bold py-0" onclick="openAdjustModal(${item.rowIdx})">Adjust</button>
        </td>
      </tr>
    `).join('');
  }).getBoqDataForAdjustment(proj);
}

function openAdjustModal(rowIdx) {
  const item = currentBoqItemsData.find(i => i.rowIdx === rowIdx);
  if(!item) return;

  document.getElementById('adjRowIndex').value = rowIdx;
  document.getElementById('adjItemName').innerText = item.item;
  document.getElementById('adjPhaseName').innerText = item.phase;
  
  const adjNewMatEl = document.getElementById('adjNewMat');
  const adjNewLabEl = document.getElementById('adjNewLab');
  adjNewMatEl.value = item.matCost;
  adjNewLabEl.value = item.labCost;
  formatThousands(adjNewMatEl);
  formatThousands(adjNewLabEl);
  
  document.getElementById('adjOldMatDisplay').innerText = `Old: ₱${item.matCost.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
  document.getElementById('adjOldLabDisplay').innerText = `Old: ₱${item.labCost.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
  
  document.getElementById('adjReason').value = '';
  document.getElementById('adjust-boq-alert').style.display = 'none';

  if(!adjustModalInstance) {
    adjustModalInstance = new bootstrap.Modal(document.getElementById('adjustBoqModal'));
  }
  adjustModalInstance.show();
}

function submitAdjustBoqItem() {
  const rowIdx = document.getElementById('adjRowIndex').value;
  const newMat = parseFormattedNumber(document.getElementById('adjNewMat').value);
  const newLab = parseFormattedNumber(document.getElementById('adjNewLab').value);
  const reason = document.getElementById('adjReason').value.trim();
  const alertBox = document.getElementById('adjust-boq-alert');
  const btn = document.getElementById('adjSubmitBtn');

  if (!reason) {
    alertBox.innerText = "Please provide a reason for this adjustment.";
    alertBox.className = "alert alert-danger py-2";
    alertBox.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

  const payload = {
      rowIdx: rowIdx,
      newMat: newMat,
      newLab: newLab,
      reason: reason
  };

  google.script.run.withSuccessHandler(res => {
      adjustModalInstance.hide();
      btn.disabled = false;
      btn.innerHTML = 'Apply Adjustment';
      alert("Adjustment applied and logged to the Out ledger successfully.");
      loadBoqAdjustItems(); // Refresh the table
  }).withFailureHandler(err => {
      btn.disabled = false;
      btn.innerHTML = 'Apply Adjustment';
      alertBox.innerText = "Error: " + err.message;
      alertBox.className = "alert alert-danger py-2";
      alertBox.style.display = 'block';
  }).adjustBoqItem(payload, userProfile.email);
}

function submitAddBoqItem() {
  const proj = document.getElementById('boqAdjustProjectSelect').value;
  const phase = document.getElementById('addBoqPhase').value.trim();
  const itemDesc = document.getElementById('addBoqDesc').value.trim();
  const unit = document.getElementById('addBoqUnit').value.trim();
  const qty = parseFloat(document.getElementById('addBoqQty').value) || 0;
  const matCost = parseFormattedNumber(document.getElementById('addBoqMat').value);
  const labCost = parseFormattedNumber(document.getElementById('addBoqLab').value);
  const reason = document.getElementById('addBoqReason').value.trim();
  
  const alertBox = document.getElementById('boq-add-alert');
  const btn = document.getElementById('addBoqBtn');

  if (!phase || !itemDesc || !unit || qty <= 0 || !reason) {
    alertBox.innerText = "Please fill in all required fields and provide a reason.";
    alertBox.className = "alert alert-danger py-2";
    alertBox.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

  const payload = {
      project: proj, phase: phase, item: itemDesc, unit: unit,
      qty: qty, matCost: matCost, labCost: labCost, reason: reason
  };

  google.script.run.withSuccessHandler(res => {
      btn.disabled = false;
      btn.innerHTML = 'Save New Item';
      
      // Clear form
      document.getElementById('addBoqDesc').value = '';
      document.getElementById('addBoqUnit').value = '';
      document.getElementById('addBoqQty').value = '';
      document.getElementById('addBoqMat').value = '';
      document.getElementById('addBoqLab').value = '';
      document.getElementById('addBoqReason').value = '';
      
      alertBox.innerText = "Item added to BOQ and Ledger successfully!";
      alertBox.className = "alert alert-success py-2";
      alertBox.style.display = 'block';
      setTimeout(() => alertBox.style.display = 'none', 4000);
      
      loadBoqAdjustItems(); // Refresh the table
  }).withFailureHandler(err => {
      btn.disabled = false;
      btn.innerHTML = 'Save New Item';
      alertBox.innerText = "Error: " + err.message;
      alertBox.className = "alert alert-danger py-2";
      alertBox.style.display = 'block';
  }).addBoqItem(payload, userProfile.email);
}

// --- RETURNABLE ITEMS LOGIC ---

function loadReturnableItems() {
  const body = document.getElementById('retTableBody');
  const pSelect = document.getElementById('retProjectSelect');
  const itemsBody = document.getElementById('retItemsBody');
  if (itemsBody && itemsBody.children.length === 0) addReturnableRow();
  
  body.innerHTML = '<tr><td colspan="6" class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div> Loading...</td></tr>';
  
  // Reuse the existing project loader function if the dropdown is empty
  if (pSelect && pSelect.options.length <= 1) {
    google.script.run.withSuccessHandler(projects => {
      pSelect.innerHTML = '<option value="">— Select project —</option>';
      projects.forEach(p => {
        let opt = document.createElement('option');
        opt.value = p; opt.innerHTML = p;
        pSelect.appendChild(opt);
      });
      colorizeProjectSelect(pSelect);
      whenProjectMapReady(function(){ setupProjectDropdownHighlight(pSelect); });
    }).getProjectsListOnly();
  }

  // Fetch the items from the new database sheet
  google.script.run.withSuccessHandler(data => {
    if (data.length === 0) {
      body.innerHTML = '<tr><td colspan="6" class="text-center py-3 text-muted">No returnable items requested yet.</td></tr>';
      return;
    }
    body.innerHTML = data.map(r => {
      let badgeClass = r.status === 'Approved' ? 'bg-success' : (r.status === 'Rejected' ? 'bg-danger' : 'bg-warning text-dark');
      return `
      <tr>
        <td class="text-nowrap">${r.date}</td>
        <td>${r.project}</td>
        <td class="fw-bold">${r.item}</td>
        <td class="text-center fw-bold">${fmtNum(r.qty)}</td>
        <td>${r.requester}</td>
        <td><span class="badge ${badgeClass}">${r.status}</span></td>
      </tr>
    `}).join('');
  }).getReturnableItemsData();
}

function addReturnableRow() {
  const tbody = document.getElementById('retItemsBody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="form-control form-control-sm ret-item-name" placeholder="e.g. Scaffolding, Excavator"></td>
    <td><input type="number" class="form-control form-control-sm ret-item-qty" placeholder="0" min="1"></td>
    <td class="text-center"><button class="btn btn-sm btn-outline-danger" onclick="this.closest('tr').remove()">✕</button></td>
  `;
  tbody.appendChild(tr);
}

function submitReturnableItems() {
  const project = document.getElementById('retProjectSelect').value;
  const btn = document.getElementById('retSubmitBtn');
  if (!project) { alert("Please select a project."); return; }

  const items = [];
  document.querySelectorAll('#retItemsBody tr').forEach(row => {
    const name = (row.querySelector('.ret-item-name').value || '').trim();
    const qty  = parseInt(row.querySelector('.ret-item-qty').value) || 0;
    if (name && qty > 0) items.push({ item: name, qty: qty });
  });
  if (items.length === 0) { alert("Please add at least one tool with a valid quantity."); return; }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Submitting...';

  google.script.run
    .withSuccessHandler(res => {
      alert("Returnable item(s) requested successfully! Now pending approval.");
      document.getElementById('retProjectSelect').value = '';
      document.getElementById('retItemsBody').innerHTML = '';
      addReturnableRow();
      btn.disabled = false;
      btn.innerHTML = 'Submit Request';
      loadReturnableItems();
    })
    .withFailureHandler(err => {
      alert("Error: " + err.message);
      btn.disabled = false;
      btn.innerHTML = 'Submit Request';
    })
    .submitReturnableRequest({ project: project, items: items }, userProfile.email);
}

function dispatchPO(poCode) {
    if (!confirm(`Are you sure you want to dispatch ${poCode} to the supplier?`)) return;
    
    event.target.disabled = true;
    event.target.innerText = "Sending...";

    google.script.run
        .withSuccessHandler(msg => {
            alert(msg);
            loadPurchaseOrders(); // Refresh table
        })
        .withFailureHandler(err => {
            alert(err.message);
            loadPurchaseOrders();
        })
        .dispatchAlphaPO(poCode, userProfile.email);
}

function voidPO(poCode) {
    const reason = prompt(`WARNING: You are about to void ${poCode} and return its items to the bidding pool.\n\nPlease enter a reason for voiding this PO:`);
    if (reason === null) return; // User cancelled
    if (reason.trim() === "") {
        alert("A void reason is required.");
        return;
    }

    event.target.disabled = true;
    event.target.innerText = "Voiding...";

    google.script.run
        .withSuccessHandler(msg => {
            alert(msg);
            loadPurchaseOrders(); // Refresh table
        })
        .withFailureHandler(err => {
            alert(err.message);
            loadPurchaseOrders();
        })
        .voidAlphaPO(poCode, reason, userProfile.email);
}

// --- COMPUTE PROJECT COST LOGIC ---

function initComputeCost() {
  const pSelect = document.getElementById('pricing-project-select');
  // Re-use your existing project fetcher to populate the dropdown
  if (pSelect.options.length <= 1) { 
    pSelect.innerHTML = '<option value="">— Loading Projects —</option>';
    google.script.run.withSuccessHandler(projects => {
      pSelect.innerHTML = '<option value="">— Select project —</option>';
      projects.forEach(p => {
        let opt = document.createElement('option');
        opt.value = p; opt.innerHTML = p;
        pSelect.appendChild(opt);
      });
      colorizeProjectSelect(pSelect);
      whenProjectMapReady(function(){ setupProjectDropdownHighlight(pSelect); });
    }).getProjectsListOnly();
  }
}

function loadPricingData() {
  const project = document.getElementById('pricing-project-select').value;
  const tbody = document.getElementById('pricing-table-body');
  const saveBtn = document.getElementById('save-pricing-btn');
  
  if (!project) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted">Select a project to load data.</td></tr>';
    document.getElementById('pricing-grand-total').textContent = '₱0.00';
    saveBtn.style.display = 'none';
    return;
  }

  tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-primary"></div> Fetching data...</td></tr>';
  saveBtn.style.display = 'none';
  
  google.script.run.withSuccessHandler(renderPricingTable).getProjectPricingData(project);
}

// Render the hierarchical table with Memory State
function renderPricingTable(groupedData) {
  const tbody = document.getElementById('pricing-table-body');
  tbody.innerHTML = '';
  
  if (!groupedData || Object.keys(groupedData).length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No categories found.</td></tr>';
    return;
  }

  const formatMoney = amt => '₱' + Number(amt).toLocaleString(undefined, {minimumFractionDigits: 2});

  // Render helper — shared by both the priority pass and the remainder loop
  function renderRow(type, data) {
    const safeGroupId = type.replace(/[^a-zA-Z0-9]/g, '_');

    if (data.isLumpSum) {
      if (data.isInformational) {
        // Informational breakdown — display-only, not counted in grand total, not saved
        tbody.innerHTML += `
          <tr class="informational-row" data-type="${type}" data-item="N/A" data-exclude="true">
            <td class="ps-5 text-muted fst-italic"><i class="text-muted small me-1">↳</i> ${type}</td>
            <td class="text-end text-muted">${formatMoney(data.amount)}</td>
            <td class="text-center text-muted small">—</td>
            <td class="text-center text-muted small">—</td>
            <td class="text-end pe-3 text-muted">${formatMoney(data.amount)}</td>
          </tr>
        `;
      } else {
        // LUMP SUMS - Inject savedPct and savedOverride
        tbody.innerHTML += `
          <tr class="lump-sum-row" data-type="${type}" data-item="N/A">
            <td class="ps-3 fw-bold text-dark text-uppercase">${type}</td>
            <td class="text-end base-amount" data-val="${data.amount}">${formatMoney(data.amount)}</td>
            <td class="text-center">
              <input type="number" class="form-control form-control-sm override-input text-center" placeholder="Override" value="${data.savedOverride}" oninput="calculatePricingTotal()">
            </td>
            <td class="text-center">
              <input type="number" class="form-control form-control-sm markup-input text-center" value="${data.savedPct}" min="0" step="0.1" oninput="calculatePricingTotal()">
            </td>
            <td class="text-end pe-3 fw-bold text-primary final-cost">${formatMoney(data.amount)}</td>
          </tr>
        `;
      }
      return;
    }

    // EXPENSE HEADER + LINE ITEMS (non-lump-sum categories)
    tbody.innerHTML += `
      <tr class="header-row bg-light" data-group="${safeGroupId}">
        <td class="ps-3 fw-bold text-secondary text-uppercase">${type}</td>
        <td class="text-end fw-bold text-secondary group-base-total">${formatMoney(data.amount)}</td>
        <td class="text-center text-muted small">—</td>
        <td class="text-center">
          <input type="number" class="form-control form-control-sm text-center" placeholder="% All" min="0" step="0.1" oninput="applyGroupMarkup('${safeGroupId}', this.value)">
        </td>
        <td class="text-end pe-3 fw-bold text-success group-final-total">₱0.00</td>
      </tr>
    `;

    // LINE ITEMS - isReadOnly rows (e.g. CGT) get disabled, locked-look inputs
    data.lineItems.forEach(li => {
      const locked      = li.isReadOnly === true;
      const lockedAttr  = locked ? ' disabled' : '';
      const lockedStyle = locked ? ' style="background:#f8fafc; color:#94a3b8; cursor:not-allowed;"' : '';
      tbody.innerHTML += `
        <tr class="line-item-row group-child-${safeGroupId}" data-type="${type}" data-item="${li.name}">
          <td class="ps-5 text-dark"><i class="text-muted small me-1">↳</i> ${li.name}</td>
          <td class="text-end base-amount" data-val="${li.amount}">${formatMoney(li.amount)}</td>
          <td class="text-center">
            <input type="number" class="form-control form-control-sm override-input text-center"
                   placeholder="${locked ? '—' : 'Override'}" value="${li.savedOverride}"${lockedAttr}${lockedStyle} oninput="calculatePricingTotal()">
          </td>
          <td class="text-center">
            <input type="number" class="form-control form-control-sm markup-input text-center"
                   value="${li.savedPct}" min="0" step="0.1"${lockedAttr}${lockedStyle} oninput="calculatePricingTotal()">
          </td>
          <td class="text-end pe-3 fw-bold text-primary final-cost">${formatMoney(li.amount)}</td>
        </tr>
      `;
    });
  }

  // Pass 1 — render the three cost-summary rows at the top in the required order
  const topKeys = ["Construction Materials", "Payroll", "Materials + Payroll"];
  topKeys.forEach(key => {
    if (groupedData[key]) {
      renderRow(key, groupedData[key]);
      delete groupedData[key];
    }
  });

  // Pass 2 — render all remaining categories
  for (const [type, data] of Object.entries(groupedData)) {
    renderRow(type, data);
  }


  document.getElementById('save-pricing-btn').style.display = 'block';
  calculatePricingTotal(); // Trigger math immediately to apply loaded states!
}

// Updated Save Function to capture both % and Override


// Function to Cascade Markup % from Header to Child Line Items
function applyGroupMarkup(groupId, value) {
  const children = document.querySelectorAll(`.group-child-${groupId} .markup-input`);
  children.forEach(input => {
    input.value = value;
  });
  calculatePricingTotal(); // Re-trigger math
}

// Dynamic Math Calculator
function calculatePricingTotal() {
  let grandTotal = 0;
  const formatMoney = amt => '₱' + Number(amt).toLocaleString(undefined, {minimumFractionDigits: 2});

  // Step 1: Calculate every editable row independently (disabled inputs return their
  // stored value normally, so the CGT row still processes — it just gets overwritten
  // in Step 2 with the correctly derived 6% figure).
  const itemRows = document.querySelectorAll('.lump-sum-row, .line-item-row');
  itemRows.forEach(row => {
    const baseAmount  = Number(row.querySelector('.base-amount').getAttribute('data-val')) || 0;
    const overrideVal = row.querySelector('.override-input').value;
    const markupVal   = row.querySelector('.markup-input').value;

    const effectiveCost = (overrideVal !== "") ? Number(overrideVal) : baseAmount;
    const percentage    = Number(markupVal) || 0;
    const finalCost     = effectiveCost + (effectiveCost * (percentage / 100));

    row.querySelector('.final-cost').textContent = formatMoney(finalCost);
    row.setAttribute('data-final', finalCost);
  });

  // Step 2: Re-derive CGT from the LOT COST row's just-calculated final cost.
  // This runs BEFORE the grand-total sum so the corrected CGT value feeds into
  // both the group roll-up and the overall total.
  const lotRow = Array.from(itemRows).find(
    row => (row.getAttribute('data-item') || '').toUpperCase() === 'LOT COST'
  );
  const cgtRow = Array.from(itemRows).find(
    row => (row.getAttribute('data-item') || '').toUpperCase().startsWith('CAPITAL GAINS TAX')
  );

  if (lotRow && cgtRow) {
    const lotFinal  = Number(lotRow.getAttribute('data-final')) || 0;
    const cgtAmount = lotFinal * 0.06;

    // Patch the CGT row's base-amount, final-cost display, and data-final
    cgtRow.querySelector('.base-amount').setAttribute('data-val', cgtAmount);
    cgtRow.querySelector('.final-cost').textContent = formatMoney(cgtAmount);
    cgtRow.setAttribute('data-final', cgtAmount);
  }

  // Step 3: Sum all data-final values into the grand total
  itemRows.forEach(row => {
    grandTotal += Number(row.getAttribute('data-final')) || 0;
  });

  // Step 4: Roll up group children into their expense-category headers
  document.querySelectorAll('.header-row').forEach(header => {
    const groupId = header.getAttribute('data-group');
    let groupFinal = 0;
    document.querySelectorAll(`.group-child-${groupId}`).forEach(child => {
      groupFinal += Number(child.getAttribute('data-final')) || 0;
    });
    header.querySelector('.group-final-total').textContent = formatMoney(groupFinal);
  });

  document.getElementById('pricing-grand-total').textContent = formatMoney(grandTotal);
}
// Keep this version! (Around line 2149)
function savePricing() {
    const project = document.getElementById('pricing-project-select').value;
    if (!project) return alert("Please select a project.");

    const btn = document.getElementById('save-pricing-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

    const rows = document.querySelectorAll('.lump-sum-row, .line-item-row');
    const payload = {
        project: project,
        items: []
    };

    rows.forEach(row => {
        const type = row.getAttribute('data-type');
        const item = row.getAttribute('data-item') || "N/A"; // Lump sums don't have an item
        const percentage = row.querySelector('.markup-input').value;
        const override = row.querySelector('.override-input').value;

        // We save the row if they inputted a %, an override, OR if we need to log it to 'reset' a previous state
        if (percentage !== "" || override !== "") {
            payload.items.push({
                type: type,
                lineItem: item,
                percentage: Number(percentage) || 0,
                override: override // Will be blank string if empty, or the number they typed
            });
        }
    });

    if(payload.items.length === 0) {
        alert("Please enter at least one markup percentage or override before saving.");
        btn.disabled = false;
        btn.innerHTML = "Save Simulation";
        return;
    }

    google.script.run
        .withSuccessHandler(function(msg) {
            alert(msg);
            btn.disabled = false;
            btn.innerHTML = "Save Simulation";
        })
        .withFailureHandler(function(err) {
            alert("Error: " + err.message);
            btn.disabled = false;
            btn.innerHTML = "Save Simulation";
        })
        .savePricingSimulation(payload, userProfile.email);
}


// --- SUPPLIER DATABASE LOGIC ---
// Edit/delete reuse the same getManagedRows/updateManagedRow/deleteManagedRow
// endpoints the "Manage Data" screen uses for other reference data (see
// csv_import.js) -- this table is the id-bearing source (getSuppliersList,
// used elsewhere for the bidding supplier picker, doesn't carry row ids).
let supplierRows = [];
const SUPPLIER_FIELD_KEYS = ["company_name", "contact_person", "email", "phone", "tin", "category", "address", "bank_details"];

// "View History" button lives in the Directory card-header, which the view
// already renders with d-flex/justify-content-between for exactly this kind
// of second element -- inject it once rather than editing the .erb further.
(function addSupplierHistoryButton() {
    const header = document.querySelector('#section-supplier-data .card-header.d-flex');
    if (!header || document.getElementById('supplierHistoryBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'supplierHistoryBtn';
    btn.type = 'button';
    btn.className = 'btn btn-sm btn-outline-secondary fw-bold';
    btn.textContent = 'View History';
    btn.addEventListener('click', () => window.showManagedDataHistory('suppliers', 'Suppliers'));
    header.appendChild(btn);
})();

function loadSuppliers() {
    const thead = document.querySelector('#section-supplier-data thead');
    const tbody = document.getElementById('supplierTableBody');
    if (thead) {
        thead.innerHTML = `<tr>
            <th class="ps-4">Company Name</th>
            <th>Contact Details</th>
            <th>Category</th>
            <th>TIN</th>
            <th class="text-end pe-4">Actions</th>
        </tr>`;
    }
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm"></div> Fetching suppliers...</td></tr>';

    google.script.run.withSuccessHandler(res => {
        supplierRows = res.rows;
        if (supplierRows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No suppliers found. Add one on the left.</td></tr>';
            return;
        }
        tbody.innerHTML = supplierRows.map(sup => `
            <tr>
                <td class="ps-4 fw-bold text-dark">${sup.company_name || ''}</td>
                <td>
                   <div class="d-flex flex-column">
                      <span>👤 ${sup.contact_person || ''}</span>
                      <a href="mailto:${sup.email || ''}" class="text-primary text-decoration-none hover:underline">✉️ ${sup.email || ''}</a>
                      <span class="text-muted small">📞 ${sup.phone || 'N/A'}</span>
                   </div>
                </td>
                <td><span class="badge bg-secondary">${sup.category || 'General'}</span></td>
                <td class="text-muted">${sup.tin || 'N/A'}</td>
                <td class="text-end text-nowrap pe-4">
                    <button class="btn btn-sm btn-outline-secondary me-1" onclick="supplierEdit(${sup.id})">Edit</button>
                    <button class="btn btn-sm btn-outline-danger" onclick="supplierDelete(${sup.id})">Delete</button>
                </td>
            </tr>
        `).join('');
    }).getManagedRows('suppliers');
}

function ensureSupplierEditModal() {
    if (document.getElementById('supplierEditModal')) return;
    const modal = document.createElement('div');
    modal.innerHTML = `<div class="modal fade" id="supplierEditModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow">
          <div class="modal-header"><h5 class="modal-title fw-bold">Edit Supplier</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
          <div class="modal-body">
            <div id="supplierEdit-alert" class="alert alert-danger py-2" style="display:none; font-size:0.85rem;"></div>
            <input type="hidden" id="supplierEditId">
            <div class="mb-2 text-start"><label class="form-label small fw-bold text-muted">Company Name</label>
              <input id="supplierEdit_company_name" class="form-control form-control-sm"></div>
            <div class="mb-2 text-start"><label class="form-label small fw-bold text-muted">Contact Person</label>
              <input id="supplierEdit_contact_person" class="form-control form-control-sm"></div>
            <div class="mb-2 text-start"><label class="form-label small fw-bold text-muted">Email</label>
              <input id="supplierEdit_email" class="form-control form-control-sm"></div>
            <div class="mb-2 text-start"><label class="form-label small fw-bold text-muted">Phone</label>
              <input id="supplierEdit_phone" class="form-control form-control-sm"></div>
            <div class="mb-2 text-start"><label class="form-label small fw-bold text-muted">TIN</label>
              <input id="supplierEdit_tin" class="form-control form-control-sm"></div>
            <div class="mb-2 text-start"><label class="form-label small fw-bold text-muted">Category</label>
              <input id="supplierEdit_category" class="form-control form-control-sm"></div>
            <div class="mb-2 text-start"><label class="form-label small fw-bold text-muted">Address</label>
              <input id="supplierEdit_address" class="form-control form-control-sm"></div>
            <div class="mb-2 text-start"><label class="form-label small fw-bold text-muted">Bank Details</label>
              <textarea id="supplierEdit_bank_details" class="form-control form-control-sm" rows="2"></textarea></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-primary fw-bold" id="supplierEditSaveBtn">Save Changes</button>
          </div>
        </div></div></div>`;
    document.body.appendChild(modal);
    document.getElementById('supplierEditSaveBtn').addEventListener('click', saveSupplierEdit);
}

function supplierEdit(id) {
    const row = supplierRows.find(r => r.id === id);
    if (!row) return;
    ensureSupplierEditModal();
    document.getElementById('supplierEditId').value = id;
    document.getElementById('supplierEdit-alert').style.display = 'none';
    SUPPLIER_FIELD_KEYS.forEach(k => {
        document.getElementById('supplierEdit_' + k).value = row[k] == null ? '' : row[k];
    });
    new bootstrap.Modal(document.getElementById('supplierEditModal')).show();
}

function saveSupplierEdit() {
    const id = document.getElementById('supplierEditId').value;
    const data = {};
    SUPPLIER_FIELD_KEYS.forEach(k => { data[k] = document.getElementById('supplierEdit_' + k).value; });
    const btn = document.getElementById('supplierEditSaveBtn');
    btn.disabled = true;
    google.script.run.withSuccessHandler(() => {
        btn.disabled = false;
        bootstrap.Modal.getInstance(document.getElementById('supplierEditModal')).hide();
        loadSuppliers();
    }).withFailureHandler(err => {
        btn.disabled = false;
        const box = document.getElementById('supplierEdit-alert');
        box.textContent = 'Error: ' + err.message;
        box.style.display = 'block';
    }).updateManagedRow('suppliers', id, data);
}

function supplierDelete(id) {
    if (!confirm("Delete this supplier permanently? This can't be undone.")) return;
    google.script.run.withSuccessHandler(() => { loadSuppliers(); })
        .withFailureHandler(err => { alert('Error: ' + err.message); })
        .deleteManagedRow('suppliers', id);
}

function submitSupplier() {
    const name = document.getElementById('supName').value.trim();
    const contact = document.getElementById('supContact').value.trim();
    const email = document.getElementById('supEmail').value.trim();
    const alertBox = document.getElementById('supplier-alert');
    const btn = document.getElementById('supSubmitBtn');

    if (!name || !contact || !email) {
        alertBox.innerText = "Company Name, Contact Person, and Email are required.";
        alertBox.className = "alert alert-danger py-2";
        alertBox.style.display = 'block';
        return;
    }

    const payload = {
        name: name, contact: contact, email: email,
        phone: document.getElementById('supPhone').value.trim(),
        tin: document.getElementById('supTin').value.trim(),
        category: document.getElementById('supCategory').value.trim(),
        address: document.getElementById('supAddress').value.trim(),
        bank: document.getElementById('supBank').value.trim()
    };

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
    alertBox.style.display = 'none';

    google.script.run.withSuccessHandler(() => {
        alertBox.innerText = "Supplier added successfully!";
        alertBox.className = "alert alert-success py-2";
        alertBox.style.display = 'block';

        // Clear Form
        document.querySelectorAll('#section-supplier-data input, #section-supplier-data textarea').forEach(el => el.value = '');

        btn.disabled = false;
        btn.innerHTML = 'Save Supplier';
        setTimeout(() => alertBox.style.display = 'none', 3000);
        loadSuppliers(); // Refresh table
    }).saveSupplierData(payload, userProfile.email);
}

// =============================================================
// ISSUE PAYMENTS LOGIC
// =============================================================
let issuePaymentPoData = [];

function initIssuePayments() {
  const projectFilter  = document.getElementById('ipProjectFilter');
  const supplierFilter = document.getElementById('ipSupplierFilter');
  const checklist      = document.getElementById('ipPoChecklist');
  const container      = document.getElementById('ip-terms-container');

  projectFilter.innerHTML  = '<option value="">— All Projects —</option>';
  supplierFilter.innerHTML = '<option value="">— Select a project first —</option>';
  checklist.innerHTML      = '<span class="text-muted small">Select a supplier first...</span>';
  container.style.display  = 'none';

  google.script.run
    .withSuccessHandler(data => {
      issuePaymentPoData = data || [];
      const projects = [...new Set(data.map(p => p.project).filter(Boolean))].sort();
      projectFilter.innerHTML = '<option value="">— All Projects —</option>' +
        projects.map(p => `<option value="${p}">${p}</option>`).join('');
      colorizeProjectSelect(projectFilter);
      whenProjectMapReady(function(){ setupProjectDropdownHighlight(projectFilter); });
    })
    .withFailureHandler(err => {
      checklist.innerHTML = `<span class="text-danger small">Error loading POs: ${err.message}</span>`;
    })
    .getPoListForPayments();
}

function renderIpSupplierDropdown() {
  const project        = document.getElementById('ipProjectFilter').value;
  const supplierFilter = document.getElementById('ipSupplierFilter');
  const checklist      = document.getElementById('ipPoChecklist');

  supplierFilter.innerHTML = '<option value="">— Select a project first —</option>';
  checklist.innerHTML      = '<span class="text-muted small">Select a supplier first...</span>';
  document.getElementById('ip-terms-container').style.display = 'none';
  document.getElementById('ip-alert').style.display = 'none';

  if (!project) return;

  const suppliers = [...new Set(
    issuePaymentPoData
      .filter(p => p.project === project)
      .map(p => p.supplier)
      .filter(Boolean)
  )].sort();

  supplierFilter.innerHTML = '<option value="">— Select Supplier —</option>' +
    suppliers.map(s => `<option value="${s}">${s}</option>`).join('');
}

function renderIpPoChecklist() {
  const project   = document.getElementById('ipProjectFilter').value;
  const supplier  = document.getElementById('ipSupplierFilter').value;
  const checklist = document.getElementById('ipPoChecklist');

  checklist.innerHTML = '<span class="text-muted small">Select a supplier first...</span>';
  document.getElementById('ip-terms-container').style.display = 'none';
  document.getElementById('ip-alert').style.display = 'none';

  if (!supplier) return;

  const filtered = issuePaymentPoData.filter(p =>
    (!project  || p.project  === project) &&
    p.supplier === supplier
  );

  if (filtered.length === 0) {
    checklist.innerHTML = '<span class="text-muted small">No POs found for this supplier.</span>';
    return;
  }

  checklist.innerHTML = filtered.map(p => {
    const safeId = p.poCode.replace(/[^a-zA-Z0-9]/g, '_');
    return `
      <div class="form-check py-1">
        <input class="form-check-input ip-po-checkbox" type="checkbox" value="${p.poCode}" id="ippo-${safeId}">
        <label class="form-check-label" for="ippo-${safeId}">
          <strong>${p.poCode}</strong> &mdash; ${p.supplier} (${p.project})
        </label>
      </div>`;
  }).join('');
}

function loadIssuePaymentDetails() {
  const selectedPoCodes = Array.from(
    document.querySelectorAll('.ip-po-checkbox:checked')
  ).map(cb => cb.value);

  const container = document.getElementById('ip-terms-container');
  const tbody     = document.getElementById('ip-terms-body');
  const saveBtn   = document.getElementById('ip-save-btn');

  if (selectedPoCodes.length === 0) {
    showToast('Please select at least one Purchase Order.', 'warning');
    return;
  }

  container.style.display = 'block';
  saveBtn.style.display = 'none';
  tbody.innerHTML = `
    <tr>
      <td colspan="8" class="text-center py-4 text-muted">
        <div class="spinner-border spinner-border-sm text-primary"></div> Loading payment terms...
      </td>
    </tr>`;

  google.script.run
    .withSuccessHandler(data => { renderPaymentTermsTable(data); })
    .withFailureHandler(err => {
      tbody.innerHTML = `<tr><td colspan="8" class="text-danger text-center fw-bold py-4">Error: ${err.message}</td></tr>`;
    })
    .getIssuePaymentDetails(selectedPoCodes);
}

function renderPaymentTermsTable(data) {
  // data is a flat array — each element is one payment term with poCode/supplier/mrfId/poTotal embedded
  const tbody   = document.getElementById('ip-terms-body');
  const infoEl  = document.getElementById('ip-po-info');
  const saveBtn = document.getElementById('ip-save-btn');

  if (!data || data.length === 0) {
    infoEl.innerHTML = '';
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-muted py-5">
          <div style="font-size:2rem;">&#128196;</div>
          No payment terms found for the selected POs.<br>
          <small>Please ensure payment terms were encoded in the <strong>Encode Quotes</strong> module.</small>
        </td>
      </tr>`;
    saveBtn.style.display = 'none';
    return;
  }

  // Summarise loaded POs in the info bar
  const uniquePos    = [...new Set(data.map(t => t.poCode))];
  const supplierName = data[0].supplier || '—';
  infoEl.innerHTML =
    uniquePos.map(pc => `<span class="badge bg-dark px-2 py-1" style="font-size:0.8rem;">${pc}</span>`).join(' ') +
    ` <span class="fw-bold text-dark">${supplierName}</span>` +
    ` <span class="text-muted small ms-2">| ${uniquePos.length} PO(s) loaded</span>`;

  let hasUnpaid = false;

  tbody.innerHTML = data.map((term, idx) => {
    // term.percentage is a decimal (0–1); term.poTotal is the total for this PO
    const invoicedAmt  = Number(term.poTotal) * Number(term.percentage);
    const displayPct   = Math.round(Number(term.percentage) * 100);
    const fmtInvoiced  = `&#8369;${invoicedAmt.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    const safePoCode   = (term.poCode   || '').replace(/"/g, '&quot;');
    const safeMrfId    = (term.mrfId    || '').replace(/"/g, '&quot;');
    const safeSupplier = (term.supplier || '').replace(/"/g, '&quot;');

    if (term.isPaid) {
      return `
        <tr class="table-success">
          <td class="ps-3"><span class="badge bg-secondary" style="font-size:0.7rem;">${term.poCode}</span></td>
          <td class="fw-bold">${term.description}</td>
          <td class="text-center fw-bold">${displayPct}%</td>
          <td class="text-end fw-bold text-success">${fmtInvoiced}</td>
          <td colspan="4" class="text-center">
            <span class="badge bg-success px-3 py-2" style="font-size:0.78rem; border-radius:8px;">
              &#10003; PAID &mdash; ${term.paymentDate} &nbsp;|&nbsp; ${term.bank} &nbsp;|&nbsp; Check # ${term.checkNumber}
            </span>
          </td>
        </tr>`;
    }

    hasUnpaid = true;
    return `
      <tr data-term-idx="${idx}"
          data-term-desc="${term.description.replace(/"/g, '&quot;')}"
          data-pct="${displayPct}"
          data-invoiced="${invoicedAmt.toFixed(2)}"
          data-po-code="${safePoCode}"
          data-mrf-id="${safeMrfId}"
          data-supplier="${safeSupplier}">
        <td class="ps-3"><span class="badge bg-dark" style="font-size:0.7rem;">${term.poCode}</span></td>
        <td class="fw-bold">${term.description}</td>
        <td class="text-center">${displayPct}%</td>
        <td class="text-end fw-bold text-primary">${fmtInvoiced}</td>
        <td>
          <input type="date" class="form-control form-control-sm ip-due-date" value="${term.dueDate || ''}">
        </td>
        <td>
          <input type="text" class="form-control form-control-sm ip-bank" placeholder="e.g. BDO">
        </td>
        <td>
          <input type="text" class="form-control form-control-sm ip-check-num" placeholder="Check #">
        </td>
        <td>
          <input type="text" inputmode="decimal" class="form-control form-control-sm ip-pay-amt text-end"
                 placeholder="0.00" value="${invoicedAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}"
                 oninput="formatThousands(this)">
        </td>
      </tr>`;
  }).join('');

  saveBtn.style.display = hasUnpaid ? 'inline-block' : 'none';
}

function applyBulkPaymentDetails() {
  const date  = document.getElementById('ip-bulk-date').value;
  const bank  = document.getElementById('ip-bulk-bank').value.trim();
  const check = document.getElementById('ip-bulk-check').value.trim();

  document.querySelectorAll('#ip-terms-body tr[data-term-idx]').forEach(row => {
    if (date)  row.querySelector('.ip-due-date').value  = date;
    if (bank)  row.querySelector('.ip-bank').value      = bank;
    if (check) row.querySelector('.ip-check-num').value = check;
  });
}

function saveIssuePayments() {
  const btn      = document.getElementById('ip-save-btn');
  const alertBox = document.getElementById('ip-alert');

  const unpaidRows  = document.querySelectorAll('#ip-terms-body tr[data-term-idx]');
  const submissions = [];

  unpaidRows.forEach(row => {
    const dueDate  = row.querySelector('.ip-due-date').value;
    const bank     = row.querySelector('.ip-bank').value.trim();
    const checkNum = row.querySelector('.ip-check-num').value.trim();
    const payAmt   = parseFormattedNumber(row.querySelector('.ip-pay-amt').value);

    if (dueDate && bank && checkNum && !isNaN(payAmt) && payAmt > 0) {
      submissions.push({
        poCode:        row.dataset.poCode,
        mrfId:         row.dataset.mrfId,
        supplier:      row.dataset.supplier,
        termDesc:      row.dataset.termDesc,
        percentage:    row.dataset.pct,
        invoicedAmt:   row.dataset.invoiced,
        paymentDate:   dueDate,
        bank:          bank,
        checkNumber:   checkNum,
        paymentAmount: payAmt
      });
    }
  });

  if (submissions.length === 0) {
    alertBox.innerText = 'Please fill in all four fields (Date, Bank, Check #, Amount) for at least one unpaid term.';
    alertBox.className = 'alert alert-danger py-2';
    alertBox.style.display = 'block';
    return;
  }

  alertBox.style.display = 'none';
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

  google.script.run
    .withSuccessHandler(() => {
      alertBox.innerText = `Successfully recorded ${submissions.length} payment(s)!`;
      alertBox.className = 'alert alert-success py-2';
      alertBox.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = 'Save Payments';
      loadIssuePaymentDetails();
      setTimeout(() => alertBox.style.display = 'none', 5000);
    })
    .withFailureHandler(err => {
      alertBox.innerText = 'Error: ' + err.message;
      alertBox.className = 'alert alert-danger py-2';
      alertBox.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = 'Save Payments';
    })
    .saveIssuePayments({ payments: submissions }, userProfile.email);
}

// ===== HISTORICAL PRICING =====

// Fetches the unique item list once per session and caches it for autocomplete.
// Subsequent section opens are instant (guard on array length).
function initHistoricalPricing() {
  if (cachedHistoricalItems.length > 0) return;
  google.script.run
    .withSuccessHandler(function(items) {
      cachedHistoricalItems = items || [];
    })
    .withFailureHandler(function(err) {
      console.error('initHistoricalPricing: failed to load autocomplete items — ' + err.message);
    })
    .getUniqueHistoricalItems();
}

// Fired on every keystroke in the HP search box.
// Filters the cache for partial matches (case-insensitive) and renders up to 10 suggestions.
function onHpSearchInput(val) {
  const ul    = document.getElementById('hp-search-suggestions');
  const query = val.trim();

  if (!query || cachedHistoricalItems.length === 0) {
    ul.style.display = 'none';
    return;
  }

  const queryLower = query.toLowerCase();
  const matches = cachedHistoricalItems
    .filter(item => item.toLowerCase().includes(queryLower))
    .slice(0, 10);

  if (matches.length === 0) {
    ul.style.display = 'none';
    return;
  }

  ul.innerHTML = matches.map(item => {
    const safe = item.replace(/'/g, "\\'");
    return `<li>
      <a class="dropdown-item" href="javascript:void(0)"
         style="font-size: 0.875rem; padding: 0.45rem 1rem; white-space: normal;"
         onclick="selectHpSuggestion('${safe}')">
        ${highlightHpMatch(item, query)}
      </a>
    </li>`;
  }).join('');

  ul.style.display = 'block';
}

// Populates the search input with the chosen suggestion, hides the dropdown,
// and fires the actual search immediately.
function selectHpSuggestion(value) {
  document.getElementById('hp-search-input').value = value;
  document.getElementById('hp-search-suggestions').style.display = 'none';
  searchHistoricalPrices();
}

// Wraps the matching portion of text in a styled <strong> tag for visual highlighting.
// Reuses the existing escapeHtml() — safe against XSS even for item names with special chars.
function highlightHpMatch(text, query) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return escapeHtml(text);
  return escapeHtml(text.substring(0, idx))
    + '<strong class="text-primary">' + escapeHtml(text.substring(idx, idx + query.length)) + '</strong>'
    + escapeHtml(text.substring(idx + query.length));
}

function searchHistoricalPrices() {
  const query = (document.getElementById('hp-search-input').value || '').trim();
  const tableBody = document.getElementById('hp-table-body');
  const alertBox = document.getElementById('hp-alert');
  const btn = document.getElementById('hp-search-btn');
  const countBadge = document.getElementById('hp-result-count');

  alertBox.style.display = 'none';

  if (!query) {
    alertBox.innerText = 'Please enter an item name to search.';
    alertBox.className = 'alert alert-warning py-2';
    alertBox.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Searching...';
  countBadge.style.display = 'none';

  tableBody.innerHTML = `
    <tr>
      <td colspan="6" class="text-center py-4 text-muted">
        <span class="spinner-border spinner-border-sm me-2"></span> Searching purchase orders...
      </td>
    </tr>`;

  google.script.run
    .withSuccessHandler(function(results) {
      btn.disabled = false;
      btn.innerHTML = 'Search';

      if (!results || results.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="6" class="text-center py-5 text-muted">
              <div style="font-size:2rem; margin-bottom:0.5rem;">🔎</div>
              No results found for <strong>${escapeHtml(query)}</strong>.
            </td>
          </tr>`;
        countBadge.innerText = '0 results';
        countBadge.className = 'badge bg-secondary';
        countBadge.style.display = 'inline-block';
        return;
      }

      countBadge.innerText = results.length + ' result' + (results.length !== 1 ? 's' : '');
      countBadge.className = 'badge bg-primary';
      countBadge.style.display = 'inline-block';

      const rows = results.map(r => `
        <tr>
          <td class="ps-4 text-nowrap">${escapeHtml(r.date)}</td>
          <td>${escapeHtml(r.project)}</td>
          <td><span class="badge bg-light text-dark border fw-normal">${escapeHtml(r.poNumber)}</span></td>
          <td>${escapeHtml(r.supplier)}</td>
          <td>${escapeHtml(r.item)}</td>
          <td class="text-end pe-4 fw-bold text-success">
            ₱${Number(r.unitPrice).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </td>
        </tr>`).join('');

      tableBody.innerHTML = rows;
    })
    .withFailureHandler(function(err) {
      btn.disabled = false;
      btn.innerHTML = 'Search';
      tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger">Error: ${escapeHtml(err.message)}</td></tr>`;
    })
    .getHistoricalPrices(query);
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Close the HP suggestions dropdown when the user clicks anywhere outside the search area.
document.addEventListener('click', function(e) {
  const input = document.getElementById('hp-search-input');
  const ul    = document.getElementById('hp-search-suggestions');
  if (!input || !ul) return;
  if (!input.contains(e.target) && !ul.contains(e.target)) {
    ul.style.display = 'none';
  }
});

// Also close the dropdown when Enter is pressed (the existing onkeydown fires the search,
// this listener dismisses the suggestion list at the same moment).
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && document.activeElement === document.getElementById('hp-search-input')) {
    const ul = document.getElementById('hp-search-suggestions');
    if (ul) ul.style.display = 'none';
  }
});

// =============================================================
// GLOBAL TOAST UTILITY
// =============================================================

/**
 * Shows a floating toast using the existing .toast-notification CSS class.
 * type: 'success' | 'danger' | 'warning' | 'info'
 */
function showToast(message, type) {
  type = type || 'info';
  const colorMap = {
    success: '#166534',
    danger:  '#991b1b',
    warning: '#92400e',
    info:    '#1e3a5f'
  };
  const bgMap = {
    success: '#dcfce7',
    danger:  '#fee2e2',
    warning: '#fef3c7',
    info:    '#e0f2fe'
  };

  let toast = document.getElementById('_global-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = '_global-toast';
    toast.className = 'toast-notification';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.cssText = [
    'display:block',
    'position:fixed',
    'top:unset',       /* cancel the stylesheet top:24px that was stretching the element */
    'bottom:24px',
    'right:24px',
    'left:unset',
    'z-index:99999',
    'padding:14px 22px',
    'border-radius:12px',
    'font-size:0.85rem',
    'font-weight:600',
    'width:auto',
    'min-width:260px',
    'max-width:360px',
    'box-shadow:0 8px 32px rgba(0,0,0,0.15)',
    `background:${bgMap[type] || bgMap.info}`,
    `color:${colorMap[type] || colorMap.info}`
  ].join(';');

  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

// =============================================================
// BUILD BOQ MODULE  —  Native BOQ Generator
// =============================================================

let _boqPhaseCount  = 0;
let _boqScopeCount  = 0;
let _boqItemCount   = 0;
let _boqDataLoaded  = false;
let _boqFetchSeq    = 0;
window.phaseScopeMap = {};   // { phaseName: [scope1, scope2, …] }
window.materialsMap  = {};   // { itemNameLower: { name, unit, quotedCost } }

// ── AUTOCOMPLETE ENGINE ──────────────────────────────────────
// One reusable <ul> appended to <body> with position:fixed.
// Fixed positioning bypasses every overflow:hidden or z-index
// stacking issue inside the card hierarchy.
// All input events are handled via delegation on document so
// the engine works with elements added to the DOM at any time.
// ─────────────────────────────────────────────────────────────
(function () {
  // ── Singleton dropdown panel ─────────────────────────────
  const dd = document.createElement('ul');
  dd.id = 'boq-ac-dd';
  dd.style.cssText =
    'position:fixed;z-index:9999;background:#fff;' +
    'border:1px solid #e2e8f0;border-radius:10px;' +
    'box-shadow:0 8px 24px rgba(15,23,42,0.12);' +
    'list-style:none;margin:0;padding:4px 0;' +
    'max-height:220px;overflow-y:auto;min-width:200px;display:none;';
  document.body.appendChild(dd);

  let _input = null;  // the input the dropdown is currently anchored to
  let _all   = [];    // full unfiltered option list for the active input

  // ── Strip numeric / alpha / Roman-numeral list prefixes ──
  // Mirrors cleanBullets() so "I. GENERAL REQUIREMENTS" and
  // "GENERAL REQUIREMENTS" normalise to the same lookup key.
  // Applied to both database keys and user-typed values before
  // any comparison so structural numbering never breaks matching.
  function stripPrefix_(s) {
    return (s || '')
      .replace(/^(\d+[\.\)\-]?\s+)+/,             '')
      .replace(/^([a-zA-Z][\.\)\-]\s+)+/,          '')
      .replace(/^([IVXLCDMivxlcdm]+[\.\)\-]\s+)+/, '')
      .trim();
  }

  // ── Resolve options for a given input ────────────────────
  function getItems(el) {
    const map = window.phaseScopeMap || {};

    if (el.classList.contains('boq-phase-name')) {
      // Strip prefixes from every key, deduplicate (case-insensitive), sort.
      const seen = new Set();
      const out  = [];
      Object.keys(map).forEach(k => {
        const display = stripPrefix_(k);
        const norm    = display.toLowerCase();
        if (!seen.has(norm)) { seen.add(norm); out.push(display); }
      });
      return out.sort();
    }

    if (el.classList.contains('boq-scope-name')) {
      const block = el.closest('.boq-phase-block');
      const typed = block
        ? (block.querySelector('.boq-phase-name')?.value || '').trim()
        : '';
      // Normalize typed value AND every map key before comparing so
      // "GENERAL REQUIREMENTS" matches the key "I. GENERAL REQUIREMENTS".
      const normTyped = stripPrefix_(typed).toLowerCase();
      const matchKey  = Object.keys(map)
        .find(k => stripPrefix_(k).toLowerCase() === normTyped) || '';
      // Strip prefixes from scope values and deduplicate before display.
      const seen = new Set();
      return (map[matchKey] || [])
        .map(s => stripPrefix_(s))
        .filter(s => { const n = s.toLowerCase(); return seen.has(n) ? false : (seen.add(n), true); });
    }
    return [];
  }

  // ── Render list, filtered by query ───────────────────────
  function render(query) {
    const q = query.toLowerCase();
    const visible = q ? _all.filter(s => s.toLowerCase().includes(q)) : _all;
    if (visible.length === 0) {
      dd.innerHTML =
        '<li style="padding:8px 14px;color:#94a3b8;font-size:0.8rem;cursor:default;">' +
        (query ? 'No matches — your entry will be saved as typed.' : 'No existing suggestions.') +
        '</li>';
      return;
    }
    dd.innerHTML = visible.map(s =>
      `<li data-val="${escapeHtml(s)}"
           style="padding:8px 14px;cursor:pointer;font-size:0.83rem;color:#0f172a;
                  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
           onmouseenter="this.style.background='#f1f5f9'"
           onmouseleave="this.style.background=''"
       >${escapeHtml(s)}</li>`
    ).join('');
  }

  // ── Position directly below the active input ─────────────
  function reposition() {
    if (!_input) return;
    const r = _input.getBoundingClientRect();
    dd.style.top   = (r.bottom + 2) + 'px';
    dd.style.left  = r.left + 'px';
    dd.style.width = Math.max(r.width, 200) + 'px';
  }

  // ── Open ─────────────────────────────────────────────────
  function open(el) {
    _input = el;
    _all   = getItems(el);
    reposition();
    render(el.value.trim());
    dd.style.display = 'block';
  }

  // ── Close ────────────────────────────────────────────────
  function close() {
    dd.style.display = 'none';
    _input = null;
  }

  // ── Select: mousedown fires before blur, so preventDefault
  //    keeps the input focused while we set its value ────────
  dd.addEventListener('mousedown', e => {
    const li = e.target.closest('li[data-val]');
    if (!li || !_input) return;
    e.preventDefault();
    _input.value = li.dataset.val;
    _input.dispatchEvent(new Event('change', { bubbles: true }));
    close();
  });

  // ── Open on focus (covers both mouse-click and tab) ──────
  document.addEventListener('focusin', e => {
    if (e.target.matches('.boq-phase-name, .boq-scope-name')) open(e.target);
  });

  // ── Filter while typing; re-fetch scope list so a freshly
  //    typed Phase value is picked up on the next keystroke ─
  document.addEventListener('input', e => {
    if (!_input || e.target !== _input) return;
    if (!e.target.matches('.boq-phase-name, .boq-scope-name')) return;
    _all = getItems(e.target);
    render(e.target.value.trim());
    reposition();
  });

  // ── Close when clicking outside the input + dropdown ─────
  document.addEventListener('mousedown', e => {
    if (dd.style.display === 'none') return;
    if (e.target !== _input && !dd.contains(e.target)) close();
  });

  // ── Close on Escape ───────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && dd.style.display !== 'none') close();
  });

  // ── Track scroll/resize so the panel stays anchored ──────
  document.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);

  window._boqAcClose = close;  // allow external code to close if needed
})();

function initBoqBuilder() {
  const container = document.getElementById('boq-phases-container');
  if (!container) return;

  // Reset the phase builder on every visit (project details intentionally preserved).
  container.innerHTML = `
    <div id="boq-no-phase-msg" class="text-center py-5 text-muted" style="font-size: 0.88rem;">
      Click <strong>+ Add Phase</strong> below to begin building your budget.
    </div>`;
  _boqPhaseCount  = 0;
  _boqScopeCount  = 0;
  _boqItemCount   = 0;
  _boqDataLoaded  = false;
  window.phaseScopeMap = {};
  window.materialsMap  = {};
  calcNboqGrandTotal();   // reset grand total display

  // Clear milestone fields
  const nboqQC = document.getElementById('nboq-quotedCost');
  if (nboqQC) nboqQC.value = '';
  const nboqMC = document.getElementById('nboq-milestonesContainer');
  if (nboqMC) nboqMC.innerHTML = '';
  calcMilestoneTotal('nboq');

  const seq = ++_boqFetchSeq;

  google.script.run
    .withSuccessHandler(data => {
      if (seq !== _boqFetchSeq) return;

      // ── Phase / Scope map ──────────────────────────────────────────
      window.phaseScopeMap = (data && data.phaseScopeMap) ? data.phaseScopeMap : {};

      // ── Materials master list → keyed map + datalist ───────────────
      const list = (data && Array.isArray(data.materialsList)) ? data.materialsList : [];
      list.forEach(m => {
        window.materialsMap[m.name.toLowerCase()] = m;
      });

      const dl = document.getElementById('boq-materials-datalist');
      if (dl) {
        dl.innerHTML = list.map(m => `<option value="${escapeHtml(m.name)}">`).join('');
      }

      _boqDataLoaded = true;
    })
    .withFailureHandler(err => {
      if (seq !== _boqFetchSeq) return;
      _boqDataLoaded = true;
      showToast('Could not load builder data: ' + err.message, 'danger');
    })
    .getBoqBuilderData();

  loadMyBoqSubmissions();
}

function addBoqPhase() {
  const container = document.getElementById('boq-phases-container');
  const noMsg = document.getElementById('boq-no-phase-msg');
  if (noMsg) noMsg.remove();

  _boqPhaseCount++;
  const phaseId = 'boq-phase-' + _boqPhaseCount;

  const div = document.createElement('div');
  div.className = 'boq-phase-block';
  div.id = phaseId;
  div.style.cssText = 'margin-bottom: 24px; border: 1px solid #e2e8f0; border-radius: 14px;';
  div.innerHTML = `
    <div style="background: #1e293b; padding: 10px 16px; display: flex; align-items: center; gap: 10px; border-radius: 14px 14px 0 0;">
      <span style="font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em; color: rgba(255,255,255,0.5); text-transform: uppercase; white-space: nowrap;">Phase</span>
      <input type="text" class="form-control form-control-sm boq-phase-name"
        placeholder="e.g. Civil Works, Electrical…"
        style="max-width: 320px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff;">
      <button class="btn btn-sm ms-auto" onclick="addBoqScope('${phaseId}')"
        style="border-radius: 8px; font-size: 0.78rem; padding: 4px 14px; background: rgba(248,180,0,0.15); border: 1px solid rgba(248,180,0,0.4); color: #f8b400; font-weight: 600; white-space: nowrap;">
        + Add Scope
      </button>
      <button class="btn btn-sm" onclick="removeBoqPhase('${phaseId}')"
        style="border-radius: 8px; font-size: 0.78rem; padding: 4px 10px; background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3); color: #ef4444; white-space: nowrap;">
        ✕ Remove
      </button>
    </div>
    <div class="boq-scopes-container p-3" id="${phaseId}-scopes" style="background: #f8fafc; border-radius: 0 0 14px 14px;">
      <div class="boq-no-scope-msg text-muted text-center py-3" style="font-size: 0.82rem;">
        Click <strong>+ Add Scope</strong> to add a scope under this phase.
      </div>
    </div>
  `;
  container.appendChild(div);
}

function removeBoqPhase(phaseId) {
  const el = document.getElementById(phaseId);
  if (el) el.remove();
  if (typeof window._boqAcClose === 'function') window._boqAcClose();
  if (!document.querySelector('.boq-phase-block')) {
    const container = document.getElementById('boq-phases-container');
    container.innerHTML = `
      <div id="boq-no-phase-msg" class="text-center py-5 text-muted" style="font-size: 0.88rem;">
        Click <strong>+ Add Phase</strong> below to begin organizing your items.
      </div>`;
  }
}

function addBoqScope(phaseId) {
  const scopesContainer = document.getElementById(phaseId + '-scopes');
  if (!scopesContainer) return;
  const noMsg = scopesContainer.querySelector('.boq-no-scope-msg');
  if (noMsg) noMsg.remove();

  _boqScopeCount++;
  const scopeId = 'boq-scope-' + _boqScopeCount;

  const div = document.createElement('div');
  div.className = 'boq-scope-block';
  div.id = scopeId;
  div.style.cssText = 'margin-bottom: 16px; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff;';
  div.innerHTML = `
    <div style="background: #f1f5f9; padding: 8px 14px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #e2e8f0; border-radius: 10px 10px 0 0;">
      <span style="font-size: 0.65rem; font-weight: 700; letter-spacing: 0.07em; color: #94a3b8; text-transform: uppercase; white-space: nowrap;">Scope</span>
      <input type="text" class="form-control form-control-sm boq-scope-name"
        placeholder="e.g. Foundation, Wiring…"
        style="max-width: 280px; border-radius: 8px; font-size: 0.83rem; font-weight: 600; color: #0f172a;">
      <button class="btn btn-sm ms-auto" onclick="addBoqItem('${scopeId}')"
        style="border-radius: 8px; font-size: 0.75rem; padding: 3px 12px; background: #e0f2fe; border: 1px solid #bae6fd; color: #0369a1; font-weight: 600; white-space: nowrap;">
        + Add Item
      </button>
      <button class="btn btn-sm" onclick="removeBoqScope('${scopeId}')"
        style="border-radius: 8px; font-size: 0.75rem; padding: 3px 9px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); color: #ef4444; white-space: nowrap;">
        ✕
      </button>
    </div>
    <table class="table align-middle mb-0" style="font-size: 0.82rem;">
      <thead style="background: #f8fafc; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; font-weight: 700;">
        <tr>
          <th style="padding: 8px 10px; width: 25%;">Item Name / Description</th>
          <th style="padding: 8px 8px; width: 8%;">UOM</th>
          <th style="padding: 8px 8px; width: 9%;">Quantity</th>
          <th style="padding: 8px 8px; width: 11%;">Labor Cost (₱)</th>
          <th style="padding: 8px 8px; width: 11%;">Material Cost (₱)</th>
          <th style="padding: 8px 8px; width: 11%;">Total Cost (₱)</th>
          <th style="padding: 8px 8px; width: 11%;">Quoted Cost (₱)</th>
          <th style="padding: 8px 8px; width: 5%;"></th>
        </tr>
      </thead>
      <tbody class="boq-items-body" id="${scopeId}-items">
        <tr class="boq-no-item-msg">
          <td colspan="8" class="text-center py-3 text-muted" style="font-size: 0.8rem;">
            Click <strong>+ Add Item</strong> to add items under this scope.
          </td>
        </tr>
      </tbody>
    </table>
  `;
  scopesContainer.appendChild(div);
}

function removeBoqScope(scopeId) {
  const el = document.getElementById(scopeId);
  if (!el) return;
  const phaseBlock = el.closest('.boq-phase-block');
  el.remove();
  if (phaseBlock) {
    const scopesContainer = document.getElementById(phaseBlock.id + '-scopes');
    if (scopesContainer && !scopesContainer.querySelector('.boq-scope-block')) {
      scopesContainer.innerHTML = `
        <div class="boq-no-scope-msg text-muted text-center py-3" style="font-size: 0.82rem;">
          Click <strong>+ Add Scope</strong> to add a scope under this phase.
        </div>`;
    }
  }
}

function addBoqItem(scopeId) {
  const tbody = document.getElementById(scopeId + '-items');
  if (!tbody) return;
  const noMsg = tbody.querySelector('.boq-no-item-msg');
  if (noMsg) noMsg.remove();

  _boqItemCount++;
  const itemId = 'boq-item-' + _boqItemCount;

  const tr = document.createElement('tr');
  tr.className = 'boq-item-row';
  tr.id = itemId;
  tr.style.cssText = 'border-bottom: 1px solid #f1f5f9;';
  tr.innerHTML = `
    <td style="padding: 6px 10px;">
      <input type="text" class="form-control form-control-sm boq-item-name"
        list="boq-materials-datalist" autocomplete="off"
        placeholder="Type or select item…"
        style="border-radius: 8px; font-size: 0.81rem;">
    </td>
    <td style="padding: 6px 7px;">
      <input type="text" class="form-control form-control-sm boq-item-unit"
        placeholder="bags, pcs…"
        style="border-radius: 8px; font-size: 0.81rem;">
    </td>
    <td style="padding: 6px 7px;">
      <input type="number" class="form-control form-control-sm boq-item-qty"
        placeholder="0" step="any" min="0"
        style="border-radius: 8px; font-size: 0.81rem;">
    </td>
    <td style="padding: 6px 7px;">
      <input type="text" inputmode="decimal" class="form-control form-control-sm boq-item-labor"
        placeholder="0.00" oninput="formatThousands(this)"
        style="border-radius: 8px; font-size: 0.81rem;">
    </td>
    <td style="padding: 6px 7px;">
      <input type="text" inputmode="decimal" class="form-control form-control-sm boq-item-material"
        placeholder="0.00" oninput="formatThousands(this)"
        style="border-radius: 8px; font-size: 0.81rem;">
    </td>
    <td style="padding: 6px 7px;">
      <input type="text" class="form-control form-control-sm boq-item-total"
        placeholder="—" readonly
        style="border-radius: 8px; font-size: 0.81rem; background: #f8fafc; cursor: default; font-weight: 600; color: #1d3461;">
    </td>
    <td style="padding: 6px 7px;">
      <input type="text" class="form-control form-control-sm boq-item-cost"
        placeholder="—" readonly
        style="border-radius: 8px; font-size: 0.81rem; background: #f8fafc; cursor: default; font-weight: 600; color: #92610f;">
    </td>
    <td style="padding: 6px 7px; text-align: center;">
      <button class="btn btn-sm btn-outline-danger" onclick="removeBoqItem('${itemId}')"
        style="border-radius: 8px; padding: 3px 9px; font-size: 0.75rem; line-height: 1.4;">✕</button>
    </td>
  `;
  tbody.appendChild(tr);
}

function removeBoqItem(itemId) {
  const tr = document.getElementById(itemId);
  if (!tr) return;
  const tbody = tr.closest('tbody');
  tr.remove();
  if (tbody && !tbody.querySelector('.boq-item-row')) {
    tbody.innerHTML = `
      <tr class="boq-no-item-msg">
        <td colspan="8" class="text-center py-3 text-muted" style="font-size: 0.8rem;">
          Click <strong>+ Add Item</strong> to add items under this scope.
        </td>
      </tr>`;
  }
}

// ── Row math helpers ─────────────────────────────────────────────────────────
const NBOQ_MARKUP_RATE = 0.35; // 35% markup applied on top of Total Cost to derive Quoted Cost

function calcNboqRowTotal(tr) {
  const qty      = parseFloat(tr.querySelector('.boq-item-qty')?.value)      || 0;
  const labor    = parseFormattedNumber(tr.querySelector('.boq-item-labor')?.value);
  const material = parseFormattedNumber(tr.querySelector('.boq-item-material')?.value);

  // Total Cost = (Labor Cost + Material Cost) × Quantity
  const totalCost = (labor + material) * qty;
  const totalEl   = tr.querySelector('.boq-item-total');
  if (totalEl) totalEl.value = (totalCost > 0) ? totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';

  // Quoted Cost = Total Cost + (35% of Total Cost)
  const quotedCost = totalCost * (1 + NBOQ_MARKUP_RATE);
  const costEl      = tr.querySelector('.boq-item-cost');
  if (costEl) costEl.value = (quotedCost > 0) ? quotedCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
}

function calcNboqGrandTotal() {
  let sum = 0;
  document.querySelectorAll('#boq-phases-container .boq-item-total').forEach(el => {
    sum += parseFormattedNumber(el.value);
  });
  const el = document.getElementById('nboq-grand-total');
  if (el) el.textContent = '₱' + sum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Event delegation — auto-populate + live math ────────────────────────────
// Runs once at module load; works for all dynamically added rows.
(function attachNboqListeners() {
  document.addEventListener('input', function(e) {
    // ── Item Name: auto-fill UOM only from Materials map (cost is now computed, not looked up) ─────────
    if (e.target.classList.contains('boq-item-name')) {
      const val = e.target.value.trim();
      const mat = window.materialsMap[val.toLowerCase()];
      const tr  = e.target.closest('tr.boq-item-row');
      if (!tr) return;
      const unitEl = tr.querySelector('.boq-item-unit');
      if (mat) {
        unitEl.value = mat.unit;
        unitEl.readOnly = true;  unitEl.style.background = '#f0fdf4';
      } else if (!val) {
        unitEl.readOnly = false; unitEl.style.background = '';
      }
      calcNboqRowTotal(tr);
      calcNboqGrandTotal();
      return;
    }
    // ── Qty, Labor, Material: recalculate row total + grand total ─────
    if (e.target.classList.contains('boq-item-qty')      ||
        e.target.classList.contains('boq-item-labor')    ||
        e.target.classList.contains('boq-item-material')) {
      const tr = e.target.closest('tr.boq-item-row');
      if (tr) { calcNboqRowTotal(tr); calcNboqGrandTotal(); }
    }
  });
})();

// ── Submit ───────────────────────────────────────────────────────────────────
function submitNativeBoq() {
  // Validate project details
  const projectCode  = (document.getElementById('nboq-projectCode')?.value  || '').trim();
  const customerName = (document.getElementById('nboq-customerName')?.value || '').trim();
  const company      = document.getElementById('nboq-assignCompany')?.value || '';

  if (!projectCode)  { showToast('Please enter a Project Code.',   'warning'); return; }
  if (!customerName) { showToast('Please enter a Customer Name.',  'warning'); return; }
  if (!company)      { showToast('Please select a Company.',       'warning'); return; }

  if (!/^[A-Za-z0-9 ]+$/.test(projectCode)) {
    showToast('Project Code may contain only letters, numbers, and spaces — no hyphens or symbols.', 'danger');
    return;
  }

  const allItemRows = document.querySelectorAll('#boq-phases-container .boq-item-row');
  if (allItemRows.length === 0) {
    showToast('Please add at least one line item before saving.', 'warning');
    return;
  }

  const items = [];
  let hasError = false;

  allItemRows.forEach(tr => {
    const nameEl  = tr.querySelector('.boq-item-name');
    const name    = (nameEl?.value || '').trim();
    if (!name) {
      if (nameEl) { nameEl.style.borderColor = '#ef4444'; nameEl.style.boxShadow = '0 0 0 3px rgba(239,68,68,.15)'; }
      hasError = true;
      return;
    }
    if (nameEl) { nameEl.style.borderColor = ''; nameEl.style.boxShadow = ''; }

    // Walk up DOM to find the Phase and Scope names
    const scopeBlock = tr.closest('.boq-scope-block');
    const phaseBlock = scopeBlock?.closest('.boq-phase-block');
    const phase = (phaseBlock?.querySelector('.boq-phase-name')?.value || '').trim();
    const scope = (scopeBlock?.querySelector('.boq-scope-name')?.value || '').trim();

    const qty          = parseFloat(tr.querySelector('.boq-item-qty')?.value)      || 0;
    const laborCost    = parseFormattedNumber(tr.querySelector('.boq-item-labor')?.value);
    const materialCost = parseFormattedNumber(tr.querySelector('.boq-item-material')?.value);
    const totalCost    = parseFormattedNumber(tr.querySelector('.boq-item-total')?.value) || ((laborCost + materialCost) * qty);
    const quotedCost   = parseFormattedNumber(tr.querySelector('.boq-item-cost')?.value)  || (totalCost * (1 + NBOQ_MARKUP_RATE));

    items.push({
      phase,
      scope,
      name,
      unit:       (tr.querySelector('.boq-item-unit')?.value || '').trim(),
      quotedCost,
      qty,
      laborCost,
      materialCost,
      totalCost
    });
  });

  if (hasError) {
    showToast('Please fill in Item Name for all highlighted rows.', 'danger');
    return;
  }

  // Milestone validation
  const _nboqMilestonePayload = extractMilestonePayload('nboq');
  if (!_nboqMilestonePayload.valid) {
    showToast(_nboqMilestonePayload.error, 'danger');
    return;
  }

  const payload = {
    project: {
      code:           projectCode,
      customerName:   customerName,
      company:        company,
      phone:    (document.getElementById('nboq-phone')?.value    || '').trim(),
      email:    (document.getElementById('nboq-email')?.value    || '').trim(),
      site:     (document.getElementById('nboq-site')?.value     || '').trim(),
      billing:  (document.getElementById('nboq-billing')?.value  || '').trim(),
      birthday: (document.getElementById('nboq-birthday')?.value || ''),
      tin:      (document.getElementById('nboq-tin')?.value      || '').trim(),
      quotedCost:     _nboqMilestonePayload.quotedCost,
      milestoneTerms: _nboqMilestonePayload.milestoneTerms
    },
    items
  };

  const btn = document.getElementById('boq-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  google.script.run
    .withSuccessHandler(res => {
      // If this was a resubmission of a returned BOQ, mark the old one as Resubmitted
      if (_resubmitReturnedId) {
        google.script.run.markBoqSubmissionResubmitted(_resubmitReturnedId);
        _resubmitReturnedId = null;
      }
      btn.disabled = false;
      btn.textContent = 'Submit for Approval';
      showToast('✅ BOQ ' + res.submissionId + ' submitted for admin approval.', 'success');
      initBoqBuilder();
      loadMyBoqSubmissions();
    })
    .withFailureHandler(err => {
      btn.disabled = false;
      btn.textContent = 'Submit for Approval';
      showToast('Error submitting BOQ: ' + err.message, 'danger');
    })
    .submitNativeBoqForApproval(payload, userProfile.email);
}

// ===== BOQ APPROVAL WORKFLOW =====

function loadMyBoqSubmissions() {
  const tbody = document.getElementById('my-boq-submissions-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Loading...</td></tr>';
  google.script.run
    .withSuccessHandler(function(rows) { renderMyBoqSubmissions(rows || []); })
    .withFailureHandler(function(err) { tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger py-4">' + err.message + '</td></tr>'; })
    .getMyBoqSubmissions(userProfile.email);
}

function renderMyBoqSubmissions(rows) {
  const tbody = document.getElementById('my-boq-submissions-body');
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No submissions yet.</td></tr>'; return; }
  const badge = function(s) {
    const m = { 'Pending':'bg-warning text-dark', 'Approved':'bg-success', 'Rejected':'bg-danger', 'Returned':'bg-info text-dark', 'Resubmitted':'bg-secondary' };
    return '<span class="badge ' + (m[s] || 'bg-secondary') + '">' + s + '</span>';
  };
  tbody.innerHTML = rows.map(function(r) {
    let action = '<span class="text-muted small">—</span>';
    if (r.status === 'Returned') {
      action = '<button class="btn btn-sm btn-warning fw-bold" onclick="editReturnedBoq(\'' + r.submissionId + '\')">Edit & Resubmit</button>';
    }
    const pdfCell = (r.status === 'Approved' && r.approvedPdfUrl)
      ? '<a href="' + r.approvedPdfUrl + '" target="_blank" class="btn btn-sm btn-outline-primary fw-bold py-0">View PDF</a>'
      : '<span class="text-muted small">—</span>';
    return '<tr>' +
      '<td class="ps-4 fw-bold">' + r.submissionId + '</td>' +
      '<td>' + r.projectCode + '</td>' +
      '<td class="text-nowrap">' + r.date + '</td>' +
      '<td class="text-center">' + badge(r.status) + '</td>' +
      '<td class="small text-muted">' + (r.remarks || '—') + '</td>' +
      '<td class="text-center">' + pdfCell + '</td>' +
      '<td class="text-center pe-3">' + action + '</td>' +
      '</tr>';
  }).join('');
}

function editReturnedBoq(submissionId) {
  if (!confirm('Load this returned BOQ back into the builder for editing?')) return;
  google.script.run
    .withSuccessHandler(function(info) {
      const p = info.payload || {};
      const proj = p.project || {};
      // Reset builder first
      initBoqBuilder();
      // Give initBoqBuilder a moment to reset, then repopulate
      setTimeout(function() {
        // Project fields
        const set = function(id, val) { const el = document.getElementById(id); if (el) el.value = val || ''; };
        set('nboq-projectCode', proj.code);
        set('nboq-customerName', proj.customerName);
        const companySel = document.getElementById('nboq-assignCompany');
        if (companySel) companySel.value = proj.company || '';
        set('nboq-phone', proj.phone);
        set('nboq-email', proj.email);
        set('nboq-site', proj.site);
        set('nboq-billing', proj.billing);
        set('nboq-birthday', proj.birthday);
        set('nboq-tin', proj.tin);

        // Rebuild phases/scopes/items from payload
        (p.items || []).forEach(function(it) {
          // Find or create the phase block
          let phaseBlock = Array.from(document.querySelectorAll('.boq-phase-block')).find(function(b) {
            return (b.querySelector('.boq-phase-name')?.value || '') === (it.phase || '');
          });
          if (!phaseBlock) {
            addBoqPhase();
            phaseBlock = document.querySelector('.boq-phase-block:last-of-type');
            phaseBlock.querySelector('.boq-phase-name').value = it.phase || '';
          }
          // Find or create the scope block within this phase
          let scopeBlock = Array.from(phaseBlock.querySelectorAll('.boq-scope-block')).find(function(s) {
            return (s.querySelector('.boq-scope-name')?.value || '') === (it.scope || '');
          });
          if (!scopeBlock) {
            addBoqScope(phaseBlock.id);
            scopeBlock = phaseBlock.querySelector('.boq-scope-block:last-of-type');
            scopeBlock.querySelector('.boq-scope-name').value = it.scope || '';
          }
          // Add the item row
          addBoqItem(scopeBlock.id);
          const row = scopeBlock.querySelector('.boq-item-row:last-of-type');
          row.querySelector('.boq-item-name').value     = it.name || '';
          row.querySelector('.boq-item-unit').value     = it.unit || '';
          row.querySelector('.boq-item-qty').value      = it.qty || '';
          const laborEl = row.querySelector('.boq-item-labor');
          const materialEl = row.querySelector('.boq-item-material');
          laborEl.value    = it.laborCost || '';
          materialEl.value = it.materialCost || '';
          formatThousands(laborEl);
          formatThousands(materialEl);
          calcNboqRowTotal(row);
        });
        calcNboqGrandTotal();
        _resubmitReturnedId = submissionId;
        showToast('Returned BOQ loaded. Admin remarks: ' + (info.remarks || '(none)'), 'info');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 300);
    })
    .withFailureHandler(function(err) { showToast('Error loading BOQ: ' + err.message, 'danger'); })
    .getBoqSubmissionPayload(submissionId);
}

function loadPendingBoqApprovals() {
  const card = document.getElementById('boq-approvals-card');
  const tbody = document.getElementById('boq-approvals-body');
  if (!card || !tbody) return;
  // Admin-only visibility
  if (!isAdminUser_()) { card.style.display = 'none'; return; }
  card.style.display = '';
  tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Loading...</td></tr>';
  google.script.run
    .withSuccessHandler(function(rows) { renderPendingBoqApprovals(rows || []); })
    .withFailureHandler(function(err) { tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger py-4">' + err.message + '</td></tr>'; })
    .getPendingBoqApprovals();
}

function renderPendingBoqApprovals(rows) {
  const tbody = document.getElementById('boq-approvals-body');
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">No pending BOQ submissions.</td></tr>'; return; }
  const fmt = function(n) { return '₱' + (Number(n)||0).toLocaleString(undefined, {minimumFractionDigits:2}); };
  tbody.innerHTML = rows.map(function(r) {
    const sid = r.submissionId.replace(/'/g, "\\'");
    return '<tr id="boqapp-row-' + r.submissionId + '">' +
      '<td class="ps-4 fw-bold">' + r.submissionId + '</td>' +
      '<td>' + r.projectCode + '</td>' +
      '<td>' + (r.customerName || '—') + '</td>' +
      '<td>' + (r.company || '—') + '</td>' +
      '<td class="text-center">' + r.itemCount + '</td>' +
      '<td class="text-end fw-bold">' + fmt(r.grandTotal) + '</td>' +
      '<td class="small text-muted">' + r.submitter + '</td>' +
      '<td class="text-center pe-3" style="white-space:nowrap;">' +
        '<button class="btn btn-sm btn-outline-secondary me-1 py-0" onclick="viewBoqPdf(\'' + sid + '\',this)">PDF</button>' +
        '<button class="btn btn-sm btn-success me-1 py-0 fw-bold" onclick="actBoqApproval(\'' + sid + '\',\'Accept\')">Accept</button>' +
        '<button class="btn btn-sm btn-warning me-1 py-0 fw-bold" onclick="openBoqReturnModal(\'' + sid + '\')">Return</button>' +
        '<button class="btn btn-sm btn-danger py-0 fw-bold" onclick="actBoqApproval(\'' + sid + '\',\'Reject\')">Reject</button>' +
      '</td></tr>';
  }).join('');
}

function viewBoqPdf(submissionId, btn) {
  btn.disabled = true; const old = btn.textContent; btn.textContent = '…';
  google.script.run
    .withSuccessHandler(function(url) {
      btn.disabled = false; btn.textContent = old;
      if (url && typeof url === 'string') window.open(url, '_blank');
    })
    .withFailureHandler(function(err) { btn.disabled = false; btn.textContent = old; showToast('PDF error: ' + err.message, 'danger'); })
    .generateBoqApprovalPdf(submissionId);
}

function actBoqApproval(submissionId, action) {
  if (action === 'Accept' && !confirm('Accept this BOQ? It will be written to the project budget (Logs) and become live.')) return;
  if (action === 'Reject' && !confirm('Reject this BOQ? It will NOT be written to the budget.')) return;
  const row = document.getElementById('boqapp-row-' + submissionId);
  if (row) { row.style.opacity = '0.4'; row.style.pointerEvents = 'none'; }
  google.script.run
    .withSuccessHandler(function() {
      showToast('BOQ ' + submissionId + ' ' + (action === 'Accept' ? 'accepted and written to budget.' : 'rejected.'), 'success');
      loadPendingBoqApprovals();
    })
    .withFailureHandler(function(err) {
      showToast(err.message, 'danger');
      if (row) { row.style.opacity = '1'; row.style.pointerEvents = 'auto'; }
    })
    .processBoqApproval(submissionId, action, '', userProfile.email);
}

function openBoqReturnModal(submissionId) {
  document.getElementById('boq-return-subid').value = submissionId;
  document.getElementById('boq-return-remarks').value = '';
  document.getElementById('boq-return-alert').style.display = 'none';
  new bootstrap.Modal(document.getElementById('boqReturnModal')).show();
}

function submitBoqReturn() {
  const submissionId = document.getElementById('boq-return-subid').value;
  const remarks = document.getElementById('boq-return-remarks').value.trim();
  const alertEl = document.getElementById('boq-return-alert');
  const btn = document.getElementById('boq-return-submit-btn');
  if (!remarks) {
    alertEl.textContent = 'Remarks are required.';
    alertEl.className = 'alert alert-danger py-2 mb-3';
    alertEl.style.display = '';
    return;
  }
  btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Returning...';
  google.script.run
    .withSuccessHandler(function() {
      bootstrap.Modal.getInstance(document.getElementById('boqReturnModal')).hide();
      btn.disabled = false; btn.innerHTML = 'Return with Remarks';
      showToast('BOQ ' + submissionId + ' returned to submitter.', 'success');
      loadPendingBoqApprovals();
    })
    .withFailureHandler(function(err) {
      btn.disabled = false; btn.innerHTML = 'Return with Remarks';
      alertEl.textContent = err.message;
      alertEl.className = 'alert alert-danger py-2 mb-3';
      alertEl.style.display = '';
    })
    .processBoqApproval(submissionId, 'Return', remarks, userProfile.email);
}

// ── Milestone Terms helpers ──────────────────────────────────────────────────
function formatThousands(el) {
  const raw = el.value.replace(/,/g, '');
  const dotIdx = raw.indexOf('.');
  const hasDecimal = dotIdx !== -1;
  const intStr = (hasDecimal ? raw.slice(0, dotIdx) : raw).replace(/\D/g, '');
  const decStr = hasDecimal ? raw.slice(dotIdx + 1).replace(/\D/g, '').slice(0, 2) : '';
  if (!intStr && !hasDecimal) { el.value = ''; return; }
  const intFormatted = intStr ? Number(intStr).toLocaleString('en-US') : '0';
  el.value = hasDecimal ? intFormatted + '.' + decStr : intFormatted;
}

// Parses a value that may contain formatThousands()-style comma separators
// (e.g. "50,000.25") back into a plain number for math -- plain parseFloat
// stops at the first comma and silently truncates ("50,000" -> 50), so any
// field wired to formatThousands must be read through this instead.
function parseFormattedNumber(v) {
  return parseFloat(String(v == null ? '' : v).replace(/,/g, '')) || 0;
}

function clampPct(el) {
  if (el.value === '') return;
  const v = parseFloat(el.value);
  if (v > 100) el.value = 100;
  else if (v < 0) el.value = 0;
}

function addMilestoneRow(prefix) {
  const container = document.getElementById(prefix + '-milestonesContainer');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'row g-2 align-items-center mb-2 milestone-row';
  row.innerHTML = `
    <div class="col">
      <input type="number" class="form-control form-control-sm milestone-completion"
        placeholder="% of Completion" min="0" max="100" step="any"
        oninput="clampPct(this); calcMilestoneTotal('${prefix}')">
    </div>
    <div class="col">
      <input type="number" class="form-control form-control-sm milestone-payment"
        placeholder="% of Payment" min="0" max="100" step="any"
        oninput="clampPct(this); calcMilestoneTotal('${prefix}')">
    </div>
    <div class="col-auto">
      <button type="button" class="btn btn-sm btn-outline-danger"
        onclick="removeMilestoneRow(this)">✕</button>
    </div>`;
  container.appendChild(row);
  calcMilestoneTotal(prefix);
}

function removeMilestoneRow(btn) {
  const row = btn.closest('.milestone-row');
  if (!row) return;
  const container = row.parentElement;
  row.remove();
  // Determine prefix from container id (e.g. "boq-milestonesContainer" → "boq")
  const prefix = container.id.replace('-milestonesContainer', '');
  calcMilestoneTotal(prefix);
}

function calcMilestoneTotal(prefix) {
  const container = document.getElementById(prefix + '-milestonesContainer');
  const badge     = document.getElementById(prefix + '-milestoneTotal');
  if (!container || !badge) return;
  let total = 0;
  container.querySelectorAll('.milestone-payment').forEach(function(inp) {
    total += parseFloat(inp.value) || 0;
  });
  badge.textContent = 'Total Payment: ' + total + '%';
  badge.className   = 'badge ' + (total === 100 ? 'bg-success' : 'bg-secondary');
}

// Returns { valid: bool, quotedCost: number, milestoneTerms: string, error: string }
function extractMilestonePayload(prefix) {
  const quotedCost = parseFloat((document.getElementById(prefix + '-quotedCost')?.value || '').replace(/,/g, '')) || 0;
  if (quotedCost <= 0) {
    return { valid: false, error: 'Please enter a Quoted Cost to Client greater than 0.' };
  }

  const rows = document.querySelectorAll('#' + prefix + '-milestonesContainer .milestone-row');
  const milestones = [];
  rows.forEach(function(row) {
    const completion = parseFloat(row.querySelector('.milestone-completion')?.value) || 0;
    const payment    = parseFloat(row.querySelector('.milestone-payment')?.value)    || 0;
    if (completion > 0 || payment > 0) {
      milestones.push({ completion: completion, payment: payment });
    }
  });

  if (milestones.length > 0) {
    const total = milestones.reduce(function(sum, m) { return sum + m.payment; }, 0);
    if (Math.round(total * 100) !== 10000) {   // avoids floating-point drift
      return { valid: false, error: 'Milestone payment percentages must sum to exactly 100%. Current total: ' + total + '%.' };
    }
  }

  return {
    valid: true,
    quotedCost: quotedCost,
    milestoneTerms: JSON.stringify(milestones)
  };
}

// =========================
// PROJECT ENGINEER / RTB / COLLECTIONS
// =========================

function initProjectEngineer() {
  const select = document.getElementById('pe-project-select');
  if (!select) return;

  select.innerHTML = '<option value="">— Select Project —</option>';
  document.getElementById('pe-overall-pct').value = '';
  document.getElementById('pe-rtb-pct').value = '';
  document.getElementById('pe-project-details').style.display = 'none';

  // getInitialData() only lists projects that already have BOQ items (it
  // derives its project list from BoqItem, not Project) -- a brand new
  // project with no items uploaded yet would never appear here. Use
  // getProjectsListOnly() instead, which unions Project + BoqItem + MrfItem
  // + Reimbursement project codes, so every real project shows up.
  google.script.run
    .withSuccessHandler(function(projects) {
      if (!projects) return;
      projects.forEach(function(p) {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        select.appendChild(opt);
      });
      colorizeProjectSelect(select);
      whenProjectMapReady(function(){ setupProjectDropdownHighlight(select); });
    })
    .withFailureHandler(function(err) {
      showToast('Could not load projects: ' + err.message, 'danger');
    })
    .getProjectsListOnly();
}

function onPeProjectChange() {
  const projectCode = document.getElementById('pe-project-select').value;
  const detailsCard = document.getElementById('pe-project-details');
  const fmt = function(n) { return '₱' + (Number(n) || 0).toLocaleString(undefined, {minimumFractionDigits: 2}); };

  detailsCard.style.display = 'none';
  if (!projectCode) return;

  google.script.run
    .withSuccessHandler(function(data) {
      document.getElementById('pe-detail-customer').textContent = data.customerName || '—';
      document.getElementById('pe-detail-company').textContent  = data.company      || '—';
      document.getElementById('pe-detail-quoted').textContent   = data.quotedCost   ? fmt(data.quotedCost) : '—';
      detailsCard.style.display = '';
    })
    .withFailureHandler(function(err) {
      showToast('Could not load project data: ' + err.message, 'danger');
    })
    .getProjectEngineerData(projectCode);
}

function submitProgressReport() {
  const projectCode = document.getElementById('pe-project-select').value;
  const overallPct  = parseFloat(document.getElementById('pe-overall-pct').value);
  const btn         = document.getElementById('pe-progress-btn');

  if (!projectCode) { showToast('Please select a project.', 'warning'); return; }
  if (isNaN(overallPct) || overallPct <= 0 || overallPct > 100) {
    showToast('Overall % Accomplished is required and must be between 1 and 100.', 'warning');
    return;
  }

  const payload = { projectCode: projectCode, overallPercent: overallPct, phaseBreakdown: [] };

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Submitting...';

  google.script.run
    .withSuccessHandler(function() {
      showToast('Progress report submitted successfully.', 'success');
      document.getElementById('pe-overall-pct').value = '';
      btn.disabled = false;
      btn.innerHTML = 'Submit Progress';
    })
    .withFailureHandler(function(err) {
      showToast(err.message, 'danger');
      btn.disabled = false;
      btn.innerHTML = 'Submit Progress';
    })
    .submitProjectProgress(payload, userProfile.email);
}

function submitRTBReport() {
  const projectCode = document.getElementById('pe-project-select').value;
  const rtbPct      = parseFloat(document.getElementById('pe-rtb-pct').value);
  const btn         = document.getElementById('pe-rtb-btn');

  if (!projectCode) { showToast('Please select a project.', 'warning'); return; }
  if (isNaN(rtbPct) || rtbPct <= 0 || rtbPct > 100) {
    showToast('% to Bill is required and must be between 1 and 100.', 'warning');
    return;
  }

  const payload = { projectCode: projectCode, rtbPercent: rtbPct };

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Submitting...';

  google.script.run
    .withSuccessHandler(function() {
      showToast('RTB submitted successfully. Awaiting admin approval.', 'success');
      document.getElementById('pe-rtb-pct').value = '';
      btn.disabled = false;
      btn.innerHTML = 'Submit RTB';
    })
    .withFailureHandler(function(err) {
      showToast(err.message, 'danger');
      btn.disabled = false;
      btn.innerHTML = 'Submit RTB';
    })
    .submitRTBRequest(payload, userProfile.email);
}

function loadRTBApprovals() {
  const tbody = document.getElementById('rtb-approvals-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4"><span class="spinner-border spinner-border-sm me-2"></span>Loading...</td></tr>';

  google.script.run
    .withSuccessHandler(function(data) {
      rtbApprovalsRaw = data || [];
      renderRTBApprovals(rtbApprovalsRaw);
    })
    .withFailureHandler(function(err) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger py-4">' + err.message + '</td></tr>';
    })
    .getPendingRTBs();
}

function renderRTBApprovals(data) {
  const tbody = document.getElementById('rtb-approvals-body');
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted">No pending RTBs.</td></tr>';
    return;
  }
  const fmt = function(n) { return '₱' + (Number(n) || 0).toLocaleString(undefined, {minimumFractionDigits: 2}); };
  tbody.innerHTML = data.map(function(r) {
    const safeId = r.rtbId.replace(/'/g, "\\'");
    return '<tr id="rtb-row-' + r.rtbId + '">' +
      '<td class="ps-4">' + (r.encoder || '—') + '</td>' +
      '<td class="fw-bold">' + r.projectCode + '</td>' +
      '<td class="text-end">' + r.rtbPercent + '%</td>' +
      '<td class="text-end fw-bold text-success">' + fmt(r.amountToBill) + '</td>' +
      '<td class="text-end">' + (r.lastProgress || 0) + '%</td>' +
      '<td class="text-end">' + fmt(r.totalExpenses) + '</td>' +
      '<td class="text-end">' + fmt(r.quotedCost) + '</td>' +
      '<td class="text-center pe-3">' +
        '<button class="btn btn-success btn-sm me-1 fw-bold" onclick="approveRejectRTB(\'' + safeId + '\',\'Approve\')">Approve</button>' +
        '<button class="btn btn-danger btn-sm fw-bold" onclick="approveRejectRTB(\'' + safeId + '\',\'Reject\')">Reject</button>' +
      '</td></tr>';
  }).join('');
}

function approveRejectRTB(rtbId, action) {
  if (!confirm('Are you sure you want to ' + action + ' RTB ' + rtbId + '?')) return;

  const row = document.getElementById('rtb-row-' + rtbId);
  if (row) { row.style.opacity = '0.4'; row.style.pointerEvents = 'none'; }

  google.script.run
    .withSuccessHandler(function() {
      showToast('RTB ' + action + 'd successfully.', 'success');
      loadRTBApprovals();
    })
    .withFailureHandler(function(err) {
      showToast(err.message, 'danger');
      if (row) { row.style.opacity = '1'; row.style.pointerEvents = 'auto'; }
    })
    .processRTB(rtbId, action, userProfile.email);
}

function loadCollections() {
  const tbody = document.getElementById('collections-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><span class="spinner-border spinner-border-sm me-2"></span>Loading...</td></tr>';

  google.script.run
    .withSuccessHandler(function(data) {
      collectionRTBsRaw = data || [];
      renderCollections(collectionRTBsRaw);
    })
    .withFailureHandler(function(err) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger py-4">' + err.message + '</td></tr>';
    })
    .getApprovedRTBs();
}

function renderCollections(data) {
  const tbody = document.getElementById('collections-body');
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-muted">No approved RTBs awaiting collection.</td></tr>';
    return;
  }
  const fmt = function(n) { return '₱' + (Number(n) || 0).toLocaleString(undefined, {minimumFractionDigits: 2}); };
  tbody.innerHTML = data.map(function(r) {
    const safeId = r.rtbId.replace(/'/g, "\\'");
    return '<tr>' +
      '<td class="ps-4 fw-bold">' + r.rtbId + '</td>' +
      '<td>' + r.projectCode + '</td>' +
      '<td class="text-end">' + r.rtbPercent + '%</td>' +
      '<td class="text-end fw-bold text-success pe-3">' + fmt(r.amountToBill) + '</td>' +
      '<td class="text-center pe-3">' +
        '<button class="btn btn-primary btn-sm fw-bold" onclick="openCollectionModal(\'' + safeId + '\')">Mark Collected</button>' +
      '</td></tr>';
  }).join('');
}

function openCollectionModal(rtbId) {
  activeCollectionRtbId = rtbId;
  document.getElementById('col-amount').value = '';
  document.getElementById('col-bank').value = '';
  document.getElementById('col-due-date').value = '';
  document.getElementById('col-check-number').value = '';
  const alertBox = document.getElementById('collection-modal-alert');
  if (alertBox) alertBox.style.display = 'none';
  const saveBtn = document.getElementById('collection-save-btn');
  if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = 'Save Collection'; }
  new bootstrap.Modal(document.getElementById('collectionModal')).show();
}

function saveCollection() {
  const amount      = document.getElementById('col-amount').value.trim();
  const bank        = document.getElementById('col-bank').value.trim();
  const dueDate     = document.getElementById('col-due-date').value.trim();
  const checkNumber = document.getElementById('col-check-number').value.trim();
  const saveBtn     = document.getElementById('collection-save-btn');

  if (!amount || !bank || !dueDate || !checkNumber) {
    showToast('All fields are required.', 'warning');
    return;
  }

  const rtbRow = collectionRTBsRaw.find(function(r) { return r.rtbId === activeCollectionRtbId; });
  const projectCode = rtbRow ? rtbRow.projectCode : '';

  const payload = {
    rtbId:       activeCollectionRtbId,
    projectCode: projectCode,
    amount:      parseFormattedNumber(amount),
    bank:        bank,
    dueDate:     dueDate,
    checkNumber: checkNumber
  };

  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';

  google.script.run
    .withSuccessHandler(function() {
      bootstrap.Modal.getInstance(document.getElementById('collectionModal')).hide();
      showToast('Collection recorded successfully.', 'success');
      loadCollections();
    })
    .withFailureHandler(function(err) {
      showToast(err.message, 'danger');
      saveBtn.disabled = false;
      saveBtn.innerHTML = 'Save Collection';
    })
    .submitCollection(payload, userProfile.email);
}

// =========================
// SUBCONTRACTOR MODULE
// =========================

var _wpBoqLines  = [];   // BOQ lines for the currently-selected project
var _wpBoqClaimed = {};  // key → subcontractor name for claimed lines

// ── Strip list prefixes (Roman, alpha, numeric) — module-level copy
function cleanBulletsWp_(text) {
  return (text || '').toString()
    .replace(/^(\d+[\.\)\-]?\s+)+/, '')
    .replace(/^([a-zA-Z][\.\)\-]\s+)+/, '')
    .replace(/^([IVXLCDMivxlcdm]+[\.\)\-]\s+)+/, '')
    .trim();
}

// ── Subcontractor AP — Phase 3 full view ─────────────────────────────
var _subApData = null;

function initSubcontractorAP() {
  var subSel  = document.getElementById('ap-filter-sub');
  var projSel = document.getElementById('ap-filter-project');
  if (subSel)  subSel.innerHTML  = '<option value="">All Subcontractors</option>';
  if (projSel) projSel.innerHTML = '<option value="">All Projects</option>';
  document.querySelectorAll('.ap-status-check').forEach(function(cb) { cb.checked = cb.value !== 'Voided'; });
  loadSubApData({});
}

function loadSubApData(filters) {
  var tbody = document.getElementById('sub-ap-mil-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4"><span class="spinner-border spinner-border-sm me-2"></span>Loading...</td></tr>';
  google.script.run
    .withSuccessHandler(function(data) {
      _subApData = data;
      renderSubApKpis(data.kpi);
      var subSel  = document.getElementById('ap-filter-sub');
      var projSel = document.getElementById('ap-filter-project');
      if (subSel  && subSel.options.length  <= 1) (data.subs     || []).forEach(function(s) { var o = document.createElement('option'); o.value = s.subId; o.textContent = s.name; subSel.appendChild(o); });
      if (projSel && projSel.options.length <= 1) {
        (data.projects || []).forEach(function(p) { var o = document.createElement('option'); o.value = o.textContent = p; projSel.appendChild(o); });
        colorizeProjectSelect(projSel);
      }
      whenProjectMapReady(function(){ setupProjectDropdownHighlight(projSel); });
      renderSubApMilestoneTable(data.rows);
    })
    .withFailureHandler(function(err) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-4">' + err.message + '</td></tr>';
    })
    .getSubconApData(filters);
}

function renderSubApKpis(kpi) {
  if (!kpi) return;
  var fmt = function(n) { return '₱' + (Number(n)||0).toLocaleString(undefined, {minimumFractionDigits:2}); };
  function set(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; }
  set('kpi-open-sum',    fmt(kpi.open  ? kpi.open.sum  : 0));
  set('kpi-open-count',  (kpi.open  ? kpi.open.count  : 0) + ' milestones');
  set('kpi-ready-sum',   fmt(kpi.ready ? kpi.ready.sum : 0));
  set('kpi-ready-count', (kpi.ready ? kpi.ready.count : 0) + ' milestones');
  set('kpi-paid-sum',    fmt(kpi.paid  ? kpi.paid.sum  : 0));
  set('kpi-paid-count',  (kpi.paid  ? kpi.paid.count  : 0) + ' milestones');
  set('kpi-voided-count', kpi.voided || 0);
}

function renderSubApMilestoneTable(rows) {
  var tbody = document.getElementById('sub-ap-mil-tbody');
  if (!tbody) return;
  var fmt = function(n) { return '₱' + (Number(n)||0).toLocaleString(undefined, {minimumFractionDigits:2}); };
  if (!rows || !rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-5 text-muted">No milestones match the current filters.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(function(r) {
    var safeId   = r.milId.replace(/[^a-zA-Z0-9\-]/g, '');
    var safeWpId = r.wpId.replace(/[^a-zA-Z0-9\-]/g, '');
    var badgeCls = r.status === 'Paid' ? 'bg-success' : r.status === 'Voided' ? 'bg-secondary' : r.status === 'Open' ? 'bg-light text-dark border' : '';
    var badgeSty = r.status === 'Ready to Pay' ? ' style="background:#e8a820;color:#fff;"' : '';
    var badge = '<span class="badge ' + badgeCls + '"' + badgeSty + '>' + r.status + '</span>' +
      (r.statusNote ? '<br><small class="text-muted" style="font-size:.68rem;">' + r.statusNote + '</small>' : '');
    var checkCell = r.checkId ? '<span class="small text-muted">' + r.checkId + '</span>' : '<span class="small text-muted fst-italic">—</span>';
    var actions = '';
    if (r.status !== 'Voided') {
      if (!r.readyToPay && r.status === 'Open') {
        actions += '<button class="btn me-1 fw-bold" style="font-size:.7rem;padding:2px 7px;border-radius:5px;background:#1d3461;border:none;color:#fff;" onclick="apMarkReady(\'' + safeId + '\',this)">Mark Ready</button>';
      }
      if (r.status !== 'Paid') {
        actions += '<button class="btn me-1 fw-bold" style="font-size:.7rem;padding:2px 7px;border-radius:5px;background:#e8a820;border:none;color:#fff;" onclick="openLinkCheckModal(\'' + safeId + '\',\'' + r.subId + '\',\'' + r.wpId + '\',\'' + fmt(r.amount).replace(/'/g,"") + '\')">Link Check</button>';
      }
      if (r.checkId) {
        actions += '<button class="btn me-1" style="font-size:.7rem;padding:2px 7px;border-radius:5px;border:1px solid #dc3545;background:transparent;color:#dc3545;" onclick="apUnlinkCheck(\'' + safeId + '\',this)">Unlink</button>';
      }
    }
    actions += '<button class="btn" style="font-size:.7rem;padding:2px 7px;border-radius:5px;border:1px solid #94a3b8;background:transparent;color:#64748b;" onclick="generateWpPdf(\'' + safeWpId + '\',this)">PDF</button>';
    return '<tr>' +
      '<td class="ps-3"><div class="fw-bold small">' + r.wpLabel + '</div><div class="text-muted" style="font-size:.72rem;">' + r.subName + ' · ' + r.wpId + '</div></td>' +
      '<td class="small">' + r.project + '</td>' +
      '<td class="small"><div>' + r.label + '</div><div class="text-muted" style="font-size:.72rem;">Seq ' + r.seq + ' · Target ' + r.targetPct + '%</div></td>' +
      '<td class="text-end small fw-bold">' + fmt(r.amount) + '</td>' +
      '<td class="text-center">' + badge + '</td>' +
      '<td class="small">' + checkCell + '</td>' +
      '<td class="text-center pe-3" style="white-space:nowrap;">' + actions + '</td>' +
      '</tr>';
  }).join('');
}

function applySubApFilters() {
  var filters = {
    subId:      document.getElementById('ap-filter-sub').value,
    project:    document.getElementById('ap-filter-project').value,
    statuses:   Array.from(document.querySelectorAll('.ap-status-check:checked')).map(function(el) { return el.value; }),
    showVoided: document.getElementById('apst-voided').checked
  };
  loadSubApData(filters);
}

function resetSubApFilters() {
  document.getElementById('ap-filter-sub').value = '';
  document.getElementById('ap-filter-project').value = '';
  document.querySelectorAll('.ap-status-check').forEach(function(cb) { cb.checked = cb.value !== 'Voided'; });
  loadSubApData({});
}

function apMarkReady(milId, btn) {
  if (!confirm('Mark milestone ' + milId + ' as Ready to Pay?')) return;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
  google.script.run
    .withSuccessHandler(function() { showToast('Milestone ' + milId + ' marked Ready to Pay.', 'success'); loadSubApData({}); })
    .withFailureHandler(function(err) { showToast(err.message, 'danger'); btn.disabled = false; btn.textContent = 'Mark Ready'; })
    .markMilestoneReady(milId, userProfile.email);
}

function renderSubApTable(wps) {
  const tbody = document.getElementById('sub-ap-tbody');
  if (!tbody) return;
  const fmt = function(n) { return '₱' + (Number(n)||0).toLocaleString(undefined, {minimumFractionDigits:2}); };
  const canExpand = userProfile && userProfile.allowedTabs &&
    userProfile.allowedTabs.some(function(t) { return t.trim().toLowerCase() === 'subcontractor'; });
  if (!wps.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted">No work packages yet.</td></tr>';
    return;
  }
  tbody.innerHTML = wps.map(function(wp) {
    var safeId = wp.wpId.replace(/[^a-zA-Z0-9\-]/g, '');
    var expandBtn = canExpand
      ? '<button class="btn btn-outline-secondary" style="font-size:0.72rem;padding:2px 8px;border-radius:6px;" ' +
        'id="sub-ap-expand-' + safeId + '" onclick="toggleWpDetails(\'' + safeId + '\')">Milestones ▾</button>'
      : '';
    return '<tr id="sub-ap-row-' + safeId + '">' +
        '<td class="ps-3 fw-bold small">' + wp.wpId + '</td>' +
        '<td class="small">' + wp.subName + '</td>' +
        '<td class="small">' + wp.project + '</td>' +
        '<td class="small">' + wp.label + '</td>' +
        '<td class="small text-muted">' + (wp.basis || '—') + '</td>' +
        '<td class="text-end small fw-bold">' + fmt(wp.contractValue) + '</td>' +
        '<td class="text-center"><span class="badge ' + (wp.status === 'Open' ? 'bg-success' : 'bg-secondary') + '">' + wp.status + '</span></td>' +
        '<td class="text-center pe-3">' + expandBtn + '</td>' +
      '</tr>' +
      '<tr id="sub-ap-milrow-' + safeId + '" style="display:none;">' +
        '<td colspan="8" style="padding:0; background:#f8fafc;">' +
          '<div id="sub-ap-mildetail-' + safeId + '" class="px-4 py-3"></div>' +
        '</td>' +
      '</tr>';
  }).join('');
}

// ── Subcontractor CRUD Modal ─────────────────────────────────────────
function openSubcontractorCrud() {
  loadSubcontractorList();
  new bootstrap.Modal(document.getElementById('subconCrudModal')).show();
}

function loadSubcontractorList() {
  const listEl = document.getElementById('subcon-list');
  if (!listEl) return;
  listEl.innerHTML = '<p class="text-muted small py-2 text-center"><span class="spinner-border spinner-border-sm me-1"></span>Loading...</p>';
  google.script.run
    .withSuccessHandler(function(data) { renderSubconList(data || []); })
    .withFailureHandler(function(err) {
      listEl.innerHTML = '<p class="text-danger small py-2">' + err.message + '</p>';
    })
    .getSubcontractors();
}

function renderSubconList(subs) {
  const listEl = document.getElementById('subcon-list');
  if (!subs.length) {
    listEl.innerHTML = '<p class="text-muted small py-2 text-center">No subcontractors yet.</p>';
    return;
  }
  listEl.innerHTML = subs.map(function(s) {
    return '<div class="d-flex align-items-center justify-content-between py-2 border-bottom ' + (s.active ? '' : 'opacity-50') + '">' +
      '<div>' +
        '<div class="fw-bold small">' + s.name + '</div>' +
        '<div class="text-muted" style="font-size:0.75rem;">' + (s.tin ? 'TIN: ' + s.tin : '') + (s.contact ? (s.tin ? ' · ' : '') + s.contact : '') + '</div>' +
      '</div>' +
      '<button type="button" class="btn btn-sm ' + (s.active ? 'btn-outline-danger' : 'btn-outline-success') + '" ' +
        'onclick="doToggleSubActive(\'' + s.subId + '\',' + s.active + ')" style="font-size:0.75rem; border-radius:6px;">' +
        (s.active ? 'Retire' : 'Reactivate') +
      '</button>' +
      '</div>';
  }).join('');
}

function doToggleSubActive(subId, currentActive) {
  if (!confirm((currentActive ? 'Retire' : 'Reactivate') + ' this subcontractor?')) return;
  google.script.run
    .withSuccessHandler(function() {
      showToast('Subcontractor updated.', 'success');
      loadSubcontractorList();
    })
    .withFailureHandler(function(err) { showToast(err.message, 'danger'); })
    .toggleSubcontractorActive(subId, userProfile.email);
}

function submitNewSubcontractor() {
  const name    = (document.getElementById('subcon-new-name').value    || '').trim();
  const tin     = (document.getElementById('subcon-new-tin').value     || '').trim();
  const contact = (document.getElementById('subcon-new-contact').value || '').trim();
  const alertEl = document.getElementById('subcon-form-alert');
  const btn     = document.getElementById('subcon-save-btn');

  alertEl.style.display = 'none';
  if (!name) {
    alertEl.textContent = 'Name is required.';
    alertEl.className = 'alert alert-warning py-2 mb-2';
    alertEl.style.display = '';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';

  google.script.run
    .withSuccessHandler(function(result) {
      showToast('Subcontractor "' + result.name + '" created.', 'success');
      document.getElementById('subcon-new-name').value    = '';
      document.getElementById('subcon-new-tin').value     = '';
      document.getElementById('subcon-new-contact').value = '';
      btn.disabled = false;
      btn.innerHTML = 'Save';
      loadSubcontractorList();
    })
    .withFailureHandler(function(err) {
      alertEl.textContent = err.message;
      alertEl.className = 'alert alert-danger py-2 mb-2';
      alertEl.style.display = '';
      btn.disabled = false;
      btn.innerHTML = 'Save';
    })
    .saveSubcontractor({ name: name, tin: tin, contact: contact }, userProfile.email);
}

// ── Assign Work Package ──────────────────────────────────────────────
function initAssignWp() {
  _wpBoqLines  = [];
  _wpBoqClaimed = {};

  var projSel = document.getElementById('wp-project');
  var subSel  = document.getElementById('wp-sub');
  projSel.innerHTML = '<option value="">— Select Project —</option>';
  subSel.innerHTML  = '<option value="">— Select Subcontractor —</option>';

  document.getElementById('wp-basis').value            = '';
  document.getElementById('wp-label').value            = '';
  document.getElementById('wp-contract-value').value   = '';
  document.getElementById('wp-contract-pdf').value     = '';
  document.getElementById('wp-boq-picker-wrap').style.display = 'none';
  document.getElementById('wp-boq-picker-body').innerHTML     = '';
  document.getElementById('wp-boq-running-total').textContent = '';
  var _srch = document.getElementById('wp-boq-search'); if (_srch) _srch.value = '';
  document.getElementById('wp-milestonesContainer').innerHTML = '';
  document.getElementById('wp-milestoneTotal').textContent    = 'Total Payment: 0%';
  document.getElementById('wp-milestoneTotal').className      = 'badge bg-secondary';
  document.getElementById('wp-milestoneAmtTotal').textContent = 'Total: ₱0.00';
  document.getElementById('wp-form-alert').style.display      = 'none';
  document.getElementById('wp-quick-add-sub').style.display   = 'none';

  google.script.run
    .withSuccessHandler(function(projects) {
      (projects || []).forEach(function(p) {
        var opt = document.createElement('option');
        opt.value = opt.textContent = p;
        projSel.appendChild(opt);
      });
      colorizeProjectSelect(projSel);
      whenProjectMapReady(function(){ setupProjectDropdownHighlight(projSel); });
    })
    .withFailureHandler(function(err) { showToast('Could not load projects: ' + err.message, 'danger'); })
    .getProjectsListOnly();

  google.script.run
    .withSuccessHandler(function(subs) {
      (subs || []).filter(function(s) { return s.active; }).forEach(function(s) {
        var opt = document.createElement('option');
        opt.value = s.subId;
        opt.textContent = s.name;
        subSel.appendChild(opt);
      });
    })
    .withFailureHandler(function(err) { showToast('Could not load subcontractors: ' + err.message, 'danger'); })
    .getSubcontractors();
}

function onWpProjectChange() {
  var project    = document.getElementById('wp-project').value;
  var pickerWrap = document.getElementById('wp-boq-picker-wrap');
  var pickerBody = document.getElementById('wp-boq-picker-body');

  _wpBoqLines  = [];
  _wpBoqClaimed = {};
  pickerBody.innerHTML = '';
  document.getElementById('wp-boq-running-total').textContent = '';
  var _srch2 = document.getElementById('wp-boq-search'); if (_srch2) _srch2.value = '';

  if (!project) { pickerWrap.style.display = 'none'; return; }

  pickerWrap.style.display = '';
  pickerBody.innerHTML = '<p class="text-muted small"><span class="spinner-border spinner-border-sm me-1"></span>Loading BOQ lines...</p>';

  google.script.run
    .withSuccessHandler(function(result) {
      _wpBoqLines  = (result && result.lines)   || [];
      _wpBoqClaimed = (result && result.claimed) || {};
      renderWpBoqPicker();
    })
    .withFailureHandler(function(err) {
      pickerBody.innerHTML = '<p class="text-danger small">' + err.message + '</p>';
    })
    .getBoqLinesForAssignment(project);
}

function onWpBasisChange() {
  renderWpBoqPicker();
}

// Escape a value for use in an HTML attribute
function _escAttr(s) {
  return (s || '').toString()
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderWpBoqPicker() {
  var pickerBody = document.getElementById('wp-boq-picker-body');
  if (!_wpBoqLines.length) {
    pickerBody.innerHTML = '<p class="text-muted small">No BOQ lines found for this project.</p>';
    document.getElementById('wp-boq-running-total').textContent = '';
    return;
  }

  var basis = document.getElementById('wp-basis').value;
  var fmt   = function(n) { return '₱' + (Number(n)||0).toLocaleString(undefined, {minimumFractionDigits:2}); };

  // Group: phase → scope → lines (preserve insertion order for phases)
  var grouped    = {};
  var phaseOrder = [];
  _wpBoqLines.forEach(function(line) {
    var phase = cleanBulletsWp_(line.phase) || 'General';
    var scope = cleanBulletsWp_(line.scope) || 'General';
    if (!grouped[phase]) { grouped[phase] = {}; phaseOrder.push(phase); }
    if (!grouped[phase][scope]) grouped[phase][scope] = [];
    grouped[phase][scope].push(line);
  });

  var phaseIdx = 0;
  var scopeIdx = 0;
  var html = '<div style="max-height:340px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:8px;">';
  html += '<table class="table table-sm mb-0" id="wp-boq-table" style="font-size:0.78rem;">';
  html += '<thead style="position:sticky; top:0; background:#f8fafc; z-index:1;"><tr>' +
    '<th style="width:32px;"></th><th>Item</th><th class="text-end pe-2">Cost</th></tr></thead><tbody>';

  phaseOrder.sort().forEach(function(phase) {
    var pi           = phaseIdx++;
    var encodedPhase = _escAttr(phase);

    // Determine if the phase has any available (non-claimed) items for the checkbox
    var phaseHasAvailable = Object.keys(grouped[phase]).some(function(sc) {
      return grouped[phase][sc].some(function(l) { return !_wpBoqClaimed[l.key]; });
    });
    var phaseCbHtml = phaseHasAvailable
      ? '<input type="checkbox" class="form-check-input wp-phase-all-cb" data-pi="' + pi + '" ' +
        'title="Select / deselect all in phase" ' +
        'style="cursor:pointer;margin:0;accent-color:#e8a820;" ' +
        'onclick="toggleWpPhaseAll(' + pi + ')">'
      : '';

    // Phase header: checkbox cell + name cell (both navy)
    html += '<tr data-row-type="phase" data-pi="' + pi + '" data-phase-key="' + encodedPhase + '">' +
      '<td style="background:#1d3461; padding:6px 8px; vertical-align:middle; width:32px;">' + phaseCbHtml + '</td>' +
      '<td colspan="2" style="background:#1d3461; color:#fff; font-weight:700; font-size:0.72rem; text-transform:uppercase; padding:6px 10px; letter-spacing:0.04em;">' + phase + '</td></tr>';

    Object.keys(grouped[phase]).sort().forEach(function(scope) {
      var si           = scopeIdx++;
      var hasAvailable = grouped[phase][scope].some(function(l) { return !_wpBoqClaimed[l.key]; });

      var scopeCbHtml = hasAvailable
        ? '<input type="checkbox" class="form-check-input wp-scope-all-cb" data-si="' + si + '" ' +
          'title="Select / deselect all in scope" style="cursor:pointer;margin:0;" ' +
          'onclick="toggleWpScopeAll(' + si + ')">'
        : '';
      html += '<tr data-row-type="scope" data-si="' + si + '" data-pi="' + pi + '" data-phase-key="' + encodedPhase + '">' +
        '<td style="background:#f1f5f9; padding:4px 8px; vertical-align:middle;">' + scopeCbHtml + '</td>' +
        '<td colspan="2" style="background:#f1f5f9; color:#475569; font-weight:600; font-size:0.72rem; padding:4px 10px 4px 14px;">' + scope + '</td></tr>';

      grouped[phase][scope].forEach(function(line) {
        var cost        = basis === 'labor' ? line.costLabor : basis === 'material' ? line.costMaterial : line.costTotal;
        var isClaimed   = !!_wpBoqClaimed[line.key];
        var displayItem = cleanBulletsWp_(line.item);
        var searchText  = _escAttr((displayItem + ' ' + scope + ' ' + phase).toLowerCase());

        if (isClaimed) {
          html += '<tr data-row-type="item" data-si="' + si + '" data-pi="' + pi + '" data-phase-key="' + encodedPhase + '" data-search="' + searchText + '" style="opacity:0.45;">' +
            '<td><input type="checkbox" class="form-check-input wp-boq-check" data-key="' + line.key + '" disabled></td>' +
            '<td style="padding-left:24px;">' + displayItem + ' <span class="text-muted" style="font-size:0.7rem;">(' + _wpBoqClaimed[line.key] + ')</span></td>' +
            '<td class="text-end pe-2 text-muted">' + fmt(cost) + '</td></tr>';
        } else {
          html += '<tr data-row-type="item" data-si="' + si + '" data-pi="' + pi + '" data-phase-key="' + encodedPhase + '" data-search="' + searchText + '">' +
            '<td><input type="checkbox" class="form-check-input wp-boq-check" data-key="' + line.key + '" onchange="_onWpItemCheck(this,' + si + ',' + pi + ')"></td>' +
            '<td style="padding-left:24px;">' + displayItem + '</td>' +
            '<td class="text-end pe-2">' + fmt(cost) + '</td></tr>';
        }
      });
    });
  });

  html += '</tbody></table></div>';
  pickerBody.innerHTML = html;
  updateWpBoqRunningTotal();
  filterWpBoqPicker();
}

function updateWpBoqRunningTotal() {
  // Counts ALL checked boxes, including those hidden by the search filter
  var basis   = document.getElementById('wp-basis').value;
  var checked = document.querySelectorAll('#wp-boq-picker-body .wp-boq-check:checked');
  var total   = 0;
  checked.forEach(function(cb) {
    var line = _wpBoqLines.find(function(l) { return l.key === cb.dataset.key; });
    if (!line) return;
    total += basis === 'labor' ? line.costLabor : basis === 'material' ? line.costMaterial : line.costTotal;
  });
  var fmt = function(n) { return '₱' + (Number(n)||0).toLocaleString(undefined, {minimumFractionDigits:2}); };
  var el  = document.getElementById('wp-boq-running-total');
  el.textContent = checked.length ? 'Selected BOQ total (' + (basis || 'total') + '): ' + fmt(total) : '';
}

// Called when an individual item checkbox changes
function _onWpItemCheck(cb, si, pi) {
  updateWpBoqRunningTotal();
  _updateWpScopeCbState(si);
  _updateWpPhaseCbState(pi);
}

// ── Search filter ────────────────────────────────────────────────────
function filterWpBoqPicker() {
  var searchEl = document.getElementById('wp-boq-search');
  var term     = searchEl ? searchEl.value.trim().toLowerCase() : '';
  var table    = document.getElementById('wp-boq-table');
  if (!table) return;

  var siVisible    = {};
  var phaseVisible = {};

  table.querySelectorAll('tr[data-row-type="item"]').forEach(function(row) {
    var match = !term || (row.dataset.search || '').includes(term);
    row.style.display = match ? '' : 'none';
    if (match) {
      siVisible[row.dataset.si]          = true;
      phaseVisible[row.dataset.phaseKey] = true;
    }
  });

  table.querySelectorAll('tr[data-row-type="scope"]').forEach(function(row) {
    row.style.display = (!term || siVisible[row.dataset.si]) ? '' : 'none';
  });

  table.querySelectorAll('tr[data-row-type="phase"]').forEach(function(row) {
    row.style.display = (!term || phaseVisible[row.dataset.phaseKey]) ? '' : 'none';
  });
}

// ── Phase-level select all ────────────────────────────────────────────
function toggleWpPhaseAll(pi) {
  // Acts on ALL available items in the phase regardless of search filter
  var itemCbs = document.querySelectorAll(
    '#wp-boq-picker-body tr[data-row-type="item"][data-pi="' + pi + '"] .wp-boq-check:not(:disabled)');
  if (!itemCbs.length) return;

  var allChecked = Array.from(itemCbs).every(function(cb) { return cb.checked; });
  var target     = !allChecked;
  itemCbs.forEach(function(cb) { cb.checked = target; });

  // Sync every scope checkbox under this phase
  document.querySelectorAll('tr[data-row-type="scope"][data-pi="' + pi + '"] .wp-scope-all-cb')
    .forEach(function(scopeCb) { scopeCb.checked = target; scopeCb.indeterminate = false; });

  // Sync phase checkbox itself
  var phaseCb = document.querySelector('.wp-phase-all-cb[data-pi="' + pi + '"]');
  if (phaseCb) { phaseCb.checked = target; phaseCb.indeterminate = false; }

  updateWpBoqRunningTotal();
}

function _updateWpPhaseCbState(pi) {
  var phaseCb = document.querySelector('.wp-phase-all-cb[data-pi="' + pi + '"]');
  if (!phaseCb) return;
  var itemCbs = document.querySelectorAll(
    '#wp-boq-picker-body tr[data-row-type="item"][data-pi="' + pi + '"] .wp-boq-check:not(:disabled)');
  if (!itemCbs.length) return;
  var checkedCount = Array.from(itemCbs).filter(function(cb) { return cb.checked; }).length;
  if (checkedCount === 0) {
    phaseCb.checked = false; phaseCb.indeterminate = false;
  } else if (checkedCount === itemCbs.length) {
    phaseCb.checked = true;  phaseCb.indeterminate = false;
  } else {
    phaseCb.indeterminate = true;
  }
}

// ── Scope-level select all ───────────────────────────────────────────
function toggleWpScopeAll(si) {
  // Acts on ALL available items in the scope regardless of search filter
  var itemCbs = document.querySelectorAll(
    '#wp-boq-picker-body tr[data-row-type="item"][data-si="' + si + '"] .wp-boq-check:not(:disabled)');
  if (!itemCbs.length) return;

  var allChecked = Array.from(itemCbs).every(function(cb) { return cb.checked; });
  var target     = !allChecked;
  itemCbs.forEach(function(cb) { cb.checked = target; });

  // Sync scope checkbox
  var scopeCb = document.querySelector('.wp-scope-all-cb[data-si="' + si + '"]');
  if (scopeCb) { scopeCb.checked = target; scopeCb.indeterminate = false; }

  // Update parent phase checkbox to reflect the new aggregate state
  var scopeRow = document.querySelector('tr[data-row-type="scope"][data-si="' + si + '"]');
  if (scopeRow) _updateWpPhaseCbState(scopeRow.dataset.pi);

  updateWpBoqRunningTotal();
}

function _updateWpScopeCbState(si) {
  var scopeCb = document.querySelector('.wp-scope-all-cb[data-si="' + si + '"]');
  if (!scopeCb) return;
  var itemCbs = document.querySelectorAll(
    '#wp-boq-picker-body tr[data-row-type="item"][data-si="' + si + '"] .wp-boq-check:not(:disabled)');
  if (!itemCbs.length) return;
  var checkedCount = Array.from(itemCbs).filter(function(cb) { return cb.checked; }).length;
  if (checkedCount === 0) {
    scopeCb.checked = false; scopeCb.indeterminate = false;
  } else if (checkedCount === itemCbs.length) {
    scopeCb.checked = true;  scopeCb.indeterminate = false;
  } else {
    scopeCb.indeterminate = true;
  }
}

// ── WP Milestone Widget ──────────────────────────────────────────────
function addWpMilestoneRow() {
  var container = document.getElementById('wp-milestonesContainer');
  var row = document.createElement('div');
  row.className = 'mb-2 milestone-row';
  row.innerHTML =
    '<div class="row g-1 align-items-center">' +
      '<div class="col">' +
        '<input type="text" class="form-control form-control-sm wp-mil-label" placeholder="Label *">' +
      '</div>' +
      '<div class="col-2">' +
        '<input type="number" class="form-control form-control-sm wp-mil-target" placeholder="%" min="1" max="100" step="any" oninput="clampPct(this); calcWpMilestoneTotal()">' +
      '</div>' +
      '<div class="col-2">' +
        '<input type="number" class="form-control form-control-sm wp-mil-payment" placeholder="%" min="0.01" max="100" step="any" oninput="clampPct(this); calcWpMilestoneTotal()">' +
      '</div>' +
      '<div class="col-3">' +
        '<input type="text" class="form-control form-control-sm wp-mil-amount" placeholder="₱0.00" readonly style="background:#f8fafc; color:#1d3461; font-weight:700; font-size:0.78rem;">' +
      '</div>' +
      '<div class="col-auto">' +
        '<button type="button" class="btn btn-sm btn-outline-danger" onclick="removeWpMilestoneRow(this)">✕</button>' +
      '</div>' +
    '</div>';
  container.appendChild(row);
  calcWpMilestoneTotal();
}

function removeWpMilestoneRow(btn) {
  btn.closest('.milestone-row').remove();
  calcWpMilestoneTotal();
}

function recomputeWpMilestoneAmounts() {
  calcWpMilestoneTotal();
}

function calcWpMilestoneTotal() {
  var container = document.getElementById('wp-milestonesContainer');
  var badge     = document.getElementById('wp-milestoneTotal');
  var amtEl     = document.getElementById('wp-milestoneAmtTotal');
  if (!container || !badge) return;

  var rawCv         = (document.getElementById('wp-contract-value').value || '').replace(/,/g, '');
  var contractValue = parseFloat(rawCv) || 0;
  var fmt           = function(n) { return '₱' + (Number(n)||0).toLocaleString(undefined, {minimumFractionDigits:2}); };

  var totalPct = 0;
  var totalAmt = 0;

  container.querySelectorAll('.milestone-row').forEach(function(row) {
    var pctInput = row.querySelector('.wp-mil-payment');
    var amtInput = row.querySelector('.wp-mil-amount');
    var pct      = parseFloat(pctInput.value) || 0;
    totalPct += pct;
    var amt = (contractValue > 0 && pct > 0) ? Math.round(pct / 100 * contractValue * 100) / 100 : 0;
    totalAmt += amt;
    amtInput.value = (contractValue > 0 && pct > 0) ? fmt(amt) : '';
  });

  badge.textContent = 'Total Payment: ' + totalPct + '%';
  badge.className   = 'badge ' + (Math.round(totalPct * 100) === 10000 ? 'bg-success' : 'bg-secondary');
  amtEl.textContent = 'Total: ' + fmt(totalAmt);
}

// ── Quick-add sub inside Assign WP ───────────────────────────────────
function toggleWpQuickAddSub() {
  var panel = document.getElementById('wp-quick-add-sub');
  var isHidden = panel.style.display === 'none';
  panel.style.display = isHidden ? '' : 'none';
  if (isHidden) {
    document.getElementById('wp-quick-add-alert').style.display = 'none';
    document.getElementById('wp-qa-name').value    = '';
    document.getElementById('wp-qa-tin').value     = '';
    document.getElementById('wp-qa-contact').value = '';
  }
}

function submitWpQuickAddSub() {
  var name    = (document.getElementById('wp-qa-name').value    || '').trim();
  var tin     = (document.getElementById('wp-qa-tin').value     || '').trim();
  var contact = (document.getElementById('wp-qa-contact').value || '').trim();
  var alertEl = document.getElementById('wp-quick-add-alert');
  var btn     = document.getElementById('wp-qa-save-btn');

  alertEl.style.display = 'none';
  if (!name) {
    alertEl.textContent = 'Name is required.';
    alertEl.className = 'alert alert-warning py-2 mb-2';
    alertEl.style.display = '';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>';

  google.script.run
    .withSuccessHandler(function(result) {
      var subSel = document.getElementById('wp-sub');
      var opt = document.createElement('option');
      opt.value = result.subId;
      opt.textContent = result.name;
      subSel.appendChild(opt);
      subSel.value = result.subId;
      showToast('Subcontractor "' + result.name + '" added.', 'success');
      toggleWpQuickAddSub();
      btn.disabled = false;
      btn.innerHTML = 'Save Sub';
    })
    .withFailureHandler(function(err) {
      alertEl.textContent = err.message;
      alertEl.className = 'alert alert-danger py-2 mb-2';
      alertEl.style.display = '';
      btn.disabled = false;
      btn.innerHTML = 'Save Sub';
    })
    .saveSubcontractor({ name: name, tin: tin, contact: contact }, userProfile.email);
}

// ── Submit Work Package ──────────────────────────────────────────────
async function submitWorkPackage() {
  var btn     = document.getElementById('wp-submit-btn');
  var alertEl = document.getElementById('wp-form-alert');

  function showWpErr(msg) {
    alertEl.textContent = msg;
    alertEl.className   = 'alert alert-danger py-2 mt-2';
    alertEl.style.display = '';
    alertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  alertEl.style.display = 'none';

  var project       = document.getElementById('wp-project').value;
  var subId         = document.getElementById('wp-sub').value;
  var basis         = document.getElementById('wp-basis').value;
  var label         = (document.getElementById('wp-label').value || '').trim();
  var rawCv         = (document.getElementById('wp-contract-value').value || '').replace(/,/g, '');
  var contractValue = parseFloat(rawCv) || 0;

  if (!project)           { showWpErr('Please select a project.'); return; }
  if (!subId)             { showWpErr('Please select a subcontractor.'); return; }
  if (!label)             { showWpErr('Work package label is required.'); return; }
  if (contractValue <= 0) { showWpErr('Contract value must be greater than 0.'); return; }

  // Collect selected BOQ lines
  var checkedBoxes = document.querySelectorAll('#wp-boq-picker-body .wp-boq-check:checked');
  if (!checkedBoxes.length) { showWpErr('Please select at least one BOQ line.'); return; }

  var lines = Array.from(checkedBoxes).map(function(cb) {
    return _wpBoqLines.find(function(l) { return l.key === cb.dataset.key; });
  }).filter(Boolean).map(function(l) {
    return { phase: l.phase, scope: l.scope, item: l.item, costLabor: l.costLabor, costMaterial: l.costMaterial, costTotal: l.costTotal };
  });

  // Collect milestones
  var milRows = document.querySelectorAll('#wp-milestonesContainer .milestone-row');
  if (!milRows.length) { showWpErr('At least one milestone is required.'); return; }

  var milestones = [];
  var milErr = null;
  milRows.forEach(function(row, i) {
    if (milErr) return;
    var milLabel   = (row.querySelector('.wp-mil-label').value   || '').trim();
    var targetPct  = parseFloat(row.querySelector('.wp-mil-target').value)  || 0;
    var paymentPct = parseFloat(row.querySelector('.wp-mil-payment').value) || 0;
    if (!milLabel)    { milErr = 'Milestone ' + (i+1) + ': label is required.'; return; }
    if (targetPct <= 0)  { milErr = 'Milestone ' + (i+1) + ': Target % must be > 0.'; return; }
    if (paymentPct <= 0) { milErr = 'Milestone ' + (i+1) + ': Payment % must be > 0.'; return; }
    milestones.push({ seq: i + 1, label: milLabel, targetPct: targetPct, paymentPct: paymentPct });
  });
  if (milErr) { showWpErr(milErr); return; }

  var paymentSum = milestones.reduce(function(s, m) { return s + m.paymentPct; }, 0);
  if (Math.round(paymentSum * 100) !== 10000) {
    showWpErr('Milestone payment percentages must sum to exactly 100%. Current total: ' + paymentSum.toFixed(2) + '%.');
    return;
  }

  // Contract PDF (optional)
  var contractFile = null;
  var fileInput = document.getElementById('wp-contract-pdf');
  if (fileInput.files.length) {
    try {
      var base64 = await toBase64(fileInput.files[0]);
      contractFile = { name: fileInput.files[0].name, mimeType: fileInput.files[0].type, data: base64.split(',')[1] };
    } catch(e) { showWpErr('Could not read file: ' + e.message); return; }
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';

  var payload = { project: project, subId: subId, label: label, basis: basis, contractValue: contractValue, contractFile: contractFile, lines: lines, milestones: milestones };

  google.script.run
    .withSuccessHandler(function(result) {
      showToast('Work Package ' + result.wpId + ' saved (' + result.saved + ' lines).', 'success');
      initAssignWp();
      btn.disabled = false;
      btn.innerHTML = 'Save Work Package';
    })
    .withFailureHandler(function(err) {
      showWpErr(err.message);
      btn.disabled = false;
      btn.innerHTML = 'Save Work Package';
    })
    .saveWorkPackage(payload, userProfile.email);
}

// =========================
// SUBCONTRACTOR MODULE — PHASE 2: REPORTS & FLAGGING
// =========================

var _rptAllReports = [];
var _rptProjects   = [];

function isAdminUser_() {
  return !!(userProfile && userProfile.role &&
    String(userProfile.role).trim().toLowerCase() === 'admin');
}

// ── Subcontractor AP: expand milestones per WP row ─────────────────

function toggleWpDetails(wpId) {
  var milRow    = document.getElementById('sub-ap-milrow-' + wpId);
  var btn       = document.getElementById('sub-ap-expand-' + wpId);
  if (!milRow) return;
  var nowHidden = milRow.style.display === 'none';
  milRow.style.display = nowHidden ? '' : 'none';
  if (btn) btn.textContent = nowHidden ? 'Milestones ▴' : 'Milestones ▾';
  if (nowHidden) {
    var detailDiv = document.getElementById('sub-ap-mildetail-' + wpId);
    if (detailDiv && !detailDiv.dataset.loaded) {
      loadWpMilestonesDetail_(wpId, detailDiv);
    }
  }
}

function loadWpMilestonesDetail_(wpId, detailDiv) {
  detailDiv.innerHTML = '<p class="text-muted small mb-0"><span class="spinner-border spinner-border-sm me-1"></span>Loading milestones...</p>';
  google.script.run
    .withSuccessHandler(function(mils) {
      detailDiv.dataset.loaded = '1';
      if (!mils || !mils.length) {
        detailDiv.innerHTML = '<p class="text-muted small mb-0">No milestones defined.</p>';
        return;
      }
      var fmt = function(n) { return '₱' + (Number(n)||0).toLocaleString(undefined, {minimumFractionDigits:2}); };
      var canMark = userProfile && userProfile.allowedTabs &&
        userProfile.allowedTabs.some(function(t) { return t.trim().toLowerCase() === 'subcontractor'; });
      var rows = mils.map(function(m) {
        var badge = m.readyToPay
          ? '<span class="badge" style="background:#e8a820; color:#fff;">Ready to Pay</span>'
          : '<span class="badge bg-light text-muted border" style="font-size:0.7rem;">Pending</span>';
        var markBtn = (canMark && !m.readyToPay && !m.checkId)
          ? '<button class="btn ms-1 fw-bold" id="mkr-' + m.milId + '" style="font-size:0.7rem;padding:2px 8px;border-radius:6px;background:#1d3461;border:none;color:#fff;" ' +
            'onclick="doMarkMilestoneReady(\'' + m.milId + '\',this)">Mark Ready</button>'
          : '';
        return '<tr style="font-size:0.78rem;">' +
          '<td class="ps-2 text-muted" style="white-space:nowrap;">' + m.milId + '</td>' +
          '<td>' + m.label + '</td>' +
          '<td class="text-center">' + m.targetPct + '%</td>' +
          '<td class="text-end">' + fmt(m.amount) + '</td>' +
          '<td class="text-center" style="white-space:nowrap;">' + badge + markBtn + '</td>' +
          '</tr>';
      }).join('');
      detailDiv.innerHTML =
        '<table class="table table-sm mb-0" style="font-size:0.78rem;">' +
        '<thead><tr style="font-size:0.7rem;text-transform:uppercase;color:#94a3b8;">' +
        '<th class="ps-2">MIL ID</th><th>Label</th><th class="text-center">Target %</th>' +
        '<th class="text-end">Amount</th><th class="text-center">Status</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>';
    })
    .withFailureHandler(function(err) {
      detailDiv.innerHTML = '<p class="text-danger small mb-0">' + err.message + '</p>';
    })
    .getWpMilestonesForAp(wpId);
}

function doMarkMilestoneReady(milId, btn) {
  if (!confirm('Mark milestone ' + milId + ' as Ready to Pay?')) return;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
  google.script.run
    .withSuccessHandler(function() {
      showToast('Milestone ' + milId + ' marked Ready to Pay.', 'success');
      var detailDiv = document.getElementById(btn.id.replace('mkr-', 'sub-ap-mildetail-').replace(/-MIL-.*/, ''));
      // Re-find the containing detailDiv
      var el = btn.closest('[id^="sub-ap-mildetail-"]');
      if (el) { delete el.dataset.loaded; loadWpMilestonesDetail_(el.id.replace('sub-ap-mildetail-', ''), el); }
    })
    .withFailureHandler(function(err) {
      showToast(err.message, 'danger');
      btn.disabled = false;
      btn.textContent = 'Mark Ready';
    })
    .markMilestoneReady(milId, userProfile.email);
}

// ── Subcontractor Reports section ──────────────────────────────────

function initSubconReports() {
  var tbody = document.getElementById('rpt-table-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4"><span class="spinner-border spinner-border-sm me-2"></span>Loading...</td></tr>';

  google.script.run
    .withSuccessHandler(function(result) {
      _rptAllReports = result.reports || [];
      _rptProjects   = result.projects || [];

      // Populate project filter
      var projSel = document.getElementById('rpt-filter-project');
      projSel.innerHTML = '<option value="">All Projects</option>';
      _rptProjects.forEach(function(p) {
        var opt = document.createElement('option');
        opt.value = opt.textContent = p;
        projSel.appendChild(opt);
      });
      colorizeProjectSelect(projSel);
      whenProjectMapReady(function(){ setupProjectDropdownHighlight(projSel); });
      document.getElementById('rpt-filter-wp').innerHTML = '<option value="">All Work Packages</option>';
      document.getElementById('rpt-filter-wp').disabled = true;

      renderRptTable(_rptAllReports);
    })
    .withFailureHandler(function(err) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-4">' + err.message + '</td></tr>';
    })
    .getSubconReportsData(userProfile.email, isAdminUser_());
}

function renderRptTable(reports) {
  var tbody = document.getElementById('rpt-table-body');
  if (!tbody) return;
  if (!reports || !reports.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-5 text-muted">No reports yet.</td></tr>';
    return;
  }
  tbody.innerHTML = reports.map(function(r) {
    var photosCell = r.photosUrl
      ? '<a href="' + r.photosUrl.split(', ')[0] + '" target="_blank" class="badge bg-secondary text-decoration-none">View</a>'
      : '<span class="text-muted">—</span>';
    var termDisplay = r.paymentTerm ? r.paymentTerm : '<span class="text-muted fst-italic">General</span>';
    return '<tr>' +
      '<td class="ps-3 small" style="white-space:nowrap;">' + r.date + '</td>' +
      '<td class="small">' + r.project + '</td>' +
      '<td class="small">' + r.wpLabel + '</td>' +
      '<td class="small">' + termDisplay + '</td>' +
      '<td class="text-center"><span class="badge bg-primary">' + r.percent + '%</span></td>' +
      '<td class="small">' + (r.reportedByName || r.reportedBy) + '</td>' +
      '<td class="text-center pe-3">' + photosCell + '</td>' +
      '</tr>';
  }).join('');
}

function onRptProjectFilterChange() {
  var project = document.getElementById('rpt-filter-project').value;
  var wpSel   = document.getElementById('rpt-filter-wp');
  wpSel.innerHTML = '<option value="">All Work Packages</option>';
  wpSel.disabled  = !project;
  if (project) {
    var seen = {};
    _rptAllReports.forEach(function(r) {
      if (r.project === project && !seen[r.wpId]) { seen[r.wpId] = r.wpLabel; }
    });
    Object.keys(seen).forEach(function(wpId) {
      var opt = document.createElement('option');
      opt.value = wpId; opt.textContent = seen[wpId];
      wpSel.appendChild(opt);
    });
  }
  filterRptTable();
}

function filterRptTable() {
  var project = document.getElementById('rpt-filter-project').value;
  var wpId    = document.getElementById('rpt-filter-wp').value;
  var filtered = _rptAllReports.filter(function(r) {
    if (project && r.project !== project) return false;
    if (wpId    && r.wpId    !== wpId)    return false;
    return true;
  });
  renderRptTable(filtered);
}

// ── New Report modal ────────────────────────────────────────────────

function openNewSubconReport() {
  document.getElementById('rpt-project').innerHTML   = '<option value="">— Select Project —</option>';
  document.getElementById('rpt-wp').innerHTML        = '<option value="">— Select Work Package —</option>';
  document.getElementById('rpt-wp').disabled         = true;
  document.getElementById('rpt-term').innerHTML      = '<option value="">General work package progress</option>';
  document.getElementById('rpt-term').disabled       = true;
  syncRptPct(0);
  document.getElementById('rpt-narrative').value     = '';
  document.getElementById('rpt-photos').value        = '';
  document.getElementById('rpt-modal-alert').style.display = 'none';
  var btn = document.getElementById('rpt-submit-btn');
  btn.disabled = false; btn.textContent = 'Submit Report';

  var projSel = document.getElementById('rpt-project');
  if (_rptProjects.length) {
    _rptProjects.forEach(function(p) {
      var opt = document.createElement('option');
      opt.value = opt.textContent = p;
      projSel.appendChild(opt);
    });
  } else {
    projSel.innerHTML = '<option value="">Loading...</option>';
    google.script.run
      .withSuccessHandler(function(result) {
        _rptProjects = result.projects || [];
        projSel.innerHTML = '<option value="">— Select Project —</option>';
        _rptProjects.forEach(function(p) {
          var opt = document.createElement('option');
          opt.value = opt.textContent = p;
          projSel.appendChild(opt);
        });
      })
      .withFailureHandler(function() { projSel.innerHTML = '<option value="">Error</option>'; })
      .getSubconReportsData(userProfile.email, isAdminUser_());
  }

  new bootstrap.Modal(document.getElementById('subconReportModal')).show();
}

function onRptModalProjectChange() {
  var project = document.getElementById('rpt-project').value;
  var wpSel   = document.getElementById('rpt-wp');
  var termSel = document.getElementById('rpt-term');
  wpSel.innerHTML  = '<option value="">— Select Work Package —</option>';
  wpSel.disabled   = true;
  termSel.innerHTML = '<option value="">General work package progress</option>';
  termSel.disabled = true;
  if (!project) return;
  wpSel.innerHTML = '<option value="">Loading...</option>';
  google.script.run
    .withSuccessHandler(function(wps) {
      wpSel.innerHTML = '<option value="">— Select Work Package —</option>';
      (wps || []).forEach(function(wp) {
        var opt = document.createElement('option');
        opt.value = wp.wpId; opt.textContent = wp.label;
        wpSel.appendChild(opt);
      });
      wpSel.disabled = false;
    })
    .withFailureHandler(function() {
      wpSel.innerHTML = '<option value="">Error</option>';
    })
    .getWorkPackagesForProject(project);
}

function onRptModalWpChange() {
  var wpId    = document.getElementById('rpt-wp').value;
  var termSel = document.getElementById('rpt-term');
  termSel.innerHTML = '<option value="">General work package progress</option>';
  termSel.disabled  = !wpId;
  if (!wpId) return;
  google.script.run
    .withSuccessHandler(function(mils) {
      (mils || []).forEach(function(m) {
        var opt = document.createElement('option');
        opt.value = m.milId;
        opt.textContent = 'Seq ' + m.seq + ' — ' + m.label;
        termSel.appendChild(opt);
      });
    })
    .withFailureHandler(function() { /* non-critical */ })
    .getMilestonesForWp(wpId);
}

async function submitNewSubconReport() {
  var btn     = document.getElementById('rpt-submit-btn');
  var alertEl = document.getElementById('rpt-modal-alert');
  alertEl.style.display = 'none';

  function showRptErr(msg) {
    alertEl.textContent = msg;
    alertEl.className   = 'alert alert-danger py-2 mb-3';
    alertEl.style.display = '';
  }

  var project     = document.getElementById('rpt-project').value;
  var wpId        = document.getElementById('rpt-wp').value;
  var paymentTerm = document.getElementById('rpt-term').value;
  var percent     = parseInt(document.getElementById('rpt-percent').value) || 0;
  var narrative   = (document.getElementById('rpt-narrative').value || '').trim();

  if (!wpId)      { showRptErr('Please select a work package.'); return; }
  if (!narrative) { showRptErr('Narrative is required.'); return; }

  var photos = [];
  var photoInput = document.getElementById('rpt-photos');
  if (photoInput.files.length) {
    try {
      for (var i = 0; i < photoInput.files.length; i++) {
        var f   = photoInput.files[i];
        var b64 = await toBase64(f);
        photos.push({ name: f.name, mimeType: f.type, data: b64.split(',')[1] });
      }
    } catch(e) { showRptErr('Could not read photo files: ' + e.message); return; }
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Submitting...';

  google.script.run
    .withSuccessHandler(function(result) {
      bootstrap.Modal.getInstance(document.getElementById('subconReportModal')).hide();
      var msg = 'Report ' + result.reportId + ' submitted.';
      if (result.flagged && result.flagged.length) msg += ' ' + result.flagged.length + ' milestone(s) flagged ready to pay.';
      showToast(msg, 'success');
      initSubconReports();
      btn.disabled = false;
      btn.textContent = 'Submit Report';
    })
    .withFailureHandler(function(err) {
      showRptErr(err.message);
      btn.disabled = false;
      btn.textContent = 'Submit Report';
    })
    .submitSubconReport({ wpId: wpId, project: project, paymentTerm: paymentTerm, percentComplete: percent, narrative: narrative, photos: photos }, userProfile.email);
}

// =========================
// SUBCONTRACTOR MODULE — PHASE 3
// =========================

// ── Refinement B: linked slider + number input ────────────────────
function syncRptPct(val) {
  val = Math.max(0, Math.min(100, parseFloat(val) || 0));
  var s = document.getElementById('rpt-percent');
  var n = document.getElementById('rpt-percent-num');
  if (s) s.value = val;
  if (n) n.value = val;
}

// ── Link Check modal ─────────────────────────────────────────────────
function openLinkCheckModal(milId, subId, wpId, amtFmt) {
  var infoEl    = document.getElementById('link-check-modal-info');
  var tableWrap = document.getElementById('link-check-table-wrap');
  var alertEl   = document.getElementById('link-check-modal-alert');
  infoEl.innerHTML  = 'Milestone: <strong>' + milId + '</strong>&nbsp;|&nbsp;Amount: <strong>' + amtFmt + '</strong>';
  tableWrap.innerHTML = '<p class="text-muted small"><span class="spinner-border spinner-border-sm me-1"></span>Loading checks...</p>';
  alertEl.style.display = 'none';
  new bootstrap.Modal(document.getElementById('subconLinkCheckModal')).show();
  google.script.run
    .withSuccessHandler(function(checks) {
      if (!checks || !checks.length) {
        tableWrap.innerHTML = '<p class="text-muted small py-2 text-center">No unlinked checks available for this subcontractor.</p>';
        return;
      }
      var rows = checks.map(function(c) {
        return '<tr>' +
          '<td class="small fw-bold">' + c.checkNumber + '</td>' +
          '<td class="small">' + c.bank + '</td>' +
          '<td class="small">' + c.project + '</td>' +
          '<td class="text-end small">' + c.amountFmt + '</td>' +
          '<td class="small text-muted">' + c.date + '</td>' +
          '<td class="text-center"><button class="btn fw-bold" style="font-size:.7rem;padding:2px 8px;border-radius:5px;background:#1d3461;border:none;color:#fff;" ' +
          'onclick="submitLinkCheck(\'' + milId + '\',\'' + c.checkNumber.replace(/'/g,"\\'") + '\',this)">Select</button></td>' +
          '</tr>';
      }).join('');
      tableWrap.innerHTML = '<div class="table-responsive"><table class="table table-sm table-hover mb-0" style="font-size:.81rem;">' +
        '<thead><tr><th>Check #</th><th>Bank</th><th>Project</th><th class="text-end">Amount</th><th>Date</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    })
    .withFailureHandler(function(err) { tableWrap.innerHTML = '<p class="text-danger small py-2">' + err.message + '</p>'; })
    .getLinkableChecksForSub(subId);
}

function submitLinkCheck(milId, checkId, btn) {
  btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
  var alertEl = document.getElementById('link-check-modal-alert');
  google.script.run
    .withSuccessHandler(function() {
      bootstrap.Modal.getInstance(document.getElementById('subconLinkCheckModal')).hide();
      showToast('Check ' + checkId + ' linked to ' + milId + '.', 'success');
      loadSubApData({});
      initSubconPayables();
    })
    .withFailureHandler(function(err) {
      alertEl.textContent = err.message; alertEl.className = 'alert alert-danger py-2 mb-3'; alertEl.style.display = '';
      btn.disabled = false; btn.textContent = 'Select';
    })
    .linkCheckToMilestone(milId, checkId, userProfile.email);
}

function apUnlinkCheck(milId, btn) {
  if (!confirm('Unlink check from ' + milId + '? Ready To Pay will NOT be restored.')) return;
  btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
  google.script.run
    .withSuccessHandler(function() { showToast('Check unlinked from ' + milId + '.', 'success'); loadSubApData({}); })
    .withFailureHandler(function(err) { showToast(err.message, 'danger'); btn.disabled = false; btn.textContent = 'Unlink'; })
    .unlinkCheckFromMilestone(milId, userProfile.email);
}

function generateWpPdf(wpId, btn) {
  btn.disabled = true; btn.textContent = '…';
  google.script.run
    .withSuccessHandler(function(url) {
      btn.disabled = false; btn.textContent = 'PDF';
      if (url && typeof url === 'string') window.open(url, '_blank');
    })
    .withFailureHandler(function(err) {
      btn.disabled = false; btn.textContent = 'PDF';
      showToast('PDF error: ' + (err && err.message ? err.message : String(err)), 'danger');
    })
    .generateWorkPackagePdf(wpId);
}

// ── Budget vs Actual ─────────────────────────────────────────────────
var _budgetData = null;

function initSubconBudget() {
  var tbody = document.getElementById('budget-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4"><span class="spinner-border spinner-border-sm me-2"></span>Loading...</td></tr>';
  google.script.run
    .withSuccessHandler(function(data) {
      _budgetData = data;
      renderBudgetKpis(data.kpi);
      var ps = document.getElementById('budget-filter-project');
      if (ps && ps.options.length <= 1) {
        (data.projects || []).forEach(function(p) { var o = document.createElement('option'); o.value = o.textContent = p; ps.appendChild(o); });
        colorizeProjectSelect(document.getElementById('budget-filter-project'));
      }
      whenProjectMapReady(function(){ setupProjectDropdownHighlight(ps); });
      renderBudgetTable(data.rows);
    })
    .withFailureHandler(function(err) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger py-4">' + err.message + '</td></tr>';
    })
    .getSubconBudgetData('');
}

function renderBudgetKpis(kpi) {
  if (!kpi) return;
  var fmt = function(n) { return '₱' + (Number(n)||0).toLocaleString(undefined,{minimumFractionDigits:2}); };
  function set(id, val, color) { var el = document.getElementById(id); if (el) { el.textContent = val; if (color) el.style.color = color; } }
  set('bkpi-boq',      fmt(kpi.boq));
  set('bkpi-contract', fmt(kpi.contract));
  set('bkpi-paid',     fmt(kpi.paid));
  set('bkpi-variance', (kpi.variance >= 0 ? '+' : '') + fmt(kpi.variance), kpi.variance < 0 ? '#dc3545' : '#16a34a');
}

function renderBudgetTable(rows) {
  var tbody = document.getElementById('budget-tbody');
  if (!tbody) return;
  var fmt = function(n) { return '₱' + (Number(n)||0).toLocaleString(undefined,{minimumFractionDigits:2}); };
  if (!rows || !rows.length) { tbody.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted">No work packages found.</td></tr>'; return; }
  tbody.innerHTML = rows.map(function(r) {
    var varStyle = r.variance < 0 ? 'color:#dc3545;font-weight:700;' : 'color:#16a34a;font-weight:700;';
    return '<tr>' +
      '<td class="ps-3"><div class="fw-bold small">' + r.label + '</div><div class="text-muted" style="font-size:.72rem;">' + r.wpId + '</div></td>' +
      '<td class="small">' + r.project + '</td>' +
      '<td class="small">' + r.subName + '</td>' +
      '<td class="small text-muted">' + (r.basis || '—') + '</td>' +
      '<td class="text-end small">' + fmt(r.boqBudget) + '</td>' +
      '<td class="text-end small fw-bold">' + fmt(r.contractValue) + '</td>' +
      '<td class="text-end small" style="color:#16a34a;">' + fmt(r.paid) + '</td>' +
      '<td class="text-end small pe-3" style="' + varStyle + '">' + (r.variance >= 0 ? '+' : '') + fmt(r.variance) + '</td>' +
      '</tr>';
  }).join('');
}

function applyBudgetFilters() {
  var p = document.getElementById('budget-filter-project').value;
  var tbody = document.getElementById('budget-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4"><span class="spinner-border spinner-border-sm me-2"></span>Loading...</td></tr>';
  google.script.run
    .withSuccessHandler(function(data) { _budgetData = data; renderBudgetKpis(data.kpi); renderBudgetTable(data.rows); })
    .withFailureHandler(function(err) { if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger py-4">' + err.message + '</td></tr>'; })
    .getSubconBudgetData(p);
}

function resetBudgetFilters() { document.getElementById('budget-filter-project').value = ''; applyBudgetFilters(); }

function exportBudgetCsv() {
  if (!_budgetData || !_budgetData.rows || !_budgetData.rows.length) { showToast('No data to export.', 'warning'); return; }
  var fmtN = function(n) { return (Number(n)||0).toFixed(2); };
  var csv = 'WP ID,Label,Project,Subcontractor,Basis,BOQ Budget,Contract Value,Paid,Variance\n' +
    _budgetData.rows.map(function(r) {
      return [r.wpId, '"'+r.label+'"', r.project, '"'+r.subName+'"', r.basis||'',
              fmtN(r.boqBudget), fmtN(r.contractValue), fmtN(r.paid), fmtN(r.variance)].join(',');
    }).join('\n');
  var blob = new Blob([csv], {type:'text/csv'});
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a'); a.href = url; a.download = 'subcontract_budget_vs_actual.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ── Subcontractor Payables ────────────────────────────────────────────
function initSubconPayables() {
  var tbody = document.getElementById('subcon-payables-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><span class="spinner-border spinner-border-sm me-2"></span>Loading...</td></tr>';
  google.script.run
    .withSuccessHandler(function(rows) { renderSubconPayables(rows || []); })
    .withFailureHandler(function(err) { if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger py-4">' + err.message + '</td></tr>'; })
    .getSubconPayables();
}

function renderSubconPayables(rows) {
  var tbody = document.getElementById('subcon-payables-tbody');
  if (!tbody) return;
  var fmt = function(n) { return '₱' + (Number(n)||0).toLocaleString(undefined,{minimumFractionDigits:2}); };
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-muted">No milestones ready to pay.</td></tr>'; return; }
  tbody.innerHTML = rows.map(function(r) {
    var safeId = r.milId.replace(/[^a-zA-Z0-9\-]/g,'');
    var linkBtn = '<button class="btn fw-bold" style="font-size:.7rem;padding:2px 8px;border-radius:5px;background:#e8a820;border:none;color:#fff;" ' +
      'onclick="openLinkCheckModal(\'' + safeId + '\',\'' + r.subId + '\',\'' + r.wpId + '\',\'' + fmt(r.amount).replace(/'/g,'') + '\')">Link Check</button>';
    return '<tr>' +
      '<td class="ps-3 small fw-bold">' + r.subName + '</td>' +
      '<td class="small">' + r.wpLabel + '</td>' +
      '<td class="small">' + r.milLabel + ' <span class="text-muted">(Seq ' + r.seq + ')</span></td>' +
      '<td class="text-end small fw-bold">' + fmt(r.amount) + '</td>' +
      '<td class="text-center pe-3">' + linkBtn + '</td>' +
      '</tr>';
  }).join('');
}

