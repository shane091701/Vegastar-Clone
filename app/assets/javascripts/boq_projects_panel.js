// Adds a collapsible "Existing Projects" panel directly to the BOQ Upload
// screen (right under the Project Code field) so an admin can view, edit,
// or delete Project records without leaving that screen -- most often to
// clear out a stuck project shell left behind by a failed upload (see
// BoqIngestor's transaction) before retrying with the same project code.
// Reuses the same getManagedRows/updateManagedRow/deleteManagedRow("projects")
// endpoints the "Manage Data" screen uses (see csv_import.js), so the same
// deletion-safety rules apply (a project with real BOQ/MRF/expense/etc. data
// attached can't be deleted from here either).
//
// Kept as its own file for the same reason as csv_import.js / manage_hub.js:
// portal.js / index.html.erb are regenerated from Source/ by
// tools/port_frontend.ps1, so new features are added as separate files that
// inject their own markup instead of editing those directly.
(function () {
  var FIELD_KEYS = ["code", "customer_name", "company", "phone", "email", "site_location"];
  var rows = [];

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function buildModal() {
    return '<div class="modal fade" id="boqProjEditModal" tabindex="-1" aria-hidden="true">' +
      '  <div class="modal-dialog modal-dialog-centered">' +
      '    <div class="modal-content border-0 shadow">' +
      '      <div class="modal-header"><h5 class="modal-title fw-bold">Edit Project</h5>' +
      '        <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
      '      <div class="modal-body">' +
      '        <div id="boqProj-edit-alert" class="alert alert-danger py-2" style="display:none; font-size:0.85rem;"></div>' +
      '        <input type="hidden" id="boqProjEditId">' +
      '        <div class="mb-2 text-start"><label class="form-label small fw-bold text-muted">Project Code</label>' +
      '          <input id="boqProjEdit_code" class="form-control form-control-sm"></div>' +
      '        <div class="mb-2 text-start"><label class="form-label small fw-bold text-muted">Customer Name</label>' +
      '          <input id="boqProjEdit_customer_name" class="form-control form-control-sm"></div>' +
      '        <div class="mb-2 text-start"><label class="form-label small fw-bold text-muted">Company</label>' +
      '          <input id="boqProjEdit_company" class="form-control form-control-sm"></div>' +
      '        <div class="mb-2 text-start"><label class="form-label small fw-bold text-muted">Phone</label>' +
      '          <input id="boqProjEdit_phone" class="form-control form-control-sm"></div>' +
      '        <div class="mb-2 text-start"><label class="form-label small fw-bold text-muted">Email</label>' +
      '          <input id="boqProjEdit_email" class="form-control form-control-sm"></div>' +
      '        <div class="mb-2 text-start"><label class="form-label small fw-bold text-muted">Site Location</label>' +
      '          <input id="boqProjEdit_site_location" class="form-control form-control-sm"></div>' +
      "      </div>" +
      '      <div class="modal-footer">' +
      '        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>' +
      '        <button type="button" class="btn btn-primary fw-bold" id="boqProjEditSaveBtn">Save Changes</button>' +
      "      </div>" +
      "    </div></div></div>";
  }

  function loadProjects() {
    var body = document.getElementById("boqProjectsBody");
    if (!body) return;
    body.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Loading...</td></tr>';
    google.script.run
      .withSuccessHandler(function (res) {
        rows = res.rows;
        document.getElementById("boqProjectsCount").textContent = "(" + rows.length + ")";
        if (!rows.length) {
          body.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No projects yet.</td></tr>';
          return;
        }
        body.innerHTML = rows.map(function (r) {
          return "<tr>" +
            "<td>" + escapeHtml(r.code) + "</td>" +
            "<td>" + escapeHtml(r.customer_name) + "</td>" +
            "<td>" + escapeHtml(r.company) + "</td>" +
            '<td class="text-end text-nowrap">' +
            '<button class="btn btn-sm btn-outline-secondary me-1" onclick="boqProjEdit(' + r.id + ')">Edit</button>' +
            '<button class="btn btn-sm btn-outline-danger" onclick="boqProjDelete(' + r.id + ')">Delete</button>' +
            "</td></tr>";
        }).join("");
      })
      .withFailureHandler(function (err) {
        body.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error loading projects: ' +
          escapeHtml(err.message) + "</td></tr>";
      })
      .getManagedRows("projects");
  }

  window.boqProjEdit = function (id) {
    var row = rows.find(function (r) { return r.id === id; });
    if (!row) return;
    document.getElementById("boqProjEditId").value = id;
    document.getElementById("boqProj-edit-alert").style.display = "none";
    FIELD_KEYS.forEach(function (k) {
      document.getElementById("boqProjEdit_" + k).value = row[k] == null ? "" : row[k];
    });
    new bootstrap.Modal(document.getElementById("boqProjEditModal")).show();
  };

  window.boqProjDelete = function (id) {
    if (!confirm("Delete this project record permanently? This can't be undone.")) return;
    google.script.run
      .withSuccessHandler(function () { loadProjects(); })
      .withFailureHandler(function (err) { alert("Error: " + err.message); })
      .deleteManagedRow("projects", id);
  };

  function saveEdit() {
    var id = document.getElementById("boqProjEditId").value;
    var data = {};
    FIELD_KEYS.forEach(function (k) { data[k] = document.getElementById("boqProjEdit_" + k).value; });
    var btn = document.getElementById("boqProjEditSaveBtn");
    btn.disabled = true;
    google.script.run
      .withSuccessHandler(function () {
        btn.disabled = false;
        bootstrap.Modal.getInstance(document.getElementById("boqProjEditModal")).hide();
        loadProjects();
      })
      .withFailureHandler(function (err) {
        btn.disabled = false;
        var box = document.getElementById("boqProj-edit-alert");
        box.textContent = "Error: " + err.message;
        box.style.display = "block";
      })
      .updateManagedRow("projects", id, data);
  }

  function init() {
    if (document.getElementById("boqProjectsPanel")) return;
    var anchorInput = document.getElementById("projectCode");
    if (!anchorInput) return;
    var row = anchorInput.closest(".row");
    if (!row) return;

    var panel = document.createElement("div");
    panel.id = "boqProjectsPanel";
    panel.setAttribute("data-permission", "admin");
    panel.className = "mb-4 text-start";
    panel.innerHTML =
      '<button class="btn btn-sm btn-outline-secondary fw-bold mb-2" type="button" ' +
      '  data-bs-toggle="collapse" data-bs-target="#boqProjectsCollapse" aria-expanded="false">' +
      "  View / Edit / Delete Existing Projects" +
      "</button>" +
      '<div class="collapse" id="boqProjectsCollapse">' +
      '  <div class="card card-body bg-light border-0 p-3">' +
      '    <div class="d-flex justify-content-between align-items-center mb-2">' +
      '      <span class="fw-bold small">Existing Projects <span id="boqProjectsCount" class="text-muted fw-normal"></span></span>' +
      '      <span>' +
      '        <button class="btn btn-sm btn-outline-secondary me-1" type="button" onclick="window.showManagedDataHistory(\'projects\', \'Projects\')">View History</button>' +
      '        <button class="btn btn-sm btn-outline-primary" type="button" onclick="window.__loadBoqProjects()">Refresh</button>' +
      "      </span>" +
      "    </div>" +
      '    <div class="table-responsive">' +
      '      <table class="table table-sm align-middle" style="font-size:0.8rem;">' +
      '        <thead><tr><th>Code</th><th>Customer</th><th>Company</th><th class="text-end">Actions</th></tr></thead>' +
      '        <tbody id="boqProjectsBody"><tr><td colspan="4" class="text-center text-muted">Loading...</td></tr></tbody>' +
      "      </table>" +
      "    </div>" +
      "  </div>" +
      "</div>" +
      buildModal();

    row.insertAdjacentElement("afterend", panel);

    document.getElementById("boqProjectsCollapse").addEventListener("shown.bs.collapse", loadProjects);
    document.getElementById("boqProjEditSaveBtn").addEventListener("click", saveEdit);
    window.__loadBoqProjects = loadProjects;

    // This panel's data-permission="admin" (set above) was added after the
    // one-time permission filter already ran at login -- re-run it so this
    // doesn't stay visible to every role regardless of permission.
    if (typeof window.reapplyPermissions === "function") window.reapplyPermissions();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
