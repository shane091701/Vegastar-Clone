// "Manage Users" -- admin-only screen to create new logins and see who has
// access. The original system had no account-creation UI either (accounts
// only ever came from db:seed); this closes that gap. Kept out of
// portal.js because that file is regenerated from Source/ by
// tools/port_frontend.ps1.
(function () {
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
      '<div class="upload-card" style="max-width: 750px; margin: 0 auto;">' +
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
      '      <div class="form-text">Share this with them directly -- have them change it after first login.</div>' +
      "    </div>" +
      "  </div>" +
      '  <button id="mu-create-btn" class="btn btn-primary fw-bold w-100 mt-2 mb-4" type="button">Create Login</button>' +
      '  <h5 class="fw-bold mb-3 border-bottom pb-2 text-start">Existing Logins</h5>' +
      '  <div class="table-responsive">' +
      '    <table class="table table-sm align-middle">' +
      '      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Created</th><th></th></tr></thead>' +
      '      <tbody id="mu-table-body"><tr><td colspan="5" class="text-center text-muted">Loading...</td></tr></tbody>' +
      "    </table>" +
      "  </div>" +
      "</div>";

    var mainContainer = document.querySelector(".main-container");
    if (mainContainer) mainContainer.appendChild(section);

    document.getElementById("mu-generate-btn").addEventListener("click", function () {
      var chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
      var pw = "";
      for (var i = 0; i < 10; i++) pw += chars[Math.floor(Math.random() * chars.length)];
      document.getElementById("mu-password").value = pw;
    });

    document.getElementById("mu-create-btn").addEventListener("click", createUser);

    window.loadManageUsers = function () {
      google.script.run
        .withSuccessHandler(function (res) {
          var roleSelect = document.getElementById("mu-role");
          var currentVal = roleSelect.value;
          roleSelect.innerHTML = '<option value="">— Select Role —</option>' +
            res.roles.map(function (r) { return '<option value="' + r + '">' + r + "</option>"; }).join("");
          roleSelect.value = currentVal;

          var body = document.getElementById("mu-table-body");
          if (!res.users.length) {
            body.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No users yet.</td></tr>';
            return;
          }
          body.innerHTML = res.users.map(function (u) {
            return "<tr>" +
              "<td>" + escapeHtml(u.name) + "</td>" +
              "<td>" + escapeHtml(u.email) + "</td>" +
              '<td><span class="badge bg-secondary">' + escapeHtml(u.role) + "</span></td>" +
              "<td>" + escapeHtml(u.createdAt) + "</td>" +
              '<td><button class="btn btn-sm btn-outline-danger" onclick="deactivateUser(' + u.id + ', \'' +
                escapeHtml(u.email).replace(/'/g, "\\'") + '\')">Deactivate</button></td>' +
              "</tr>";
          }).join("");
        })
        .withFailureHandler(function (err) { showAlert("Error loading users: " + err.message); })
        .getUsersList();
    };

    window.deactivateUser = function (id, email) {
      if (!confirm('Deactivate the login for "' + email + '"? They will no longer be able to log in.')) return;
      google.script.run
        .withSuccessHandler(function () { loadManageUsers(); })
        .withFailureHandler(function (err) { showAlert("Error: " + err.message); })
        .deactivateUser(id);
    };
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
