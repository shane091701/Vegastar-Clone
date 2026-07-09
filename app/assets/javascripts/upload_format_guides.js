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
        'Within that sheet, it scans column C for a header cell that says ' +
        '<strong>QTY</strong>, <strong>QTY.</strong>, or <strong>QUANTITY</strong> -- ' +
        "everything above that row is ignored, everything below it is read as data.",
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
        "A row counts as an actual <strong>line item</strong> only when both Column B (item name) and Column C (qty) have values.",
        "Rows where Column B contains \"TOTAL\" or \"SUB-TOTAL\" are skipped automatically -- no need to remove your subtotal rows first.",
        "Row order matters: items are attached to whichever phase/scope heading came most recently above them."
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

  function buildModal(guide, modalId) {
    var theadCells = guide.columns.map(function (c) { return "<th>" + c + "</th>"; }).join("");
    var bodyRows = guide.rows.map(function (r) {
      var cells = r.cells.map(function (c) { return "<td>" + escapeHtml(c) + "</td>"; }).join("");
      return '<tr class="' + rowClass(r.kind) + '"><td class="small text-muted">' + escapeHtml(r.label) + "</td>" + cells + "</tr>";
    }).join("");
    var notesHtml = guide.notes.map(function (n) { return "<li>" + n + "</li>"; }).join("");

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
      '      <div class="table-responsive" style="overflow-x: auto; max-width: 100%;">' +
      '        <table class="table table-sm table-bordered mb-2" style="font-size: 0.78rem; white-space: nowrap;">' +
      '          <thead><tr><th></th>' + theadCells + "</tr></thead>" +
      "          <tbody>" + bodyRows + "</tbody>" +
      "        </table>" +
      "      </div>" +
      '      <ul class="small text-muted mb-0">' + notesHtml + "</ul>" +
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
