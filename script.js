// ================= IMPROVED QUESTION HANDLER =================
async function nextQuestion() {
    try {
        const res = await fetch("/new-question");
        const data = await res.json();

        if (data.question) {
            document.getElementById("questionText").innerText = data.question;
            // Reset dashboard when new question is loaded
            document.getElementById("dashboard").classList.add("hidden");
        }
    } catch (err) {
        showNotification("Failed to load new question. Please try again.", "error");
        console.error(err);
    }
}

// ================= GLOBAL VARIABLES =================
let mediaRecorder = null;
let chunks = [];
let stream = null;
let recordingStartTime = null;

// ================= DOM ELEMENTS =================
const video = document.getElementById("webcam");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const dashboard = document.getElementById("dashboard");
const statusIndicator = document.getElementById("statusIndicator");
const videoOverlay = document.getElementById("videoOverlay");

// Dashboard fields
const confScore = document.getElementById("confScore");
const transcriptText = document.getElementById("transcriptText");
const eyeContactText = document.getElementById("eyeContactText");
const facialText = document.getElementById("facialText");
const speakingText = document.getElementById("speakingText");
const tipsList = document.getElementById("tipsList");
const scoreBar = document.getElementById("scoreBar");
const scoreStatus = document.getElementById("scoreStatus");
const analysisTime = document.getElementById("analysisTime");

// ================= CAMERA INITIALIZATION =================
async function initCamera() {
    try {
        // Request camera and microphone permissions
        stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user"
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100
            }
        });

        video.srcObject = stream;
        
        // Set up MediaRecorder with optimized settings
        const options = {
            mimeType: 'video/webm;codecs=vp9,opus',
            videoBitsPerSecond: 2500000 // 2.5 Mbps for good quality
        };
        
        // Try different mimeTypes if the preferred one isn't supported
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options.mimeType = 'video/webm;codecs=vp8,opus';
        }
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options.mimeType = 'video/webm';
        }
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options.mimeType = 'video/mp4';
        }

        mediaRecorder = new MediaRecorder(stream, options);

        // Handle data from recorder
        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                chunks.push(event.data);
            }
        };

        // Handle recording stop
        mediaRecorder.onstop = uploadVideo;
        
        // Handle errors
        mediaRecorder.onerror = (event) => {
            console.error("MediaRecorder error:", event);
            showNotification("Recording error occurred. Please try again.", "error");
            resetRecordingState();
        };

        // Update status indicator
        updateStatus("ready", "Camera & microphone ready");
        
        console.log("✅ Camera & microphone initialized successfully");

    } catch (error) {
        console.error("❌ Camera/Microphone access error:", error);
        
        // Provide helpful error messages
        if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
            showNotification("No camera/microphone found. Please connect a device.", "error");
        } else if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
            showNotification("Camera/microphone permission denied. Please allow access.", "error");
        } else if (error.name === "NotReadableError" || error.name === "TrackStartError") {
            showNotification("Camera/microphone is busy. Please close other apps using it.", "error");
        } else {
            showNotification("Failed to access camera/microphone. Please check permissions.", "error");
        }
        
        updateStatus("error", "Permission Error");
    }
}

// ================= STATUS MANAGEMENT =================
function updateStatus(state, message = "") {
    const indicator = document.getElementById("statusIndicator");
    
    switch(state) {
        case "ready":
            indicator.innerHTML = '<i class="fas fa-circle-check"></i> Ready';
            indicator.className = "status-badge";
            indicator.style.background = "rgba(34, 197, 94, 0.15)";
            break;
        case "recording":
            indicator.innerHTML = '<i class="fas fa-circle"></i> Recording...';
            indicator.className = "status-badge recording";
            break;
        case "analyzing":
            indicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
            indicator.className = "status-badge analyzing";
            break;
        case "complete":
            indicator.innerHTML = '<i class="fas fa-check-circle"></i> Analysis Complete';
            indicator.className = "status-badge";
            indicator.style.background = "rgba(34, 197, 94, 0.15)";
            break;
        case "error":
            indicator.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + message;
            indicator.className = "status-badge";
            indicator.style.background = "rgba(239, 68, 68, 0.15)";
            break;
    }
}

// ================= START RECORDING =================
startBtn.addEventListener("click", async () => {
    if (!mediaRecorder || mediaRecorder.state === "recording") return;
    
    try {
        // Reset previous recording data
        chunks = [];
        recordingStartTime = Date.now();
        
        // Start recording
        mediaRecorder.start(1000); // Collect data every second
        
        // Update UI
        startBtn.disabled = true;
        stopBtn.disabled = false;
        videoOverlay.classList.remove("hidden");
        dashboard.classList.add("hidden");
        
        // Update status
        updateStatus("recording", "Recording in progress");
        
        console.log("🎥 Recording started at:", new Date().toLocaleTimeString());
        
    } catch (error) {
        console.error("Error starting recording:", error);
        showNotification("Failed to start recording. Please try again.", "error");
        resetRecordingState();
    }
});

// ================= STOP RECORDING =================
stopBtn.addEventListener("click", () => {
    if (!mediaRecorder || mediaRecorder.state !== "recording") return;
    
    try {
        // Stop recording
        mediaRecorder.stop();
        
        // Update UI
        startBtn.disabled = false;
        stopBtn.disabled = true;
        videoOverlay.classList.add("hidden");
        
        // Calculate recording duration
        const duration = Date.now() - recordingStartTime;
        console.log("⏹ Recording stopped. Duration:", duration, "ms");
        
        // Update status
        updateStatus("analyzing", "Analyzing your response");
        
    } catch (error) {
        console.error("Error stopping recording:", error);
        showNotification("Error stopping recording. Please try again.", "error");
        resetRecordingState();
    }
});

// ================= UPLOAD VIDEO FOR ANALYSIS =================
async function uploadVideo() {
    const blob = new Blob(chunks, { type: chunks[0]?.type || "video/webm" });
    
    // Validate recording
    if (blob.size < 5000) { // 5KB minimum
        showNotification("Recording too short. Please record at least 5 seconds.", "warning");
        updateStatus("ready", "Ready");
        resetRecordingState();
        return;
    }
    
    // Show upload progress
    showNotification("Uploading recording for analysis...", "info");
    
    const formData = new FormData();
    formData.append("video", blob, `interview-${Date.now()}.webm`);
    
    try {
        const response = await fetch("/analyze", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        // Render analysis results
        renderDashboard(data);
        
    } catch (error) {
        console.error("❌ Analysis failed:", error);
        showNotification("Analysis failed: " + error.message, "error");
        updateStatus("error", "Analysis Failed");
    }
}

// ================= RENDER ANALYSIS DASHBOARD =================
function renderDashboard(data) {
    // Show dashboard
    dashboard.classList.remove("hidden");
    
    // Update status
    updateStatus("complete", "Analysis complete");
    
    // Update analysis time
    analysisTime.textContent = "Analyzed at " + new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    // Update confidence score with animation
    const score = data.confidence_score || 0;
    confScore.textContent = score + "%";
    
    // Animate score bar
    setTimeout(() => {
        scoreBar.style.width = score + "%";
    }, 100);
    
    // Update score status text
    let statusText = "";
    if (score >= 80) statusText = "Excellent! Very confident delivery";
    else if (score >= 60) statusText = "Good! Solid performance";
    else if (score >= 40) statusText = "Average. Room for improvement";
    else statusText = "Needs practice. Keep working on it";
    scoreStatus.textContent = statusText;
    
    // Update other fields
    transcriptText.textContent = data.transcript || "No transcript available";
    eyeContactText.textContent = data.eye_contact || "Not detected";
    facialText.textContent = data.facial_expressions || "Not detected";
    speakingText.textContent = data.speaking_style || "Not detected";
    
    // Update tips list
    tipsList.innerHTML = "";
    if (data.feedback_points && data.feedback_points.length > 0) {
        data.feedback_points.forEach(tip => {
            const li = document.createElement("li");
            li.textContent = tip;
            tipsList.appendChild(li);
        });
    } else {
        const li = document.createElement("li");
        li.textContent = "No specific feedback points available";
        tipsList.appendChild(li);
    }
    
    // Show success notification
    showNotification("Analysis complete! Review your feedback below.", "success");
    
    console.log("📊 Dashboard updated with analysis results");
}

// ================= HELPER FUNCTIONS =================
function resetRecordingState() {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    videoOverlay.classList.add("hidden");
    updateStatus("ready", "Ready");
}

function showNotification(message, type = "info") {
    // Implementation of showNotification function
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Create a temporary alert for now - can be enhanced with a proper notification system
    if (type === "error") {
        alert("Error: " + message);
    }
}

// ================= INITIALIZE ON PAGE LOAD =================
document.addEventListener("DOMContentLoaded", () => {
    // Initialize camera
    initCamera();
    
    // Add event listener for page visibility change
    document.addEventListener("visibilitychange", () => {
        if (document.hidden && mediaRecorder?.state === "recording") {
            // Stop recording if user switches tabs
            mediaRecorder.stop();
            showNotification("Recording stopped because you switched tabs.", "warning");
        }
    });
    
    // Add keyboard shortcuts
    document.addEventListener("keydown", (e) => {
        // Ctrl/Cmd + R to start/stop recording
        if ((e.ctrlKey || e.metaKey) && e.key === "r") {
            e.preventDefault();
            if (mediaRecorder?.state === "recording") {
                stopBtn.click();
            } else {
                startBtn.click();
            }
        }
        
        // Space to toggle recording when not in input fields
        if (e.code === "Space" && !e.target.matches("input, textarea, select")) {
            e.preventDefault();
            if (mediaRecorder?.state === "recording") {
                stopBtn.click();
            } else {
                startBtn.click();
            }
        }
    });
    
    console.log("🚀 AI Interview Coach initialized");
});

// ================= CLEANUP ON PAGE UNLOAD =================
window.addEventListener("beforeunload", () => {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
});
