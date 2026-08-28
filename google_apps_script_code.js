/**
 * Google Apps Script for AutoAccount AI - Multi-Company Scanner & Expense Ledger
 * 
 * Arranges columns exactly as requested:
 * Col A: Data Entry Log Time (DD/MM/YYYY HH:mm:ss)
 * Col B: Date (DD/MM/YYYY)
 * Col C: Particulars (Merchant Name - Item Description)
 * Col D: Mode of Payment (Dropdown: Cash, Credit Card, TnG, ShopeePay, Bank Transfer)
 * Col E: Cheque No./ Reference No./ Invoice No.
 * Col F: [Blank]
 * Col G: Amount
 * Col H: [Blank]
 * Col I: [Blank]
 * Col J: Category (Dropdown with Accounting Categories)
 * Col K: Image Link (Google Drive Receipt Link)
 */

var PAYMENT_MODES = [
  "Cash",
  "Credit Card",
  "TnG",
  "ShopeePay",
  "Bank Transfer"
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

    // 2. Save high-res receipt image if provided
    var fileUrl = "";
    if (data.image_base64 && data.image_base64.length > 0) {
      var decodedImage = Utilities.base64Decode(data.image_base64);
      var blob = Utilities.newBlob(decodedImage, "image/jpeg", data.filename || "Receipt.jpg");
      var file = monthFolder.createFile(blob);
      fileUrl = file.getUrl();
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
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
      data.category || "Plant Inputs",         // Col J: Category
      fileUrl                                  // Col K: Image Link
    ];

    if (row.length >= 11) {
      row[10] = fileUrl;
    } else {
      while (row.length < 10) {
        row.push("");
      }
      row.push(fileUrl);
    }

    var targetRowIdx = 0;

    // --- IN-PLACE UPDATE LOGIC ---
    if (data.action === "update") {
      // 1. Try finding by row_index
      if (data.row_index && data.row_index > 1 && data.row_index <= sheet.getLastRow()) {
        targetRowIdx = parseInt(data.row_index, 10);
      }

      // 2. Try finding by Reference No in Column E
      if (!targetRowIdx && data.reference_no && data.reference_no.toString().trim().length > 0) {
        var lastRow = sheet.getLastRow();
        if (lastRow > 1) {
          var refValues = sheet.getRange(2, 5, lastRow - 1, 1).getValues();
          for (var r = refValues.length - 1; r >= 0; r--) {
            if (refValues[r][0] && refValues[r][0].toString().trim() === data.reference_no.toString().trim()) {
              targetRowIdx = r + 2;
              break;
            }
          }
        }
      }

      // 3. Try finding by Log Time in Column A
      if (!targetRowIdx && data.log_time && data.log_time.toString().trim().length > 0) {
        var lastRow = sheet.getLastRow();
        if (lastRow > 1) {
          var logValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
          for (var r = logValues.length - 1; r >= 0; r--) {
            if (logValues[r][0] && logValues[r][0].toString().trim() === data.log_time.toString().trim()) {
              targetRowIdx = r + 2;
              break;
            }
          }
        }
      }

      // 4. If updating right after scanning, update the last row
      if (!targetRowIdx && sheet.getLastRow() > 1) {
        targetRowIdx = sheet.getLastRow();
      }

      if (targetRowIdx > 1 && targetRowIdx <= sheet.getLastRow()) {
        var currentValues = sheet.getRange(targetRowIdx, 1, 1, 11).getValues()[0];
        // Preserve original Entry Log Time
        if (currentValues[0]) {
          row[0] = currentValues[0];
        }
        // Preserve existing receipt image URL if not re-uploaded
        if (!fileUrl && currentValues[10]) {
          row[10] = currentValues[10];
          fileUrl = currentValues[10];
        }
        sheet.getRange(targetRowIdx, 1, 1, 11).setValues([row]);
      } else {
        sheet.appendRow(row);
        targetRowIdx = sheet.getLastRow();
      }
    } else {
      // Normal Scan: Append New Row
      sheet.appendRow(row);
      targetRowIdx = sheet.getLastRow();
    }

    // Apply data validation dropdowns for row
    applyRowValidation(sheet, targetRowIdx);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      drive_link: fileUrl,
      folder: "Accounting/" + (data.year || "2026") + "/" + (data.month || "08_August"),
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
    var rulePayment = SpreadsheetApp.newDataValidation()
      .requireValueInList(PAYMENT_MODES, true)
      .setAllowInvalid(true)
      .build();
    sheet.getRange(rowIdx, 4).setDataValidation(rulePayment);

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
