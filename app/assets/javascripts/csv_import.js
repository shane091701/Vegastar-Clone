// "Manage Data" -- admin-only screen for the data types that have no
// one-at-a-time entry form anywhere else (Materials catalog) or would be
// tedious to retype from old records (Suppliers, Subcontractors, Expense
// Categories, historical Expenses/Checks). Bulk-import via CSV (append or
// replace) plus view / edit / delete of existing rows. Kept out of
// portal.js because that file is regenerated from Source/ by
// tools/port_frontend.ps1.
(function () {
  var TYPES = {
    suppliers: {
      label: "Suppliers",
      headers: ["Company Name", "Contact Person", "Email", "Phone", "TIN", "Category", "Address", "Bank Details"],
      example: ["ABC Hardware Supply", "Ana Cruz", "sales@abchardware.example", "0917-111-2222", "111-222-333-000", "Materials", "45 Aurora Blvd, Quezon City", "BDO - 001122334455"],
      note: "Only Company Name is required."
    },
    materials: {
      label: "Materials Catalog",
      headers: ["Item Name", "Unit", "Actual Cost", "Quoted Cost"],
      example: ["4000 psi Portland Cement", "bag", "245", "260"],
      note: "Only Item Name is required. This feeds the material picker in Build BOQ."
    },
    subcontractors: {
      label: "Subcontractors",
      headers: ["Name", "TIN", "Contact"],
      example: ["Demo Builders Co.", "555-666-777-000", "0919-555-0000"],
      note: "Only Name is required. Duplicate names (case-insensitive) are skipped, same as adding one by hand."
    },
    expense_categories: {
      label: "Expense Categories",
      headers: ["Type", "Item"],
      example: ["Material", "Cement"],
      note: "Type is required; Item can be left blank for a bare category. Duplicates are skipped."
    },
    expenses: {
      label: "Historical Expenses",
      headers: ["Project", "Type", "Particular", "Amount", "Date"],
      example: ["DEMO-001", "Material", "Fuel and hauling", "3500.75", "2026-01-15"],
      note: "Project and Amount are required. Date defaults to today if left blank (format: YYYY-MM-DD)."
    },
    checks: {
      label: "Historical Checks",
      headers: ["Date", "Project", "Bank", "Check Number", "Amount", "Status"],
      example: ["2026-01-15", "DEMO-001", "BDO", "CHK-1001", "48000", "Not Deposited"],
      note: "Project, Check Number, and Amount are required. Status defaults to \"Not Deposited\" if left blank."
    }
  };

  var currentFields = []; // field metadata from the last getManagedRows call

  function csvEscape(v) {
    var s = String(v == null ? "" : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function currentType() {
    return document.getElementById("csvImportType").value;
  }

  function init() {
    var anchor = document.getElementById("nav-expense");
    if (!anchor || document.getElementById("nav-csv-import")) return;

    // showSection() lives in the regenerated portal.js and can't be edited
    // there -- wrap it so opening this section (re)loads the records table.
    if (typeof window.showSection === "function" && !window.showSection.__wrapsCsvImport) {
      var original = window.showSection;
      var wrapped = function (sectionId) {
        original(sectionId);
        if (sectionId === "csv-import") loadRecords();
      };
      wrapped.__wrapsCsvImport = true;
      window.showSection = wrapped;
    }

    var link = document.createElement("a");
    link.id = "nav-csv-import";
    link.setAttribute("data-permission", "admin");
    link.setAttribute("onclick", "showSection('csv-import')");
    link.style.cursor = "pointer";
    link.textContent = "Manage Data";
    anchor.insertAdjacentElement("afterend", link);

    var optionsHtml = Object.keys(TYPES).map(function (key) {
      return '<option value="' + key + '">' + TYPES[key].label + "</option>";
    }).join("");

    var section = document.createElement("div");
    section.id = "section-csv-import";
    section.className = "content-section";
    section.innerHTML =
      '<h2 class="page-title">Manage <span class="text-highlight">Data</span></h2>' +
      '<div class="upload-card" style="max-width: 900px; margin: 0 auto;">' +
      '  <div class="mb-3">' +
      '    <label class="form-label fw-bold small text-muted">Data type</label>' +
      '    <select id="csvImportType" class="form-select">' + optionsHtml + "</select>" +
      '    <div id="csvImportNote" class="form-text"></div>' +
      "  </div>" +

      '  <h5 class="fw-bold mb-3 border-bottom pb-2 text-start">Import from CSV</h5>' +
      '  <div class="mb-3 text-start">' +
      '    <div class="small fw-bold text-muted mb-1">Your file should look like this:</div>' +
      '    <div class="table-responsive" style="overflow-x: auto; max-width: 100%;">' +
      '      <table class="table table-sm table-bordered mb-1" style="font-size: 0.8rem; white-space: nowrap;">' +
      '        <thead id="csvFormatPreviewHead"></thead>' +
      '        <tbody id="csvFormatPreviewBody"></tbody>' +
      "      </table>" +
      "    </div>" +
      '    <div class="form-text mt-0">First row must have these column headers — everything below it is treated as data. Columns can be in any order, and header spelling/casing is flexible (a few common alternate names are accepted too).</div>' +
      "  </div>" +
      '  <div id="csv-import-alert" class="alert py-2" style="display:none; font-size: 0.85rem;"></div>' +
      '  <button type="button" class="btn btn-outline-secondary btn-sm fw-bold mb-3" id="csvDownloadTemplateBtn">' +
      "    Download CSV Template" +
      "  </button>" +
      '  <div class="mb-3">' +
      '    <label class="form-label fw-bold small text-muted">Select your filled-in CSV file</label>' +
      '    <input type="file" id="csvImportFile" class="form-control" accept=".csv">' +
      "  </div>" +
      '  <div class="mb-3 text-start">' +
      '    <label class="form-label fw-bold small text-muted d-block">When importing:</label>' +
      '    <div class="form-check">' +
      '      <input class="form-check-input" type="radio" name="csvMode" id="csvModeAppend" value="append" checked>' +
      '      <label class="form-check-label" for="csvModeAppend"><strong>Add to existing data</strong> — keeps what\'s already there and adds the new rows.</label>' +
      "    </div>" +
      '    <div class="form-check">' +
      '      <input class="form-check-input" type="radio" name="csvMode" id="csvModeReplace" value="replace">' +
      '      <label class="form-check-label" for="csvModeReplace"><strong>Replace all existing data</strong> — deletes every current row of this type first, then imports. Use with care.</label>' +
      "    </div>" +
      "  </div>" +
      '  <button id="csvImportBtn" class="btn btn-primary btn-lg w-100 fw-bold" type="button">' +
      '    <span id="csvImportLoader" class="spinner-border spinner-border-sm me-2" style="display:none;"></span>' +
      '    <span id="csvImportBtnText">UPLOAD</span>' +
      "  </button>" +
      '  <div id="csvImportResults" class="mt-3" style="display:none;"></div>' +

      '  <h5 class="fw-bold mb-3 mt-4 border-bottom pb-2 text-start">Existing Records <span id="csvRecordCount" class="text-muted fw-normal"></span></h5>' +
      '  <div id="csv-records-alert" class="alert py-2" style="display:none; font-size: 0.85rem;"></div>' +
      '  <div class="table-responsive">' +
      '    <table class="table table-sm align-middle" style="font-size: 0.85rem;">' +
      '      <thead id="csvRecordsHead"></thead>' +
      '      <tbody id="csvRecordsBody"><tr><td class="text-center text-muted">Loading...</td></tr></tbody>' +
      "    </table>" +
      "  </div>" +
      "</div>" +
      buildEditModal();

    var mainContainer = document.querySelector(".main-container");
    if (mainContainer) mainContainer.appendChild(section);

    var typeSelect = document.getElementById("csvImportType");
    typeSelect.addEventListener("change", function () {
      refreshNote();
      resetImportUi();
      loadRecords();
    });
    refreshNote();

    document.getElementById("csvDownloadTemplateBtn").addEventListener("click", downloadTemplate);
    document.getElementById("csvImportBtn").addEventListener("click", doImport);
    document.getElementById("csvEditSaveBtn").addEventListener("click", saveEdit);
  }

  function buildEditModal() {
    return '<div class="modal fade" id="csvEditModal" tabindex="-1" aria-hidden="true">' +
      '  <div class="modal-dialog modal-dialog-centered">' +
      '    <div class="modal-content border-0 shadow">' +
      '      <div class="modal-header"><h5 class="modal-title fw-bold">Edit Record</h5>' +
      '        <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
      '      <div class="modal-body">' +
      '        <div id="csv-edit-alert" class="alert alert-danger py-2" style="display:none; font-size:0.85rem;"></div>' +
      '        <input type="hidden" id="csvEditId">' +
      '        <div id="csvEditFields"></div>' +
      "      </div>" +
      '      <div class="modal-footer">' +
      '        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>' +
      '        <button type="button" class="btn btn-primary fw-bold" id="csvEditSaveBtn">Save Changes</button>' +
      "      </div>" +
      "    </div></div></div>";
  }

  function refreshNote() {
    var type = TYPES[currentType()];
    document.getElementById("csvImportNote").textContent = type.note;

    document.getElementById("csvFormatPreviewHead").innerHTML =
      "<tr>" + type.headers.map(function (h) { return "<th>" + escapeHtml(h) + "</th>"; }).join("") + "</tr>";
    document.getElementById("csvFormatPreviewBody").innerHTML =
      "<tr>" + type.example.map(function (v) { return "<td>" + escapeHtml(v) + "</td>"; }).join("") + "</tr>";
  }

  function resetImportUi() {
    document.getElementById("csvImportFile").value = "";
    document.getElementById("csvImportResults").style.display = "none";
    document.getElementById("csv-import-alert").style.display = "none";
    document.getElementById("csvModeAppend").checked = true;
  }

  function downloadTemplate() {
    var type = TYPES[currentType()];
    var csv = type.headers.map(csvEscape).join(",") + "\n" + type.example.map(csvEscape).join(",") + "\n";
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = currentType() + "_template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importAlert(msg) {
    var box = document.getElementById("csv-import-alert");
    box.textContent = msg;
    box.className = "alert alert-danger py-2";
    box.style.display = "block";
  }

  function doImport() {
    var fileInput = document.getElementById("csvImportFile");
    var resultsBox = document.getElementById("csvImportResults");
    var btn = document.getElementById("csvImportBtn");
    var loader = document.getElementById("csvImportLoader");
    var btnText = document.getElementById("csvImportBtnText");
    var mode = document.querySelector('input[name="csvMode"]:checked').value;

    document.getElementById("csv-import-alert").style.display = "none";
    resultsBox.style.display = "none";

    if (!fileInput.files.length) {
      importAlert("Please choose a CSV file first.");
      return;
    }
    if (mode === "replace" &&
        !confirm("REPLACE will permanently delete every current " + TYPES[currentType()].label +
                 " row before importing. This can't be undone. Continue?")) {
      return;
    }

    btn.disabled = true;
    loader.style.display = "inline-block";
    btnText.textContent = "UPLOADING...";

    var reader = new FileReader();
    reader.onload = function () {
      google.script.run
        .withSuccessHandler(function (res) {
          btn.disabled = false;
          loader.style.display = "none";
          btnText.textContent = "UPLOAD";
          fileInput.value = "";

          var msg = '<div class="alert alert-success py-2">' +
            (res.mode === "replace" ? "Replaced all data — created " : "Created ") +
            res.created + " record(s).</div>";
          if (res.skipped && res.skipped.length) {
            msg += '<div class="alert alert-warning py-2"><strong>' + res.skipped.length +
              " row(s) skipped:</strong><ul class=\"mb-0 mt-1\">" +
              res.skipped.map(function (s) { return "<li>" + escapeHtml(s) + "</li>"; }).join("") +
              "</ul></div>";
          }
          resultsBox.innerHTML = msg;
          resultsBox.style.display = "block";
          document.getElementById("csvModeAppend").checked = true;
          loadRecords();
        })
        .withFailureHandler(function (err) {
          btn.disabled = false;
          loader.style.display = "none";
          btnText.textContent = "UPLOAD";
          importAlert("Error: " + (err && err.message ? err.message : "import failed"));
        })
        .importCsvData(currentType(), String(reader.result), mode);
    };
    reader.onerror = function () {
      btn.disabled = false;
      loader.style.display = "none";
      btnText.textContent = "UPLOAD";
      importAlert("Could not read that file. Please try again.");
    };
    reader.readAsText(fileInput.files[0]);
  }

  window.loadRecords = loadRecords;

  function loadRecords() {
    var head = document.getElementById("csvRecordsHead");
    var body = document.getElementById("csvRecordsBody");
    if (!head || !body) return;
    body.innerHTML = '<tr><td class="text-center text-muted">Loading...</td></tr>';

    google.script.run
      .withSuccessHandler(function (res) {
        currentFields = res.fields;
        document.getElementById("csvRecordCount").textContent = "(" + res.rows.length + ")";
        head.innerHTML = "<tr>" +
          res.fields.map(function (f) { return "<th>" + escapeHtml(f.label) + "</th>"; }).join("") +
          '<th class="text-end">Actions</th></tr>';
        if (!res.rows.length) {
          body.innerHTML = '<tr><td colspan="' + (res.fields.length + 1) +
            '" class="text-center text-muted">No records yet.</td></tr>';
          return;
        }
        body.innerHTML = res.rows.map(function (row) {
          var cells = res.fields.map(function (f) {
            return "<td>" + escapeHtml(row[f.key] == null ? "" : row[f.key]) + "</td>";
          }).join("");
          return "<tr>" + cells +
            '<td class="text-end text-nowrap">' +
            '<button class="btn btn-sm btn-outline-secondary me-1" onclick="csvEditRow(' + row.id + ')">Edit</button>' +
            '<button class="btn btn-sm btn-outline-danger" onclick="csvDeleteRow(' + row.id + ')">Delete</button>' +
            "</td></tr>";
        }).join("");
        window.__csvRows = res.rows;
      })
      .withFailureHandler(function (err) {
        var box = document.getElementById("csv-records-alert");
        box.textContent = "Error loading records: " + err.message;
        box.className = "alert alert-danger py-2";
        box.style.display = "block";
        body.innerHTML = "";
      })
      .getManagedRows(currentType());
  }

  window.csvEditRow = function (id) {
    var row = (window.__csvRows || []).find(function (r) { return r.id === id; });
    if (!row) return;
    document.getElementById("csvEditId").value = id;
    document.getElementById("csv-edit-alert").style.display = "none";

    document.getElementById("csvEditFields").innerHTML = currentFields.map(function (f) {
      var val = row[f.key] == null ? "" : row[f.key];
      var inputType = f.type === "number" ? "number" : (f.type === "date" ? "date" : "text");
      var attrs = 'id="csvEdit_' + f.key + '" class="form-control form-control-sm" type="' + inputType + '"' +
        (f.type === "number" ? ' step="any"' : "") +
        (f.readonly ? " disabled" : "");
      return '<div class="mb-2 text-start">' +
        '<label class="form-label fw-bold small text-muted">' + escapeHtml(f.label) +
        (f.required ? ' <span class="text-danger">*</span>' : "") + "</label>" +
        '<input ' + attrs + ' value="' + escapeHtml(val).replace(/"/g, "&quot;") + '">' +
        "</div>";
    }).join("");

    new bootstrap.Modal(document.getElementById("csvEditModal")).show();
  };

  function saveEdit() {
    var id = parseInt(document.getElementById("csvEditId").value, 10);
    var btn = document.getElementById("csvEditSaveBtn");
    var alertBox = document.getElementById("csv-edit-alert");
    alertBox.style.display = "none";

    var data = {};
    for (var i = 0; i < currentFields.length; i++) {
      var f = currentFields[i];
      if (f.readonly) continue;
      var el = document.getElementById("csvEdit_" + f.key);
      var v = el.value.trim();
      if (f.required && !v) {
        alertBox.textContent = f.label + " is required.";
        alertBox.style.display = "block";
        return;
      }
      data[f.key] = v;
    }

    btn.disabled = true;
    btn.textContent = "Saving...";
    google.script.run
      .withSuccessHandler(function () {
        btn.disabled = false;
        btn.textContent = "Save Changes";
        bootstrap.Modal.getInstance(document.getElementById("csvEditModal")).hide();
        loadRecords();
      })
      .withFailureHandler(function (err) {
        btn.disabled = false;
        btn.textContent = "Save Changes";
        alertBox.textContent = "Error: " + err.message;
        alertBox.style.display = "block";
      })
      .updateManagedRow(currentType(), id, data);
  }

  window.csvDeleteRow = function (id) {
    if (!confirm("Delete this record permanently? This can't be undone.")) return;
    google.script.run
      .withSuccessHandler(function () { loadRecords(); })
      .withFailureHandler(function (err) {
        var box = document.getElementById("csv-records-alert");
        box.textContent = "Error: " + err.message;
        box.className = "alert alert-danger py-2";
        box.style.display = "block";
      })
      .deleteManagedRow(currentType(), id);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
