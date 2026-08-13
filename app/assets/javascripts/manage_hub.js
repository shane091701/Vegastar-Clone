// Hides the admin-only "Manage Companies" nav link. "Manage Users" was
// previously hidden here too but is now shown again -- manage_users.js
// still builds its link and section exactly as before, so nothing else
// needed to change. manage_companies.js still builds its own link/section
// too -- this just makes it unreachable from the nav. "Manage Data"
// (csv_import.js) is untouched and stays directly reachable.
(function () {
  var HIDDEN_NAV_IDS = ["nav-manage-companies"];

  // Hides whichever nav links in HIDDEN_NAV_IDS currently exist.
  function hideAll() {
    var allExist = true;
    HIDDEN_NAV_IDS.forEach(function (id) {
      var nav = document.getElementById(id);
      if (nav) {
        nav.style.display = "none";
      } else {
        allExist = false;
      }
    });
    return allExist;
  }

  // Script include order (index.html.erb) runs manage_companies.js before
  // this file, and it calls its init() synchronously rather than waiting on
  // DOMContentLoaded (see its own readyState check) -- so by the time this
  // line runs, the link normally already exists and gets hidden in the same
  // tick, with no visible flash. The interval below is only a safety net in
  // case that ordering ever changes.
  if (!hideAll()) {
    var attempts = 0;
    var interval = setInterval(function () {
      attempts++;
      if (hideAll() || attempts > 50) clearInterval(interval); // give up quietly after ~5s
    }, 100);
  }

  // The hide above only covers page load. portal.js's applyPermissions()
  // runs again on every login and on every "already have a session" restore
  // (see its two call sites), and unconditionally re-shows every
  // data-permission="admin" element for an admin user -- including this
  // link -- because it has no notion of "force hidden regardless of
  // permission". That undoes the hide above the moment an admin actually
  // logs in, which is the whole point of this file. Wrap the function
  // (same technique manage_users.js already uses for showSection) so the
  // hide is reasserted every time permissions are (re)applied, from
  // whichever caller: portal.js's own login/session-restore flow, or
  // window.reapplyPermissions() as called by other deferred scripts.
  function wrapApplyPermissions() {
    if (typeof window.applyPermissions !== "function" || window.applyPermissions.__wrapsManageHub) return false;
    var original = window.applyPermissions;
    var wrapped = function (allowedTabs) {
      var result = original(allowedTabs);
      hideAll();
      return result;
    };
    wrapped.__wrapsManageHub = true;
    window.applyPermissions = wrapped;
    return true;
  }

  if (!wrapApplyPermissions()) {
    var wrapAttempts = 0;
    var wrapInterval = setInterval(function () {
      wrapAttempts++;
      if (wrapApplyPermissions() || wrapAttempts > 50) clearInterval(wrapInterval); // give up quietly after ~5s
    }, 100);
  }
})();
