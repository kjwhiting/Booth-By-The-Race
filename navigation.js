function switchTab(tabId) {
  document.querySelectorAll(".tab-content").forEach(function (content) {
    content.classList.remove("active");
  });

  document.querySelectorAll("nav button").forEach(function (button) {
    button.classList.remove("active");
  });

  var targetTab = document.getElementById(tabId);
  if (targetTab) {
    targetTab.classList.add("active");
  }

  document.querySelectorAll("nav button").forEach(function (button) {
    if (button.getAttribute("onclick") === "switchTab('" + tabId + "')") {
      button.classList.add("active");
    }
  });
}
