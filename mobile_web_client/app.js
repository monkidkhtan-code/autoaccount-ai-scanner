// State
let currentImageFile = null;
let cropperInstance = null;
let currentEnhancedImageUrl = null;
let currentFilter = "enhanced_clean";
let currentReceiptData = null;
let allReceipts = [];
let userGeminiApiKey = localStorage.getItem("gemini_api_key") || "AQ.Ab8RN6JmvdDMPQgMGzMDkh0LfQ-84C9xNS1SYIgS9nhI47SffQ";

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  if (!localStorage.getItem("gemini_api_key")) {
    localStorage.setItem("gemini_api_key", userGeminiApiKey);
  }
  setupEventListeners();
  updateApiStatusUI();
  loadReceiptsList();
});

function updateApiStatusUI() {
  const label = document.getElementById("api-status-label");
  const inputKey = document.getElementById("input-gemini-key");

  if (userGeminiApiKey) {
    if (inputKey) inputKey.value = userGeminiApiKey;
    if (label) label.innerText = "⚡ Gemini AI Active";
  }
}

function openApiKeyModal() {
  document.getElementById("api-key-modal").classList.remove("hidden");
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
  currentImageFile = file;

  const uploadPrompt = document.getElementById("upload-prompt");
  const previewContainer = document.getElementById("image-preview-container");
  const cropperImg = document.getElementById("cropper-image");

  uploadPrompt.classList.add("hidden");
  previewContainer.classList.remove("hidden");

  if (cropperInstance) {
    cropperInstance.destroy();
    cropperInstance = null;
  }

  // Create lightweight instant blob object URL (0ms memory overhead)
  const objectUrl = URL.createObjectURL(file);

  cropperImg.onload = function() {
    try {
      if (typeof Cropper !== 'undefined') {
        cropperInstance = new Cropper(cropperImg, {
          viewMode: 1,
          dragMode: 'move',
          autoCropArea: 0.95,
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
      console.warn("Cropper init fallback:", err);
    }
  };

  cropperImg.src = objectUrl;
}

let currentCroppedBlob = null;

function applyAndSaveCrop() {
  if (!cropperInstance) {
    alert("No active crop box found.");
    return;
  }

  try {
    const croppedCanvas = cropperInstance.getCroppedCanvas({
      maxWidth: 1280,
      maxHeight: 1920,
      fillColor: '#fff',
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    });

    if (!croppedCanvas) {
      alert("Could not create cropped image.");
      return;
    }

    croppedCanvas.toBlob((blob) => {
      if (!blob) return;
      currentCroppedBlob = blob;
      
      // Update preview image
      const cropperImg = document.getElementById("cropper-image");
      const croppedUrl = URL.createObjectURL(blob);
      
      // Destroy cropper and display confirmed cropped image
      if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
      }
      
      cropperImg.src = croppedUrl;

      // Update badge
      const statusBadge = document.getElementById("crop-status-text");
      if (statusBadge) {
        statusBadge.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-600"></i> <strong class="text-emerald-700">Crop Applied & Saved!</strong> Ready for Extraction.';
      }
      
      const btnApply = document.getElementById("btn-apply-crop");
      if (btnApply) {
        btnApply.innerHTML = '<i class="fa-solid fa-check"></i> Saved';
        btnApply.classList.replace("bg-emerald-600", "bg-slate-700");
      }
    }, "image/jpeg", 0.95);
  } catch (err) {
    console.error("Error saving crop:", err);
    alert("Crop error: " + err.message);
  }
}

function resetFullCrop() {
  currentCroppedBlob = null;
  const cropperImg = document.getElementById("cropper-image");

  if (currentImageFile) {
    if (cropperInstance) {
      cropperInstance.destroy();
      cropperInstance = null;
    }
    const objUrl = URL.createObjectURL(currentImageFile);
    cropperImg.src = objUrl;

    const statusBadge = document.getElementById("crop-status-text");
    if (statusBadge) {
      statusBadge.innerHTML = '<i class="fa-solid fa-image text-slate-600"></i> Full uncropped photo active';
    }

    const btnApply = document.getElementById("btn-apply-crop");
    if (btnApply) {
      btnApply.innerHTML = '<i class="fa-solid fa-scissors"></i> ✂️ Apply & Save Crop';
      btnApply.classList.replace("bg-slate-700", "bg-emerald-600");
    }
  }
}

function rotateCropper() {
  if (cropperInstance) {
    cropperInstance.rotate(90);
  } else if (currentImageFile) {
    // If cropper wasn't active, initialize it so user can rotate
    processSelectedFile(currentCroppedBlob || currentImageFile);
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
  } else if (currentImageFile) {
    processSelectedFile(currentCroppedBlob || currentImageFile);
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
  currentImageFile = null;
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
  canvas.width = 420;
  canvas.height = 620;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 420, 620);

  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 18px Courier New, monospace";
  ctx.textAlign = "center";
  ctx.fillText("AGRO SUPPLY TRADING", 210, 45);

  ctx.font = "11px Courier New, monospace";
  ctx.fillText("SST NO: W10-1808-320001", 210, 65);
  ctx.fillText("Klang, Selangor", 210, 85);

  ctx.font = "bold 12px Courier New, monospace";
  ctx.textAlign = "left";
  ctx.fillText("======================================", 20, 130);
  ctx.fillText("INVOICE #: INV-2026-8812  DATE: 25/08/2026", 20, 150);
  ctx.fillText("CASHIER: AHMAD           PAY: TnG", 20, 170);
  ctx.fillText("======================================", 20, 190);

  ctx.font = "12px Courier New, monospace";
  ctx.fillText("ITEM DESCRIPTION        QTY     AMOUNT", 20, 220);
  ctx.fillText("--------------------------------------", 20, 235);
  ctx.fillText("CHILI FERTILIZER (50KG) 2x    RM 160.00", 20, 260);
  ctx.fillText("PESTICIDE SPRAY BOTTLE  1x    RM  45.00", 20, 285);
  ctx.fillText("PLASTIC PACKING TAPE    4x    RM  24.00", 20, 310);

  ctx.font = "bold 13px Courier New, monospace";
  ctx.fillText("--------------------------------------", 20, 345);
  ctx.fillText("TOTAL AMOUNT:                RM 229.00", 20, 375);
  ctx.fillText("======================================", 20, 400);

  canvas.toBlob((blob) => {
    const sampleFile = new File([blob], "sample_farm_receipt.jpg", { type: "image/jpeg" });
    processSelectedFile(sampleFile);
  }, "image/jpeg");
}

async function processAndExtract() {
  if (!currentImageFile && !currentCroppedBlob) {
    alert("Please capture or choose a receipt photo first.");
    return;
  }

  const loadingCard = document.getElementById("loading-card");
  const resultCard = document.getElementById("result-card");
  loadingCard.classList.remove("hidden");
  resultCard.classList.add("hidden");

  const sendPayload = async (imageBlob) => {
    currentEnhancedImageUrl = URL.createObjectURL(imageBlob);

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

  // If crop was explicitly applied and saved
  if (currentCroppedBlob) {
    sendPayload(currentCroppedBlob);
    return;
  }

  // If user didn't tap "Apply Crop" but cropper is still active on screen, grab canvas
  if (cropperInstance) {
    try {
      const croppedCanvas = cropperInstance.getCroppedCanvas({
        maxWidth: 1280,
        maxHeight: 1920,
        fillColor: '#fff',
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
      });
      if (croppedCanvas) {
        croppedCanvas.toBlob((blob) => {
          sendPayload(blob || currentImageFile);
        }, "image/jpeg", 0.95);
        return;
      }
    } catch (e) {
      console.warn("Cropper canvas error, using direct file:", e);
    }
  }

  // Fallback to direct file
  sendPayload(currentImageFile);
}

function populateReviewForm(receipt) {
  document.getElementById("field-date").value = receipt.receipt_date || "";
  
  // Separate Merchant Name and Item Description
  document.getElementById("field-merchant").value = receipt.merchant_name || "";
  document.getElementById("field-item-desc").value = receipt.item_description || "";
  document.getElementById("field-ref").value = receipt.reference_no || "";
  
  // Set Category dropdown
  const catSelect = document.getElementById("field-category");
  catSelect.value = receipt.category || "Plant Inputs";
  if (!catSelect.value) {
    catSelect.selectedIndex = 1; // Default to Plant Inputs
  }

  // Set Payment Mode dropdown
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
  if (!currentEnhancedImageUrl && !currentReceiptData) {
    alert("No enhanced receipt available to download.");
    return;
  }
  const link = document.createElement("a");
  link.href = currentEnhancedImageUrl || (currentReceiptData && currentReceiptData.image_url ? `/api/storage-image?path=${currentReceiptData.image_url}` : "");
  link.download = `${currentReceiptData ? currentReceiptData.merchant_name.replace(/\s+/g, '_') : 'Receipt'}_${currentReceiptData ? currentReceiptData.receipt_date : 'scan'}.jpg`;
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
