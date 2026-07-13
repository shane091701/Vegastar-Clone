// "Manage Users" -- admin-only screen to create, edit, reset, deactivate,
// and reactivate logins. The original system had no account-creation UI at
// all (accounts only ever came from db:seed); this closes that gap. Kept
// out of portal.js because that file is regenerated from Source/ by
// tools/port_frontend.ps1.
(function () {
  var usersCache = [];
  var rolePermissionsCache = [];
  var allTabsCache = [];

  function init() {
    var anchor = document.getElementById("nav-expense");
    if (!anchor || document.getElementById("nav-manage-users")) return;

    // showSection() lives in the regenerated portal.js and dispatches to a
    // per-section loader via an if/else chain we can't safely edit there --
    // wrap it instead so this survives future regeneration.
    if (typeof window.showSection === "function" && !window.showSection.__wrapsManageUsers) {
      var originalShowSection = window.showSection;
      var wrapped = function (sectionId) {
        originalShowSection(sectionId);
        if (sectionId === "manage-users" && typeof loadManageUsers === "function") loadManageUsers();
      };
      wrapped.__wrapsManageUsers = true;
      window.showSection = wrapped;
    }

    var link = document.createElement("a");
    link.id = "nav-manage-users";
    link.setAttribute("data-permission", "admin");
    link.setAttribute("onclick", "showSection('manage-users')");
    link.style.cursor = "pointer";
    link.textContent = "Manage Users";
    anchor.insertAdjacentElement("afterend", link);

    var section = document.createElement("div");
    section.id = "section-manage-users";
    section.className = "content-section";
    section.innerHTML =
      '<h2 class="page-title">Manage <span class="text-highlight">Users</span></h2>' +
      '<div class="upload-card" style="max-width: 800px; margin: 0 auto;">' +
      '  <div id="mu-alert" class="alert py-2" style="display:none; font-size: 0.85rem;"></div>' +
      '  <h5 class="fw-bold mb-3 border-bottom pb-2 text-start">Add a New Login</h5>' +
      '  <div class="row g-3 mb-2 text-start">' +
      '    <div class="col-md-6">' +
      '      <label class="form-label fw-bold small text-muted">Full Name <span class="text-danger">*</span></label>' +
      '      <input type="text" id="mu-name" class="form-control" placeholder="e.g. Juan Dela Cruz">' +
      "    </div>" +
      '    <div class="col-md-6">' +
      '      <label class="form-label fw-bold small text-muted">Email <span class="text-danger">*</span></label>' +
      '      <input type="email" id="mu-email" class="form-control" placeholder="name@vegastar.local">' +
      "    </div>" +
      '    <div class="col-md-6">' +
      '      <label class="form-label fw-bold small text-muted">Role <span class="text-danger">*</span></label>' +
      '      <select id="mu-role" class="form-select"><option value="">— Select Role —</option></select>' +
      "    </div>" +
      '    <div class="col-md-6">' +
      '      <label class="form-label fw-bold small text-muted">Temporary Password <span class="text-danger">*</span></label>' +
      '      <div class="input-group">' +
      '        <input type="text" id="mu-password" class="form-control" placeholder="At least 8 characters">' +
      '        <button type="button" class="btn btn-outline-secondary" id="mu-generate-btn">Generate</button>' +
      "      </div>" +
      '      <div class="form-text">Share this with them directly -- they\'ll be forced to set their own on first login.</div>' +
      "    </div>" +
      "  </div>" +
      '  <button id="mu-create-btn" class="btn btn-primary fw-bold w-100 mt-2 mb-4" type="button">Create Login</button>' +
      '  <h5 class="fw-bold mb-3 border-bottom pb-2 text-start">Existing Logins</h5>' +
      '  <div class="table-responsive">' +
      '    <table class="table table-sm align-middle">' +
      '      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th></th></tr></thead>' +
      '      <tbody id="mu-table-body"><tr><td colspan="6" class="text-center text-muted">Loading...</td></tr></tbody>' +
      "    </table>" +
      "  </div>" +
      '  <h5 class="fw-bold mb-3 mt-4 border-bottom pb-2 text-start">Roles &amp; Tab Access</h5>' +
      '  <p class="small text-muted text-start">Controls which tabs each role sees in the top navigation. Admin always has full access.</p>' +
      '  <div class="table-responsive">' +
      '    <table class="table table-sm align-middle">' +
      '      <thead><tr><th>Role</th><th>Tabs</th><th></th></tr></thead>' +
      '      <tbody id="mu-roles-table-body"><tr><td colspan="3" class="text-center text-muted">Loading...</td></tr></tbody>' +
      "    </table>" +
      "  </div>" +
      "</div>" +
      buildEditModal() +
      buildResetModal() +
      buildRolePermissionsModal();

    var mainContainer = document.querySelector(".main-container");
    if (mainContainer) mainContainer.appendChild(section);

    document.getElementById("mu-generate-btn").addEventListener("click", function () {
      document.getElementById("mu-password").value = randomPassword();
    });
    document.getElementById("mu-create-btn").addEventListener("click", createUser);
    document.getElementById("mu-edit-save-btn").addEventListener("click", saveEdit);
    document.getElementById("mu-reset-generate-btn").addEventListener("click", function () {
      document.getElementById("mu-reset-password").value = randomPassword();
    });
    document.getElementById("mu-reset-save-btn").addEventListener("click", saveReset);
    document.getElementById("mu-role-perm-save-btn").addEventListener("click", saveRolePermissions);

    // The nav link's data-permission="admin" (set above) was added after
    // the one-time permission filter already ran at login -- re-run it so
    // this doesn't stay visible to every role regardless of permission.
    if (typeof window.reapplyPermissions === "function") window.reapplyPermissions();

    window.loadManageUsers = function () {
      google.script.run
        .withSuccessHandler(function (res) {
          usersCache = res.users;
          var roleSelect = document.getElementById("mu-role");
          var roleOptions = '<option value="">— Select Role —</option>' +
            res.roles.map(function (r) { return '<option value="' + r + '">' + r + "</option>"; }).join("");
          roleSelect.innerHTML = roleOptions;
          document.getElementById("mu-edit-role").innerHTML = roleOptions;
          renderTable();
        })
        .withFailureHandler(function (err) { showAlert("Error loading users: " + err.message); })
        .getUsersList();

      google.script.run
        .withSuccessHandler(function (res) {
          rolePermissionsCache = res.roles;
          allTabsCache = res.allTabs;
          renderRolesTable();
        })
        .withFailureHandler(function (err) { showAlert("Error loading role permissions: " + err.message); })
        .getRolePermissions();
    };

    window.deactivateUser = function (id, email) {
      if (!confirm('Deactivate the login for "' + email + '"? They will no longer be able to log in.')) return;
      google.script.run
        .withSuccessHandler(function () { loadManageUsers(); })
        .withFailureHandler(function (err) { showAlert("Error: " + err.message); })
        .deactivateUser(id);
    };

    window.reactivateUser = function (id, email) {
      google.script.run
        .withSuccessHandler(function () { showAlert('Reactivated "' + email + '".', "success"); loadManageUsers(); })
        .withFailureHandler(function (err) { showAlert("Error: " + err.message); })
        .reactivateUser(id);
    };

    window.openEditUser = function (id) {
      var u = usersCache.find(function (x) { return x.id === id; });
      if (!u) return;
      document.getElementById("mu-edit-id").value = u.id;
      document.getElementById("mu-edit-name").value = u.name;
      document.getElementById("mu-edit-email").value = u.email;
      document.getElementById("mu-edit-role").value = u.role;
      document.getElementById("mu-edit-alert").style.display = "none";
      new bootstrap.Modal(document.getElementById("editUserModal")).show();
    };

    window.openRolePermissions = function (role) {
      var entry = rolePermissionsCache.find(function (r) { return r.role === role; });
      var currentTabs = entry ? entry.tabs : [];

      document.getElementById("mu-role-perm-role").value = role;
      document.getElementById("mu-role-perm-role-label").textContent = role;
      document.getElementById("mu-role-perm-alert").style.display = "none";
      document.getElementById("mu-role-perm-checklist").innerHTML = allTabsCache.map(function (tab) {
        var checked = currentTabs.indexOf(tab) !== -1 ? " checked" : "";
        var id = "mu-role-perm-tab-" + tab.replace(/[^a-z0-9]/gi, "-");
        return '<div class="form-check">' +
          '<input class="form-check-input" type="checkbox" value="' + escapeHtml(tab) + '" id="' + id + '"' + checked + '>' +
          '<label class="form-check-label" for="' + id + '">' + escapeHtml(tabLabel(tab)) + "</label>" +
          "</div>";
      }).join("");
      new bootstrap.Modal(document.getElementById("rolePermissionsModal")).show();
    };

    window.openResetPassword = function (id, email) {
      document.getElementById("mu-reset-id").value = id;
      document.getElementById("mu-reset-email-label").textContent = email;
      document.getElementById("mu-reset-password").value = "";
      document.getElementById("mu-reset-alert").style.display = "none";
      new bootstrap.Modal(document.getElementById("resetPasswordModal")).show();
    };
  }

  function buildEditModal() {
    return '<div class="modal fade" id="editUserModal" tabindex="-1" aria-hidden="true">' +
      '  <div class="modal-dialog modal-dialog-centered">' +
      '    <div class="modal-content border-0 shadow">' +
      '      <div class="modal-header"><h5 class="modal-title fw-bold">Edit User</h5>' +
      '        <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
      '      <div class="modal-body">' +
      '        <div id="mu-edit-alert" class="alert alert-danger py-2" style="display:none; font-size: 0.85rem;"></div>' +
      '        <input type="hidden" id="mu-edit-id">' +
      '        <div class="mb-3"><label class="form-label fw-bold small text-muted">Full Name</label>' +
      '          <input type="text" id="mu-edit-name" class="form-control"></div>' +
      '        <div class="mb-3"><label class="form-label fw-bold small text-muted">Email</label>' +
      '          <input type="email" id="mu-edit-email" class="form-control"></div>' +
      '        <div class="mb-2"><label class="form-label fw-bold small text-muted">Role</label>' +
      '          <select id="mu-edit-role" class="form-select"></select></div>' +
      "      </div>" +
      '      <div class="modal-footer">' +
      '        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>' +
      '        <button type="button" class="btn btn-primary fw-bold" id="mu-edit-save-btn">Save Changes</button>' +
      "      </div>" +
      "    </div></div></div>";
  }

  function buildResetModal() {
    return '<div class="modal fade" id="resetPasswordModal" tabindex="-1" aria-hidden="true">' +
      '  <div class="modal-dialog modal-dialog-centered">' +
      '    <div class="modal-content border-0 shadow">' +
      '      <div class="modal-header"><h5 class="modal-title fw-bold">Reset Password</h5>' +
      '        <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
      '      <div class="modal-body">' +
      '        <p class="small text-muted">Setting a new password for <strong id="mu-reset-email-label"></strong>. ' +
      "        They'll be forced to set their own on next login.</p>" +
      '        <div id="mu-reset-alert" class="alert alert-danger py-2" style="display:none; font-size: 0.85rem;"></div>' +
      '        <input type="hidden" id="mu-reset-id">' +
      '        <label class="form-label fw-bold small text-muted">New Temporary Password</label>' +
      '        <div class="input-group">' +
      '          <input type="text" id="mu-reset-password" class="form-control" placeholder="At least 8 characters">' +
      '          <button type="button" class="btn btn-outline-secondary" id="mu-reset-generate-btn">Generate</button>' +
      "        </div>" +
      "      </div>" +
      '      <div class="modal-footer">' +
      '        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>' +
      '        <button type="button" class="btn btn-primary fw-bold" id="mu-reset-save-btn">Set Password</button>' +
      "      </div>" +
      "    </div></div></div>";
  }

  function buildRolePermissionsModal() {
    return '<div class="modal fade" id="rolePermissionsModal" tabindex="-1" aria-hidden="true">' +
      '  <div class="modal-dialog modal-dialog-centered">' +
      '    <div class="modal-content border-0 shadow">' +
      '      <div class="modal-header"><h5 class="modal-title fw-bold">Tab Access for <span id="mu-role-perm-role-label"></span></h5>' +
      '        <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
      '      <div class="modal-body">' +
      '        <div id="mu-role-perm-alert" class="alert alert-danger py-2" style="display:none; font-size: 0.85rem;"></div>' +
      '        <input type="hidden" id="mu-role-perm-role">' +
      '        <p class="small text-muted">Check every tab this role should be able to see.</p>' +
      '        <div id="mu-role-perm-checklist"></div>' +
      "      </div>" +
      '      <div class="modal-footer">' +
      '        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>' +
      '        <button type="button" class="btn btn-primary fw-bold" id="mu-role-perm-save-btn">Save Access</button>' +
      "      </div>" +
      "    </div></div></div>";
  }

  function tabLabel(tab) {
    return tab.replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function renderRolesTable() {
    var body = document.getElementById("mu-roles-table-body");
    if (!rolePermissionsCache.length) {
      body.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No roles found.</td></tr>';
      return;
    }
    body.innerHTML = rolePermissionsCache.map(function (r) {
      var isAdmin = r.role.toLowerCase() === "admin";
      var tabsDisplay = isAdmin
        ? '<span class="badge bg-secondary">All tabs</span>'
        : r.tabs.map(function (t) { return '<span class="badge bg-light text-dark border me-1">' + escapeHtml(tabLabel(t)) + "</span>"; }).join(" ") || '<span class="text-muted">No tabs</span>';
      var actionCell = isAdmin
        ? ""
        : '<button class="btn btn-sm btn-outline-secondary" onclick="openRolePermissions(\'' + jsStr(r.role) + '\')">Edit Access</button>';
      return "<tr>" +
        '<td><span class="badge bg-secondary">' + escapeHtml(r.role) + "</span></td>" +
        "<td>" + tabsDisplay + "</td>" +
        '<td class="text-nowrap">' + actionCell + "</td>" +
        "</tr>";
    }).join("");
  }

  function saveRolePermissions() {
    var role = document.getElementById("mu-role-perm-role").value;
    var checked = Array.prototype.slice.call(
      document.querySelectorAll("#mu-role-perm-checklist input[type=checkbox]:checked")
    ).map(function (cb) { return cb.value; });
    var btn = document.getElementById("mu-role-perm-save-btn");
    var alertBox = document.getElementById("mu-role-perm-alert");
    alertBox.style.display = "none";

    btn.disabled = true;
    btn.textContent = "Saving...";
    google.script.run
      .withSuccessHandler(function () {
        btn.disabled = false;
        btn.textContent = "Save Access";
        bootstrap.Modal.getInstance(document.getElementById("rolePermissionsModal")).hide();
        showAlert('Updated tab access for "' + role + '".', "success");
        loadManageUsers();
      })
      .withFailureHandler(function (err) {
        btn.disabled = false;
        btn.textContent = "Save Access";
        alertBox.textContent = "Error: " + err.message;
        alertBox.style.display = "block";
      })
      .updateRolePermissions(role, checked);
  }

  function randomPassword() {
    var chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    var pw = "";
    for (var i = 0; i < 10; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    return pw;
  }

  function renderTable() {
    var body = document.getElementById("mu-table-body");
    if (!usersCache.length) {
      body.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No users yet.</td></tr>';
      return;
    }
    body.innerHTML = usersCache.map(function (u) {
      var statusBadge = u.active
        ? '<span class="badge bg-success">Active</span>'
        : '<span class="badge bg-secondary">Inactive</span>';
      var actionBtn = u.active
        ? '<button class="btn btn-sm btn-outline-danger" onclick="deactivateUser(' + u.id + ", '" +
          jsStr(u.email) + "')\">Deactivate</button>"
        : '<button class="btn btn-sm btn-outline-success" onclick="reactivateUser(' + u.id + ", '" +
          jsStr(u.email) + "')\">Reactivate</button>";
      return "<tr>" +
        "<td>" + escapeHtml(u.name) + "</td>" +
        "<td>" + escapeHtml(u.email) + "</td>" +
        '<td><span class="badge bg-secondary">' + escapeHtml(u.role) + "</span></td>" +
        "<td>" + statusBadge + "</td>" +
        "<td>" + escapeHtml(u.createdAt) + "</td>" +
        '<td class="text-nowrap">' +
          '<button class="btn btn-sm btn-outline-secondary me-1" onclick="openEditUser(' + u.id + ')">Edit</button>' +
          '<button class="btn btn-sm btn-outline-secondary me-1" onclick="openResetPassword(' + u.id + ", '" +
            jsStr(u.email) + "')\">Reset Password</button>" +
          actionBtn +
        "</td>" +
        "</tr>";
    }).join("");
  }

  function jsStr(s) {
    return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function showAlert(msg, kind) {
    var box = document.getElementById("mu-alert");
    box.textContent = msg;
    box.className = "alert py-2 alert-" + (kind || "danger");
    box.style.display = "block";
  }

  function createUser() {
    var name = document.getElementById("mu-name").value.trim();
    var email = document.getElementById("mu-email").value.trim();
    var role = document.getElementById("mu-role").value;
    var password = document.getElementById("mu-password").value;
    var btn = document.getElementById("mu-create-btn");

    if (!name || !email || !role || !password) {
      showAlert("Please fill in Name, Email, Role, and Password.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Creating...";

    google.script.run
      .withSuccessHandler(function (res) {
        btn.disabled = false;
        btn.textContent = "Create Login";
        document.getElementById("mu-name").value = "";
        document.getElementById("mu-email").value = "";
        document.getElementById("mu-role").value = "";
        document.getElementById("mu-password").value = "";
        showAlert('Created login for "' + res.email + '".', "success");
        loadManageUsers();
      })
      .withFailureHandler(function (err) {
        btn.disabled = false;
        btn.textContent = "Create Login";
        showAlert("Error: " + err.message);
      })
      .createUser({ name: name, email: email, role: role, password: password });
  }

  function saveEdit() {
    var id = parseInt(document.getElementById("mu-edit-id").value, 10);
    var name = document.getElementById("mu-edit-name").value.trim();
    var email = document.getElementById("mu-edit-email").value.trim();
    var role = document.getElementById("mu-edit-role").value;
    var btn = document.getElementById("mu-edit-save-btn");
    var alertBox = document.getElementById("mu-edit-alert");
    alertBox.style.display = "none";

    if (!name || !email || !role) {
      alertBox.textContent = "Please fill in Name, Email, and Role.";
      alertBox.style.display = "block";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Saving...";
    google.script.run
      .withSuccessHandler(function () {
        btn.disabled = false;
        btn.textContent = "Save Changes";
        bootstrap.Modal.getInstance(document.getElementById("editUserModal")).hide();
        showAlert("User updated.", "success");
        loadManageUsers();
      })
      .withFailureHandler(function (err) {
        btn.disabled = false;
        btn.textContent = "Save Changes";
        alertBox.textContent = "Error: " + err.message;
        alertBox.style.display = "block";
      })
      .updateUser(id, { name: name, email: email, role: role });
  }

  function saveReset() {
    var id = parseInt(document.getElementById("mu-reset-id").value, 10);
    var password = document.getElementById("mu-reset-password").value;
    var btn = document.getElementById("mu-reset-save-btn");
    var alertBox = document.getElementById("mu-reset-alert");
    alertBox.style.display = "none";

    if (password.length < 8) {
      alertBox.textContent = "Password must be at least 8 characters.";
      alertBox.style.display = "block";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Saving...";
    google.script.run
      .withSuccessHandler(function () {
        btn.disabled = false;
        btn.textContent = "Set Password";
        bootstrap.Modal.getInstance(document.getElementById("resetPasswordModal")).hide();
        showAlert("Password reset. Share the new temporary password with them directly.", "success");
      })
      .withFailureHandler(function (err) {
        btn.disabled = false;
        btn.textContent = "Set Password";
        alertBox.textContent = "Error: " + err.message;
        alertBox.style.display = "block";
      })
      .resetPassword(id, password);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
