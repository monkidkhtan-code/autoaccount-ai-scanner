import os
import shutil
from datetime import datetime
from typing import Optional, Dict
from ..config import settings

class GoogleDriveService:
    def __init__(self, credentials_path: Optional[str] = None):
        self.credentials_path = credentials_path
        self.is_connected = False
        # If credentials exist, initialize Google Drive API client
        # Otherwise, maintain local mirrored folder structure

    def save_and_organize_receipt(
        self, 
        image_bytes: bytes, 
        receipt_date: str, 
        merchant_name: str,
        reference_no: str
    ) -> Dict[str, str]:
        """
        Saves receipt organized by Year / Month.
        Hierarchy: Receipts / YYYY / MM_MonthName / YYYY-MM-DD_Merchant_Ref.jpg
        """
        try:
            date_obj = datetime.strptime(receipt_date, "%Y-%m-%d")
        except Exception:
            date_obj = datetime.now()

        year_str = date_obj.strftime("%Y")
        month_str = date_obj.strftime("%m_%B")
        date_str = date_obj.strftime("%Y-%m-%d")

        # Clean merchant and ref for safe filenames
        clean_merchant = "".join(c for c in merchant_name if c.isalnum() or c in (' ', '_', '-')).strip().replace(' ', '_')
        clean_ref = "".join(c for c in reference_no if c.isalnum() or c in ('_', '-')).strip()
        if not clean_merchant:
            clean_merchant = "Receipt"
        if not clean_ref:
            clean_ref = "NoRef"

        folder_relative = os.path.join("Receipts", year_str, month_str)
        filename = f"{date_str}_{clean_merchant}_{clean_ref}.jpg"

        # Local storage destination (mirrors Google Drive folder hierarchy)
        target_dir = os.path.join(settings.storage_dir, folder_relative)
        os.makedirs(target_dir, exist_ok=True)
        local_filepath = os.path.join(target_dir, filename)

        with open(local_filepath, "wb") as f:
            f.write(image_bytes)

        drive_folder_display = f"Google Drive > Receipts > {year_str} > {month_str}"
        simulated_link = f"https://drive.google.com/file/d/simulated_{year_str}_{clean_ref}/view"

        return {
            "local_path": local_filepath,
            "filename": filename,
            "drive_folder": drive_folder_display,
            "drive_link": simulated_link,
            "relative_path": os.path.join(folder_relative, filename)
        }
