// Expand guide group accordions in the sidebar by default.
// TypeDoc persists accordion state in `localStorage` with keys like
// "tsd-accordion-<data-key>". On first visit, if no preference is stored, we
// pre-set the guide groups to open.
(function () {
  var keys = [
    "Getting Started",
    "Getting Started$Guides",
    "Configuration",
    "Configuration$Guides",
    "Advanced",
    "Advanced$Guides",
    "Services",
    "Services$Guides",
  ];

  for (var i = 0; i < keys.length; i++) {
    var key = "tsd-accordion-" + keys[i];
    if (localStorage.getItem(key) === null) {
      localStorage.setItem(key, "true");
    }
  }
})();
