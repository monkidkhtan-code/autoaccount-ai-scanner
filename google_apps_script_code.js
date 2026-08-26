/**
 * Google Apps Script for AutoAccount AI - Farm Accounting Hub
 * 
 * Arranges columns exactly as requested:
 * Col A: Date
 * Col B: Particulars
 * Col C: Mode of Payment (Dropdown: Cash, Credit Card, TnG, ShopeePay)
 * Col D: Ref No./ Invoice No.
 * Col E: [Blank]
 * Col F: Amount
 * Col G: [Blank]
 * Col H: [Blank]
 * Col I: Category (Dropdown with 32 Farm Accounting Categories)
 * Col J: Drive Receipt Link
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
    
    // Set headers & dropdown validation if sheet is brand new
    if (sheet.getLastRow() === 0) {
      var headers = [
        "Date", 
        "Particulars", 
        "Mode of Payment", 
        "Ref No./ Invoice No.", 
        "", 
        "Amount", 
        "", 
        "", 
        "Category", 
        "Drive Receipt Link"
      ];
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, 10).setFontWeight("bold").setBackground("#e2e8f0");
      setupDropdowns(sheet);
    }

    var row = data.row_data || [
      data.receipt_date || "",
      data.particulars || "",
      data.payment_method || "Cash",
      data.reference_no || "",
      "", // Blank Column E
      data.total_amount || 0,
      "", // Blank Column G
      "", // Blank Column H
      data.category || "Plant Inputs",
      fileUrl
    ];

    // Put file URL into Column J (index 9)
    if (row.length >= 10) {
      row[9] = fileUrl;
    } else {
      row.push(fileUrl);
    }

    sheet.appendRow(row);
    var newRowIdx = sheet.getLastRow();

    // Ensure dropdown validation rule applies to new row
    applyRowValidation(sheet, newRowIdx);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      drive_link: fileUrl,
      folder: "Accounting/" + data.year + "/" + data.month,
      row_index: newRowIdx
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function setupDropdowns(sheet) {
  // Apply validation for Mode of Payment (Column C: col 3)
  var rulePayment = SpreadsheetApp.newDataValidation()
    .requireValueInList(PAYMENT_MODES, true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange("C2:C500").setDataValidation(rulePayment);

  // Apply validation for Category (Column I: col 9)
  var ruleCategory = SpreadsheetApp.newDataValidation()
    .requireValueInList(FARM_CATEGORIES, true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange("I2:I500").setDataValidation(ruleCategory);
}

function applyRowValidation(sheet, rowIdx) {
  var rulePayment = SpreadsheetApp.newDataValidation()
    .requireValueInList(PAYMENT_MODES, true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange(rowIdx, 3).setDataValidation(rulePayment);

  var ruleCategory = SpreadsheetApp.newDataValidation()
    .requireValueInList(FARM_CATEGORIES, true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange(rowIdx, 9).setDataValidation(ruleCategory);
}

function getOrCreateFolder(parent, name) {
  var folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}
