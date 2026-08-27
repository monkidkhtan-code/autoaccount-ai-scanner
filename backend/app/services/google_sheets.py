import os
import csv
import json
import base64
import requests
from datetime import datetime
from typing import Optional, List, Dict
from ..models.receipt import ReceiptData
from ..config import settings

class GoogleSheetsService:
    def __init__(self, webhook_url: Optional[str] = None):
        self.webhook_url = webhook_url or settings.google_apps_script_url
        self.csv_path = os.path.join(settings.storage_dir, "Farm_Accounting_Expenses_Ledger.csv")
        self._ensure_csv_headers()

    def _ensure_csv_headers(self):
        os.makedirs(settings.storage_dir, exist_ok=True)
        if not os.path.exists(self.csv_path):
            headers = [
                "Data Entry Log Time",  # Col A
                "Date",                 # Col B
                "Particulars",          # Col C
                "Mode of Payment",      # Col D
                "Cheque No./ Reference No./ Invoice No.", # Col E
                "",                     # Col F (Blank)
                "Amount",               # Col G
                "",                     # Col H (Blank)
                "",                     # Col I (Blank)
                "Category",             # Col J
                "Image Link"            # Col K
            ]
            with open(self.csv_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(headers)

    def sync_to_google_cloud(
        self, 
        receipt: ReceiptData, 
        image_bytes: Optional[bytes] = None,
        webhook_url_override: Optional[str] = None,
        action: str = "append"
    ) -> Dict[str, str]:
        """
        Exact 11-column structure matching user's Google Sheet:
        Col A: Data Entry Log Time (DD/MM/YYYY HH:MM:SS)
        Col B: Date (DD/MM/YYYY)
        Col C: Particulars (Merchant Name - Item Description)
        Col D: Mode of Payment (Cash, Credit Card, TnG, ShopeePay)
        Col E: Cheque No./ Reference No./ Invoice No.
        Col F: [Blank]
        Col G: Amount
        Col H: [Blank]
        Col I: [Blank]
        Col J: Category (32 Farm categories)
        Col K: Image Link (Google Drive Link)
        """
        target_webhook = (webhook_url_override or self.webhook_url or "").strip()
        
        # Safeguard: never sync error states to Google Sheets
        if "error" in (receipt.merchant_name or "").lower() or "ai extraction" in (receipt.merchant_name or "").lower():
            print(f"[GoogleSheetsService] Aborting sync: receipt contains error status '{receipt.merchant_name}'")
            return {"status": "error_aborted", "drive_link": "", "folder": ""}

        now = datetime.now()
        log_time_str = now.strftime("%d/%m/%Y %H:%M:%S")

        # Combine Merchant Name + Item Description into Particulars
        m_name = (receipt.merchant_name or "").strip()
        i_desc = (receipt.item_description or "").strip()

        if m_name and i_desc:
            particulars = f"{m_name} - {i_desc}"
        elif m_name:
            particulars = m_name
        elif i_desc:
            particulars = i_desc
        else:
            particulars = "Expense Receipt"

        try:
            date_obj = datetime.strptime(receipt.receipt_date, "%Y-%m-%d")
        except Exception:
            date_obj = now

        year_str = date_obj.strftime("%Y")
        month_str = date_obj.strftime("%m_%B")
        formatted_date = date_obj.strftime("%d/%m/%Y")

        clean_merchant = "".join(c for c in m_name if c.isalnum() or c in (' ', '_', '-')).strip().replace(' ', '_') or "Receipt"
        clean_ref = "".join(c for c in (receipt.reference_no or "") if c.isalnum() or c in ('_', '-')).strip() or "NoRef"
        filename = f"{receipt.receipt_date}_{clean_merchant}_{clean_ref}.jpg"

        image_b64 = base64.b64encode(image_bytes).decode("utf-8") if image_bytes else ""

        # 11-column exact row mapping:
        row_data = [
            log_time_str,                           # Col A: Data Entry Log Time
            formatted_date,                         # Col B: Date
            particulars,                            # Col C: Particulars (Merchant - Item Description)
            receipt.payment_method or "Cash",       # Col D: Mode of Payment
            receipt.reference_no or "",             # Col E: Cheque No./ Reference No./ Invoice No.
            "",                                     # Col F: [Blank]
            receipt.total_amount,                   # Col G: Amount
            "",                                     # Col H: [Blank]
            "",                                     # Col I: [Blank]
            receipt.category or "Upkeep of Vehicles", # Col J: Category
            ""                                      # Col K: Image Link (filled by Apps Script)
        ]

        payload = {
            "action": action,
            "row_index": receipt.sheet_row_index,
            "year": year_str,
            "month": month_str,
            "filename": filename,
            "image_base64": image_b64,
            "row_data": row_data,
            "log_time": log_time_str,
            "receipt_date": formatted_date,
            "particulars": particulars,
            "payment_method": receipt.payment_method or "Cash",
            "reference_no": receipt.reference_no or "",
            "total_amount": receipt.total_amount,
            "category": receipt.category or "Upkeep of Vehicles"
        }

        cloud_result = {"status": "local_only", "drive_link": "", "folder": f"Accounting/{year_str}/{month_str}"}

        if target_webhook:
            try:
                res = requests.post(
                    target_webhook,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=25
                )
                if res.status_code == 200:
                    try:
                        res_json = res.json()
                        if res_json.get("status") == "success":
                            cloud_result["status"] = "synced_live"
                            cloud_result["drive_link"] = res_json.get("drive_link", "")
                            cloud_result["folder"] = res_json.get("folder", cloud_result["folder"])
                            if res_json.get("row_index"):
                                receipt.sheet_row_index = int(res_json["row_index"])
                            receipt.drive_link = cloud_result["drive_link"]
                            receipt.drive_folder = f"Google Drive > {cloud_result['folder']}"
                    except Exception:
                        pass
            except Exception as e:
                print(f"[GoogleSheetsService] Webhook call failed: {e}")

        row_data_local = row_data.copy()
        row_data_local[10] = receipt.drive_link or ""
        with open(self.csv_path, "a", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(row_data_local)

        return cloud_result

    def get_all_records(self) -> List[Dict[str, str]]:
        if not os.path.exists(self.csv_path):
            return []
        records = []
        with open(self.csv_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                records.append(row)
        return records
