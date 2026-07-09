// "Change Password" -- lets any logged-in user change their own password
// voluntarily, any time (distinct from the mandatory first-login change in
// password_policy.js, and from an admin's "Reset Password" for someone
// else in Manage Users). Kept out of portal.js because that file is
// regenerated from Source/ by tools/port_frontend.ps1.
(function () {
  function init() {
    var profileBox = document.querySelector(".user-profile");
    if (!profileBox || document.getElementById("changePasswordBtn")) return;

    var btn = document.createElement("button");
    btn.id = "changePasswordBtn";
    btn.className = "btn btn-sm btn-outline-secondary ms-2";
    btn.style.cssText = "font-size: 0.75rem; padding: 0.25rem 0.75rem;";
    btn.textContent = "Change Password";
    btn.onclick = openChangePasswordModal;
    profileBox.insertBefore(btn, profileBox.querySelector("button"));

    var modal = document.createElement("div");
    modal.innerHTML =
      '<div class="modal fade" id="changePasswordModal" tabindex="-1" aria-hidden="true">' +
      '  <div class="modal-dialog modal-dialog-centered">' +
      '    <div class="modal-content border-0 shadow">' +
      '      <div class="modal-header">' +
      '        <h5 class="modal-title fw-bold">Change Password</h5>' +
      '        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
      '      </div>' +
      '      <div class="modal-body">' +
      '        <div id="cp-alert" class="alert py-2" style="display:none; font-size: 0.85rem;"></div>' +
      '        <div class="mb-3">' +
      '          <label class="form-label fw-bold small text-muted">Current Password</label>' +
      '          <input type="password" id="cp-current" class="form-control">' +
      "        </div>" +
      '        <div class="mb-3">' +
      '          <label class="form-label fw-bold small text-muted">New Password</label>' +
      '          <input type="password" id="cp-new" class="form-control" placeholder="At least 8 characters">' +
      "        </div>" +
      '        <div class="mb-2">' +
      '          <label class="form-label fw-bold small text-muted">Confirm New Password</label>' +
      '          <input type="password" id="cp-confirm" class="form-control" placeholder="Re-type it">' +
      "        </div>" +
      "      </div>" +
      '      <div class="modal-footer">' +
      '        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>' +
      '        <button type="button" class="btn btn-primary fw-bold" id="cp-save-btn">Save Password</button>' +
      "      </div>" +
      "    </div>" +
      "  </div>" +
      "</div>";
    document.body.appendChild(modal.firstElementChild);

    document.getElementById("cp-save-btn").addEventListener("click", submit);
  }

  function showAlert(msg, kind) {
    var box = document.getElementById("cp-alert");
    box.textContent = msg;
    box.className = "alert py-2 alert-" + (kind || "danger");
    box.style.display = "block";
  }

  window.openChangePasswordModal = function () {
    ["cp-current", "cp-new", "cp-confirm"].forEach(function (id) {
      document.getElementById(id).value = "";
    });
    document.getElementById("cp-alert").style.display = "none";
    new bootstrap.Modal(document.getElementById("changePasswordModal")).show();
  };

  function submit() {
    var current = document.getElementById("cp-current").value;
    var next = document.getElementById("cp-new").value;
    var confirm = document.getElementById("cp-confirm").value;
    var btn = document.getElementById("cp-save-btn");

    if (!current) {
      showAlert("Please enter your current password.");
      return;
    }
    if (next.length < 8) {
      showAlert("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      showAlert("New passwords don't match.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Saving...";

    google.script.run
      .withSuccessHandler(function () {
        btn.disabled = false;
        btn.textContent = "Save Password";
        bootstrap.Modal.getInstance(document.getElementById("changePasswordModal")).hide();
      })
      .withFailureHandler(function (err) {
        btn.disabled = false;
        btn.textContent = "Save Password";
        showAlert("Error: " + (err && err.message ? err.message : "could not change password"));
      })
      .changePassword(next, current);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
