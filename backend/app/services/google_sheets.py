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
                "Date", 
                "Particulars", 
                "Mode of Payment", 
                "Ref No./ Invoice No.", 
                "", # Blank Column E
                "Amount", 
                "", # Blank Column G
                "", # Blank Column H
                "Category", 
                "Drive Receipt Link"
            ]
            with open(self.csv_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(headers)

    def sync_to_google_cloud(self, receipt: ReceiptData, image_bytes: Optional[bytes] = None) -> Dict[str, str]:
        """
        Combines Merchant Name and Item Description into the 'Particulars' column
        and syncs to Google Sheets according to the custom farm column order:
        [Date, Particulars, Mode of Payment, Ref No./ Invoice No., '', Amount, '', '', Category, Drive Link]
        """
        # Combine Merchant Name + Item Description into Particulars
        if receipt.item_description and receipt.item_description.strip():
            particulars = f"{receipt.merchant_name} - {receipt.item_description.strip()}"
        else:
            particulars = receipt.merchant_name

        try:
            date_obj = datetime.strptime(receipt.receipt_date, "%Y-%m-%d")
        except Exception:
            date_obj = datetime.now()

        year_str = date_obj.strftime("%Y")
        month_str = date_obj.strftime("%m_%B")
        formatted_date = date_obj.strftime("%d/%m/%Y")

        clean_merchant = "".join(c for c in receipt.merchant_name if c.isalnum() or c in (' ', '_', '-')).strip().replace(' ', '_') or "Receipt"
        clean_ref = "".join(c for c in receipt.reference_no if c.isalnum() or c in ('_', '-')).strip() or "NoRef"
        filename = f"{receipt.receipt_date}_{clean_merchant}_{clean_ref}.jpg"

        image_b64 = base64.b64encode(image_bytes).decode("utf-8") if image_bytes else ""

        # Exact Row Order:
        # Col A: Date
        # Col B: Particulars (Merchant + Item Description combined)
        # Col C: Mode of Payment (Cash, Credit Card, TnG, ShopeePay)
        # Col D: Ref No./ Invoice No.
        # Col E: [Blank]
        # Col F: Amount
        # Col G: [Blank]
        # Col H: [Blank]
        # Col I: Category (32 farm categories)
        # Col J: Drive Receipt Link
        row_data = [
            formatted_date,
            particulars,
            receipt.payment_method or "Cash",
            receipt.reference_no or "",
            "", # Blank Column E
            receipt.total_amount,
            "", # Blank Column G
            "", # Blank Column H
            receipt.category or "Plant Inputs",
            ""  # Column J: Filled by Apps Script
        ]

        payload = {
            "year": year_str,
            "month": month_str,
            "filename": filename,
            "image_base64": image_b64,
            "row_data": row_data,
            "receipt_date": formatted_date,
            "particulars": particulars,
            "payment_method": receipt.payment_method or "Cash",
            "reference_no": receipt.reference_no or "",
            "total_amount": receipt.total_amount,
            "category": receipt.category or "Plant Inputs"
        }

        cloud_result = {"status": "local_only", "drive_link": "", "folder": f"Accounting/{year_str}/{month_str}"}

        if self.webhook_url:
            try:
                res = requests.post(
                    self.webhook_url,
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
                            receipt.drive_link = cloud_result["drive_link"]
                            receipt.drive_folder = f"Google Drive > {cloud_result['folder']}"
                    except Exception:
                        pass
            except Exception as e:
                print(f"[GoogleSheetsService] Webhook call failed: {e}")

        row_data_local = row_data.copy()
        row_data_local[9] = receipt.drive_link or ""
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
