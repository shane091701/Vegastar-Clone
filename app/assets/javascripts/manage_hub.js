// Hides the admin-only "Manage Users" and "Manage Companies" nav links.
// manage_users.js / manage_companies.js still build these links and their
// sections exactly as before -- this just makes them unreachable from the
// nav. "Manage Data" (csv_import.js) is untouched and stays directly
// reachable. Runs after both pieces exist since each is built asynchronously
// on DOMContentLoaded by its own module (see script include order in
// index.html.erb).
(function () {
  var HIDDEN_NAV_IDS = ["nav-manage-users", "nav-manage-companies"];

  function allPiecesReady() {
    return HIDDEN_NAV_IDS.every(function (id) { return document.getElementById(id); });
  }

  function init() {
    HIDDEN_NAV_IDS.forEach(function (id) {
      var nav = document.getElementById(id);
      if (nav) nav.style.display = "none";
    });
  }

  var attempts = 0;
  var interval = setInterval(function () {
    attempts++;
    if (allPiecesReady()) {
      clearInterval(interval);
      init();
    } else if (attempts > 50) {
      clearInterval(interval); // give up quietly after ~5s
    }
  }, 100);
})();
