document.addEventListener("DOMContentLoaded", async (e) => {
    function showToast(message, duration = 3000) {
        let container = document.getElementById("toast-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "toast-container";
            document.body.appendChild(container);
        }

        const toast = document.createElement("div");
        toast.textContent = message;
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.3s ease";

        container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = "1";
        });

        setTimeout(() => {
            toast.style.opacity = "0";
            toast.addEventListener("transitionend", () => {
                toast.remove();
            });
        }, duration);
    }

    document.querySelector(".main_content_submit").addEventListener("click", async (e) => {
        try {
            const inputs = document.querySelectorAll("input[type='number']");
            const dict = {};
            for (const input of inputs) {
                if (input.value.trim().length === 0 || isNaN(input.value) || Number(input.value) < 0 || Number(input.value) > 10) {
                    showToast("Fill all fields with values (1-10).");
                    return;
                }

                dict[input.dataset.id] = input.value;
            }

            const finaldict = {
                sound: document.querySelector(".main_content_submit").dataset.audioid,
                ratings: dict
            }

            const res = await fetch("/web/api/rate/", {
                method: 'POST',
                headers: {
                    'Content-Type': "application/json"
                },
                body: JSON.stringify(finaldict)
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

            showToast("Rating submitted!");
            document.querySelector(".main_content_submit").disabled = true;
        } catch (e) {
            showToast(e.message);
            console.error(e);
        }
    })

    try {
        const audioContainer = document.querySelector(".sound");

        const questionsResponse = await fetch("/web/api/questions/");
        audioContainer.innerHTML = "Loading random audio...";

        if (!questionsResponse.ok) {
            const { error } = await questionsResponse.json()
            showToast(error);
            return;
        }

        if (questionsResponse.redirected) {
            window.location.href = questionsResponse.url;
            return;
        }


        const { questions } = await questionsResponse.json();
        const questionsContainer = document.querySelector(".questions");

        for (const q of questions) {
            const { question, id, active } = q;
            if (!active) continue;
            const div = document.createElement("div");
            div.classList.add("question-rating-item");

            const span = document.createElement("span");
            span.innerText = question;
            span.classList.add("question-text");

            const input = document.createElement("input");
            input.type = "number";
            input.min = "1";
            input.max = "10";
            input.placeholder = "1-10";
            input.dataset.id = id;
            input.classList.add("rating-input");

            div.appendChild(span);
            div.appendChild(input);

            questionsContainer.appendChild(div);
        };

        const audioResponse = await fetch("/web/api/random_audio/");
        if (!audioResponse.ok) {
            const { error } = await audioResponse.json();
            audioContainer.innerHTML = "Congrats! You rated all of our available audios.";
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
        document.querySelector(".main_content_submit").dataset.audioid = audioResponse.headers.get('X-Audio-ID');

        audioContainer.innerHTML = "";
        audioContainer.appendChild(audioEl);

    } catch (e) {
        showToast(e.message);
        console.error("Parallel fetch error:", e);
    }
});