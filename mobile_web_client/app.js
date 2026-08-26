// State Management
let originalImageFile = null;
let currentCroppedBlob = null;
let cropperInstance = null;
let currentFilter = "enhanced_clean";
let currentReceiptData = null;
let allReceipts = [];
let userGeminiApiKey = localStorage.getItem("gemini_api_key") || "";

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  updateApiStatusUI();
  loadReceiptsList();
});

function updateApiStatusUI() {
  const label = document.getElementById("api-status-label");
  const inputKey = document.getElementById("input-gemini-key");

  if (userGeminiApiKey && userGeminiApiKey.trim().length > 0) {
    if (inputKey) inputKey.value = userGeminiApiKey;
    if (label) {
      label.innerHTML = '<i class="fa-solid fa-bolt text-yellow-300"></i> ⚡ Gemini AI Active';
      label.className = "text-xs font-semibold px-2.5 py-1 bg-emerald-500/20 text-emerald-200 rounded-full border border-emerald-400/30";
    }
  } else {
    if (label) {
      label.innerHTML = '<i class="fa-solid fa-key text-amber-300"></i> Set API Key';
      label.className = "text-xs font-semibold px-2.5 py-1 bg-amber-500/20 text-amber-200 rounded-full border border-amber-400/30";
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

  // Show cropper toolbar controls
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

  // If already cropped, re-open cropper on original image
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

      // Destroy active cropper box to show the clean cropped image directly
      if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
      }

      cropperImg.src = croppedUrl;
      updateCropStatus("cropped");

      // Hide adjustment buttons since image is now cropped
      document.getElementById("crop-controls-bar").classList.add("hidden");

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
    // Expand crop box to 100%
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

function setFilter(filterMode) {
  currentFilter = filterMode;
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    if (btn.dataset.filter === filterMode) {
      btn.classList.add("active-filter", "bg-emerald-50", "border-emerald-500", "text-emerald-700");
    } else {
      btn.classList.remove("active-filter", "bg-emerald-50", "border-emerald-500", "text-emerald-700");
      btn.classList.add("bg-white");
    }
  });
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
  ctx.fillText("SKG TYRE AUTOCARE SDN BHD", 220, 45);

  ctx.font = "11px Courier New, monospace";
  ctx.fillText("NO: 24, JALAN SETIA INDAH, SETIA ALAM", 220, 65);
  ctx.fillText("TEL: 03-3358 1234", 220, 85);

  ctx.font = "bold 12px Courier New, monospace";
  ctx.textAlign = "left";
  ctx.fillText("======================================", 20, 110);
  ctx.fillText("INVOICE #: CS-2401407    DATE: 26/08/2026", 20, 130);
  ctx.fillText("VEHICLE: PROTON EXORA    PAY: Cash", 20, 150);
  ctx.fillText("======================================", 20, 170);

  ctx.font = "12px Courier New, monospace";
  ctx.fillText("ITEM DESCRIPTION        QTY     AMOUNT", 20, 200);
  ctx.fillText("--------------------------------------", 20, 215);
  ctx.fillText("TYRE PATCHING / REPAIR  1x    RM  40.00", 20, 245);
  ctx.fillText("WHEEL BALANCING         2x    RM  20.00", 20, 275);

  ctx.font = "bold 13px Courier New, monospace";
  ctx.fillText("--------------------------------------", 20, 310);
  ctx.fillText("TOTAL AMOUNT:                RM  60.00", 20, 340);
  ctx.fillText("======================================", 20, 365);

  canvas.toBlob((blob) => {
    const sampleFile = new File([blob], "sample_skg_tyre_receipt.jpg", { type: "image/jpeg" });
    processSelectedFile(sampleFile);
  }, "image/jpeg");
}

async function processAndExtract() {
  if (!originalImageFile && !currentCroppedBlob) {
    alert("Please capture or choose a receipt photo first.");
    return;
  }

  const loadingCard = document.getElementById("loading-card");
  const resultCard = document.getElementById("result-card");
  loadingCard.classList.remove("hidden");
  resultCard.classList.add("hidden");

  const sendPayload = async (imageBlob) => {
    const formData = new FormData();
    formData.append("file", imageBlob, "receipt_upload.jpg");
    formData.append("filter_mode", currentFilter);
    formData.append("auto_crop", "false");
    formData.append("api_key", userGeminiApiKey || "");
    formData.append("auto_sync", "true");

    try {
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
        }, "image/jpeg", 0.95);
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
  catSelect.value = receipt.category || "Plant Inputs";
  if (!catSelect.value) {
    catSelect.selectedIndex = 1;
  }

  const paySelect = document.getElementById("field-payment");
  paySelect.value = receipt.payment_method || "Cash";
  if (!paySelect.value) {
    paySelect.value = "Cash";
  }

  document.getElementById("field-currency").value = receipt.currency || "MYR";
  document.getElementById("field-amount").value = receipt.total_amount || 0;

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

  currentReceiptData.receipt_date = document.getElementById("field-date").value;
  currentReceiptData.merchant_name = document.getElementById("field-merchant").value;
  currentReceiptData.item_description = document.getElementById("field-item-desc").value;
  currentReceiptData.reference_no = document.getElementById("field-ref").value;
  currentReceiptData.category = document.getElementById("field-category").value;
  currentReceiptData.payment_method = document.getElementById("field-payment").value;
  currentReceiptData.currency = document.getElementById("field-currency").value;
  currentReceiptData.total_amount = parseFloat(document.getElementById("field-amount").value) || 0;

  try {
    const res = await fetch("/api/update-receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentReceiptData)
    });
    if (res.ok) {
      alert("Receipt record updated & synced to Google Sheets successfully!");
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
  tbody.innerHTML = "";

  if (receipts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-slate-400 italic">No farm receipts scanned yet. Tap "Scan & Extract" to start.</td></tr>`;
    return;
  }

  receipts.forEach((r) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50 transition-colors";
    const particularsCombined = r.item_description ? `${r.merchant_name} - ${r.item_description}` : r.merchant_name;

    tr.innerHTML = `
      <td class="px-3 py-2.5 font-medium text-slate-800">${r.receipt_date || 'N/A'}</td>
      <td class="px-3 py-2.5 font-semibold text-slate-900">${particularsCombined}</td>
      <td class="px-3 py-2.5"><span class="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-2xs font-semibold">${r.payment_method || 'Cash'}</span></td>
      <td class="px-3 py-2.5 text-slate-600 font-mono text-2xs">${r.reference_no || 'N/A'}</td>
      <td class="px-3 py-2.5 font-bold text-emerald-700">${r.currency || 'MYR'} ${r.total_amount.toFixed(2)}</td>
      <td class="px-3 py-2.5"><span class="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 text-2xs font-semibold">${r.category}</span></td>
      <td class="px-3 py-2.5"><span class="px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 text-2xs font-semibold">${r.status || 'Synced'}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderCompileSelector(receipts) {
  const container = document.getElementById("compile-receipt-list");
  container.innerHTML = "";

  if (receipts.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-400 italic py-4">No receipts available to compile. Scan bills first.</p>`;
    return;
  }

  receipts.forEach((r) => {
    const div = document.createElement("div");
    div.className = "flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-100 transition-colors";
    div.innerHTML = `
      <div class="flex items-center space-x-3">
        <input type="checkbox" class="compile-checkbox rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4" value="${r.id}" checked />
        <div>
          <p class="font-bold text-xs text-slate-800">${r.merchant_name} <span class="font-normal text-slate-500">(${r.receipt_date})</span></p>
          <p class="text-2xs text-slate-500">Ref: ${r.reference_no || 'N/A'} | Mode: ${r.payment_method || 'Cash'} | Cat: ${r.category}</p>
        </div>
      </div>
      <div class="text-right">
        <span class="font-bold text-xs text-emerald-700">${r.currency || 'MYR'} ${r.total_amount.toFixed(2)}</span>
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

async function generateCompiledPDF() {
  const selectedIds = Array.from(document.querySelectorAll(".compile-checkbox:checked")).map((cb) => cb.value);
  if (selectedIds.length === 0) {
    alert("Please select at least 1 receipt to compile.");
    return;
  }

  const layoutMode = document.getElementById("compile-layout").value;
  const title = document.getElementById("compile-title").value || "Farm Expense & Receipts Audit Sheet";

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
      btn.classList.add("bg-white", "text-emerald-800", "shadow");
      btn.classList.remove("text-slate-600");
    } else {
      section.classList.add("hidden");
      btn.classList.remove("bg-white", "text-emerald-800", "shadow");
      btn.classList.add("text-slate-600");
    }
  });

  if (tabName === "compile" || tabName === "ledger") {
    loadReceiptsList();
  }
}
