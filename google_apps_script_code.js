/**
 * Google Apps Script for AutoAccount AI - Multi-Company Scanner & Expense Ledger
 * 
 * Column Mapping & Formats (Strict Excel Compatibility):
 * Col A: Data Entry Log Time (DD/MM/YYYY HH:mm:ss)
 * Col B: Date (DD/MM/YYYY - True Serial Date for seamless Excel pasting)
 * Col C: Particulars (Merchant Name - Item Description)
 * Col D: Mode of Payment (Dropdown: Cash, Credit Card, TnG, ShopeePay, Bank Transfer)
 * Col E: Cheque No./ Reference No./ Invoice No. (Explicit Plain Text '@' to preserve leading zeros & hyphens)
 * Col F: [Blank]
 * Col G: Amount (Numeric Currency Format '#,##0.00' with 2 decimal places)
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

/**
 * Creates custom menu in Google Sheets UI for one-click Excel format repair
 */
function onOpen() {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.createMenu("⚡ AutoAccount AI")
      .addItem("🛠️ Fix All Formats & Dates (Excel Compatible)", "fixAllSheetFormats")
      .addItem("📋 Re-apply Dropdown Validations", "applyAllDropdownValidations")
      .addToUi();
  } catch (e) {}
}

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

    var dateVal = parseToDateObject(data.receipt_date);
    var refVal = (data.reference_no !== undefined && data.reference_no !== null) ? data.reference_no.toString() : "";
    var amountVal = parseFloat(data.total_amount) || 0;

    var row = data.row_data || [
      data.log_time || nowFormatted,           // Col A: Data Entry Log Time
      dateVal,                                 // Col B: Date
      data.particulars || "",                  // Col C: Particulars
      data.payment_method || "Cash",           // Col D: Mode of Payment
      refVal,                                  // Col E: Cheque No./ Reference No./ Invoice No.
      "",                                      // Col F: [Blank]
      amountVal,                               // Col G: Amount
      "",                                      // Col H: [Blank]
      "",                                      // Col I: [Blank]
      data.category || "Plant Inputs",         // Col J: Category
      fileUrl                                  // Col K: Image Link
    ];

    // Ensure parsed types in row array
    row[1] = parseToDateObject(row[1] || data.receipt_date);
    row[4] = (row[4] !== undefined && row[4] !== null) ? row[4].toString() : refVal;
    row[6] = parseFloat(row[6] !== undefined ? row[6] : amountVal) || 0;

    if (row.length >= 11) {
      row[10] = fileUrl || row[10] || "";
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
      if (!targetRowIdx && refVal.trim().length > 0) {
        var lastRow = sheet.getLastRow();
        if (lastRow > 1) {
          var refValues = sheet.getRange(2, 5, lastRow - 1, 1).getValues();
          for (var r = refValues.length - 1; r >= 0; r--) {
            if (refValues[r][0] && refValues[r][0].toString().trim() === refVal.trim()) {
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

    // Apply strict cell formats (Date, Text, 2-Decimal Currency)
    formatRow(sheet, targetRowIdx);

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

/**
 * Formats row cells with exact types so copying to Excel never corrupts formats:
 * - Col B: Real Date (dd/MM/yyyy)
 * - Col E: Pure Text '@' (preserves leading zeros like 00714, slashes, hyphens)
 * - Col G: Number Currency '#,##0.00' (always 2 decimals)
 */
function formatRow(sheet, rowIdx) {
  try {
    sheet.getRange(rowIdx, 1).setNumberFormat("dd/MM/yyyy HH:mm:ss");
    sheet.getRange(rowIdx, 2).setNumberFormat("dd/MM/yyyy");
    sheet.getRange(rowIdx, 3).setNumberFormat("@");
    sheet.getRange(rowIdx, 4).setNumberFormat("@");
    sheet.getRange(rowIdx, 5).setNumberFormat("@");
    sheet.getRange(rowIdx, 7).setNumberFormat("#,##0.00");
    sheet.getRange(rowIdx, 10).setNumberFormat("@");
    sheet.getRange(rowIdx, 11).setNumberFormat("@");
  } catch (e) {}
}

function parseToDateObject(val) {
  if (!val) return "";
  if (val instanceof Date) return val;
  var s = val.toString().trim();
  
  // Match YYYY-MM-DD
  var mIso = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (mIso) {
    return new Date(parseInt(mIso[1], 10), parseInt(mIso[2], 10) - 1, parseInt(mIso[3], 10));
  }
  
  // Match DD/MM/YYYY or DD-MM-YYYY
  var mDmy = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (mDmy) {
    return new Date(parseInt(mDmy[3], 10), parseInt(mDmy[2], 10) - 1, parseInt(mDmy[1], 10));
  }
  
  var parsed = new Date(s);
  return isNaN(parsed.getTime()) ? s : parsed;
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
  } catch (e) {}
}

/**
 * One-click tool to fix all existing rows in Google Sheet so they copy cleanly into Excel
 */
function fixAllSheetFormats() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  
  // 1. Column-wide Number Formats
  sheet.getRange("A2:A" + lastRow).setNumberFormat("dd/MM/yyyy HH:mm:ss");
  sheet.getRange("B2:B" + lastRow).setNumberFormat("dd/MM/yyyy");
  sheet.getRange("C2:C" + lastRow).setNumberFormat("@");
  sheet.getRange("D2:D" + lastRow).setNumberFormat("@");
  sheet.getRange("E2:E" + lastRow).setNumberFormat("@");
  sheet.getRange("G2:G" + lastRow).setNumberFormat("#,##0.00");
  sheet.getRange("J2:J" + lastRow).setNumberFormat("@");
  sheet.getRange("K2:K" + lastRow).setNumberFormat("@");

  // 2. Re-parse dates into real Date serial numbers
  var dateRange = sheet.getRange(2, 2, lastRow - 1, 1);
  var dateValues = dateRange.getValues();
  for (var i = 0; i < dateValues.length; i++) {
    if (dateValues[i][0]) {
      dateValues[i][0] = parseToDateObject(dateValues[i][0]);
    }
  }
  dateRange.setValues(dateValues);

  // 3. Ensure reference numbers are plain strings
  var refRange = sheet.getRange(2, 5, lastRow - 1, 1);
  var refValues = refRange.getValues();
  for (var j = 0; j < refValues.length; j++) {
    if (refValues[j][0] !== null && refValues[j][0] !== undefined) {
      refValues[j][0] = refValues[j][0].toString();
    }
  }
  refRange.setValues(refValues);

  // 4. Ensure amounts are numbers
  var amtRange = sheet.getRange(2, 7, lastRow - 1, 1);
  var amtValues = amtRange.getValues();
  for (var k = 0; k < amtValues.length; k++) {
    if (amtValues[k][0] !== null && amtValues[k][0] !== undefined) {
      amtValues[k][0] = parseFloat(amtValues[k][0]) || 0;
    }
  }
  amtRange.setValues(amtValues);

  SpreadsheetApp.getActiveSpreadsheet().toast("✅ All rows formatted for Excel copy-paste compatibility!", "AutoAccount AI", 5);
}

function applyAllDropdownValidations() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  for (var r = 2; r <= lastRow; r++) {
    applyRowValidation(sheet, r);
  }
  SpreadsheetApp.getActiveSpreadsheet().toast("✅ Dropdowns updated for all rows!", "AutoAccount AI", 4);
}

function getOrCreateFolder(parent, name) {
  var folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}
