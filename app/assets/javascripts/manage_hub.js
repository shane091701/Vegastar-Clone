// Consolidates the separate "Manage Users", "Manage Data", and "Manage
// Companies" top-nav items into a single "Manage" tab with sub-tabs, since
// having three admin-only top-level nav items got cluttered fast. This runs
// after manage_users.js / csv_import.js / manage_companies.js have already
// built their sections (see script include order in index.html.erb) and
// just re-homes their existing DOM instead of duplicating any of their
// logic. Kept as its own file for the same reason those are: portal.js /
// index.html.erb are regenerated from Source/ by tools/port_frontend.ps1.
(function () {
  var SUB_TABS = [
    { key: "users", label: "Users", sectionId: "section-manage-users", navId: "nav-manage-users" },
    { key: "data", label: "Data", sectionId: "section-csv-import", navId: "nav-csv-import" },
    { key: "companies", label: "Companies", sectionId: "section-manage-companies", navId: "nav-manage-companies" }
  ];

  var activeTab = "users";

  function allPiecesReady() {
    return SUB_TABS.every(function (t) { return document.getElementById(t.sectionId); });
  }

  function showTab(key) {
    activeTab = key;
    SUB_TABS.forEach(function (t) {
      var panel = document.getElementById(t.sectionId);
      if (panel) panel.style.display = t.key === key ? "" : "none";
      var pill = document.getElementById("manage-hub-tab-" + t.key);
      if (pill) pill.classList.toggle("active", t.key === key);
    });
    if (key === "data" && typeof window.loadRecords === "function") window.loadRecords();
    if (key === "users" && typeof window.loadManageUsers === "function") window.loadManageUsers();
    // Companies tab needs no explicit refresh call: manage_companies.js
    // already loads the list once on page load and keeps it in sync after
    // every create/rename/delete.
  }

  function init() {
    if (!allPiecesReady() || document.getElementById("nav-manage")) return;

    var mainContainer = document.querySelector(".main-container");
    var oldAnchor = document.getElementById(SUB_TABS[0].navId);
    if (!mainContainer || !oldAnchor) return;

    // Build the single top-level nav item where "Manage Users" used to be,
    // then hide the three original nav links (their sections get re-homed
    // below, so the links have nothing left to point at independently).
    var link = document.createElement("a");
    link.id = "nav-manage";
    link.setAttribute("data-permission", "admin");
    link.setAttribute("onclick", "showSection('manage')");
    link.style.cursor = "pointer";
    link.textContent = "Manage";
    oldAnchor.insertAdjacentElement("afterend", link);

    SUB_TABS.forEach(function (t) {
      var nav = document.getElementById(t.navId);
      if (nav) nav.style.display = "none";
    });

    // Wrapper section + sub-tab pills.
    var section = document.createElement("div");
    section.id = "section-manage";
    section.className = "content-section";
    var pillsHtml = SUB_TABS.map(function (t) {
      return '<button type="button" class="btn btn-sm btn-outline-primary manage-hub-pill" id="manage-hub-tab-' + t.key + '">' +
        t.label + "</button>";
    }).join(" ");
    section.innerHTML =
      '<h2 class="page-title">Manage</h2>' +
      '<div class="d-flex gap-2 mb-4" id="manage-hub-pills">' + pillsHtml + "</div>";
    mainContainer.appendChild(section);

    SUB_TABS.forEach(function (t) {
      var pill = document.getElementById("manage-hub-tab-" + t.key);
      pill.addEventListener("click", function () { showTab(t.key); });
    });

    // Re-home the three existing sections as sub-panels: strip
    // "content-section" so the global showSection()'s hide-all-and-show-one
    // pass (querySelectorAll('.content-section')) leaves them alone -- their
    // visibility is now controlled only by showTab() above.
    SUB_TABS.forEach(function (t) {
      var panel = document.getElementById(t.sectionId);
      panel.classList.remove("content-section", "active");
      panel.style.display = "none";
      section.appendChild(panel);
    });

    // Re-show whichever sub-tab was active whenever the Manage tab itself
    // is opened (showSection('manage') only toggles the wrapper's own
    // "active" class -- it doesn't know about our sub-panels).
    if (typeof window.showSection === "function" && !window.showSection.__wrapsManageHub) {
      var original = window.showSection;
      var wrapped = function (sectionId) {
        original(sectionId);
        if (sectionId === "manage") showTab(activeTab);
      };
      wrapped.__wrapsManageHub = true;
      window.showSection = wrapped;
    }

    showTab("users");

    // The "Manage" link's data-permission="admin" was just added above --
    // the one-time permission filter already ran at login, long before this
    // deferred script finished its own async setup, so without this the
    // link would stay visible to every role regardless of permission.
    if (typeof window.reapplyPermissions === "function") window.reapplyPermissions();
  }

  // The three source sections are each built asynchronously by their own
  // module on DOMContentLoaded -- poll briefly until all exist rather than
  // guessing a fixed delay.
  var attempts = 0;
  var interval = setInterval(function () {
    attempts++;
    if (allPiecesReady()) {
      clearInterval(interval);
      init();
    } else if (attempts > 50) {
      clearInterval(interval); // give up quietly after ~5s; nav items still work individually
    }
  }, 100);
})();
