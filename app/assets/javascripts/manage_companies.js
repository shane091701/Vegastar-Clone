// Populates the "Assign Company" dropdowns (BOQ upload screens) from the
// database instead of the old hardcoded <option> list, and gives admins a
// screen to add/rename/remove companies without touching code. Kept out of
// portal.js/index.html.erb because those are regenerated from Source/ by
// tools/port_frontend.ps1.
(function () {
  var companiesCache = [];

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function jsStr(s) {
    return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  // Every screen with an Assign Company dropdown -- add more IDs here if
  // another one is added later.
  var DROPDOWN_IDS = ["assignCompany", "nboq-assignCompany"];

  function populateDropdowns() {
    DROPDOWN_IDS.forEach(function (id) {
      var select = document.getElementById(id);
      if (!select) return;
      var currentValue = select.value;
      var placeholder = select.querySelector('option[value=""]');
      select.innerHTML = (placeholder ? placeholder.outerHTML : '<option value="">— Select Company —</option>') +
        companiesCache.map(function (name) {
          return '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + "</option>";
        }).join("");
      if (currentValue && companiesCache.indexOf(currentValue) !== -1) select.value = currentValue;
    });
  }

  function loadCompanies() {
    google.script.run
      .withSuccessHandler(function (res) {
        companiesCache = res.companies || [];
        populateDropdowns();
        renderCompaniesTable();
      })
      .withFailureHandler(function () {})
      .getCompaniesList();
  }

  function initDropdowns() {
    loadCompanies();
    // If a screen rebuilds the <select> after our initial population (e.g.
    // re-rendering a form on navigation), it comes back with just the
    // placeholder option -- notice that and repopulate.
    new MutationObserver(function () {
      if (!companiesCache.length) return;
      DROPDOWN_IDS.forEach(function (id) {
        var el = document.getElementById(id);
        if (el && el.options.length <= 1) populateDropdowns();
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  function initAdminScreen() {
    var anchor = document.getElementById("nav-manage-users");
    if (!anchor || document.getElementById("nav-manage-companies")) return;

    if (typeof window.showSection === "function" && !window.showSection.__wrapsManageCompanies) {
      var originalShowSection = window.showSection;
      var wrapped = function (sectionId) {
        originalShowSection(sectionId);
        if (sectionId === "manage-companies") loadCompanies();
      };
      wrapped.__wrapsManageCompanies = true;
      window.showSection = wrapped;
    }

    var link = document.createElement("a");
    link.id = "nav-manage-companies";
    link.setAttribute("data-permission", "admin");
    link.setAttribute("onclick", "showSection('manage-companies')");
    link.style.cursor = "pointer";
    link.textContent = "Manage Companies";
    anchor.insertAdjacentElement("afterend", link);

    var section = document.createElement("div");
    section.id = "section-manage-companies";
    section.className = "content-section";
    section.innerHTML =
      '<h2 class="page-title">Manage <span class="text-highlight">Companies</span></h2>' +
      '<div class="upload-card" style="max-width: 700px; margin: 0 auto;">' +
      '  <div id="mc-alert" class="alert py-2" style="display:none; font-size: 0.85rem;"></div>' +
      '  <h5 class="fw-bold mb-3 border-bottom pb-2 text-start">Add a Company</h5>' +
      '  <p class="small text-muted text-start">These are the choices shown in the "Assign Company" dropdown when uploading a BOQ.</p>' +
      '  <div class="input-group mb-4">' +
      '    <input type="text" id="mc-new-name" class="form-control" placeholder="e.g. Krone Konstruct">' +
      '    <button class="btn btn-primary fw-bold" id="mc-add-btn" type="button">Add Company</button>' +
      "  </div>" +
      '  <h5 class="fw-bold mb-3 border-bottom pb-2 text-start">Existing Companies</h5>' +
      '  <div class="table-responsive">' +
      '    <table class="table table-sm align-middle">' +
      '      <thead><tr><th>Name</th><th></th></tr></thead>' +
      '      <tbody id="mc-table-body"><tr><td colspan="2" class="text-center text-muted">Loading...</td></tr></tbody>' +
      "    </table>" +
      "  </div>" +
      "</div>" +
      buildEditModal();

    var mainContainer = document.querySelector(".main-container");
    if (mainContainer) mainContainer.appendChild(section);

    document.getElementById("mc-add-btn").addEventListener("click", createCompany);
    document.getElementById("mc-edit-save-btn").addEventListener("click", saveEditCompany);

    // The nav link's data-permission="admin" (set above) was added after
    // the one-time permission filter already ran at login -- re-run it so
    // this doesn't stay visible to every role regardless of permission.
    if (typeof window.reapplyPermissions === "function") window.reapplyPermissions();

    window.openEditCompany = function (name) {
      document.getElementById("mc-edit-old-name").value = name;
      document.getElementById("mc-edit-name").value = name;
      document.getElementById("mc-edit-alert").style.display = "none";
      new bootstrap.Modal(document.getElementById("editCompanyModal")).show();
    };

    window.deleteCompany = function (name) {
      if (!confirm('Remove "' + name + '" from the Assign Company list? Projects already using it keep the name -- it just won\'t be offered for new ones.')) return;
      google.script.run
        .withSuccessHandler(function (res) {
          companiesCache = res.companies || [];
          populateDropdowns();
          renderCompaniesTable();
        })
        .withFailureHandler(function (err) { showAlert("Error: " + err.message); })
        .deleteCompany(name);
    };
  }

  function buildEditModal() {
    return '<div class="modal fade" id="editCompanyModal" tabindex="-1" aria-hidden="true">' +
      '  <div class="modal-dialog modal-dialog-centered">' +
      '    <div class="modal-content border-0 shadow">' +
      '      <div class="modal-header"><h5 class="modal-title fw-bold">Rename Company</h5>' +
      '        <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
      '      <div class="modal-body">' +
      '        <div id="mc-edit-alert" class="alert alert-danger py-2" style="display:none; font-size: 0.85rem;"></div>' +
      '        <input type="hidden" id="mc-edit-old-name">' +
      '        <label class="form-label fw-bold small text-muted">Company Name</label>' +
      '        <input type="text" id="mc-edit-name" class="form-control">' +
      "      </div>" +
      '      <div class="modal-footer">' +
      '        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>' +
      '        <button type="button" class="btn btn-primary fw-bold" id="mc-edit-save-btn">Save Changes</button>' +
      "      </div>" +
      "    </div></div></div>";
  }

  function showAlert(msg, kind) {
    var box = document.getElementById("mc-alert");
    box.textContent = msg;
    box.className = "alert py-2 alert-" + (kind || "danger");
    box.style.display = "block";
  }

  function renderCompaniesTable() {
    var body = document.getElementById("mc-table-body");
    if (!body) return;
    if (!companiesCache.length) {
      body.innerHTML = '<tr><td colspan="2" class="text-center text-muted">No companies yet.</td></tr>';
      return;
    }
    body.innerHTML = companiesCache.map(function (name) {
      return "<tr>" +
        "<td>" + escapeHtml(name) + "</td>" +
        '<td class="text-nowrap">' +
          '<button class="btn btn-sm btn-outline-secondary me-1" onclick="openEditCompany(\'' + jsStr(name) + '\')">Edit</button>' +
          '<button class="btn btn-sm btn-outline-danger" onclick="deleteCompany(\'' + jsStr(name) + '\')">Delete</button>' +
        "</td>" +
        "</tr>";
    }).join("");
  }

  function createCompany() {
    var name = document.getElementById("mc-new-name").value.trim();
    var btn = document.getElementById("mc-add-btn");
    if (!name) {
      showAlert("Please enter a company name.");
      return;
    }
    btn.disabled = true;
    btn.textContent = "Adding...";
    google.script.run
      .withSuccessHandler(function (res) {
        btn.disabled = false;
        btn.textContent = "Add Company";
        document.getElementById("mc-new-name").value = "";
        companiesCache = res.companies || [];
        populateDropdowns();
        renderCompaniesTable();
        showAlert('Added "' + name + '".', "success");
      })
      .withFailureHandler(function (err) {
        btn.disabled = false;
        btn.textContent = "Add Company";
        showAlert("Error: " + err.message);
      })
      .createCompany(name);
  }

  function saveEditCompany() {
    var oldName = document.getElementById("mc-edit-old-name").value;
    var newName = document.getElementById("mc-edit-name").value.trim();
    var btn = document.getElementById("mc-edit-save-btn");
    var alertBox = document.getElementById("mc-edit-alert");
    alertBox.style.display = "none";

    if (!newName) {
      alertBox.textContent = "Please enter a company name.";
      alertBox.style.display = "block";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Saving...";
    google.script.run
      .withSuccessHandler(function (res) {
        btn.disabled = false;
        btn.textContent = "Save Changes";
        bootstrap.Modal.getInstance(document.getElementById("editCompanyModal")).hide();
        companiesCache = res.companies || [];
        populateDropdowns();
        renderCompaniesTable();
        showAlert("Company updated.", "success");
      })
      .withFailureHandler(function (err) {
        btn.disabled = false;
        btn.textContent = "Save Changes";
        alertBox.textContent = "Error: " + err.message;
        alertBox.style.display = "block";
      })
      .updateCompany(oldName, newName);
  }

  function init() {
    initDropdowns();
    initAdminScreen();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
