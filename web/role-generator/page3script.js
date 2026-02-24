export async function page3script() {
    const body = JSON.stringify({
        cycleLength: localStorage.getItem("cycleLength"),
        matrix: localStorage.getItem("matrix"),
        maxSubd: localStorage.getItem("maxSubd"),
        numOfCycles: localStorage.getItem("numOfCycles"),
        std: localStorage.getItem("std"),
        tempo: localStorage.getItem("tempo"),
        tempoVariation: localStorage.getItem("tempoVariation"),
        skeleton: localStorage.getItem("skeleton"),
        amplitudeVariation: localStorage.getItem("amplitudeVariation")
    });

    const audioContainer = document.getElementById("audio-container");

    try {
        audioContainer.innerHTML = `<div class="loading">Loading audio...</div>`;

        const token = localStorage.getItem("token");
        const res = await fetch("/api/generate/", {
            method: "POST",
            body,
            headers: {
                "Content-Type": "application/json",
            },
        });
        const audioId = res.headers.get("x-audio-id");
        if (!audioId) {
            throw new Error();
        }

        const audioBlob = await res.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audioEl = new Audio(audioUrl);
        audioEl.setAttribute("controls", "true");

        audioEl.controls = true;

        // Handle loading errors
        audioEl.onerror = (e) => {
            console.error("Audio error:", e);
            audioContainer.innerHTML = `<div class="error">Failed to load audio: ${e.target.error?.message || 'Unknown error'}</div>`;
        };

        // Wait for audio to be loadable
        audioEl.oncanplaythrough = () => {
            console.log("Audio ready to play");
        };

        // Clear loading and append
        audioContainer.innerHTML = "";
        audioContainer.appendChild(audioEl);


        document.getElementById("publish-btn").style.display = "block";
        document.getElementById("publish-btn").addEventListener("click", async (e) => {
            document.getElementById("publish-btn").innerText = "Publishing...";
            document.getElementById("publish-btn").disabled = true;

            try {
                const btn = document.getElementById("publish-btn");
                btn.innerText = "Publishing...";
                btn.disabled = true;

                const res = await fetch(`/api/generate/publish/?id=${audioId}`, {
                    "credentials": "include"
                });
                if (!res.ok) {
                    throw new Error(`Publish failed with status ${res.status}`);
                }

                btn.innerText = "Published!";
            } catch (err) {
                const btn = document.getElementById("publish-btn");
                btn.innerText = "Publish Failed";
                console.error("Publish error:", err);
            }
        })
    } catch (err) {
        audioContainer.innerHTML = `<div class="error">Failed to load audio</div>`;
        console.error("Audio fetch error:", err.message);
    }


    const backBtn = document.querySelector("#next-btn");
    backBtn.addEventListener("click", () => {
        localStorage.setItem("currPage", 0);
        document.getElementById("dummy").click();
    });
}