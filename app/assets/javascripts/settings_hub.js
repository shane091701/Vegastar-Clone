// Consolidates the standalone "Manage Users" (manage_users.js) and
// "Manage Data" (csv_import.js) top-level nav links into a single "Settings"
// dropdown, mirroring the existing nav-group-* dropdown pattern (e.g.
// nav-group-payments). This re-parents their already-built <a> elements
// into a new dropdown group rather than touching those files' own
// link/section-building logic, so nothing about how those sections load
// needs to change.
(function () {
  var GROUP_ID = "nav-group-settings";
  var MOVE_IDS = ["nav-manage-users", "nav-csv-import"];

  // Script include order (index.html.erb) runs csv_import.js and
  // manage_users.js before this file, so their links/sections normally
  // already exist by the time this line runs. The interval below is only a
  // safety net in case that ordering ever changes (same technique as
  // manage_hub.js).
  function buildGroup() {
    if (document.getElementById(GROUP_ID)) return true;
    var anchor = document.getElementById("nav-expense");
    var links = MOVE_IDS.map(function (id) { return document.getElementById(id); });
    if (!anchor || links.some(function (l) { return !l; })) return false;

    var group = document.createElement("div");
    group.className = "dropdown";
    group.id = GROUP_ID;
    group.style.display = "none"; // permission-driven, like the other nav-group-* wrappers
    group.innerHTML =
      '<a class="dropdown-toggle" role="button" data-bs-toggle="dropdown" aria-expanded="false">Settings</a>' +
      '<ul class="dropdown-menu"></ul>';
    anchor.insertAdjacentElement("afterend", group);

    var menu = group.querySelector(".dropdown-menu");
    links.forEach(function (link) {
      var li = document.createElement("li");
      li.setAttribute("data-permission", link.getAttribute("data-permission") || "admin");
      link.classList.add("dropdown-item");
      menu.appendChild(li);
      li.appendChild(link);
    });

    reapplyGroupVisibility();
    return true;
  }

  // Same collapse rule portal.js's applyPermissions() applies to the other
  // nav-group-* wrappers: show the group only if at least one permissioned
  // child link is currently visible.
  function reapplyGroupVisibility() {
    var group = document.getElementById(GROUP_ID);
    if (!group) return;
    var items = group.querySelectorAll("li[data-permission]");
    var anyVisible = Array.prototype.some.call(items, function (li) { return li.style.display !== "none"; });
    group.style.display = anyVisible ? "inline-block" : "none";
  }

  // portal.js's applyPermissions() has no notion of this group (it's built
  // after that function's hardcoded nav-group-* list runs), so re-run our own
  // collapse check every time permissions are (re)applied -- same wrapping
  // technique manage_hub.js and manage_users.js already use.
  function wrapApplyPermissions() {
    if (typeof window.applyPermissions !== "function" || window.applyPermissions.__wrapsSettingsHub) return false;
    var original = window.applyPermissions;
    var wrapped = function (allowedTabs) {
      var result = original(allowedTabs);
      reapplyGroupVisibility();
      return result;
    };
    wrapped.__wrapsSettingsHub = true;
    window.applyPermissions = wrapped;
    return true;
  }

  if (!buildGroup()) {
    var attempts = 0;
    var interval = setInterval(function () {
      attempts++;
      if (buildGroup() || attempts > 50) clearInterval(interval); // give up quietly after ~5s
    }, 100);
  }

  if (!wrapApplyPermissions()) {
    var wrapAttempts = 0;
    var wrapInterval = setInterval(function () {
      wrapAttempts++;
      if (wrapApplyPermissions() || wrapAttempts > 50) clearInterval(wrapInterval); // give up quietly after ~5s
    }, 100);
  }
})();
