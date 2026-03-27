document.addEventListener("DOMContentLoaded", async () => {
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

  const submitButton = document.getElementById("submitRatingButton");
  const audioContainer = document.getElementById("audioContainer");
  const questionsContainer = document.getElementById("questionsContainer");

  submitButton.addEventListener("click", async () => {
    try {
      const inputs = document.querySelectorAll("input[type='number']");
      const ratings = {};

      for (const input of inputs) {
        const value = input.value.trim();

        if (
          value.length === 0 ||
          Number.isNaN(Number(value)) ||
          Number(value) < 1 ||
          Number(value) > 10
        ) {
          showToast("Please fill in all fields with values from 1 to 10.");
          return;
        }

        ratings[input.dataset.id] = value;
      }

      const payload = {
        sound: submitButton.dataset.audioid,
        ratings,
      };

      const res = await fetch("/web/api/rate/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const { error } = await res.json();
        showToast(error);
        return;
      }

      if (res.redirected) {
        window.location.href = res.url;
        return;
      }

      showToast("Rating submitted successfully.");
      submitButton.disabled = true;
    } catch (error) {
      showToast(error.message || "Unable to submit rating.");
      console.error(error);
    }
  });

  try {
    audioContainer.textContent = "Loading random audio...";

    const questionsResponse = await fetch("/web/api/questions/");

    if (!questionsResponse.ok) {
      const { error } = await questionsResponse.json();
      showToast(error);
      return;
    }

    if (questionsResponse.redirected) {
      window.location.href = questionsResponse.url;
      return;
    }

    const { questions } = await questionsResponse.json();

    questionsContainer.innerHTML = "";

    for (const questionData of questions) {
      const { question, id, active } = questionData;
      if (!active) continue;

      const row = document.createElement("div");
      row.className = "question-rating-item";

      const label = document.createElement("span");
      label.className = "question-text";
      label.textContent = question;

      const input = document.createElement("input");
      input.type = "number";
      input.min = "1";
      input.max = "10";
      input.placeholder = "1-10";
      input.dataset.id = id;
      input.className = "rating-input";

      row.appendChild(label);
      row.appendChild(input);
      questionsContainer.appendChild(row);
    }

    const audioResponse = await fetch("/web/api/random_audio/");

    if (!audioResponse.ok) {
      audioContainer.textContent =
        "You have already rated all available audio samples.";
      submitButton.disabled = true;
      return;
    }

    if (audioResponse.redirected) {
      window.location.href = audioResponse.url;
      return;
    }

    const audioBlob = await audioResponse.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    const audioEl = document.createElement("audio");
    audioEl.setAttribute("controls", "true");

    const source = document.createElement("source");
    source.src = audioUrl;
    source.type = "audio/wav";

    audioEl.appendChild(source);
    audioEl.load();

    submitButton.dataset.audioid = audioResponse.headers.get("X-Audio-ID");

    audioContainer.innerHTML = "";
    audioContainer.appendChild(audioEl);
  } catch (error) {
    showToast(error.message || "Unable to load this rating page.");
    console.error("Rating page load error:", error);
  }
});
