// Forces a password change for accounts created with a temporary password
// (must_change_password:true -- see Api::UsersController#create_user).
//
// portal.js's login success handler and window.onload session-restore both
// stash the full profile in localStorage under "alphaErpUser" before doing
// anything else, and both are un-editable regenerated code, so rather than
// hooking their internals this just polls that localStorage key. The real
// enforcement is server-side (Api::BaseController#require_password_changed!
// blocks every other endpoint with a 403) -- this modal is the UX layer on
// top of that, not the security boundary itself.
(function () {
  var shown = false;

  function currentProfile() {
    try {
      return JSON.parse(localStorage.getItem("alphaErpUser") || "null");
    } catch (e) {
      return null;
    }
  }

  function buildModal() {
    if (document.getElementById("forcePasswordModal")) return;
    var wrap = document.createElement("div");
    wrap.innerHTML =
      '<div class="modal" id="forcePasswordModal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false" aria-hidden="true">' +
      '  <div class="modal-dialog modal-dialog-centered">' +
      '    <div class="modal-content border-0 shadow">' +
      '      <div class="modal-header">' +
      '        <h5 class="modal-title fw-bold">Set Your Password</h5>' +
      "      </div>" +
      '      <div class="modal-body">' +
      '        <p class="small text-muted">You logged in with a temporary password. Set your own before continuing.</p>' +
      '        <div id="fp-alert" class="alert alert-danger py-2" style="display:none; font-size: 0.85rem;"></div>' +
      '        <div class="mb-3">' +
      '          <label class="form-label fw-bold small text-muted">New Password</label>' +
      '          <input type="password" id="fp-new" class="form-control" placeholder="At least 8 characters">' +
      "        </div>" +
      '        <div class="mb-2">' +
      '          <label class="form-label fw-bold small text-muted">Confirm New Password</label>' +
      '          <input type="password" id="fp-confirm" class="form-control" placeholder="Re-type it">' +
      "        </div>" +
      "      </div>" +
      '      <div class="modal-footer">' +
      '        <button type="button" class="btn btn-primary fw-bold w-100" id="fp-submit-btn">Set Password &amp; Continue</button>' +
      "      </div>" +
      "    </div>" +
      "  </div>" +
      "</div>";
    document.body.appendChild(wrap.firstElementChild);

    document.getElementById("fp-submit-btn").addEventListener("click", submit);
    ["fp-new", "fp-confirm"].forEach(function (id) {
      document.getElementById(id).addEventListener("keydown", function (e) {
        if (e.key === "Enter") submit();
      });
    });
  }

  function showAlert(msg) {
    var box = document.getElementById("fp-alert");
    box.textContent = msg;
    box.style.display = "block";
  }

  function submit() {
    var pw = document.getElementById("fp-new").value;
    var confirm = document.getElementById("fp-confirm").value;
    var btn = document.getElementById("fp-submit-btn");

    if (pw.length < 8) {
      showAlert("Password must be at least 8 characters.");
      return;
    }
    if (pw !== confirm) {
      showAlert("Passwords don't match.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Saving...";

    google.script.run
      .withSuccessHandler(function () {
        var profile = currentProfile();
        if (profile) {
          profile.mustChangePassword = false;
          localStorage.setItem("alphaErpUser", JSON.stringify(profile));
        }
        bootstrap.Modal.getInstance(document.getElementById("forcePasswordModal")).hide();
        shown = false;
      })
      .withFailureHandler(function (err) {
        btn.disabled = false;
        btn.textContent = "Set Password & Continue";
        showAlert("Error: " + err.message);
      })
      .changePassword(pw);
  }

  function poll() {
    if (shown) return;
    var appVisible = document.getElementById("app-content") &&
      getComputedStyle(document.getElementById("app-content")).display !== "none";
    if (!appVisible) return;

    var profile = currentProfile();
    if (profile && profile.mustChangePassword) {
      shown = true;
      buildModal();
      new bootstrap.Modal(document.getElementById("forcePasswordModal")).show();
    }
  }

  setInterval(poll, 400);
})();
