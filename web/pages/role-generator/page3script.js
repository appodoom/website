export async function page3script() {
  const json = {
    cycleLength: localStorage.getItem("cycleLength"),
    matrix: localStorage.getItem("matrix"),
    maxSubd: localStorage.getItem("maxSubd"),
    numOfCycles: localStorage.getItem("numOfCycles"),
    std: localStorage.getItem("std") || 0,
    tempo: localStorage.getItem("tempo"),
    tempoVariation: localStorage.getItem("tempoVariation") || 0,
    skeleton: localStorage.getItem("skeleton"),
    amplitudeVariation: localStorage.getItem("amplitudeVariation") || 50,
  };

  const body = JSON.stringify(json);

  const audioContainer = document.getElementById("audio-container");
  const publishButton = document.getElementById("publish-btn");
  const backButton = document.getElementById("next-btn");

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
        publishButton.innerText = "Publishing...";
        publishButton.disabled = true;

        try {
          const publishRes = await fetch(
            `/api/generate/publish/?id=${audioId}`,
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
    localStorage.setItem("currPage", 0);
    document.getElementById("dummy").click();
  });
}
