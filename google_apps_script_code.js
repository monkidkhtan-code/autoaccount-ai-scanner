/**
 * Google Apps Script for AutoAccount AI - Farm Accounting Hub
 * 
 * Arranges columns exactly as requested:
 * Col A: Data Entry Log Time (DD/MM/YYYY HH:mm:ss)
 * Col B: Date (DD/MM/YYYY)
 * Col C: Particulars (Merchant Name - Item Description)
 * Col D: Mode of Payment (Dropdown: Cash, Credit Card, TnG, ShopeePay)
 * Col E: Cheque No./ Reference No./ Invoice No.
 * Col F: [Blank]
 * Col G: Amount
 * Col H: [Blank]
 * Col I: [Blank]
 * Col J: Category (Dropdown with 32 Farm Accounting Categories)
 * Col K: Image Link (Google Drive Receipt Link)
 */

var PAYMENT_MODES = [
  "Cash",
  "Credit Card",
  "TnG",
  "ShopeePay"
];

var FARM_CATEGORIES = [
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

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var rootFolder = DriveApp.getRootFolder();
    
    // 1. Organize in Google Drive: Accounting / YYYY / MM_Month
    var accountingFolder = getOrCreateFolder(rootFolder, "Accounting");
    var yearFolder = getOrCreateFolder(accountingFolder, data.year || "2026");
    var monthFolder = getOrCreateFolder(yearFolder, data.month || "08_August");

    // 2. Save high-res receipt image to Google Drive folder
    var fileUrl = "";
    if (data.image_base64 && data.image_base64.length > 0) {
      var decodedImage = Utilities.base64Decode(data.image_base64);
      var blob = Utilities.newBlob(decodedImage, "image/jpeg", data.filename || "Receipt.jpg");
      var file = monthFolder.createFile(blob);
      fileUrl = file.getUrl();
    }

    // 3. Append row to Google Sheet
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Timestamp for Data Entry Log Time
    var nowFormatted = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+8", "dd/MM/yyyy HH:mm:ss");

    var row = data.row_data || [
      data.log_time || nowFormatted,           // Col A: Data Entry Log Time
      data.receipt_date || "",                 // Col B: Date
      data.particulars || "",                  // Col C: Particulars
      data.payment_method || "Cash",           // Col D: Mode of Payment
      data.reference_no || "",                 // Col E: Cheque No./ Reference No./ Invoice No.
      "",                                      // Col F: [Blank]
      data.total_amount || 0,                  // Col G: Amount
      "",                                      // Col H: [Blank]
      "",                                      // Col I: [Blank]
      data.category || "Upkeep of Vehicles",   // Col J: Category
      fileUrl                                  // Col K: Image Link
    ];

    // Put file URL into Column K (index 10)
    if (row.length >= 11) {
      row[10] = fileUrl;
    } else {
      while (row.length < 10) {
        row.push("");
      }
      row.push(fileUrl);
    }

    var targetRowIdx = 0;

    // If update action is specified and valid row index provided, overwrite in place
    if (data.action === "update" && data.row_index && data.row_index > 1 && data.row_index <= sheet.getLastRow()) {
      targetRowIdx = parseInt(data.row_index, 10);
      var currentValues = sheet.getRange(targetRowIdx, 1, 1, 11).getValues()[0];
      // Keep original Entry Log Time if already exists
      if (currentValues[0]) {
        row[0] = currentValues[0];
      }
      // Preserve existing image link if not re-uploaded
      if (!fileUrl && currentValues[10]) {
        row[10] = currentValues[10];
        fileUrl = currentValues[10];
      }
      sheet.getRange(targetRowIdx, 1, 1, 11).setValues([row]);
    } else {
      sheet.appendRow(row);
      targetRowIdx = sheet.getLastRow();
    }

    // Apply data validation dropdowns for row
    applyRowValidation(sheet, targetRowIdx);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      drive_link: fileUrl,
      folder: "Accounting/" + data.year + "/" + data.month,
      row_index: targetRowIdx
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function applyRowValidation(sheet, rowIdx) {
  try {
    // Mode of Payment is Column D (col 4)
    var rulePayment = SpreadsheetApp.newDataValidation()
      .requireValueInList(PAYMENT_MODES, true)
      .setAllowInvalid(true)
      .build();
    sheet.getRange(rowIdx, 4).setDataValidation(rulePayment);

    // Category is Column J (col 10)
    var ruleCategory = SpreadsheetApp.newDataValidation()
      .requireValueInList(FARM_CATEGORIES, true)
      .setAllowInvalid(true)
      .build();
    sheet.getRange(rowIdx, 10).setDataValidation(ruleCategory);
  } catch (e) {
    // Ignore validation errors if permissions differ
  }
}

function getOrCreateFolder(parent, name) {
  var folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}
