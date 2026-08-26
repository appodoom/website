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
    toast.addEventListener(
      "transitionend",
      () => {
        toast.remove();
      },
      { once: true },
    );
  }, duration);
}

export function page0script() {
  const inputs = document.querySelectorAll(".setting-row > input");

  inputs.forEach((input) => {
    const stored = localStorage.getItem(input.name);
    if (stored) {
      input.value = stored;
    }
  });

  function checkInputs(fields) {
    for (const input of fields) {
      const allowedNull = ["tempoVariation", "std", "amplitudeVariation"];

      if (
        allowedNull.includes(input.name) &&
        (!input.value || input.value.trim().length === 0)
      ) {
        localStorage.removeItem(input.name);
        continue;
      }

      if (!input.value || input.value.trim().length === 0) {
        showToast("Please complete all required fields before continuing.");
        return false;
      }

      if (Number.isNaN(Number(input.value)) || Number(input.value) < 0) {
        showToast("Please enter positive numbers only.");
        return false;
      }

      if (input.name === "maxSubd") {
        if (Number(input.value) > 16 || Number(input.value) < 1) {
          showToast("Maximum subdivision must be between 1 and 16.");
          return false;
        }
      }

      if (input.name === "tempo") {
        if (Number(input.value) < 1) {
          showToast("Tempo must be at least 1 BPM.");
          return false;
        }
      }

      if (input.name === "std" && Number(input.value) > 100) {
        showToast("Quantization must be 100 or less.");
        return false;
      }

      if (input.name === "amplitudeVariation" && Number(input.value) > 100) {
        showToast("Medium volume probability must be 100 or less.");
        return false;
      }

      localStorage.setItem(input.name, input.value);
    }

    return true;
  }

  document.getElementById("next-btn1").addEventListener("click", () => {
    if (checkInputs(inputs)) {
      localStorage.setItem("currPage", 2);
      document.getElementById("dummy").click();
    }
  });
}
