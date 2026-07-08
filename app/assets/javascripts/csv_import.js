// "Import Data (CSV)" -- admin-only screen for the data types that have no
// one-at-a-time entry form anywhere else (Materials catalog) or would be
// tedious to retype from old records (Suppliers, Subcontractors, Expense
// Categories, historical Expenses/Checks). Kept out of portal.js because
// that file is regenerated from Source/ by tools/port_frontend.ps1.
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

  function csvEscape(v) {
    var s = String(v == null ? "" : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function init() {
    var anchor = document.getElementById("nav-expense");
    if (!anchor || document.getElementById("nav-csv-import")) return;

    var link = document.createElement("a");
    link.id = "nav-csv-import";
    link.setAttribute("data-permission", "admin");
    link.setAttribute("onclick", "showSection('csv-import')");
    link.style.cursor = "pointer";
    link.textContent = "Import Data (CSV)";
    anchor.insertAdjacentElement("afterend", link);

    var optionsHtml = Object.keys(TYPES).map(function (key) {
      return '<option value="' + key + '">' + TYPES[key].label + "</option>";
    }).join("");

    var section = document.createElement("div");
    section.id = "section-csv-import";
    section.className = "content-section";
    section.innerHTML =
      '<h2 class="page-title">Import Data <span class="text-highlight">(CSV)</span></h2>' +
      '<div class="upload-card" style="max-width: 650px; margin: 0 auto;">' +
      '  <div id="csv-import-alert" class="alert py-2" style="display:none; font-size: 0.85rem;"></div>' +
      '  <div class="mb-3">' +
      '    <label class="form-label fw-bold small text-muted">What are you importing?</label>' +
      '    <select id="csvImportType" class="form-select">' + optionsHtml + "</select>" +
      '    <div id="csvImportNote" class="form-text"></div>' +
      "  </div>" +
      '  <button type="button" class="btn btn-outline-secondary btn-sm fw-bold mb-4" id="csvDownloadTemplateBtn">' +
      "    Download CSV Template" +
      "  </button>" +
      '  <div class="mb-4">' +
      '    <label class="form-label fw-bold small text-muted">Select your filled-in CSV file</label>' +
      '    <input type="file" id="csvImportFile" class="form-control" accept=".csv">' +
      "  </div>" +
      '  <button id="csvImportBtn" class="btn btn-primary btn-lg w-100 fw-bold" type="button">' +
      '    <span id="csvImportLoader" class="spinner-border spinner-border-sm me-2" style="display:none;"></span>' +
      '    <span id="csvImportBtnText">UPLOAD</span>' +
      "  </button>" +
      '  <div id="csvImportResults" class="mt-4" style="display:none;"></div>' +
      "</div>";

    var mainContainer = document.querySelector(".main-container");
    if (mainContainer) mainContainer.appendChild(section);

    var typeSelect = document.getElementById("csvImportType");
    function refreshNote() {
      document.getElementById("csvImportNote").textContent = TYPES[typeSelect.value].note;
    }
    typeSelect.addEventListener("change", refreshNote);
    refreshNote();

    document.getElementById("csvDownloadTemplateBtn").addEventListener("click", function () {
      var type = TYPES[typeSelect.value];
      var csv = type.headers.map(csvEscape).join(",") + "\n" + type.example.map(csvEscape).join(",") + "\n";
      var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = typeSelect.value + "_template.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });

    document.getElementById("csvImportBtn").addEventListener("click", function () {
      var fileInput = document.getElementById("csvImportFile");
      var alertBox = document.getElementById("csv-import-alert");
      var resultsBox = document.getElementById("csvImportResults");
      var btn = document.getElementById("csvImportBtn");
      var loader = document.getElementById("csvImportLoader");
      var btnText = document.getElementById("csvImportBtnText");

      alertBox.style.display = "none";
      resultsBox.style.display = "none";

      if (!fileInput.files.length) {
        alertBox.textContent = "Please choose a CSV file first.";
        alertBox.className = "alert alert-danger py-2";
        alertBox.style.display = "block";
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

            var msg = '<div class="alert alert-success py-2">Created ' + res.created + " record(s).</div>";
            if (res.skipped && res.skipped.length) {
              msg += '<div class="alert alert-warning py-2"><strong>' + res.skipped.length +
                " row(s) skipped:</strong><ul class=\"mb-0 mt-1\">" +
                res.skipped.map(function (s) { return "<li>" + s + "</li>"; }).join("") +
                "</ul></div>";
            }
            resultsBox.innerHTML = msg;
            resultsBox.style.display = "block";
          })
          .withFailureHandler(function (err) {
            btn.disabled = false;
            loader.style.display = "none";
            btnText.textContent = "UPLOAD";
            alertBox.textContent = "Error: " + (err && err.message ? err.message : "import failed");
            alertBox.className = "alert alert-danger py-2";
            alertBox.style.display = "block";
          })
          .importCsvData(typeSelect.value, String(reader.result));
      };
      reader.onerror = function () {
        btn.disabled = false;
        loader.style.display = "none";
        btnText.textContent = "UPLOAD";
        alertBox.textContent = "Could not read that file. Please try again.";
        alertBox.className = "alert alert-danger py-2";
        alertBox.style.display = "block";
      };
      reader.readAsText(fileInput.files[0]);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
