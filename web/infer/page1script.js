export function page1script(p) {
    // ========== CONSTANTS AND CONFIGURATION ==========
    const API_URL = "http://127.0.0.1:5000";
    const nBeats = Number(localStorage.getItem("modelCycleLength"));
    const SOUNDS = {
        Doom: {
            path: "/web/infer/sounds/doum.wav",
            symbol: "D",
            color: "#e74c3c"
        },
        "Open Tak": {
            path: "/web/infer/sounds/open_tak.wav",
            symbol: "OTA",
            color: "#3498db"
        },
        "Open Tik": {
            path: "/web/infer/sounds/open_tik.wav",
            symbol: "OTI",
            color: "#9b59b6"
        },
        Pa2: {
            path: "/web/infer/sounds/pa2.wav",
            symbol: "PA2",
            color: "#1abc9c"
        },
        Silence: {
            path: null,
            symbol: "S",
            color: "#95a5a6"
        }
    };

    // ========== STATE MANAGEMENT ==========
    let markers = [];
    let hoverBeat = null;
    let selectedSound = "Doom";
    let stopLoop = null;
    let buffers = {};

    // Composition state
    let composition = [];
    let currentCycleId = 0;
    let playbackState = {
        isPlaying: false,
        startTime: null,
        animationFrame: null,
        currentCycle: 0
    };

    // Zoom state
    let zoomMarkers = [];
    let zoomSelectedSound = "Doom";
    let zoomStopLoop = null;
    let zoomHoverBeat = null;
    let zoomInitialized = false;

    // ========== DOM ELEMENTS ==========
    const canvas = document.getElementById("circle");
    const ctx = canvas.getContext("2d");
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = 75;

    const audioCtx = new(window.AudioContext || window.webkitAudioContext)();

    // Zoom elements
    const zoomModal = document.getElementById('zoomModal');
    const zoomCanvas = document.getElementById('zoomCircle');
    const zoomCtx = zoomCanvas.getContext('2d');
    const zoomRadius = 250;

    // ========== UTILITY FUNCTIONS ==========
    function showToast(message, duration = 3000) {
        let container = document.getElementById("toast-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "toast-container";
            document.body.appendChild(container);
        }

        const toast = document.createElement("div");
        toast.textContent = message;
        toast.className = "toast-message";
        toast.style.cssText = `
            background: rgba(0,0,0,0.8);
            color: #fff;
            padding: 10px 20px;
            margin-top: 10px;
            border-radius: 5px;
            font-family: sans-serif;
            font-size: 14px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = "1";
        });

        setTimeout(() => {
            toast.style.opacity = "0";
            toast.addEventListener("transitionend", () => toast.remove());
        }, duration);
    }

    function angleToBeat(angle) {
        if (angle < 0) angle += 2 * Math.PI;
        let beat = ((2 * Math.PI - angle) / (2 * Math.PI)) * nBeats;
        const snapValue = parseFloat(document.getElementById("snapSelect").value);
        beat = Math.round(beat / snapValue) * snapValue;
        return Math.abs(beat - nBeats) < 0.0001 ? 0 : beat;
    }

    function beatToAngle(beat) {
        return 2 * Math.PI - (beat / nBeats) * 2 * Math.PI;
    }

    function getContrastColor(hexColor) {
        if (!hexColor.startsWith('#')) return '#000';
        const r = parseInt(hexColor.substr(1, 2), 16);
        const g = parseInt(hexColor.substr(3, 2), 16);
        const b = parseInt(hexColor.substr(5, 2), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 128 ? '#000' : '#fff';
    }

    // ========== SOUND MANAGEMENT ==========
    async function loadAudioFile(url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            return await audioCtx.decodeAudioData(arrayBuffer);
        } catch (e) {
            console.error("Error loading audio:", e);
            return null;
        }
    }

    async function loadAllBuffers() {
        for (const [key, sound] of Object.entries(SOUNDS)) {
            if (sound.path) {
                const buffer = await loadAudioFile(sound.path);
                if (buffer) buffers[key] = buffer;
            }
        }
    }

    function createSoundButtons(containerId, isZoom = false) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';

        Object.keys(SOUNDS).forEach(sound => {
            const button = document.createElement("button");
            button.className = isZoom ? "zoom-sound-btn" : "sound-btn";
            button.innerHTML = `
                <div class="color-indicator" style="background-color: ${SOUNDS[sound].color}"></div>
                ${sound}
            `;

            button.addEventListener("click", () => {
                if (isZoom) {
                    zoomSelectedSound = sound;
                    document.getElementById("zoomCurrentSound").textContent = sound;
                    updateActiveSoundButtons(sound, true);
                } else {
                    selectedSound = sound;
                    document.getElementById("currentSound").textContent = sound;
                    updateActiveSoundButtons(sound, false);
                }

                // Sync between zoom and main
                if (isZoom) {
                    selectedSound = sound;
                    document.getElementById("currentSound").textContent = sound;
                    updateActiveSoundButtons(sound, false);
                } else {
                    zoomSelectedSound = sound;
                    document.getElementById("zoomCurrentSound").textContent = sound;
                    updateActiveSoundButtons(sound, true);
                }
            });

            container.appendChild(button);
        });

        // Set initial active button
        const firstBtn = container.querySelector(isZoom ? ".zoom-sound-btn" : ".sound-btn");
        if (firstBtn) firstBtn.classList.add("active");
    }

    function updateActiveSoundButtons(sound, isZoom) {
        const selector = isZoom ? ".zoom-sound-btn" : ".sound-btn";
        document.querySelectorAll(selector).forEach(btn => {
            btn.classList.remove("active");
            if (btn.textContent.includes(sound)) {
                btn.classList.add("active");
            }
        });
    }

    // ========== CANVAS RENDERING ==========
    function getCanvasStyles() {
        const styles = getComputedStyle(document.documentElement);
        return {
            circleColor: styles.getPropertyValue('--border-strong').trim() || '#34495e',
            tickColor: styles.getPropertyValue('--text').trim() || '#2c3e50',
            secondaryTickColor: styles.getPropertyValue('--error').trim() || 'red',
            markerBorder: styles.getPropertyValue('--border-strong').trim() || '#2c3e50',
            hoverColor: 'rgba(52, 152, 219, 0.3)',
            hoverBorder: 'rgba(52, 152, 219, 0.7)'
        };
    }

    function drawCanvas(ctx, centerX, centerY, radius, markersArray, hoverBeatVal, isZoom = false) {
        const styles = getCanvasStyles();
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Draw circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = styles.circleColor;
        ctx.lineWidth = isZoom ? 4 : 2;
        ctx.stroke();

        // Draw beat ticks
        ctx.lineWidth = 1;
        for (let i = 0; i < nBeats * 2; i++) {
            const angle = beatToAngle(i / 2) - Math.PI / 2;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);

            ctx.beginPath();
            if (i % 2 === 0) {
                const dotSize = isZoom ? 8 : 5;
                ctx.arc(x, y, dotSize, 0, 2 * Math.PI);
                ctx.fillStyle = styles.tickColor;
                ctx.fill();
            } else {
                const dotSize = isZoom ? 5 : 3;
                ctx.arc(x, y, dotSize, 0, 2 * Math.PI);
                ctx.fillStyle = styles.secondaryTickColor;
                ctx.fill();
            }
        }

        // Draw markers
        markersArray.forEach(marker => {
            const angle = beatToAngle(marker.beat) - Math.PI / 2;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);

            ctx.save();
            ctx.beginPath();

            if (marker.active) {
                ctx.shadowBlur = 20;
                ctx.shadowColor = SOUNDS[marker.sound].color;
                ctx.fillStyle = SOUNDS[marker.sound].color;
                ctx.arc(x, y, isZoom ? 15 : 8, 0, 2 * Math.PI);
            } else {
                ctx.fillStyle = SOUNDS[marker.sound].color;
                ctx.arc(x, y, isZoom ? 12 : 6, 0, 2 * Math.PI);
            }

            ctx.fill();
            ctx.strokeStyle = styles.markerBorder;
            ctx.lineWidth = isZoom ? 2 : 1.5;
            ctx.stroke();

            if (isZoom) {
                ctx.fillStyle = 'white';
                ctx.font = 'bold 10px Inter';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(SOUNDS[marker.sound].symbol, x, y);
            }

            ctx.restore();
        });

        // Draw hover indicator
        if (hoverBeatVal !== null) {
            const angle = beatToAngle(hoverBeatVal) - Math.PI / 2;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);

            ctx.beginPath();
            ctx.arc(x, y, isZoom ? 10 : 6, 0, 2 * Math.PI);
            ctx.fillStyle = styles.hoverColor;
            ctx.fill();
            ctx.strokeStyle = styles.hoverBorder;
            ctx.lineWidth = isZoom ? 3 : 2;
            ctx.stroke();
        }
    }

    function draw() {
        drawCanvas(ctx, cx, cy, radius, markers, hoverBeat);
    }

    function drawZoom() {
        const centerX = zoomCanvas.width / 2;
        const centerY = zoomCanvas.height / 2;
        drawCanvas(zoomCtx, centerX, centerY, zoomRadius, zoomMarkers, zoomHoverBeat, true);
    }

    function animate() {
        draw();
        requestAnimationFrame(animate);
    }

    // ========== MARKER MANAGEMENT ==========
    function handleCanvasClick(e, isZoom = false) {
        const canvas = isZoom ? zoomCanvas : document.getElementById("circle");
        const rect = canvas.getBoundingClientRect();
        const centerX = isZoom ? canvas.width / 2 : cx;
        const centerY = isZoom ? canvas.height / 2 : cy;

        const x = e.clientX - rect.left - centerX;
        const y = e.clientY - rect.top - centerY;
        const angle = Math.atan2(y, x) + Math.PI / 2;

        const snapSelect = document.getElementById(isZoom ? 'zoomSnapSelect' : 'snapSelect');
        const snapValue = parseFloat(snapSelect.value);
        let beat = angleToBeat(angle);
        beat = Math.round(beat / snapValue) * snapValue;

        const targetMarkers = isZoom ? zoomMarkers : markers;
        const targetSound = isZoom ? zoomSelectedSound : selectedSound;

        // Remove existing marker at this beat
        const existingIndex = targetMarkers.findIndex(m => Math.abs(m.beat - beat) < 0.01);
        if (existingIndex >= 0) {
            targetMarkers.splice(existingIndex, 1);
        } else {
            targetMarkers.push({ beat, sound: targetSound, active: false });
        }

        // Sync between zoom and main
        if (isZoom) {
            markers.length = 0;
            markers.push(...JSON.parse(JSON.stringify(zoomMarkers)));
            draw();
        }

        isZoom ? drawZoom() : draw();
    }

    function clearMarkers(isZoom = false) {
        const targetMarkers = isZoom ? zoomMarkers : markers;

        if (targetMarkers.length === 0) {
            showToast("No markers to clear", 2000);
            return;
        }

        if (targetMarkers.length > 5 && !confirm(`Clear all ${targetMarkers.length} markers?`)) {
            return;
        }

        targetMarkers.length = 0;

        if (isZoom) {
            markers.length = 0;
            if (zoomStopLoop) {
                clearInterval(zoomStopLoop);
                zoomStopLoop = null;
                document.getElementById('playZoomSkeleton').textContent = "Play Cycle";
            }
        } else {
            if (stopLoop) {
                clearInterval(stopLoop);
                stopLoop = null;
                document.getElementById('playSkeleton').textContent = "Play";
            }
        }

        isZoom ? drawZoom() : draw();
        if (isZoom) draw();
        showToast("Markers cleared", 2000);
    }

    // ========== AUDIO PLAYBACK ==========
    async function playAudio(bpm, cycleLength, buffers, markerArray, isZoom = false) {
        const beatLength = 60 / bpm;
        const cycleDuration = cycleLength * beatLength;
        const startTime = audioCtx.currentTime;

        function scheduleCycle(cycleStart) {
            markerArray.forEach(hit => {
                const sound = buffers[hit.sound];
                if (!sound) return;

                const timeOffset = hit.beat * beatLength;
                const playTime = cycleStart + timeOffset;

                const source = audioCtx.createBufferSource();
                source.buffer = sound;
                source.connect(audioCtx.destination);
                source.start(playTime);

                const now = audioCtx.currentTime;
                const delay = (playTime - now) * 1000;

                setTimeout(() => {
                    // Highlight the playing marker
                    hit.active = true;

                    // If playing zoom markers, also highlight corresponding main markers
                    if (isZoom && zoomModal.classList.contains('active')) {
                        markers.forEach(m => {
                            if (Math.abs(m.beat - hit.beat) < 0.01 && m.sound === hit.sound) {
                                m.active = true;
                            }
                        });
                        draw(); // Update main canvas
                    }

                    isZoom ? drawZoom() : draw();

                    setTimeout(() => {
                        hit.active = false;

                        if (isZoom && zoomModal.classList.contains('active')) {
                            markers.forEach(m => {
                                if (Math.abs(m.beat - hit.beat) < 0.01 && m.sound === hit.sound) {
                                    m.active = false;
                                }
                            });
                            draw();
                        }

                        isZoom ? drawZoom() : draw();
                    }, 150);
                }, delay);
            });
        }

        scheduleCycle(startTime);
        return setInterval(() => {
            const cycleStart = audioCtx.currentTime;
            scheduleCycle(cycleStart);
        }, cycleDuration * 1000);
    }

    // ========== COMPOSITION MANAGEMENT ==========
    function renderBeatGrid(totalBeats) {
        let gridHTML = '';
        for (let i = 0; i <= totalBeats; i++) {
            gridHTML += `<div class="beat-line main-beat" style="left: ${(i / totalBeats) * 100}%;"></div>`;
            if (i < totalBeats) {
                for (let j = 1; j < 4; j++) {
                    const subBeatPos = (i + (j / 4)) / totalBeats;
                    gridHTML += `<div class="beat-line sub-beat" style="left: ${subBeatPos * 100}%;"></div>`;
                }
                gridHTML += `
                    <div class="beat-container" style="width: ${(1 / totalBeats) * 100}%;">
                        <div class="beat-label">${i}</div>
                    </div>
                `;
            }
        }
        return gridHTML;
    }

    function renderMusicSheet() {
        const sheetContainer = document.getElementById('musicSheet');

        if (composition.length === 0) {
            sheetContainer.innerHTML = `
                <div class="empty-sheet">
                    <div class="empty-message">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
                        </svg>
                        <p>No cycles added yet</p>
                        <small>Click "Append Cycle" to add your first cycle</small>
                    </div>
                </div>
            `;
            return;
        }

        let sheetHTML = '';
        composition.forEach((cycle, cycleIndex) => {
            const cycleNumber = cycleIndex + 1;
            const sortedMarkers = [...cycle.markers].sort((a, b) => a.beat - b.beat);

            sheetHTML += `
                <div class="cycle-display" data-cycle-id="${cycle.id}" data-cycle-index="${cycleIndex}">
                    <div class="cycle-header">
                        <span class="cycle-number">Cycle ${cycleNumber}</span>
                        <div class="cycle-controls">
                            <button class="cycle-delete-btn" onclick="deleteCycle(${cycleIndex})">✕ Delete</button>
                        </div>
                    </div>
                    
                    <div class="beat-timeline" style="height: 80px; position: relative;">
                        <div class="playback-progress" id="progress-${cycleIndex}" style="width: 0%;"></div>
                        ${renderBeatGrid(nBeats)}
                        ${sortedMarkers.map((marker, markerIndex) => `
                            <div class="sound-marker" 
                                 data-cycle="${cycleIndex}"
                                 data-beat="${marker.beat}"
                                 data-sound="${marker.sound}"
                                 data-marker-index="${markerIndex}"
                                 style="left: ${(marker.beat / nBeats) * 100}%;
                                        top: 50%;
                                        background-color: ${SOUNDS[marker.sound].color};
                                        border-color: ${getContrastColor(SOUNDS[marker.sound].color)};"
                                 title="${marker.sound} at beat ${marker.beat.toFixed(2)}">
                                ${SOUNDS[marker.sound].symbol}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        sheetContainer.innerHTML = sheetHTML;
    }

    function scheduleCycleAudio(cycle, cycleIndex, startOffset, beatLength) {
        cycle.markers.forEach(marker => {
            const playTime = playbackState.startTime + startOffset + (marker.beat * beatLength);
            const soundBuffer = buffers[marker.sound];

            if (soundBuffer) {
                const source = audioCtx.createBufferSource();
                source.buffer = soundBuffer;
                source.connect(audioCtx.destination);
                source.start(playTime);
            }
        });
    }

    function updatePlaybackVisuals() {
        if (!playbackState.isPlaying || !playbackState.startTime) return;

        const elapsed = audioCtx.currentTime - playbackState.startTime;
        const bpm = Number(localStorage.getItem("modelTempo"));
        const beatLength = 60 / bpm;
        const cycleDuration = nBeats * beatLength;

        const currentCycleIndex = Math.floor(elapsed / cycleDuration);

        if (currentCycleIndex < composition.length) {
            const cycleStart = currentCycleIndex * cycleDuration;
            const progressBar = document.getElementById(`progress-${currentCycleIndex}`);

            if (progressBar) {
                if (elapsed >= cycleStart && elapsed <= cycleStart + cycleDuration) {
                    const cycleProgress = ((elapsed - cycleStart) / cycleDuration) * 100;
                    progressBar.style.width = `${cycleProgress}%`;
                    playbackState.currentCycle = currentCycleIndex;
                    updateMarkerHighlights(currentCycleIndex, elapsed - cycleStart, beatLength);
                }
            }

            // Clear other progress bars
            composition.forEach((_, idx) => {
                if (idx !== currentCycleIndex) {
                    const otherProgressBar = document.getElementById(`progress-${idx}`);
                    if (otherProgressBar) otherProgressBar.style.width = '0%';
                }
            });

            clearAllHighlightsExcept(currentCycleIndex);
        } else {
            stopPlayback();
        }

        if (playbackState.isPlaying) {
            playbackState.animationFrame = requestAnimationFrame(updatePlaybackVisuals);
        }
    }

    function updateMarkerHighlights(cycleIndex, elapsedInCycle, beatLength) {
        composition[cycleIndex].markers.forEach(marker => {
            const markerEl = document.querySelector(
                `[data-cycle="${cycleIndex}"][data-beat="${marker.beat}"][data-sound="${marker.sound}"]`
            );
            if (markerEl) {
                const markerTime = marker.beat * beatLength;
                const timeDiff = Math.abs(elapsedInCycle - markerTime);
                markerEl.classList.toggle('playing', timeDiff < 0.1);
            }
        });
    }

    function clearAllHighlightsExcept(exceptCycleIndex) {
        document.querySelectorAll('.sound-marker').forEach(marker => {
            const cycleIndex = parseInt(marker.dataset.cycle);
            if (cycleIndex !== exceptCycleIndex) {
                marker.classList.remove('playing');
            }
        });
    }

    function stopPlayback() {
        if (!playbackState.isPlaying) return;

        playbackState.isPlaying = false;
        playbackState.startTime = null;

        if (playbackState.animationFrame) {
            cancelAnimationFrame(playbackState.animationFrame);
            playbackState.animationFrame = null;
        }

        document.querySelectorAll('.sound-marker').forEach(marker => {
            marker.classList.remove('playing');
        });

        composition.forEach((_, cycleIndex) => {
            const progressBar = document.getElementById(`progress-${cycleIndex}`);
            if (progressBar) progressBar.style.width = '0%';
        });

        document.getElementById('playComposition').textContent = "Play All";
    }

    window.deleteCycle = function(cycleIndex) {
        if (cycleIndex < 0 || cycleIndex >= composition.length) return;
        const cycleNumber = cycleIndex + 1;
        if (confirm(`Delete cycle ${cycleNumber}?`)) {
            composition.splice(cycleIndex, 1);
            renderMusicSheet();
            showToast(`Cycle ${cycleNumber} deleted`, 2000);
        }
    };

    // ========== ZOOM FUNCTIONALITY ==========
    function initZoomView() {
        zoomMarkers = JSON.parse(JSON.stringify(markers));
        zoomSelectedSound = selectedSound;

        const snapSelect = document.getElementById('snapSelect');
        const zoomSnapSelect = document.getElementById('zoomSnapSelect');
        zoomSnapSelect.value = snapSelect.value;

        document.getElementById("zoomCurrentSound").textContent = selectedSound;
        createSoundButtons('zoomSoundButtons', true);
        drawZoom();

        if (!zoomInitialized) {
            setupZoomEvents();
            zoomInitialized = true;
        }
    }

    function setupZoomEvents() {
        zoomCanvas.addEventListener('click', (e) => handleCanvasClick(e, true));

        zoomCanvas.addEventListener('mousemove', (e) => {
            const rect = zoomCanvas.getBoundingClientRect();
            const centerX = zoomCanvas.width / 2;
            const centerY = zoomCanvas.height / 2;

            const x = e.clientX - rect.left - centerX;
            const y = e.clientY - rect.top - centerY;
            const angle = Math.atan2(y, x) + Math.PI / 2;

            const snapSelect = document.getElementById('zoomSnapSelect');
            const snapValue = parseFloat(snapSelect.value);
            let beat = angleToBeat(angle);
            beat = Math.round(beat / snapValue) * snapValue;

            zoomHoverBeat = beat;
            drawZoom();
        });

        zoomCanvas.addEventListener('mouseleave', () => {
            zoomHoverBeat = null;
            drawZoom();
        });

        document.getElementById('zoomSnapSelect').addEventListener('change', function() {
            document.getElementById('snapSelect').value = this.value;
            draw();
        });

        document.getElementById('snapSelect').addEventListener('change', function() {
            document.getElementById('zoomSnapSelect').value = this.value;
            drawZoom();
        });
    }

    function closeZoomModal() {
        zoomModal.classList.remove('active');
        document.body.style.overflow = '';

        markers.length = 0;
        markers.push(...JSON.parse(JSON.stringify(zoomMarkers)));
        draw();

        if (zoomStopLoop) {
            clearInterval(zoomStopLoop);
            zoomStopLoop = null;
            document.getElementById('playZoomSkeleton').textContent = "Play Cycle";
        }
    }

    // ========== EVENT LISTENERS ==========
    function setupEventListeners() {
        // Main canvas events
        canvas.addEventListener("mousemove", (e) => {
            const x = e.offsetX - cx;
            const y = e.offsetY - cy;
            const angle = Math.atan2(y, x) + Math.PI / 2;
            hoverBeat = angleToBeat(angle);
            draw();
        });

        canvas.addEventListener("mouseleave", () => {
            hoverBeat = null;
            draw();
        });

        canvas.addEventListener("click", (e) => handleCanvasClick(e, false));

        // Play buttons
        document.getElementById("playSkeleton").addEventListener("click", async (e) => {
            if (audioCtx.state === "suspended") await audioCtx.resume();

            if (!stopLoop) {
                if (Object.keys(buffers).length !== Object.keys(SOUNDS).length - 1) return; // -1 for Silence

                const bpm = Number(localStorage.getItem("modelTempo"));
                const cycleLength = Number(localStorage.getItem("modelCycleLength"));
                stopLoop = await playAudio(bpm, cycleLength, buffers, markers, false);
                e.target.textContent = "Stop";
            } else {
                clearInterval(stopLoop);
                stopLoop = null;
                e.target.textContent = "Play";
            }
        });

        document.getElementById('playZoomSkeleton').addEventListener('click', async function(e) {
            if (audioCtx.state === "suspended") await audioCtx.resume();

            if (!zoomStopLoop) {
                if (Object.keys(buffers).length !== Object.keys(SOUNDS).length - 1) return;

                const bpm = Number(localStorage.getItem("modelTempo"));
                const cycleLength = Number(localStorage.getItem("modelCycleLength"));
                zoomStopLoop = await playAudio(bpm, cycleLength, buffers, zoomMarkers, true);
                e.target.textContent = "Stop";
            } else {
                clearInterval(zoomStopLoop);
                zoomStopLoop = null;
                e.target.textContent = "Play Cycle";
            }
        });

        // Composition controls
        document.getElementById('appendCycle').addEventListener('click', () => {
            if (markers.length === 0) {
                showToast("Add some markers first!", 2000);
                return;
            }

            const cycleMarkers = markers.map(marker => ({
                beat: marker.beat,
                sound: marker.sound,
                color: SOUNDS[marker.sound].color,
                symbol: SOUNDS[marker.sound].symbol
            }));

            composition.push({
                id: currentCycleId++,
                markers: cycleMarkers,
                createdAt: new Date().toISOString()
            });

            renderMusicSheet();
            showToast(`Cycle ${composition.length} added to composition`, 2000);
        });

        document.getElementById('clearComposition').addEventListener('click', () => {
            if (composition.length === 0) {
                showToast("Composition is already empty", 2000);
                return;
            }
            if (confirm(`Clear entire composition (${composition.length} cycles)?`)) {
                composition = [];
                currentCycleId = 0;
                renderMusicSheet();
                stopPlayback();
                showToast("Composition cleared", 2000);
            }
        });

        document.getElementById('playComposition').addEventListener('click', async function() {
            if (playbackState.isPlaying) {
                stopPlayback();
                this.textContent = "Play All";
                return;
            }

            if (composition.length === 0) {
                showToast("No cycles in composition", 2000);
                return;
            }

            if (audioCtx.state === "suspended") await audioCtx.resume();

            const bpm = Number(localStorage.getItem("modelTempo"));
            const beatLength = 60 / bpm;
            const cycleDuration = nBeats * beatLength;

            playbackState.isPlaying = true;
            playbackState.startTime = audioCtx.currentTime;
            playbackState.currentCycle = 0;

            composition.forEach((cycle, cycleIndex) => {
                const startOffset = cycleIndex * cycleDuration;
                scheduleCycleAudio(cycle, cycleIndex, startOffset, beatLength);
            });

            playbackState.animationFrame = requestAnimationFrame(updatePlaybackVisuals);
            this.textContent = "Stop";

            const totalDuration = composition.length * cycleDuration;
            showToast(`Playing ${composition.length} cycles`, totalDuration * 1000);

            setTimeout(() => {
                if (playbackState.isPlaying) stopPlayback();
            }, totalDuration * 1000 + 100);
        });

        // Clear buttons
        document.getElementById('clearMarkers').addEventListener('click', () => clearMarkers(false));
        document.getElementById('clearZoomMarkers').addEventListener('click', () => clearMarkers(true));

        // Zoom modal
        document.getElementById('zoomCanvas').addEventListener('click', () => {
            initZoomView();
            zoomModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        });

        document.getElementById('closeZoomModal').addEventListener('click', closeZoomModal);
        document.getElementById('zoomOverlay').addEventListener('click', closeZoomModal);

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('appendCycle').click();
            }
            if (e.key === 'Escape') {
                if (zoomModal.classList.contains('active')) {
                    closeZoomModal();
                } else if (playbackState.isPlaying) {
                    e.preventDefault();
                    stopPlayback();
                }
            }
            if (e.key === ' ' && playbackState.isPlaying) {
                e.preventDefault();
                stopPlayback();
            }
        });
    }

    // ========== INITIALIZATION ==========
    function init() {
        createSoundButtons('sound-buttons', false);
        animate();
        setupEventListeners();
        loadAllBuffers();

        // Initialize zoom sound buttons
        window.addEventListener('load', () => {
            createSoundButtons('zoomSoundButtons', true);
        });
    }

    const tabs = document.querySelectorAll(".tab-btn");
    const contents = document.querySelectorAll(".tab-content");
    const compositionTab = document.getElementById("composition-tab-btn");
    const chatTab = document.getElementById("chat-tab-btn");
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            // Remove active from all buttons
            tabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");

            // Show selected tab
            contents.forEach(c => c.style.display = "none");
            document.getElementById(tab.dataset.tab + "-tab").style.display = "flex";
        });
    });

    document.getElementById("composeNewInputButton").addEventListener("click", () => {
        compositionTab.click();
    })

    document.getElementById("sendInput").addEventListener("click", async () => {
        if (composition.length === 0) {
            showToast("Input is empty", 2000);
            return;
        }
        const comp = composition;
        composition = [];
        currentCycleId = 0;
        renderMusicSheet();
        stopPlayback();
        document.getElementById("sendInput").textContent = "Loading...";
        document.getElementById("sendInput").disabled = true;
        const tokens = getTokens(comp);
        const res = await fetch("http://localhost:3002", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ tokens })
        });
        chatTab.click();
    })

    function getTokens(comp) {
        let arr = [];
        for (const co of comp) {
            let topush = [];
            for (const ma of co.markers) {
                topush.push({ "beat": ma.beat, "sound": ma.sound });
            }
            arr.push(topush);
        }
        const symbols = {
            "Doom": "D",
            "Open Tak": "OTA",
            "Open Tik": "OTI",
            "Silence": "S",
            "Pa2": "PA2"
        }
        const tokens = [];
        let temp = [];
        let acc = 0;
        for (const cycle of arr) {
            tokens.push("<SOC>");
            temp = [];
            for (const hit of cycle) {
                temp.push([hit.beat, hit.sound]);
            }
            temp.sort((a, b) => a[0] - b[0]);
            for (let i = 0; i < nBeats; i++) {
                tokens.push("<SOB>");
                let hitsInBeat = [];
                for (const hit of temp) {
                    if (hit[0] < i + 1 && hit[0] >= i) {
                        hitsInBeat.push(hit);
                    }
                }
                let minDelta = 10000;
                if (hitsInBeat.length > 1) {
                    for (let k = 0; k < hitsInBeat.length - 1; k++) {
                        minDelta = Math.min(minDelta, hitsInBeat[k + 1][0] - hitsInBeat[k][0]);
                    }
                }
                if (hitsInBeat.length === 1) {
                    minDelta = hitsInBeat[0][0] - i;
                }
                let subd = (minDelta === 10000 || minDelta === 0) ? 4 : 1 / minDelta;
                tokens.push("SUBD_" + subd);
                for (let l = 0; l < subd; l++) {
                    let found = false;
                    tokens.push("POS_" + l);
                    const current = i + (1 / subd) * l;
                    for (const h of hitsInBeat) {
                        if (h[0] === current) {
                            tokens.push("HIT_" + symbols[h[1]]);
                            found = true;
                        }
                    }
                    if (!found) tokens.push("HIT_S")
                }
                tokens.push("<EOB>");
            }
            tokens.push("<EOC>");
        }
        return tokens;
    }

    init();
}