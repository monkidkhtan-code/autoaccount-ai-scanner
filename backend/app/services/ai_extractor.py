import os
import json
import re
import base64
import requests
from datetime import datetime
from typing import Optional
from ..models.receipt import ReceiptData, ReceiptItem
from ..config import settings
from .image_processor import ImageProcessor

FARM_CATEGORIES = [
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
]

class AIExtractor:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.gemini_api_key or os.getenv("GEMINI_API_KEY", "")

    def extract_receipt_data(self, image_bytes: bytes, api_key: Optional[str] = None) -> ReceiptData:
        """
        Fast AI Vision extraction using gemini-3.6-flash & gemini-3.5-flash.
        """
        key = (api_key or self.api_key or settings.gemini_api_key or os.getenv("GEMINI_API_KEY", "")).strip()
        
        if not key:
            return ReceiptData(
                receipt_date=datetime.now().strftime("%Y-%m-%d"),
                merchant_name="[API Key Missing]",
                item_description="Please enter your Gemini API Key in Settings",
                reference_no="",
                category="Upkeep of Vehicles",
                currency="MYR",
                total_amount=0.0,
                notes="Enter your Gemini API Key in Settings."
            )

        optimized_bytes = ImageProcessor.optimize_for_vision(image_bytes, max_dim=1024)
        b64_image = base64.b64encode(optimized_bytes).decode("utf-8")

        prompt = """Extract receipt JSON:
{
  "merchant_name": "Store / Vendor Name only",
  "item_description": "Purchased items/services summary (e.g. Tyre Patching, Wheel Balancing)",
  "receipt_date": "YYYY-MM-DD",
  "reference_no": "Invoice or Receipt No",
  "category": "Choose closest: Sales of Chilies, Plant Inputs, Packing Materials, Salaries, Wages, Staff Welfare, Worker Permit, Petrol, Toll & Parking, Electricity, Water, Telephone & Internet, Upkeep of Farm, Upkeep of Farm Equipment, Upkeep of Vehicles, Insurance & Road tax, Printing & Stationery, Medical, Entertainment, License Fee, Training Fee, Professional Fee, Accounting Fee, Bank Charges, Depreciation, Farm House, Farm Equipment, Accum - Fixed Assets, Cash in Hand, Deposits & Prepayments, Accrual, Payback by worker for permit",
  "currency": "MYR",
  "subtotal": 0.0,
  "tax_amount": 0.0,
  "total_amount": 0.0,
  "payment_method": "Cash or Credit Card or TnG or ShopeePay",
  "items": [{"name": "item name", "quantity": 1.0, "unit_price": 0.0, "total_price": 0.0}]
}
Return pure JSON only."""

        candidate_models = [
            'gemini-3.6-flash',
            'gemini-3.5-flash',
            'gemini-3-flash-preview',
            'gemini-flash-latest'
        ]

        last_error = None
        for model_name in candidate_models:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={key}"
                payload = {
                    "contents": [{
                        "parts": [
                            {"text": prompt},
                            {
                                "inline_data": {
                                    "mime_type": "image/jpeg",
                                    "data": b64_image
                                }
                            }
                        ]
                    }],
                    "generationConfig": {
                        "temperature": 0.0,
                        "responseMimeType": "application/json"
                    }
                }

                res = requests.post(url, headers={"Content-Type": "application/json"}, json=payload, timeout=20)
                if res.status_code != 200:
                    last_error = f"{res.status_code}: {res.text[:150]}"
                    print(f"[AIExtractor] Model {model_name} failed: {last_error}")
                    continue

                res_json = res.json()
                raw_text = res_json['candidates'][0]['content']['parts'][0]['text'].strip()

                if raw_text.startswith("```json"):
                    raw_text = raw_text[7:]
                if raw_text.startswith("```"):
                    raw_text = raw_text[3:]
                if raw_text.endswith("```"):
                    raw_text = raw_text[:-3]
                raw_text = raw_text.strip()

                parsed = json.loads(raw_text)
                
                items = []
                item_names = []
                for item in parsed.get("items", []):
                    try:
                        iname = str(item.get("name", "Item"))
                        items.append(ReceiptItem(
                            name=iname,
                            quantity=float(item.get("quantity", 1.0) or 1.0),
                            unit_price=float(item.get("unit_price", 0.0) or 0.0),
                            total_price=float(item.get("total_price", 0.0) or 0.0)
                        ))
                        item_names.append(iname)
                    except Exception:
                        pass

                receipt_date_str = str(parsed.get("receipt_date", "")).strip()
                # Parse various date formats to YYYY-MM-DD
                if not re.match(r"^\d{4}-\d{2}-\d{2}$", receipt_date_str):
                    d_match = re.search(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})", receipt_date_str)
                    if d_match:
                        d, m, y = d_match.groups()
                        if len(y) == 2:
                            y = "20" + y
                        receipt_date_str = f"{y}-{int(m):02d}-{int(d):02d}"
                    else:
                        receipt_date_str = datetime.now().strftime("%Y-%m-%d")

                currency_val = str(parsed.get("currency", "MYR")).strip().upper()
                if currency_val in ["RM", "MYR"]:
                    currency_val = "MYR"
                elif currency_val in ["$", "USD"]:
                    currency_val = "USD"
                elif currency_val in ["S$", "SGD"]:
                    currency_val = "SGD"

                pm_raw = str(parsed.get("payment_method", "Cash")).strip()
                pm = "Cash"
                if "card" in pm_raw.lower() or "visa" in pm_raw.lower() or "master" in pm_raw.lower():
                    pm = "Credit Card"
                elif "tng" in pm_raw.lower() or "touch" in pm_raw.lower() or "duitnow" in pm_raw.lower() or "qr" in pm_raw.lower():
                    pm = "TnG"
                elif "shopee" in pm_raw.lower():
                    pm = "ShopeePay"
                else:
                    pm = "Cash"

                category_val = str(parsed.get("category", "Upkeep of Vehicles")).strip()
                if category_val not in FARM_CATEGORIES:
                    # Auto assign Upkeep of Vehicles if automotive/tyre
                    m_lower = parsed.get("merchant_name", "").lower()
                    if "tyre" in m_lower or "auto" in m_lower or "motor" in m_lower or "service" in m_lower:
                        category_val = "Upkeep of Vehicles"
                    else:
                        category_val = "Plant Inputs"

                item_desc = str(parsed.get("item_description", "")).strip()
                if not item_desc and item_names:
                    item_desc = ", ".join(item_names)

                tot_amt = 0.0
                try:
                    tot_amt = float(str(parsed.get("total_amount", "0")).replace("RM", "").replace("$", "").replace(",", "").strip())
                except Exception:
                    tot_amt = 0.0

                return ReceiptData(
                    receipt_date=receipt_date_str,
                    merchant_name=str(parsed.get("merchant_name", "Unknown Merchant")),
                    item_description=item_desc,
                    reference_no=str(parsed.get("reference_no", "")),
                    category=category_val,
                    currency=currency_val,
                    subtotal=float(parsed.get("subtotal", 0.0) or 0.0),
                    tax_amount=float(parsed.get("tax_amount", 0.0) or 0.0),
                    total_amount=tot_amt,
                    payment_method=pm,
                    items=items,
                    notes=str(parsed.get("notes", ""))
                )
            except Exception as e:
                last_error = str(e)
                print(f"[AIExtractor] Model {model_name} error: {e}")

        return ReceiptData(
            receipt_date=datetime.now().strftime("%Y-%m-%d"),
            merchant_name="AI Extraction Error",
            item_description=f"Error: {last_error}",
            reference_no="",
            category="Plant Inputs",
            currency="MYR",
            total_amount=0.0,
            notes=str(last_error)
        )
