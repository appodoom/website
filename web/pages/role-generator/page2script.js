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

export async function page2script(pageId) {
  function readJsonState(key) {
    const value = localStorage.getItem(key);
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  const json = {
    cycleLength: localStorage.getItem("cycleLength"),
    maxSubd: localStorage.getItem("maxSubd"),
    numOfCycles: localStorage.getItem("numOfCycles"),
    std: localStorage.getItem("std") || 100,
    tempo: localStorage.getItem("tempo"),
    tempoVariation: localStorage.getItem("tempoVariation") || 0,
    skeletons: readJsonState("skeletons"),
    skeleton_matrix: readJsonState("skeletonMatrix"),
    matrices: readJsonState("matrices"),
    amplitudeVariation: localStorage.getItem("amplitudeVariation") || 50,
  };

  const body = JSON.stringify(json);

  const audioContainer = document.getElementById("audio-container");
  const publishButton = document.getElementById("publish-btn");
  const checkboxContainer = document.getElementById("checkbox-container");
  const backButton = document.getElementById("next-btn");

  try {
    checkboxContainer.innerHTML = `<div class="loading">Loading tags...</div>`;

    const res = await fetch("/web/api/tags/");
    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error);
    }

    if (res.redirected) {
      window.location.href = res.url;
      return;
    }

    const { tags } = await res.json();

    checkboxContainer.innerHTML = "";

    for (const tagData of tags) {
      const { tag, id, active } = tagData;
      if (!active) continue;

      const row = document.createElement("div");
      row.className = "checkbox-row";

      const label = document.createElement("label");

      label.textContent = tag;

      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.tag = tag;

      label.appendChild(input);
      row.appendChild(label);
      checkboxContainer.appendChild(row);
    }
  } catch (error) {
    checkboxContainer.innerHTML = `<div class="error">Failed to load tags.</div>`;
    console.error("Tags fetch error:", error.message);
  }

  try {
    audioContainer.innerHTML = `<div class="loading">Loading audio...</div>`;
    const res = await fetch("/api/generate/", {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      throw new Error("Generate request failed.");
    }

    const audioId = res.headers.get("x-audio-id");
    if (!audioId) {
      throw new Error("Missing audio id.");
    }

    const audioBlob = await res.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    const audioEl = new Audio(audioUrl);
    audioEl.controls = true;

    audioEl.onerror = (event) => {
      console.error("Audio error:", event);
      audioContainer.innerHTML = `<div class="error">Failed to load audio.</div>`;
    };

    audioContainer.innerHTML = "";
    audioContainer.appendChild(audioEl);

    publishButton.style.display = "inline-block";
    publishButton.addEventListener(
      "click",
      async () => {
        const tags = Array.from(
          document.querySelectorAll('input[type="checkbox"]:checked'),
        ).map((cb) => cb.dataset.tag);
        if (tags.length === 0) {
          showToast("Check at least one tag before publishing");
          return;
        }
        publishButton.innerText = "Publishing...";
        publishButton.disabled = true;

        try {
          const publishRes = await fetch(
            `/api/generate/publish/?id=${audioId}&tags=${tags.join(",")}`,
            {
              credentials: "include",
            },
          );

          if (!publishRes.ok) {
            throw new Error(`Publish failed with status ${publishRes.status}`);
          }

          publishButton.innerText = "Published!";
        } catch (error) {
          publishButton.innerText = "Publish Failed";
          console.error("Publish error:", error);
        }
      },
      { once: true },
    );
  } catch (error) {
    audioContainer.innerHTML = `<div class="error">Failed to load audio.</div>`;
    console.error("Audio fetch error:", error.message);
  }

  backButton.addEventListener("click", () => {
    pageId[0] = 0;
    document.getElementById("dummy").click();
  });
}
