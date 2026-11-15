/**
 * Synchronous first paint of the Tabler sidebar from session snapshot.
 * Never used as authorization — boot still validates session, PH and permissions.
 */
(function paintAsambleasShell() {
  try {
    var raw = sessionStorage.getItem("asambleas.shell.nav.v1");
    if (!raw) return;
    var snap = JSON.parse(raw);
    if (!snap || !snap.navHtml) return;

    var nav = document.getElementById("ia-nav");
    if (!nav) return;

    var params = new URLSearchParams(location.search);
    var urlPh = params.get("phId") || "";
    var snapPh = String(snap.phId || "");
    var page = (location.pathname.split("/").pop() || "").toLowerCase();
    var allowPh = !urlPh || snapPh === urlPh;

    nav.innerHTML = snap.navHtml;
    if (allowPh && snapPh) nav.setAttribute("data-ph-id", snapPh);
    else nav.removeAttribute("data-ph-id");

    if (!allowPh) {
      var sections = nav.querySelectorAll(".nav-section, .ia-nav-section");
      if (sections.length > 1) {
        for (var i = 1; i < sections.length; i += 1) sections[i].remove();
      }
    }

    var currentKey = page === "calendar.html" ? "calendar" : page === "assemblies-history.html" ? "history" : "";
    var hash = (location.hash || "").replace("#", "");
    if (page === "ph.html") {
      currentKey = urlPh ? (hash ? "ph-" + (hash === "info" ? "config" : hash === "resumen" ? "overview" : hash) : "ph-overview") : "ph-list";
    }

    nav.querySelectorAll("a[data-ia], a.nav-link").forEach(function (a) {
      var key = a.getAttribute("data-ia") || "";
      var on = currentKey && key === currentKey;
      if (!on && currentKey === "calendar") {
        on = (a.getAttribute("href") || "").indexOf("calendar.html") !== -1;
      }
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });

    if (snap.displayName) {
      var chip = document.getElementById("user-chip");
      if (chip) chip.textContent = snap.displayName;
    }
    if (snap.roleLabel) {
      var role = document.getElementById("ia-role-chip");
      if (role) role.textContent = snap.roleLabel;
    }
    if (snap.avatar) {
      var av = document.getElementById("user-avatar");
      if (av) av.textContent = snap.avatar;
    }
  } catch (err) {
    /* ignore — boot will paint the confirmed shell */
  }
})();
