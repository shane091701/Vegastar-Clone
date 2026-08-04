// Adds a "See expected file format" preview next to spreadsheet upload
// inputs (BOQ Excel today; add more entries to GUIDES as needed) so the
// uploader can see the exact expected layout before picking a file, the
// same way the Manage Data CSV importer already does. Kept out of
// portal.js/index.html.erb since those are regenerated from Source/ by
// tools/port_frontend.ps1 -- this attaches itself to the existing #fileInput
// element instead of editing the generated markup.
(function () {
  var GUIDES = [
    {
      fileInputId: "fileInput",
      title: "Expected BOQ Excel Format",
      intro: "The uploader looks for a sheet whose name contains one of: " +
        '<strong>BOQ, BOM, Detailed, Bill of Quantities, Bill of Materials</strong> ' +
        "(a sheet with \"SUM\" in its name, like a Summary tab, is skipped). " +
        "Two column layouts are recognized automatically, based on which column has the " +
        '<strong>QTY</strong>/<strong>QUANTITY</strong> header -- everything above that ' +
        "row is ignored, everything below it is read as data. Both accept " +
        "<strong>.xlsx</strong> and <strong>.xls</strong> files.",
      examples: [
        {
          subtitle: "Layout 1: QTY in column C",
          columns: ["A", "B", "C", "D", "E", "F", "G", "H", "I"],
          rows: [
            { label: "Header row (anchor)", cells: ["", "ITEM DESCRIPTION", "QTY", "UOM", "MAT'L UNIT COST", "MAT'L TOTAL", "LABOR UNIT COST", "LABOR TOTAL", "TOTAL COST"], kind: "header" },
            { label: "Phase heading", cells: ["I. Sitework", "", "", "", "", "", "", "", ""], kind: "phase" },
            { label: "Scope row", cells: ["1.1", "Clearing and Grubbing", "", "", "", "", "", "", ""], kind: "scope" },
            { label: "Item row", cells: ["", "4000 psi Portland Cement", "50", "bag", "245", "12250", "20", "1000", "13250"], kind: "item" },
            { label: "Skipped automatically", cells: ["", "SUB-TOTAL", "", "", "", "", "", "", ""], kind: "skip" }
          ],
          notes: [
            "A row counts as a <strong>phase heading</strong> when Column A has text (e.g. \"I. Sitework\") and Column C is blank.",
            "A row counts as a <strong>scope row</strong> when Column A looks like \"1.1\" and Column C is blank -- put the description in Column B.",
            "A row counts as an actual <strong>line item</strong> only when Column B (item name) and Column C (qty) both have values, and Column C is a real number."
          ]
        },
        {
          subtitle: "Layout 2: QTY in column E (two-row header, with a Specs column)",
          columns: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"],
          rows: [
            { label: "Header row (anchor)", cells: ["", "Item#", "Description", "Specs", "Quantity", "Unit", "Direct Materials Cost", "", "Direct Labor Cost", "", "Direct L&M Cost", "TOTAL"], kind: "header" },
            { label: "Header sub-row", cells: ["", "", "", "", "", "", "Unit Cost", "amount", "Unit Cost", "amount", "", ""], kind: "header" },
            { label: "Phase heading", cells: ["", "1.0", "General Requirements", "", "", "", "", "", "", "", "", ""], kind: "phase" },
            { label: "Item row", cells: ["", "", "Mobilization/demobilization", "", "1", "Lot", "35000", "35000", "", "", "35000", "35000"], kind: "item" }
          ],
          notes: [
            "A row counts as a <strong>phase heading</strong> when the item-number column is whole-number-dot-zero (e.g. \"1.0\", \"2.0\") and the Quantity column is blank -- the Description column becomes the phase name.",
            "The Specs column and \"Direct L&M Cost\" column are read but not stored -- Column L (TOTAL) is what's saved as the item's total cost.",
            "An item row still needs a real number in the Quantity column -- text like \"Quantity\" (from a repeated header block on a later printed page) is correctly ignored, not imported as a bogus item."
          ]
        }
      ]
    }
  ];

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function rowClass(kind) {
    if (kind === "header") return "table-secondary fw-bold";
    if (kind === "phase") return "table-light fw-bold";
    if (kind === "scope") return "";
    if (kind === "skip") return "text-muted";
    return "table-success-subtle";
  }

  function buildExampleHtml(example) {
    var theadCells = example.columns.map(function (c) { return "<th>" + c + "</th>"; }).join("");
    var bodyRows = example.rows.map(function (r) {
      var cells = r.cells.map(function (c) { return "<td>" + escapeHtml(c) + "</td>"; }).join("");
      return '<tr class="' + rowClass(r.kind) + '"><td class="small text-muted">' + escapeHtml(r.label) + "</td>" + cells + "</tr>";
    }).join("");
    var notesHtml = example.notes.map(function (n) { return "<li>" + n + "</li>"; }).join("");

    return (example.subtitle ? '<h6 class="fw-bold mt-3">' + escapeHtml(example.subtitle) + "</h6>" : "") +
      '<div class="table-responsive" style="overflow-x: auto; max-width: 100%;">' +
      '  <table class="table table-sm table-bordered mb-2" style="font-size: 0.78rem; white-space: nowrap;">' +
      '    <thead><tr><th></th>' + theadCells + "</tr></thead>" +
      "    <tbody>" + bodyRows + "</tbody>" +
      "  </table>" +
      "</div>" +
      '<ul class="small text-muted">' + notesHtml + "</ul>";
  }

  function buildModal(guide, modalId) {
    var examplesHtml = guide.examples.map(buildExampleHtml).join("");

    var modal = document.createElement("div");
    modal.className = "modal fade";
    modal.id = modalId;
    modal.tabIndex = -1;
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML =
      '<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-xl">' +
      '  <div class="modal-content border-0 shadow">' +
      '    <div class="modal-header"><h5 class="modal-title fw-bold">' + escapeHtml(guide.title) + '</h5>' +
      '      <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
      '    <div class="modal-body">' +
      '      <p class="small">' + guide.intro + "</p>" +
      examplesHtml +
      "    </div>" +
      '    <div class="modal-footer">' +
      '      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>' +
      "    </div>" +
      "  </div></div>";
    document.body.appendChild(modal);
    return modal;
  }

  function attach(guide) {
    var input = document.getElementById(guide.fileInputId);
    if (!input || input.dataset.formatGuideAttached) return;
    input.dataset.formatGuideAttached = "1";

    var modalId = "formatGuideModal-" + guide.fileInputId;
    var link = document.createElement("a");
    link.href = "#";
    link.className = "d-inline-block small mt-1";
    link.textContent = "See expected file format";
    link.addEventListener("click", function (e) {
      e.preventDefault();
      var modal = document.getElementById(modalId) || buildModal(guide, modalId);
      new bootstrap.Modal(modal).show();
    });
    input.insertAdjacentElement("afterend", link);
  }

  function tryAttachAll() {
    GUIDES.forEach(attach);
  }

  // The BOQ upload input lives inside a content-section that may not be in
  // the DOM's visible/initialized path yet depending on load order -- a
  // MutationObserver plus an initial pass covers both "already there" and
  // "rendered a bit later" without depending on portal.js internals.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryAttachAll);
  } else {
    tryAttachAll();
  }
  new MutationObserver(tryAttachAll).observe(document.body, { childList: true, subtree: true });
})();
