function showToast(message, duration = 3200) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");

  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  setTimeout(() => {
    toast.classList.remove("show");
    toast.addEventListener("transitionend", () => toast.remove(), {
      once: true,
    });
  }, duration);
}

export function page0script(p) {
  const cycleInput = document.getElementById("modelCycleLengthInput");
  const tempoInput = document.getElementById("modelTempoInput");
  const submitButton = document.getElementById("submit");

  const savedCycle = localStorage.getItem("modelCycleLength");
  const savedTempo = localStorage.getItem("modelTempo");

  if (savedCycle) cycleInput.value = savedCycle;
  if (savedTempo) tempoInput.value = savedTempo;

  submitButton.addEventListener("click", (event) => {
    event.preventDefault();

    const fields = [cycleInput, tempoInput];

    for (const field of fields) {
      const value = field.value.trim();

      if (!value) {
        showToast("Please complete all required settings before continuing.");
        return;
      }

      if (Number.isNaN(Number(value)) || Number(value) <= 0) {
        showToast("Please enter numbers greater than zero.");
        return;
      }
    }

    localStorage.setItem("modelCycleLength", cycleInput.value.trim());
    localStorage.setItem("modelTempo", tempoInput.value.trim());

    p[0] = 1;
    document.getElementById("dummy").click();
  });
}
