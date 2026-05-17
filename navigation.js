function switchTab(tabId) {
  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.remove("active");
  });
  document.querySelectorAll("nav button").forEach((button) => {
    button.classList.remove("active");
  });

  const targetTab = document.getElementById(tabId);
  if (targetTab) {
    targetTab.classList.add("active");
  }

  if (window.event && window.event.currentTarget) {
    window.event.currentTarget.classList.add("active");
  }
}
