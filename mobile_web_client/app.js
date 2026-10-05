// State Management
let originalImageFile = null;
let currentCroppedBlob = null;
let cropperInstance = null;
let currentFilter = "enhanced_clean";
let currentReceiptData = null;
let userGeminiApiKey = localStorage.getItem("gemini_api_key") || "";

const API_BASE_URL = (window.location.hostname.includes("github.io") || window.location.protocol === "file:")
  ? "https://autoaccount-ai-scanner.onrender.com"
  : "";

// Exact 32 Standard Accounting Categories matching User's Accounting Formulas
const ACCOUNTING_CATEGORIES = [
  "Sales of Chilies",
  "Plant Inputs",
  "Packing Materials",
  "Salaries",
  "Wages",
  "Staff Welfare",
  "Worker Permit",
  "Petrol",
  "Toll & Parking",
  "Electricity",
  "Water",
  "Telephone & Internet",
  "Upkeep of Farm",
  "Upkeep of Farm Equipment",
  "Upkeep of Vehicles",
  "Insurance & Road tax",
  "Printing & Stationery",
  "Medical",
  "Entertainment",
  "License Fee",
  "Training Fee",
  "Professional Fee",
  "Accounting Fee",
  "Bank Charges",
  "Depreciation",
  "Farm House",
  "Farm Equipment",
  "Accum - Fixed Assets",
  "Cash in Hand",
  "Deposits & Prepayments",
  "Accrual",
  "Payback by worker for permit"
];

// Multi-Company State
const DEFAULT_COMPANIES = [
  {
    id: "comp_default",
    name: "KH Agri Farm (Chili Project)",
    webhook_url: "https://script.google.com/macros/s/AKfycby7cw5dc1mHY9SEiB14SIyuzmCF0Br26MxKLRGqDTWLU7kG98sJtuZJRgzHVT1surfK/exec"
  }
];

let companyProfiles = JSON.parse(localStorage.getItem("company_profiles") || "null") || DEFAULT_COMPANIES;
let activeCompanyId = localStorage.getItem("active_company_id") || companyProfiles[0].id;

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  populateCategoryDropdown();
  updateApiStatusUI();
  initCompanyProfiles();
  loadReceiptsList();
});

function populateCategoryDropdown() {
  const catSelect = document.getElementById("field-category");
  if (!catSelect) return;
  catSelect.innerHTML = "";
  ACCOUNTING_CATEGORIES.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    catSelect.appendChild(opt);
  });
}

// --- MULTI-COMPANY PROFILE FUNCTIONS ---

function initCompanyProfiles() {
  if (!companyProfiles || companyProfiles.length === 0) {
    companyProfiles = DEFAULT_COMPANIES;
  }
  
  const exists = companyProfiles.find((c) => c.id === activeCompanyId);
  if (!exists) {
    activeCompanyId = companyProfiles[0].id;
  }

  saveCompanyProfiles();
  renderCompanySelectDropdown();
  updateActiveCompanyUI();
}

function saveCompanyProfiles() {
  localStorage.setItem("company_profiles", JSON.stringify(companyProfiles));
  localStorage.setItem("active_company_id", activeCompanyId);
}

function getActiveCompany() {
  return companyProfiles.find((c) => c.id === activeCompanyId) || companyProfiles[0];
}

function renderCompanySelectDropdown() {
  const select = document.getElementById("header-company-select");
  if (!select) return;

  select.innerHTML = "";
  companyProfiles.forEach((comp) => {
    const opt = document.createElement("option");
    opt.value = comp.id;
    opt.textContent = comp.name;
    if (comp.id === activeCompanyId) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

function updateActiveCompanyUI() {
  const activeComp = getActiveCompany();
  const badge = document.getElementById("active-company-badge");
  const formBadge = document.getElementById("badge-company-name");

  if (badge) badge.innerText = `🏢 Entity: ${activeComp.name}`;
  if (formBadge) formBadge.innerText = `🏢 ${activeComp.name}`;
}

function onCompanySelectChange(newId) {
  activeCompanyId = newId;
  saveCompanyProfiles();
  updateActiveCompanyUI();
  renderCompanyProfilesList();
}

function openCompanyModal() {
  renderCompanyProfilesList();
  document.getElementById("company-modal").classList.remove("hidden");
}

function closeCompanyModal() {
  document.getElementById("company-modal").classList.add("hidden");
}

function renderCompanyProfilesList() {
  const list = document.getElementById("company-profiles-list");
  if (!list) return;

  list.innerHTML = "";
  companyProfiles.forEach((comp) => {
    const isActive = comp.id === activeCompanyId;
    const card = document.createElement("div");
    card.className = `p-3 rounded-xl border transition-all ${
      isActive 
        ? "bg-sky-50/80 border-sky-400 shadow-sm" 
        : "bg-white border-slate-200 hover:border-slate-300"
    }`;

    card.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <h4 class="font-bold text-xs text-slate-800 truncate">${comp.name}</h4>
            ${isActive ? '<span class="px-2 py-0.5 rounded-full text-3xs font-bold bg-sky-600 text-white">Active</span>' : ''}
          </div>
          <p class="text-3xs text-slate-500 font-mono truncate mt-0.5">${comp.webhook_url ? comp.webhook_url : '<span class="text-amber-600 italic">No Webhook URL (Local Only)</span>'}</p>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          ${!isActive ? `<button type="button" onclick="setActiveCompany('${comp.id}')" class="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-2xs font-bold">Select</button>` : ''}
          <button type="button" onclick="editCompanyProfile('${comp.id}')" class="p-1.5 text-slate-500 hover:text-slate-700 text-xs" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
          ${companyProfiles.length > 1 ? `<button type="button" onclick="deleteCompanyProfile('${comp.id}')" class="p-1.5 text-red-500 hover:text-red-700 text-xs" title="Delete"><i class="fa-solid fa-trash"></i></button>` : ''}
        </div>
      </div>
    `;
    list.appendChild(card);
  });
}

function setActiveCompany(id) {
  activeCompanyId = id;
  saveCompanyProfiles();
  renderCompanySelectDropdown();
  updateActiveCompanyUI();
  renderCompanyProfilesList();
}

function addNewCompanyProfile() {
  const nameInput = document.getElementById("new-company-name");
  const webhookInput = document.getElementById("new-company-webhook");

  const name = nameInput.value.trim();
  const webhook = webhookInput.value.trim();

  if (!name) {
    alert("Please enter a company or person name.");
    return;
  }

  const newCompany = {
    id: `comp_${Date.now()}`,
    name: name,
    webhook_url: webhook
  };

  companyProfiles.push(newCompany);
  activeCompanyId = newCompany.id;
  saveCompanyProfiles();

  nameInput.value = "";
  webhookInput.value = "";

  renderCompanySelectDropdown();
  updateActiveCompanyUI();
  renderCompanyProfilesList();
  alert(`Added and switched to "${name}"!`);
}

function editCompanyProfile(id) {
  const comp = companyProfiles.find((c) => c.id === id);
  if (!comp) return;

  const newName = prompt("Edit Company/Entity Name:", comp.name);
  if (newName === null) return;

  const newWebhook = prompt("Edit Google Apps Script Webhook URL:", comp.webhook_url);
  if (newWebhook === null) return;

  comp.name = newName.trim() || comp.name;
  comp.webhook_url = newWebhook.trim();

  saveCompanyProfiles();
  renderCompanySelectDropdown();
  updateActiveCompanyUI();
  renderCompanyProfilesList();
}

function deleteCompanyProfile(id) {
  if (companyProfiles.length <= 1) {
    alert("You must have at least one active company profile.");
    return;
  }

  if (!confirm("Are you sure you want to delete this company profile?")) return;

  companyProfiles = companyProfiles.filter((c) => c.id !== id);
  if (activeCompanyId === id) {
    activeCompanyId = companyProfiles[0].id;
  }

  saveCompanyProfiles();
  renderCompanySelectDropdown();
  updateActiveCompanyUI();
  renderCompanyProfilesList();
}

// --- GEMINI API KEY FUNCTIONS ---

function updateApiStatusUI() {
  const label = document.getElementById("api-status-label");
  const inputKey = document.getElementById("input-gemini-key");

  if (userGeminiApiKey && userGeminiApiKey.trim().length > 0) {
    if (inputKey) inputKey.value = userGeminiApiKey;
    if (label) {
      label.innerText = "AI Active";
    }
  }
}

function openApiKeyModal() {
  const modal = document.getElementById("api-key-modal");
  const inputKey = document.getElementById("input-gemini-key");
  if (inputKey) inputKey.value = userGeminiApiKey;
  modal.classList.remove("hidden");
}

function closeApiKeyModal() {
  document.getElementById("api-key-modal").classList.add("hidden");
}

async function saveApiKey() {
  const key = document.getElementById("input-gemini-key").value.trim();
  userGeminiApiKey = key;
  localStorage.setItem("gemini_api_key", key);

  if (key) {
    const formData = new FormData();
    formData.append("api_key", key);
    try {
      await fetch(`${API_BASE_URL}/api/save-api-key`, { method: "POST", body: formData });
    } catch (e) {
      console.warn("Could not save to backend:", e);
    }
  }

  updateApiStatusUI();
  closeApiKeyModal();
  alert("Gemini AI API Key saved!");
}

// --- MEMORY SAFETY & OBJECT URL LIFECYCLE MANAGEMENT ---
const managedObjectURLs = new Set();

function createManagedObjectURL(blobOrFile) {
  if (!blobOrFile) return "";
  const url = URL.createObjectURL(blobOrFile);
  managedObjectURLs.add(url);
  return url;
}

function revokeAllManagedObjectURLs() {
  managedObjectURLs.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch (e) {}
  });
  managedObjectURLs.clear();
}

/**
 * Pre-downscales raw camera captures to 1280px max
 * immediately to eliminate browser low memory tab reloads.
 * Retains 100% OCR sharpness for small receipt text and invoice numbers.
 */
async function preprocessImageForMemorySafety(file, maxDimension = 1280) {
  if (!file || !file.type || !file.type.startsWith("image/")) return file;

  return new Promise((resolve) => {
    // 1. Hardware accelerated direct downscaled decoding via createImageBitmap if supported
    if (typeof window.createImageBitmap === "function") {
      createImageBitmap(file)
        .then((bitmap) => {
          let { width, height } = bitmap;
          if (width <= maxDimension && height <= maxDimension) {
            bitmap.close();
            resolve(file);
            return;
          }

          let newWidth = width;
          let newHeight = height;
          if (width > height) {
            newHeight = Math.round((height * maxDimension) / width);
            newWidth = maxDimension;
          } else {
            newWidth = Math.round((width * maxDimension) / height);
            newHeight = maxDimension;
          }

          const canvas = document.createElement("canvas");
          canvas.width = newWidth;
          canvas.height = newHeight;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, newWidth, newHeight);
          ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);
          bitmap.close();

          canvas.toBlob((blob) => {
            canvas.width = 1;
            canvas.height = 1;
            if (blob) {
              const safeFile = new File([blob], file.name || "receipt.jpg", { type: "image/jpeg" });
              resolve(safeFile);
            } else {
              resolve(file);
            }
          }, "image/jpeg", 0.90);
        })
        .catch(() => {
          fallbackImagePreprocess(file, maxDimension, resolve);
        });
    } else {
      fallbackImagePreprocess(file, maxDimension, resolve);
    }
  });
}

function fallbackImagePreprocess(file, maxDimension, resolve) {
  try {
    const img = new Image();
    const tempUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(tempUrl);
      let { width, height } = img;
      if (width <= maxDimension && height <= maxDimension) {
        resolve(file);
        return;
      }
      let newWidth = width;
      let newHeight = height;
      if (width > height) {
        newHeight = Math.round((height * maxDimension) / width);
        newWidth = maxDimension;
      } else {
        newWidth = Math.round((width * maxDimension) / height);
        newHeight = maxDimension;
      }
      const canvas = document.createElement("canvas");
      canvas.width = newWidth;
      canvas.height = newHeight;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, newWidth, newHeight);
      ctx.drawImage(img, 0, 0, newWidth, newHeight);
      canvas.toBlob((blob) => {
        canvas.width = 1;
        canvas.height = 1;
        if (blob) {
          const safeFile = new File([blob], file.name || "receipt.jpg", { type: "image/jpeg" });
          resolve(safeFile);
        } else {
          resolve(file);
        }
      }, "image/jpeg", 0.90);
    };
    img.onerror = () => {
      URL.revokeObjectURL(tempUrl);
      resolve(file);
    };
    img.src = tempUrl;
  } catch (e) {
    resolve(file);
  }
}

// --- IN-APP LIVE CAMERA VIEWFINDER (ZERO MEMORY SPIKE / ZERO TAB EVICTION) ---
let activeVideoStream = null;
let currentCameraTrack = null;
let isTorchOn = false;

function updateFlashBtnUI(isOn) {
  const flashBtn = document.getElementById("btn-camera-flash");
  if (!flashBtn) return;
  if (isOn) {
    flashBtn.innerHTML = '<i class="fa-solid fa-bolt text-yellow-300"></i> <span class="text-3xs font-bold text-yellow-300">Flash ON</span>';
    flashBtn.className = "px-2.5 py-1.5 rounded-full bg-yellow-400/20 border border-yellow-400/60 text-yellow-300 text-xs font-bold flex items-center gap-1.5 shadow-sm";
  } else {
    flashBtn.innerHTML = '<i class="fa-solid fa-bolt text-slate-400"></i> <span class="text-3xs font-semibold text-slate-300">Flash OFF</span>';
    flashBtn.className = "px-2.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-slate-300 text-xs font-bold flex items-center gap-1.5 shadow-sm";
  }
}

async function openInAppCamera() {
  const modal = document.getElementById("camera-viewfinder-modal");
  const video = document.getElementById("camera-video-stream");
  const flashBtn = document.getElementById("btn-camera-flash");

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    triggerNativeCameraInput();
    return;
  }

  try {
    modal.classList.remove("hidden");
    
    // Request environment facing camera (primary main sensor) with high-res optical clarity
    const constraints = {
      video: {
        facingMode: { ideal: "environment" },
        width: { min: 1280, ideal: 1920, max: 3840 },
        height: { min: 720, ideal: 1080, max: 2160 }
      },
      audio: false
    };

    activeVideoStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = activeVideoStream;
    await video.play();

    currentCameraTrack = activeVideoStream.getVideoTracks()[0];
    if (currentCameraTrack) {
      const capabilities = (typeof currentCameraTrack.getCapabilities === "function") ? currentCameraTrack.getCapabilities() : {};
      
      // Auto-lock Continuous Autofocus & Macro Focus
      const advancedConstraints = [];
      
      if (capabilities.focusMode && capabilities.focusMode.includes("continuous")) {
        advancedConstraints.push({ focusMode: "continuous" });
      }
      if (capabilities.exposureMode && capabilities.exposureMode.includes("continuous")) {
        advancedConstraints.push({ exposureMode: "continuous" });
      }
      if (capabilities.whiteBalanceMode && capabilities.whiteBalanceMode.includes("continuous")) {
        advancedConstraints.push({ whiteBalanceMode: "continuous" });
      }

      // Auto-turn on flashlight for maximum text contrast
      if (capabilities.torch) {
        if (flashBtn) flashBtn.classList.remove("hidden");
        advancedConstraints.push({ torch: true });
        isTorchOn = true;
        updateFlashBtnUI(true);
      } else {
        if (flashBtn) flashBtn.classList.add("hidden");
      }

      if (advancedConstraints.length > 0) {
        try {
          await currentCameraTrack.applyConstraints({ advanced: advancedConstraints });
        } catch (e) {
          console.warn("Constraint application warning:", e);
        }
      }
    }
  } catch (err) {
    console.warn("In-app camera stream failed, falling back to native camera input:", err);
    closeInAppCamera();
    triggerNativeCameraInput();
  }
}

function closeInAppCamera() {
  const modal = document.getElementById("camera-viewfinder-modal");
  const video = document.getElementById("camera-video-stream");
  if (video) video.srcObject = null;

  if (activeVideoStream) {
    activeVideoStream.getTracks().forEach((track) => track.stop());
    activeVideoStream = null;
  }
  currentCameraTrack = null;
  isTorchOn = false;
  updateFlashBtnUI(false);
  if (modal) modal.classList.add("hidden");
}

async function toggleCameraTorch() {
  if (currentCameraTrack) {
    try {
      isTorchOn = !isTorchOn;
      await currentCameraTrack.applyConstraints({
        advanced: [{ torch: isTorchOn }]
      });
      updateFlashBtnUI(isTorchOn);
    } catch (e) {
      console.warn("Torch toggle error:", e);
    }
  }
}

async function handleViewfinderTap(e) {
  const container = e.currentTarget;
  const rect = container.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // Show focus target box animation
  const indicator = document.getElementById("camera-focus-indicator");
  if (indicator) {
    indicator.style.left = `${x - 32}px`;
    indicator.style.top = `${y - 32}px`;
    indicator.classList.remove("hidden", "opacity-0", "scale-125");
    indicator.classList.add("opacity-100", "scale-100");

    setTimeout(() => {
      indicator.classList.add("opacity-0");
      setTimeout(() => indicator.classList.add("hidden"), 300);
    }, 800);
  }

  // Trigger hardware autofocus if supported
  if (currentCameraTrack) {
    try {
      const capabilities = (typeof currentCameraTrack.getCapabilities === "function") ? currentCameraTrack.getCapabilities() : {};
      if (capabilities.focusMode && capabilities.focusMode.includes("continuous")) {
        await currentCameraTrack.applyConstraints({
          advanced: [{ focusMode: "continuous" }]
        });
      }
    } catch (err) {
      console.warn("Tap-to-focus error:", err);
    }
  }
}

async function captureInAppFrame() {
  const video = document.getElementById("camera-video-stream");
  const shutterBtn = document.getElementById("btn-shutter-snap");

  if (!video || !video.videoWidth) {
    alert("Camera is warming up. Please tap again in a moment.");
    return;
  }

  // Visual shutter effect
  if (shutterBtn) shutterBtn.classList.add("scale-90", "opacity-80");

  try {
    // 1. Try native ImageCapture API first (Hardware Sensor Still Photo with Optical Autofocus Lock)
    if (window.ImageCapture && currentCameraTrack) {
      try {
        const imageCapture = new ImageCapture(currentCameraTrack);
        const photoBlob = await imageCapture.takePhoto({
          fillLightMode: isTorchOn ? "flash" : "auto",
          imageHeight: 1920,
          imageWidth: 1440
        });

        closeInAppCamera();
        const safeFile = await preprocessImageForMemorySafety(photoBlob, 1400);
        processSelectedFile(safeFile);
        return;
      } catch (imageCaptureErr) {
        console.warn("ImageCapture.takePhoto fallback to high-res video canvas:", imageCaptureErr);
      }
    }

    // 2. High-Resolution Video Canvas Grab fallback
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true, alpha: false });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    closeInAppCamera();

    canvas.toBlob(async (blob) => {
      canvas.width = 1;
      canvas.height = 1;
      if (blob) {
        const safeFile = await preprocessImageForMemorySafety(blob, 1400);
        processSelectedFile(safeFile);
      }
    }, "image/jpeg", 0.94);

  } catch (err) {
    console.error("Capture error:", err);
    closeInAppCamera();
  }
}

// --- FILE SELECTION & CROPPER ---

function setupEventListeners() {
  const cameraInput = document.getElementById("camera-input");
  const galleryInput = document.getElementById("gallery-input");

  cameraInput.addEventListener("change", handleFileSelect);
  galleryInput.addEventListener("change", handleFileSelect);

  const dropZone = document.getElementById("drop-zone");
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("border-emerald-500", "bg-emerald-50/50");
  });
  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("border-emerald-500", "bg-emerald-50/50");
  });
  dropZone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropZone.classList.remove("border-emerald-500", "bg-emerald-50/50");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const safeFile = await preprocessImageForMemorySafety(e.dataTransfer.files[0]);
      processSelectedFile(safeFile);
    }
  });
}

function triggerCameraInput() {
  // If browser supports live camera stream, use the In-App Viewfinder (zero tab reload, instant)
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext) {
    openInAppCamera();
  } else {
    triggerNativeCameraInput();
  }
}

function triggerNativeCameraInput() {
  const cameraInput = document.getElementById("camera-input");
  if (cameraInput) {
    cameraInput.value = "";
    cameraInput.click();
  }
}

function triggerGalleryInput() {
  const galleryInput = document.getElementById("gallery-input");
  if (galleryInput) {
    galleryInput.value = "";
    galleryInput.click();
  }
}

async function handleFileSelect(e) {
  if (e.target.files && e.target.files[0]) {
    const rawFile = e.target.files[0];
    const safeFile = await preprocessImageForMemorySafety(rawFile);
    processSelectedFile(safeFile);
  }
}

function processSelectedFile(file) {
  if (!file) return;
  revokeAllManagedObjectURLs();
  originalImageFile = file;
  currentCroppedBlob = null;

  const uploadPrompt = document.getElementById("upload-prompt");
  const previewContainer = document.getElementById("image-preview-container");
  const cropperImg = document.getElementById("cropper-image");

  uploadPrompt.classList.add("hidden");
  previewContainer.classList.remove("hidden");

  document.getElementById("crop-controls-bar").classList.remove("hidden");
  document.getElementById("btn-apply-crop").classList.remove("hidden");

  updateCropStatus("adjusting");

  if (cropperInstance) {
    cropperInstance.destroy();
    cropperInstance = null;
  }

  const objectUrl = createManagedObjectURL(file);

  cropperImg.onload = function() {
    try {
      if (typeof Cropper !== 'undefined') {
        cropperInstance = new Cropper(cropperImg, {
          viewMode: 1,
          dragMode: 'move',
          autoCropArea: 0.92,
          responsive: true,
          restore: false,
          guides: true,
          center: true,
          highlight: false,
          cropBoxMovable: true,
          cropBoxResizable: true,
          toggleDragModeOnDblclick: false,
          checkOrientation: true
        });
      }
    } catch (err) {
      console.warn("Cropper init error:", err);
    }
  };

  cropperImg.src = objectUrl;
  applyLiveImageFilter();
}

function updateCropStatus(mode) {
  const statusText = document.getElementById("crop-status-text");
  const btnApply = document.getElementById("btn-apply-crop");

  if (mode === "cropped") {
    statusText.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-600"></i> <strong class="text-emerald-700">Receipt Cropped & Locked In!</strong>';
    btnApply.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Re-Adjust Crop';
    btnApply.className = "px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-xs font-bold shadow flex items-center gap-1";
  } else {
    statusText.innerHTML = '<i class="fa-solid fa-crop text-emerald-600"></i> Drag green handles around receipt, then tap <strong>"Crop Receipt"</strong>';
    btnApply.innerHTML = '<i class="fa-solid fa-scissors"></i> ✂️ Crop Receipt';
    btnApply.className = "px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow flex items-center gap-1 animate-pulse";
  }
}

function applyAndSaveCrop() {
  const cropperImg = document.getElementById("cropper-image");

  if (currentCroppedBlob && !cropperInstance) {
    processSelectedFile(originalImageFile);
    return;
  }

  if (!cropperInstance) {
    alert("Please choose a receipt photo first.");
    return;
  }

  try {
    const croppedCanvas = cropperInstance.getCroppedCanvas({
      maxWidth: 1200,
      maxHeight: 1800,
      fillColor: '#ffffff',
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    });

    if (!croppedCanvas) {
      alert("Could not generate cropped image.");
      return;
    }

    croppedCanvas.toBlob((blob) => {
      if (!blob) return;
      revokeAllManagedObjectURLs();
      currentCroppedBlob = blob;
      
      const croppedUrl = createManagedObjectURL(blob);

      if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
      }

      // Explicitly free canvas buffer
      croppedCanvas.width = 1;
      croppedCanvas.height = 1;

      cropperImg.src = croppedUrl;
      updateCropStatus("cropped");
      document.getElementById("crop-controls-bar").classList.add("hidden");
      applyLiveImageFilter();

    }, "image/jpeg", 0.92);
  } catch (err) {
    console.error("Crop error:", err);
    alert("Error cropping image: " + err.message);
  }
}

function resetFullCrop() {
  if (originalImageFile) {
    currentCroppedBlob = null;
    processSelectedFile(originalImageFile);
    setTimeout(() => {
      if (cropperInstance) {
        cropperInstance.setCropBoxData({
          left: 0,
          top: 0,
          width: cropperInstance.getContainerData().width,
          height: cropperInstance.getContainerData().height
        });
      }
    }, 150);
  }
}

function rotateCropper() {
  if (cropperInstance) {
    cropperInstance.rotate(90);
  } else if (originalImageFile) {
    processSelectedFile(currentCroppedBlob || originalImageFile);
    setTimeout(() => {
      if (cropperInstance) cropperInstance.rotate(90);
    }, 150);
  }
}

function autoDetectCropBox() {
  if (cropperInstance) {
    cropperInstance.setCropBoxData({
      left: cropperInstance.getContainerData().width * 0.05,
      top: cropperInstance.getContainerData().height * 0.05,
      width: cropperInstance.getContainerData().width * 0.90,
      height: cropperInstance.getContainerData().height * 0.90
    });
  } else if (originalImageFile) {
    processSelectedFile(originalImageFile);
  }
}

// --- LIVE IMAGE ENHANCEMENT FILTERS ---

function setFilter(filterMode) {
  currentFilter = filterMode;

  const filterNames = {
    "enhanced_clean": "Smart Clean",
    "bw_enhanced": "B&W High-Contrast",
    "color_boost": "Color Boost",
    "original": "Original"
  };

  const nameLabel = document.getElementById("filter-active-name");
  if (nameLabel) nameLabel.innerText = filterNames[filterMode] || "Custom";

  document.querySelectorAll(".filter-btn").forEach((btn) => {
    if (btn.dataset.filter === filterMode) {
      btn.classList.add("active-filter", "bg-emerald-50", "border-emerald-500", "text-emerald-700");
      btn.classList.remove("bg-white");
    } else {
      btn.classList.remove("active-filter", "bg-emerald-50", "border-emerald-500", "text-emerald-700");
      btn.classList.add("bg-white");
    }
  });

  applyLiveImageFilter();
}

function applyLiveImageFilter() {
  const cropperImg = document.getElementById("cropper-image");
  if (!cropperImg) return;

  cropperImg.classList.remove(
    "filter-preview-original",
    "filter-preview-enhanced_clean",
    "filter-preview-bw_enhanced",
    "filter-preview-color_boost"
  );

  cropperImg.classList.add(`filter-preview-${currentFilter}`);
}

function resetScanStep(openCamera = false) {
  originalImageFile = null;
  currentCroppedBlob = null;
  revokeAllManagedObjectURLs();

  if (cropperInstance) {
    cropperInstance.destroy();
    cropperInstance = null;
  }
  const cropperImg = document.getElementById("cropper-image");
  if (cropperImg) cropperImg.src = "";

  const camInput = document.getElementById("camera-input");
  const galInput = document.getElementById("gallery-input");
  if (camInput) camInput.value = "";
  if (galInput) galInput.value = "";

  const uploadPrompt = document.getElementById("upload-prompt");
  const previewContainer = document.getElementById("image-preview-container");
  const loadingCard = document.getElementById("loading-card");

  if (uploadPrompt) uploadPrompt.classList.remove("hidden");
  if (previewContainer) previewContainer.classList.add("hidden");
  if (loadingCard) loadingCard.classList.add("hidden");

  if (openCamera) {
    triggerCameraInput();
  }
}

function snapNextReceipt() {
  resetScanStep(true);
  const dropZone = document.getElementById("drop-zone");
  if (dropZone) dropZone.scrollIntoView({ behavior: "smooth" });
}

function retakePhoto() {
  resetScanStep(true);
}

async function loadSampleReceipt() {
  const canvas = document.createElement("canvas");
  canvas.width = 440;
  canvas.height = 640;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 440, 640);

  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 18px Courier New, monospace";
  ctx.textAlign = "center";
  ctx.fillText("SIN CHOON KEE AGRO PLT", 220, 45);

  ctx.font = "11px Courier New, monospace";
  ctx.fillText("NO 96 JALAN BESAR, 45500 TANJONG KARANG", 220, 65);
  ctx.fillText("TEL: 012-5265945", 220, 85);

  ctx.font = "bold 12px Courier New, monospace";
  ctx.textAlign = "left";
  ctx.fillText("======================================", 20, 110);
  ctx.fillText("BILL NO: C1-2608/00714  DATE: 18/08/2026", 20, 130);
  ctx.fillText("CASHIER: ADMIN          PAY: Cash", 20, 150);
  ctx.fillText("======================================", 20, 170);

  ctx.font = "12px Courier New, monospace";
  ctx.fillText("DESCRIPTION             QTY     AMOUNT", 20, 200);
  ctx.fillText("--------------------------------------", 20, 215);
  ctx.fillText("INVERIS G75 (500ML)     2x    RM 390.00", 20, 245);

  ctx.font = "bold 13px Courier New, monospace";
  ctx.fillText("--------------------------------------", 20, 290);
  ctx.fillText("TOTAL AMOUNT:               RM 390.00", 20, 320);
  ctx.fillText("======================================", 20, 345);

  canvas.toBlob((blob) => {
    canvas.width = 1;
    canvas.height = 1;
    const sampleFile = new File([blob], "sample_cash_bill.jpg", { type: "image/jpeg" });
    processSelectedFile(sampleFile);
  }, "image/jpeg");
}

// --- FAST CLIENT-SIDE IMAGE COMPRESSION ---

async function compressImageForUpload(blobOrFile, maxDimension = 900, quality = 0.80) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      const tempUrl = URL.createObjectURL(blobOrFile);
      img.onload = () => {
        URL.revokeObjectURL(tempUrl);
        let width = img.width;
        let height = img.height;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          canvas.width = 1;
          canvas.height = 1;
          resolve(blob || blobOrFile);
        }, "image/jpeg", quality);
      };
      img.onerror = () => {
        URL.revokeObjectURL(tempUrl);
        resolve(blobOrFile);
      };
      img.src = tempUrl;
    } catch (e) {
      resolve(blobOrFile);
    }
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result.split(',')[1];
      resolve(base64data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function safeParseJson(rawText) {
  if (!rawText) return null;
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.substring(7);
  if (cleaned.startsWith("```")) cleaned = cleaned.substring(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.substring(0, cleaned.length - 3);
  cleaned = cleaned.trim();

  // 1. Direct JSON parse
  try {
    return JSON.parse(cleaned);
  } catch (e) {}

  // 2. Repair open quotes, braces, brackets
  try {
    let temp = cleaned;
    const quotes = (temp.match(/"/g) || []).length;
    if (quotes % 2 !== 0) temp += '"';
    const openBrackets = (temp.match(/\[/g) || []).length - (temp.match(/\]/g) || []).length;
    const openBraces = (temp.match(/\{/g) || []).length - (temp.match(/\}/g) || []).length;
    if (openBrackets > 0) temp += ']'.repeat(openBrackets);
    if (openBraces > 0) temp += '}'.repeat(openBraces);
    return JSON.parse(temp);
  } catch (e) {}

  // 3. Fallback regex extraction
  const mName = cleaned.match(/"merchant_name"\s*:\s*"([^"]+)"/);
  const amt = cleaned.match(/"total_amount"\s*:\s*([0-9.]+)/);
  const dt = cleaned.match(/"receipt_date"\s*:\s*"([^"]+)"/);
  const ref = cleaned.match(/"reference_no"\s*:\s*"([^"]+)"/);
  const desc = cleaned.match(/"item_description"\s*:\s*"([^"]+)"/);
  const cat = cleaned.match(/"category"\s*:\s*"([^"]+)"/);
  const pm = cleaned.match(/"payment_method"\s*:\s*"([^"]+)"/);

  if (mName || amt || dt) {
    return {
      merchant_name: mName ? mName[1] : "Receipt",
      item_description: desc ? desc[1] : "",
      receipt_date: dt ? dt[1] : new Date().toISOString().split('T')[0],
      reference_no: ref ? ref[1] : "",
      total_amount: amt ? parseFloat(amt[1]) : 0,
      category: cat ? cat[1] : "Plant Inputs",
      payment_method: pm ? pm[1] : "Cash",
      currency: "MYR",
      items: []
    };
  }

  return null;
}

// --- DIRECT CLIENT TURBO EXTRACTION ENGINE (<1s LATENCY) ---

let activeExtractionController = null;
let activeTimeoutHandle = null;
const MAX_EXTRACTION_TIMEOUT_SEC = 40;

async function extractDirectWithGemini(base64Image, apiKey, signal = null) {
  const prompt = `Extract receipt JSON:
{
  "merchant_name": "Store/Merchant name",
  "item_description": "Summary of items or service purchased",
  "receipt_date": "YYYY-MM-DD",
  "reference_no": "Invoice or Receipt No",
  "category": "Accounting category strictly chosen from: Sales of Chilies, Plant Inputs, Packing Materials, Salaries, Wages, Staff Welfare, Worker Permit, Petrol, Toll & Parking, Electricity, Water, Telephone & Internet, Upkeep of Farm, Upkeep of Farm Equipment, Upkeep of Vehicles, Insurance & Road tax, Printing & Stationery, Medical, Entertainment, License Fee, Training Fee, Professional Fee, Accounting Fee, Bank Charges, Depreciation, Farm House, Farm Equipment, Accum - Fixed Assets, Cash in Hand, Deposits & Prepayments, Accrual, Payback by worker for permit",
  "currency": "MYR",
  "subtotal": 0.0,
  "tax_amount": 0.0,
  "total_amount": 0.0,
  "payment_method": "Cash or Credit Card or TnG or ShopeePay or Bank Transfer",
  "items": [{"name": "item name", "quantity": 1.0, "unit_price": 0.0, "total_price": 0.0}]
}
Return pure JSON only.`;

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: "image/jpeg", data: base64Image } }
      ]
    }],
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: 1200,
      responseMimeType: "application/json"
    }
  };

  const models = [
    "gemini-3.5-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-3.1-flash-lite",
    "gemini-3.1-flash-lite-preview",
    "gemini-3.6-flash"
  ];
  let lastErr = null;

  for (const m of models) {
    if (signal && signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: signal
      });

      if (!response.ok) {
        lastErr = new Error(`Model ${m} returned HTTP ${response.status}`);
        continue;
      }

      const jsonRes = await response.json();
      if (!jsonRes.candidates || !jsonRes.candidates[0] || !jsonRes.candidates[0].content) {
        lastErr = new Error(`Model ${m} returned empty candidates`);
        continue;
      }

      const rawText = jsonRes.candidates[0].content.parts[0].text;
      const parsed = safeParseJson(rawText);
      if (parsed) {
        return parsed;
      }
    } catch (e) {
      if (e.name === "AbortError") throw e;
      lastErr = e;
    }
  }

  throw lastErr || new Error("Direct AI vision processing failed");
}

// --- SCAN AND EXTRACTION WITH TARGET COMPANY WEBHOOK ---

let extractionLoadingTimer = null;

function cancelExtraction(reason = "cancelled") {
  if (activeTimeoutHandle) {
    clearTimeout(activeTimeoutHandle);
    activeTimeoutHandle = null;
  }
  if (activeExtractionController) {
    try {
      activeExtractionController.abort(reason);
    } catch (e) {}
    activeExtractionController = null;
  }
  stopLoadingAnimation(false);

  if (reason === "timeout") {
    alert("⏱️ Extraction took longer than 40 seconds.\n\nProcessing has been stopped automatically so you don't have to wait. Please try tapping 'Extract & Sync' again or retake the receipt photo.");
  }
}

function startLoadingAnimation() {
  const loadingCard = document.getElementById("loading-card");
  const resultCard = document.getElementById("result-card");
  const previewContainer = document.getElementById("image-preview-container");

  if (previewContainer) previewContainer.classList.add("hidden");
  if (resultCard) resultCard.classList.add("hidden");
  if (loadingCard) {
    loadingCard.classList.remove("hidden");
    loadingCard.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const titleEl = document.getElementById("loading-title");
  const descEl = document.getElementById("loading-desc");
  const progressEl = document.getElementById("loading-progress-bar");
  const secondsEl = document.getElementById("loading-elapsed-seconds");

  const stepOcr = document.getElementById("step-ocr");
  const stepParse = document.getElementById("step-parse");
  const stepSync = document.getElementById("step-sync");

  const startTime = Date.now();
  if (extractionLoadingTimer) clearInterval(extractionLoadingTimer);

  extractionLoadingTimer = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    if (secondsEl) secondsEl.innerText = elapsed.toFixed(1) + "s";

    // Enforce 40-second maximum processing ceiling
    if (elapsed >= MAX_EXTRACTION_TIMEOUT_SEC) {
      cancelExtraction("timeout");
      return;
    }

    if (elapsed < 0.8) {
      if (titleEl) titleEl.innerText = "Scanning Document Visuals...";
      if (descEl) descEl.innerText = "Analyzing receipt sharpness, header, & contrast...";
      if (progressEl) progressEl.style.width = "40%";
      if (stepOcr) stepOcr.className = "flex flex-col items-center p-2 rounded-xl bg-emerald-100 border border-emerald-400 text-emerald-800 font-bold transition-all shadow-sm";
      if (stepParse) stepParse.className = "flex flex-col items-center p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 font-semibold transition-all";
      if (stepSync) stepSync.className = "flex flex-col items-center p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 font-semibold transition-all";
    } else if (elapsed < 1.6) {
      if (titleEl) titleEl.innerText = "Reading Line Items & Figures...";
      if (descEl) descEl.innerText = "Extracting prices, taxes, categories, & payment methods...";
      if (progressEl) progressEl.style.width = "75%";
      if (stepOcr) stepOcr.className = "flex flex-col items-center p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold transition-all";
      if (stepParse) stepParse.className = "flex flex-col items-center p-2 rounded-xl bg-teal-100 border border-teal-400 text-teal-800 font-bold transition-all shadow-sm";
      if (stepSync) stepSync.className = "flex flex-col items-center p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 font-semibold transition-all";
    } else {
      if (titleEl) titleEl.innerText = "Preparing Accounting Records...";
      if (descEl) descEl.innerText = "Structuring line items & preparing cloud sync...";
      if (progressEl) progressEl.style.width = "95%";
      if (stepOcr) stepOcr.className = "flex flex-col items-center p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold transition-all";
      if (stepParse) stepParse.className = "flex flex-col items-center p-2 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 font-semibold transition-all";
      if (stepSync) stepSync.className = "flex flex-col items-center p-2 rounded-xl bg-sky-100 border border-sky-400 text-sky-800 font-bold transition-all shadow-sm";
    }
  }, 100);
}

function stopLoadingAnimation(success = true) {
  if (activeTimeoutHandle) {
    clearTimeout(activeTimeoutHandle);
    activeTimeoutHandle = null;
  }
  if (extractionLoadingTimer) {
    clearInterval(extractionLoadingTimer);
    extractionLoadingTimer = null;
  }
  const loadingCard = document.getElementById("loading-card");
  if (loadingCard) loadingCard.classList.add("hidden");

  if (success) {
    // Reset and restore Step 1 capture buttons immediately for the next receipt
    resetScanStep(false);
  } else {
    const previewContainer = document.getElementById("image-preview-container");
    if (previewContainer) previewContainer.classList.remove("hidden");
  }
}

async function processAndExtract() {
  if (!originalImageFile && !currentCroppedBlob) {
    alert("Please capture or choose a receipt photo first.");
    return;
  }

  const activeComp = getActiveCompany();
  const resultCard = document.getElementById("result-card");

  // Setup abort controller and 40s timeout guard
  activeExtractionController = new AbortController();
  const signal = activeExtractionController.signal;

  if (activeTimeoutHandle) clearTimeout(activeTimeoutHandle);
  activeTimeoutHandle = setTimeout(() => {
    cancelExtraction("timeout");
  }, MAX_EXTRACTION_TIMEOUT_SEC * 1000);

  startLoadingAnimation();

  const executeTurbo = async (rawImageBlob) => {
    const t0 = performance.now();
    try {
      // 1. High-clarity compression preserves small fonts & thermal print
      const compressedBlob = await compressImageForUpload(rawImageBlob, 1500, 0.92);
      let parsedReceipt = null;

      // 2. Direct Turbo Call if API key is in browser
      if (userGeminiApiKey && userGeminiApiKey.trim().length > 0) {
        try {
          const b64 = await blobToBase64(compressedBlob);
          parsedReceipt = await extractDirectWithGemini(b64, userGeminiApiKey.trim(), signal);
          const tDirect = ((performance.now() - t0) / 1000).toFixed(2);
          console.log(`⚡ Direct Turbo Extraction finished in ${tDirect}s!`);
        } catch (directErr) {
          if (directErr.name === "AbortError") throw directErr;
          console.warn("Direct turbo failed, falling back to server:", directErr);
        }
      }

      // 3. Populate form instantly if direct extraction succeeded
      if (parsedReceipt) {
        parsedReceipt.id = `REC-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        parsedReceipt.company_name = activeComp.name;
        currentReceiptData = parsedReceipt;
        populateReviewForm(parsedReceipt);

        stopLoadingAnimation(true);
        resultCard.classList.remove("hidden");
        resultCard.scrollIntoView({ behavior: "smooth" });

        // Save receipt and sync to Google Drive & Google Sheet
        const formData = new FormData();
        formData.append("file", compressedBlob, "receipt_upload.jpg");
        formData.append("receipt_json", JSON.stringify(parsedReceipt));
        formData.append("filter_mode", currentFilter);
        formData.append("company_name", activeComp.name || "");
        formData.append("webhook_url", activeComp.webhook_url || "");

        fetch(`${API_BASE_URL}/api/save-extracted-receipt`, { method: "POST", body: formData })
          .then(r => r.json())
          .then(data => {
            if (data.receipt) {
              currentReceiptData = data.receipt;
              document.getElementById("badge-company-name").innerText = `🏢 ${data.receipt.company_name || activeComp.name}`;
              document.getElementById("badge-drive-folder").innerText = data.receipt.drive_folder || "Google Drive > Receipts";
              loadReceiptsList();
            }
          })
          .catch(e => console.warn("Background save error:", e));

        return;
      }

      // 4. Server-Side Fallback
      const formData = new FormData();
      formData.append("file", compressedBlob, "receipt_upload.jpg");
      formData.append("filter_mode", currentFilter);
      formData.append("auto_crop", "false");
      formData.append("api_key", userGeminiApiKey || "");
      formData.append("company_name", activeComp.name || "");
      formData.append("webhook_url", activeComp.webhook_url || "");
      formData.append("auto_sync", "true");

      const res = await fetch(`${API_BASE_URL}/api/scan-and-extract`, {
        method: "POST",
        body: formData,
        signal: signal
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      currentReceiptData = data.receipt;
      populateReviewForm(currentReceiptData);

      stopLoadingAnimation(true);
      resultCard.classList.remove("hidden");
      resultCard.scrollIntoView({ behavior: "smooth" });

      loadReceiptsList();

    } catch (err) {
      if (err.name === "AbortError") {
        // Handled by cancelExtraction
        return;
      }
      stopLoadingAnimation(false);
      alert("Extraction error: " + err.message);
      console.error(err);
    } finally {
      if (activeTimeoutHandle) {
        clearTimeout(activeTimeoutHandle);
        activeTimeoutHandle = null;
      }
      activeExtractionController = null;
    }
  };

  // 1. If crop was applied and saved
  if (currentCroppedBlob) {
    executeTurbo(currentCroppedBlob);
    return;
  }

  // 2. If cropper is still active on screen, grab canvas directly
  if (cropperInstance) {
    try {
      const croppedCanvas = cropperInstance.getCroppedCanvas({
        maxWidth: 1000,
        maxHeight: 1500,
        fillColor: '#ffffff',
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
      });
      if (croppedCanvas) {
        croppedCanvas.toBlob((blob) => {
          croppedCanvas.width = 1;
          croppedCanvas.height = 1;
          executeTurbo(blob || originalImageFile);
        }, "image/jpeg", 0.88);
        return;
      }
    } catch (e) {
      console.warn("Cropper canvas fallback:", e);
    }
  }

  // 3. Fallback to original image
  executeTurbo(originalImageFile);
}

function populateReviewForm(receipt) {
  document.getElementById("field-date").value = receipt.receipt_date || "";
  document.getElementById("field-merchant").value = receipt.merchant_name || "";
  document.getElementById("field-item-desc").value = receipt.item_description || "";
  document.getElementById("field-ref").value = receipt.reference_no || "";
  
  const catSelect = document.getElementById("field-category");
  catSelect.value = receipt.category || "Plant Inputs";
  if (!catSelect.value) {
    catSelect.selectedIndex = 0;
  }

  const paySelect = document.getElementById("field-payment");
  paySelect.value = receipt.payment_method || "Cash";
  if (!paySelect.value) {
    paySelect.value = "Cash";
  }

  document.getElementById("field-currency").value = receipt.currency || "MYR";
  document.getElementById("field-amount").value = receipt.total_amount || 0;

  const activeComp = getActiveCompany();
  document.getElementById("badge-company-name").innerText = `🏢 ${receipt.company_name || activeComp.name}`;
  document.getElementById("badge-drive-folder").innerText = receipt.drive_folder || "Google Drive > Receipts";

  const itemsContainer = document.getElementById("items-container");
  itemsContainer.innerHTML = "";
  if (receipt.items && receipt.items.length > 0) {
    receipt.items.forEach((item) => {
      const itemRow = document.createElement("div");
      itemRow.className = "flex justify-between items-center text-xs bg-slate-50 p-2 rounded-lg border border-slate-200";
      itemRow.innerHTML = `
        <span class="font-medium text-slate-700">${item.name} (x${item.quantity})</span>
        <span class="font-bold text-emerald-800">${receipt.currency} ${item.total_price.toFixed(2)}</span>
      `;
      itemsContainer.appendChild(itemRow);
    });
  } else {
    itemsContainer.innerHTML = `<p class="text-xs text-slate-400 italic">No itemized breakdown extracted.</p>`;
  }
}

function downloadImageCopy() {
  if (!currentReceiptData) {
    alert("No receipt available to download.");
    return;
  }
  const link = document.createElement("a");
  const tempUrl = currentCroppedBlob ? URL.createObjectURL(currentCroppedBlob) : (currentReceiptData.image_url ? `${API_BASE_URL}/api/storage-image?path=${currentReceiptData.image_url}` : "");
  link.href = tempUrl;
  link.download = `${(currentReceiptData.merchant_name || 'receipt').replace(/\s+/g, '_')}_${currentReceiptData.receipt_date || 'date'}.jpg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  if (currentCroppedBlob && tempUrl.startsWith("blob:")) {
    setTimeout(() => {
      try {
        URL.revokeObjectURL(tempUrl);
      } catch (e) {}
    }, 1000);
  }
}

async function updateReceiptRecord() {
  if (!currentReceiptData) return;

  const activeComp = getActiveCompany();

  currentReceiptData.receipt_date = document.getElementById("field-date").value;
  currentReceiptData.merchant_name = document.getElementById("field-merchant").value;
  currentReceiptData.item_description = document.getElementById("field-item-desc").value;
  currentReceiptData.reference_no = document.getElementById("field-ref").value;
  currentReceiptData.category = document.getElementById("field-category").value;
  currentReceiptData.payment_method = document.getElementById("field-payment").value;
  currentReceiptData.currency = document.getElementById("field-currency").value;
  currentReceiptData.total_amount = parseFloat(document.getElementById("field-amount").value) || 0;
  currentReceiptData.company_name = activeComp.name;

  try {
    const hookParam = encodeURIComponent(activeComp.webhook_url || "");
    const res = await fetch(`${API_BASE_URL}/api/update-receipt?webhook_url=${hookParam}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentReceiptData)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.receipt) {
        currentReceiptData = data.receipt;
      }
      alert(`Receipt updated & synced in place to ${activeComp.name} Google Sheet!`);
      loadReceiptsList();
    }
  } catch (e) {
    alert("Failed to update: " + e.message);
  }
}

async function loadReceiptsList() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/receipts`);
    const data = await res.json();
    allReceipts = data.receipts || [];

    renderLedgerTable(allReceipts);
    renderCompileSelector(allReceipts);
  } catch (e) {
    console.error("Error loading receipts:", e);
  }
}

function renderLedgerTable(receipts) {
  const tbody = document.getElementById("ledger-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (receipts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-8 text-slate-400">
          <div class="flex flex-col items-center justify-center space-y-2">
            <i class="fa-solid fa-receipt text-3xl text-slate-300"></i>
            <p class="text-xs font-semibold text-slate-500">No scanned receipts yet.</p>
            <button onclick="switchTab('scan')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm">
              <i class="fa-solid fa-camera"></i> Scan First Receipt
            </button>
          </div>
        </td>
      </tr>`;
    return;
  }

  receipts.forEach((r) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50 transition-colors";
    const particularsCombined = r.item_description ? `${r.merchant_name} - ${r.item_description}` : r.merchant_name;
    const logTime = r.created_at ? new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';

    tr.innerHTML = `
      <td class="px-3 py-2.5 font-mono text-2xs text-slate-500">${logTime}</td>
      <td class="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">${r.receipt_date || 'N/A'}</td>
      <td class="px-3 py-2.5 font-semibold text-slate-900">${particularsCombined}</td>
      <td class="px-3 py-2.5"><span class="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-2xs font-semibold">${r.payment_method || 'Cash'}</span></td>
      <td class="px-3 py-2.5 text-slate-600 font-mono text-2xs">${r.reference_no || 'N/A'}</td>
      <td class="px-3 py-2.5 font-bold text-emerald-700 whitespace-nowrap">${r.currency || 'MYR'} ${r.total_amount.toFixed(2)}</td>
      <td class="px-3 py-2.5"><span class="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 text-2xs font-semibold">${r.category}</span></td>
      <td class="px-3 py-2.5"><span class="px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 text-2xs font-semibold">${r.company_name || 'Active Account'}</span></td>
      <td class="px-3 py-2.5 text-center">
        <button type="button" onclick="deleteReceiptRow('${r.id}')" class="p-1.5 text-slate-400 hover:text-red-600 text-xs transition-colors" title="Delete Receipt">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderCompileSelector(receipts) {
  const container = document.getElementById("compile-receipt-list");
  const countBadge = document.getElementById("compile-count-badge");
  if (!container) return;
  container.innerHTML = "";

  if (countBadge) {
    countBadge.innerText = `${receipts.length} Receipt${receipts.length === 1 ? '' : 's'}`;
  }

  if (receipts.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl space-y-2">
        <i class="fa-solid fa-folder-open text-3xl text-slate-300"></i>
        <p class="text-xs font-semibold text-slate-500">No receipts scanned yet.</p>
        <button onclick="switchTab('scan')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm">
          <i class="fa-solid fa-camera"></i> Scan First Receipt
        </button>
      </div>`;
    return;
  }

  receipts.forEach((r) => {
    const div = document.createElement("div");
    div.className = "flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-100 transition-colors";
    div.innerHTML = `
      <div class="flex items-center space-x-3">
        <input type="checkbox" class="compile-checkbox rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer" value="${r.id}" checked />
        <div>
          <p class="font-bold text-xs text-slate-800">${r.merchant_name} <span class="font-normal text-slate-500">(${r.receipt_date})</span></p>
          <p class="text-2xs text-slate-500">Ref: ${r.reference_no || 'N/A'} | Mode: ${r.payment_method || 'Cash'} | Entity: ${r.company_name || 'Active Account'}</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <span class="font-bold text-xs text-emerald-700">${r.currency || 'MYR'} ${r.total_amount.toFixed(2)}</span>
        <button type="button" onclick="deleteReceiptRow('${r.id}')" class="text-slate-400 hover:text-red-600 text-xs p-1" title="Delete">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;
    container.appendChild(div);
  });
}

function selectAllReceipts(selectAll) {
  document.querySelectorAll(".compile-checkbox").forEach((cb) => {
    cb.checked = selectAll;
  });
}

async function deleteReceiptRow(receiptId) {
  if (!confirm("Are you sure you want to delete this receipt record?")) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/delete-receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: receiptId })
    });
    if (res.ok) {
      loadReceiptsList();
    }
  } catch (e) {
    alert("Error deleting receipt: " + e.message);
  }
}

async function clearAllScannedReceipts() {
  if (!confirm("Are you sure you want to clear the local scanned receipt list?")) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/clear-receipts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    if (res.ok) {
      loadReceiptsList();
    }
  } catch (e) {
    alert("Error clearing receipts: " + e.message);
  }
}

async function generateCompiledPDF() {
  const selectedIds = Array.from(document.querySelectorAll(".compile-checkbox:checked")).map((cb) => cb.value);
  if (selectedIds.length === 0) {
    alert("Please select at least 1 receipt to compile.");
    return;
  }

  const layoutMode = document.getElementById("compile-layout").value;
  const title = document.getElementById("compile-title").value || "Expense Claim & Receipts Audit Sheet";

  try {
    const res = await fetch(`${API_BASE_URL}/api/compile-a4-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receipt_ids: selectedIds,
        layout_mode: layoutMode,
        title: title
      })
    });

    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }

    const data = await res.json();
    const previewSection = document.getElementById("pdf-preview-section");
    const pdfFrame = document.getElementById("pdf-frame");
    const downloadLink = document.getElementById("pdf-download-link");

    pdfFrame.src = data.download_url;
    downloadLink.href = data.download_url;
    downloadLink.download = data.filename;

    previewSection.classList.remove("hidden");
    previewSection.scrollIntoView({ behavior: "smooth" });

  } catch (e) {
    alert("Failed to compile PDF: " + e.message);
  }
}

function switchTab(tabName) {
  const tabs = ["scan", "compile", "ledger"];
  tabs.forEach((t) => {
    const section = document.getElementById(`tab-${t}`);
    const btn = document.getElementById(`tab-${t}-btn`);
    const mobBtn = document.getElementById(`mob-tab-${t}-btn`);

    if (t === tabName) {
      if (section) section.classList.remove("hidden");
      if (btn) btn.className = "flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 px-1 sm:px-3 rounded-xl font-bold text-xs transition-all shadow bg-white text-emerald-800";
      if (mobBtn) {
        mobBtn.className = "flex-1 flex flex-col items-center justify-center py-1 rounded-xl text-emerald-700 font-bold transition-all bg-emerald-50/80";
        const icon = mobBtn.querySelector("i");
        if (icon) icon.className = icon.className.replace("text-slate-400", "text-emerald-600");
      }
    } else {
      if (section) section.classList.add("hidden");
      if (btn) btn.className = "flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 px-1 sm:px-3 rounded-xl font-bold text-xs transition-all text-slate-600 hover:text-slate-900";
      if (mobBtn) {
        mobBtn.className = "flex-1 flex flex-col items-center justify-center py-1 rounded-xl text-slate-500 font-semibold transition-all";
        const icon = mobBtn.querySelector("i");
        if (icon) icon.className = icon.className.replace("text-emerald-600", "text-slate-400");
      }
    }
  });

  if (tabName === "scan") {
    if (!originalImageFile && !cropperInstance) {
      resetScanStep(false);
    }
  } else if (tabName === "compile" || tabName === "ledger") {
    loadReceiptsList();
  }
}

// --- PWA NATIVE APP INSTALLATION SUPPORT ---
let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const mobBtn = document.getElementById("btn-pwa-install-mobile");
  if (mobBtn) mobBtn.classList.remove("hidden");
});

async function triggerPWAInstall() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);
    deferredInstallPrompt = null;
    const mobBtn = document.getElementById("btn-pwa-install-mobile");
    if (mobBtn) mobBtn.classList.add("hidden");
  } else {
    alert("To install as a full-screen app:\n\n📱 Android (Chrome): Tap the 3 dots (⋮) menu > 'Add to Home screen' or 'Install App'.\n\n🍎 iPhone (Safari): Tap the Share button (⬆️) > 'Add to Home Screen'.");
  }
}

// Register PWA Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").then(
      (reg) => console.log("PWA Service Worker registered with scope:", reg.scope),
      (err) => console.warn("PWA Service Worker registration failed:", err)
    );
  });
}

