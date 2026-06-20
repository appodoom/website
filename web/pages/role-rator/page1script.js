export async function page1script(pageId) {
  const file = pageId.selectedFile;

  if (!file) {
    pageId[0] = 0;
    renderPage(pageId);
    return;
  }

  const filename = file.split("/").pop();

  setPageTitle(filename, `Library > ${file.split("/")[0]} > ${filename}`);

  document.getElementById("backButton").onclick = () => {
    pageId[0] = 0;

    renderPage(pageId);
  };

  const audioContainer = document.getElementById("audioContainer");

  audioContainer.innerHTML = `
  <audio controls>

    <source
      src="/api/generate/play?file=${encodeURIComponent(file)}"
      type="audio/wav">

  </audio>
  `;

  const toggle = document.getElementById("ratingToggle");

  const content = document.getElementById("ratingContent");

  toggle.onclick = () => {
    content.classList.toggle("collapsed");

    toggle.textContent = content.classList.contains("collapsed")
      ? "▶ Rating"
      : "▼ Rating";
  };

  const questionsContainer = document.getElementById("questionsContainer");

  try {
    const response = await fetch("/web/api/questions/");

    if (!response.ok) {
      throw new Error("Failed loading questions");
    }

    const data = await response.json();

    data.questions
      .filter((q) => q.active)
      .forEach((q) => {
        const row = document.createElement("div");

        row.className = "question-rating-item";

        row.innerHTML = `
        <span class="question-text">
          ${q.question}
        </span>

        <input
          class="rating-input"
          type="number"
          min="1"
          max="10"
          data-id="${q.id}"
          placeholder="1-10">
        `;

        questionsContainer.appendChild(row);
      });
  } catch (error) {
    showToast(error.message);
  }

  document.getElementById("submitRatingButton").onclick = async () => {
    const inputs = document.querySelectorAll(".rating-input");

    const ratings = {};

    for (const input of inputs) {
      const value = input.value.trim();

      if (!value || Number(value) < 1 || Number(value) > 10) {
        showToast("Ratings must be between 1 and 10.");

        return;
      }

      ratings[input.dataset.id] = Number(value);
    }

    try {
      const response = await fetch("/web/api/rate/", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          sound: file,
          ratings,
        }),
      });

      if (!response.ok) {
        const data = await response.json();

        showToast(data.error || "Failed");

        return;
      }

      showToast("Rating submitted successfully.");
    } catch (error) {
      showToast(error.message);
    }
  };
}
