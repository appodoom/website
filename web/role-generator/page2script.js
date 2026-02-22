export function page2script() {
    const API_URL = "http://127.0.0.1:5000";
    const nBeats = localStorage.getItem("cycleLength");
    const canvas = document.getElementById("circle");
    const ctx = canvas.getContext("2d");
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = 150;

    const markers = [];
    let hoverBeat = null;
    let selectedSound = "Doom";
    let stopLoop = null;

    const pathsMap = {
        Doom: "/web/generate/sounds/doum.wav",
        "Open Tak": "/web/generate/sounds/open_tak.wav",
        "Open Tik": "/web/generate/sounds/open_tik.wav",
        // Tik1: "http://localhost:8080/sounds/tik1.wav",
        // Tik2: "http://localhost:8080/sounds/tik2.wav",
        // Ra2: "http://localhost:8080/sounds/ra.wav",
        Pa2: "/web/generate/sounds/pa2.wav",
    };

    const symbolMap = {
        Doom: "D",
        "Open Tak": "OTA",
        "Open Tik": "OTI",
        // Tik1: "T1",
        // Tik2: "T2",
        // Ra2: "RA",
        Pa2: "PA2",
        Silence: "S",
    };

    let buffers = {};

    const sounds = [
        "Doom",
        "Open Tak",
        "Open Tik",
        // "Tik1",
        // "Tik2",
        // "Ra2",
        "Pa2",
        "Silence",
    ];
    const colors = {
        Doom: "#e74c3c",
        "Open Tak": "#3498db",
        "Open Tik": "#9b59b6",
        // Tik1: "#2ecc71",
        // Tik2: "#f1c40f",
        // Ra2: "#e67e22",
        Pa2: "#1abc9c",
        Silence: "#95a5a6",
    };

    // Create sound buttons
    const soundButtonsContainer = document.getElementById("sound-buttons");
    sounds.forEach((sound) => {
        const button = document.createElement("button");
        button.className = "sound-btn";
        button.innerHTML = `
            <div class="color-indicator" style="background-color: ${colors[sound]}"></div>
            ${sound}
          `;
        button.addEventListener("click", () => {
            selectedSound = sound;
            document.getElementById("currentSound").textContent = sound;

            // Update active state
            document.querySelectorAll(".sound-btn").forEach((btn) => {
                btn.classList.remove("active");
            });
            button.classList.add("active");
        });
        soundButtonsContainer.appendChild(button);
    });

    // Set the first button as active initially
    document.querySelector(".sound-btn").classList.add("active");

    function angleToBeat(angle) {
        if (angle < 0) angle += 2 * Math.PI;
        // Change to counter-clockwise by subtracting from 2π
        let beat = ((2 * Math.PI - angle) / (2 * Math.PI)) * nBeats;
        const snapEnabled = document.getElementById("snapCheckbox").checked;
        if (snapEnabled) beat = Math.round(beat * 4) / 4; // nearest 0.25
        return beat == nBeats ? 0 : beat;
    }

    // Convert beat to angle for drawing (counter-clockwise)
    function beatToAngle(beat) {
        // Counter-clockwise: 2π minus the clockwise angle
        return 2 * Math.PI - (beat / nBeats) * 2 * Math.PI;
    }

    function draw() {
        // Get colors from CSS variables
        const styles = getComputedStyle(document.documentElement);
        const circleColor = styles.getPropertyValue('--border-strong').trim() || '#34495e';
        const tickColor = styles.getPropertyValue('--text').trim() || '#2c3e50';
        const secondaryTickColor = styles.getPropertyValue('--error').trim() || 'red';
        const markerBorder = styles.getPropertyValue('--border-strong').trim() || '#2c3e50';
        const hoverColor = 'rgba(52, 152, 219, 0.3)';
        const hoverBorder = 'rgba(52, 152, 219, 0.7)';

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // draw circle
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = circleColor; // CHANGED
        ctx.lineWidth = 2;
        ctx.stroke();

        // draw beat ticks
        ctx.lineWidth = 1;
        for (let i = 0; i < nBeats * 2; i++) {
            const angle = beatToAngle(i / 2) - Math.PI / 2;
            const x = cx + radius * Math.cos(angle);
            const y = cy + radius * Math.sin(angle);
            ctx.moveTo(x, y);
            ctx.beginPath();

            if (i % 2 === 0) {
                ctx.arc(x, y, 5, 0, 2 * Math.PI);
                ctx.strokeStyle = tickColor; // CHANGED
            } else {
                ctx.arc(x, y, 3, 0, 2 * Math.PI);
                ctx.strokeStyle = secondaryTickColor; // CHANGED
            }
            ctx.stroke();
        }


        // draw markers
        // markers.forEach((m) => {
        //     const angle = beatToAngle(m.beat) - Math.PI / 2;
        //     const x = cx + radius * Math.cos(angle);
        //     const y = cy + radius * Math.sin(angle);
        //     ctx.beginPath();
        //     ctx.arc(x, y, 10, 0, 2 * Math.PI);
        //     ctx.fillStyle = colors[m.sound] || "red";
        //     ctx.fill();
        //     ctx.strokeStyle = "#2c3e50";
        //     ctx.lineWidth = 1.5;
        //     ctx.stroke();
        // });
        markers.forEach((m) => {
            const angle = beatToAngle(m.beat) - Math.PI / 2;
            const x = cx + radius * Math.cos(angle);
            const y = cy + radius * Math.sin(angle);

            ctx.save();
            ctx.beginPath();

            if (m.active) {
                // glow / highlight effect
                ctx.shadowBlur = 20;
                ctx.shadowColor = colors[m.sound];
                ctx.fillStyle = colors[m.sound];
                ctx.arc(x, y, 14, 0, 2 * Math.PI);
            } else {
                ctx.fillStyle = colors[m.sound];
                ctx.arc(x, y, 10, 0, 2 * Math.PI);
            }

            ctx.fill();
            ctx.strokeStyle = "#2c3e50";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
        });


        // draw hover
        if (hoverBeat !== null) {
            const angle = beatToAngle(hoverBeat) - Math.PI / 2;
            const x = cx + radius * Math.cos(angle);
            const y = cy + radius * Math.sin(angle);
            ctx.beginPath();
            ctx.arc(x, y, 10, 0, 2 * Math.PI);
            ctx.fillStyle = hoverColor;
            ctx.fill();
            ctx.strokeStyle = hoverBorder;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    function animate() {
        draw();
        requestAnimationFrame(animate);
    }
    animate();

    // mouse events
    canvas.addEventListener("mousemove", (e) => {
        const tooltip = document.getElementById("tooltip");
        const rect = canvas.getBoundingClientRect();

        // Position tooltip relative to the canvas
        tooltip.style.left = rect.left + e.offsetX + 15 + "px";
        tooltip.style.top = rect.top + e.offsetY + 15 + "px";

        const x = e.offsetX - cx;
        const y = e.offsetY - cy;
        const angle = Math.atan2(y, x) + Math.PI / 2; // shift bottom=0
        hoverBeat = angleToBeat(angle);

        tooltip.textContent = "Beat: " + hoverBeat.toFixed(2);
        tooltip.style.display = "block";

        draw();
    });

    canvas.addEventListener("mouseleave", () => {
        hoverBeat = null;
        document.getElementById("tooltip").style.display = "none";
        draw();
    });

    canvas.addEventListener("click", (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left - cx;
        const y = e.clientY - rect.top - cy;
        const angle = Math.atan2(y, x) + Math.PI / 2;
        let beat = angleToBeat(angle);
        for (let i = 0; i < markers.length; i++) {
            if (markers[i].beat === beat) {
                markers.splice(i, 1);
                break;
            }
        }
        markers.push({ beat, sound: selectedSound, active: false });
        draw();
    });

    // preload all buffers
    const audioCtx = new(window.AudioContext || window.webkitAudioContext)();
    const loadAudioFile = async (url) => {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return arrayBuffer;
    };
    const decodeAudioData = async (arrayBuffer) => {
        try {
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            return audioBuffer;
        } catch (e) {
            console.error("Error decoding audio data:", e);
            return null;
        }
    };
    async function loadWavBuffer(filePath) {
        const arrayBuffer = await loadAudioFile(filePath);
        if (arrayBuffer) {
            const audioBuffer = await decodeAudioData(arrayBuffer);
            return audioBuffer;
        }
        return null;
    }
    async function loadAllBuffers(buffers) {
        for (const key in pathsMap) {
            const buffer = await loadWavBuffer(pathsMap[key]);
            if (buffer) {
                buffers[key] = buffer;
            }
        }
    }
    document
        .getElementById("playSkeleton")
        .addEventListener("click", async (e) => {
            if (audioCtx.state === "suspended") {
                await audioCtx.resume();
            }
            if (!stopLoop) {
                if (Object.keys(buffers).length !== Object.keys(pathsMap).length)
                    return;

                const bpm = Number(localStorage.getItem("tempo"));
                const cycleLength = Number(localStorage.getItem("cycleLength"));
                stopLoop = await playAudio(bpm, cycleLength, buffers);
                e.target.textContent = "Stop";
            } else {
                clearInterval(stopLoop);
                stopLoop = null;
                e.target.textContent = "Play";
            }
        });
    loadAllBuffers(buffers);

    async function playAudio(bpm, cycleLength, buffers) {
        const beatLength = 60 / bpm; // seconds per beat (not ms)
        const cycleDuration = cycleLength * beatLength;
        const startTime = audioCtx.currentTime;

        function scheduleCycle(cycleStart) {
            for (const hit of markers) {
                const sound = buffers[hit.sound];
                if (!sound) continue;

                // offset in seconds
                const timeOffset = hit.beat * beatLength;
                const playTime = cycleStart + timeOffset;

                const source = audioCtx.createBufferSource();
                source.buffer = sound;
                source.connect(audioCtx.destination);
                source.start(playTime);
                const now = audioCtx.currentTime;
                const delay = (playTime - now) * 1000; // convert to ms
                setTimeout(() => {
                    hit.active = true;
                    setTimeout(() => (hit.active = false), 150); // duration of glow
                }, delay);
            }
        }

        // schedule first cycle immediately
        scheduleCycle(startTime);

        // schedule repeating cycles
        return setInterval(() => {
            const cycleStart = audioCtx.currentTime;
            scheduleCycle(cycleStart);
        }, cycleDuration * 1000); // convert sec → ms
    }

    function getSkeletonFromMarkers(markers) {
        let sorted = markers.sort((a, b) => a.beat - b.beat); //[{beat: 9.5, sound: doom}]

        let output = [];
        let old_beat = 0;
        for (const { beat, sound } of sorted) {
            let new_beat = beat - old_beat;
            output.push([new_beat, symbolMap[sound]]);
            old_beat = beat;
        }
        output[0][0] = nBeats - markers[markers.length - 1].beat + output[0][0];
        return output;
    }

    document.getElementById("next-btn").addEventListener("click", async () => {
        const skeleton = getSkeletonFromMarkers(markers);
        localStorage.setItem("skeleton", JSON.stringify(skeleton));
        localStorage.setItem("currPage", 3);
        document.getElementById("dummy").click();
    });
}