document.addEventListener("DOMContentLoaded", function () {
  var buttons = document.querySelectorAll("nav button[data-tab]");
  var gameInitialized = false; // Tracks if the arcade game has been booted yet

  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      var tabId = this.getAttribute("data-tab");

      // 1. Hide all tab content blocks
      document.querySelectorAll(".tab-content").forEach(function (content) {
        content.classList.remove("active");
      });

      // 2. Deactivate all navigation buttons
      buttons.forEach(function (btn) {
        btn.classList.remove("active");
      });

      // 3. Show the targeted tab content
      var target = document.getElementById(tabId);
      if (target) {
        target.classList.add("active");
      }

      // 4. Set clicked button to active
      this.classList.add("active");

      // 5. Lazy-initialize the game when the "demo" tab is clicked for the first time
      if (tabId === "demo" && !gameInitialized) {
        if (typeof initNumStrike === "function") {
          initNumStrike();
          gameInitialized = true;
        }
      }
    });
  });
});
