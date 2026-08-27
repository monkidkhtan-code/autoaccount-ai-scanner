// State Management
let originalImageFile = null;
let currentCroppedBlob = null;
let cropperInstance = null;
let currentFilter = "enhanced_clean";
let currentReceiptData = null;
let allReceipts = [];
let userGeminiApiKey = localStorage.getItem("gemini_api_key") || "";

// Standard Universal Accounting Categories (Business, Trade, Transport, Operations, Agriculture)
const ACCOUNTING_CATEGORIES = [
  "General Expenses",
  "Plant Inputs",
  "Packing Materials",
  "Salaries",
  "Wages",
  "Staff Welfare",
  "Worker Permit",
  "Petrol & Fuel",
  "Toll & Parking",
  "Electricity",
  "Water",
  "Telephone & Internet",
  "Office Supplies & Stationery",
  "Upkeep of Vehicles",
  "Upkeep of Equipment & Tools",
  "Repair & Maintenance",
  "Insurance & Road Tax",
  "Printing & Advertising",
  "Medical & Healthcare",
  "Entertainment & Meals",
  "License & Registrations",
  "Training Fee",
  "Professional & Legal Fee",
  "Accounting & Audit Fee",
  "Bank Charges & Interest",
  "Depreciation",
  "Property & Buildings",
  "Machinery & Fixed Assets",
  "Cash in Hand / Petty Cash",
  "Deposits & Prepayments",
  "Accruals",
  "Sales Revenue"
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
      await fetch("/api/save-api-key", { method: "POST", body: formData });
    } catch (e) {
      console.warn("Could not save to backend:", e);
    }
  }

  updateApiStatusUI();
  closeApiKeyModal();
  alert("Gemini AI API Key saved!");
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
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("border-emerald-500", "bg-emerald-50/50");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  });
}

function triggerCameraInput() {
  document.getElementById("camera-input").click();
}

function triggerGalleryInput() {
  document.getElementById("gallery-input").click();
}

function handleFileSelect(e) {
  if (e.target.files && e.target.files[0]) {
    processSelectedFile(e.target.files[0]);
  }
}

function processSelectedFile(file) {
  if (!file) return;
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

  const objectUrl = URL.createObjectURL(file);

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
      currentCroppedBlob = blob;
      
      const croppedUrl = URL.createObjectURL(blob);

      if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
      }

      cropperImg.src = croppedUrl;
      updateCropStatus("cropped");
      document.getElementById("crop-controls-bar").classList.add("hidden");
      applyLiveImageFilter();

    }, "image/jpeg", 0.95);
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

function retakePhoto() {
  originalImageFile = null;
  currentCroppedBlob = null;
  if (cropperInstance) {
    cropperInstance.destroy();
    cropperInstance = null;
  }
  document.getElementById("camera-input").value = "";
  document.getElementById("gallery-input").value = "";
  document.getElementById("upload-prompt").classList.remove("hidden");
  document.getElementById("image-preview-container").classList.add("hidden");
  document.getElementById("result-card").classList.add("hidden");
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
    const sampleFile = new File([blob], "sample_cash_bill.jpg", { type: "image/jpeg" });
    processSelectedFile(sampleFile);
  }, "image/jpeg");
// --- FAST CLIENT-SIDE IMAGE COMPRESSION ---

async function compressImageForUpload(blobOrFile, maxDimension = 1100, quality = 0.82) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
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
          resolve(blob || blobOrFile);
        }, "image/jpeg", quality);
      };
      img.onerror = () => resolve(blobOrFile);
      img.src = URL.createObjectURL(blobOrFile);
    } catch (e) {
      resolve(blobOrFile);
    }
  });
}

// --- SCAN AND EXTRACTION WITH TARGET COMPANY WEBHOOK ---

async function processAndExtract() {
  if (!originalImageFile && !currentCroppedBlob) {
    alert("Please capture or choose a receipt photo first.");
    return;
  }

  const activeComp = getActiveCompany();

  const loadingCard = document.getElementById("loading-card");
  const resultCard = document.getElementById("result-card");
  loadingCard.classList.remove("hidden");
  resultCard.classList.add("hidden");

  const sendPayload = async (rawImageBlob) => {
    try {
      // 1. Client-side ultra-fast compression (drops 10MB camera photo to ~80KB)
      const compressedBlob = await compressImageForUpload(rawImageBlob, 1100, 0.82);

      const formData = new FormData();
      formData.append("file", compressedBlob, "receipt_upload.jpg");
      formData.append("filter_mode", currentFilter);
      formData.append("auto_crop", "false");
      formData.append("api_key", userGeminiApiKey || "");
      formData.append("company_name", activeComp.name || "");
      formData.append("webhook_url", activeComp.webhook_url || "");
      formData.append("auto_sync", "true");

      const res = await fetch("/api/scan-and-extract", {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      currentReceiptData = data.receipt;
      populateReviewForm(currentReceiptData);

      loadingCard.classList.add("hidden");
      resultCard.classList.remove("hidden");
      resultCard.scrollIntoView({ behavior: "smooth" });

      loadReceiptsList();

    } catch (err) {
      loadingCard.classList.add("hidden");
      alert("Extraction error: " + err.message);
      console.error(err);
    }
  };

  // 1. If crop was applied and saved
  if (currentCroppedBlob) {
    sendPayload(currentCroppedBlob);
    return;
  }

  // 2. If cropper is still active on screen, grab canvas directly
  if (cropperInstance) {
    try {
      const croppedCanvas = cropperInstance.getCroppedCanvas({
        maxWidth: 1200,
        maxHeight: 1800,
        fillColor: '#ffffff',
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
      });
      if (croppedCanvas) {
        croppedCanvas.toBlob((blob) => {
          sendPayload(blob || originalImageFile);
        }, "image/jpeg", 0.92);
        return;
      }
    } catch (e) {
      console.warn("Cropper canvas fallback:", e);
    }
  }

  // 3. Fallback to original image
  sendPayload(originalImageFile);
}

function populateReviewForm(receipt) {
  document.getElementById("field-date").value = receipt.receipt_date || "";
  document.getElementById("field-merchant").value = receipt.merchant_name || "";
  document.getElementById("field-item-desc").value = receipt.item_description || "";
  document.getElementById("field-ref").value = receipt.reference_no || "";
  
  const catSelect = document.getElementById("field-category");
  catSelect.value = receipt.category || "General Expenses";
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
  link.href = currentCroppedBlob ? URL.createObjectURL(currentCroppedBlob) : (currentReceiptData.image_url ? `/api/storage-image?path=${currentReceiptData.image_url}` : "");
  link.download = `${currentReceiptData.merchant_name.replace(/\s+/g, '_')}_${currentReceiptData.receipt_date}.jpg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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
    const res = await fetch("/api/update-receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentReceiptData)
    });
    if (res.ok) {
      alert(`Receipt updated & synced to ${activeComp.name} Google Sheet!`);
      loadReceiptsList();
    }
  } catch (e) {
    alert("Failed to update: " + e.message);
  }
}

async function loadReceiptsList() {
  try {
    const res = await fetch("/api/receipts");
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
    const res = await fetch("/api/delete-receipt", {
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
    const res = await fetch("/api/clear-receipts", {
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
    const res = await fetch("/api/compile-a4-pdf", {
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
    if (t === tabName) {
      section.classList.remove("hidden");
      btn.className = "flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 px-1 sm:px-3 rounded-xl font-bold text-xs transition-all shadow bg-white text-emerald-800";
    } else {
      section.classList.add("hidden");
      btn.className = "flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 px-1 sm:px-3 rounded-xl font-bold text-xs transition-all text-slate-600 hover:text-slate-900";
    }
  });

  if (tabName === "compile" || tabName === "ledger") {
    loadReceiptsList();
  }
}
