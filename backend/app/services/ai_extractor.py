import os
import json
import re
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

    def get_client(self, override_api_key: Optional[str] = None):
        key = override_api_key or self.api_key or settings.gemini_api_key or os.getenv("GEMINI_API_KEY", "")
        if not key or not key.strip():
            return None, "No Gemini API Key provided"
        try:
            from google import genai
            return genai.Client(api_key=key.strip()), None
        except Exception as e:
            return None, str(e)

    def extract_receipt_data(self, image_bytes: bytes, api_key: Optional[str] = None) -> ReceiptData:
        """
        Fast AI Vision extraction extracting merchant_name and item_description.
        """
        client, err_msg = self.get_client(api_key)
        
        if not client:
            return ReceiptData(
                receipt_date=datetime.now().strftime("%Y-%m-%d"),
                merchant_name="[API Key Required]",
                item_description="Please enter your Gemini API Key in Settings",
                reference_no="",
                category="Upkeep of Vehicles",
                currency="MYR",
                total_amount=0.0,
                notes="Enter your free Gemini API Key (starts with AIzaSy) in Settings."
            )

        optimized_bytes = ImageProcessor.optimize_for_vision(image_bytes, max_dim=1024)

        prompt = """Extract receipt JSON:
{
  "merchant_name": "Store / Vendor Name only",
  "item_description": "Goods/services summary (e.g. Tyre Patching, Balancing, Fertilizer)",
  "receipt_date": "YYYY-MM-DD",
  "reference_no": "Invoice or Receipt number",
  "category": "Choose closest: Sales of Chilies, Plant Inputs, Packing Materials, Salaries, Wages, Staff Welfare, Worker Permit, Petrol, Toll & Parking, Electricity, Water, Telephone & Internet, Upkeep of Farm, Upkeep of Farm Equipment, Upkeep of Vehicles, Insurance & Road tax, Printing & Stationery, Medical, Entertainment, License Fee, Training Fee, Professional Fee, Accounting Fee, Bank Charges, Depreciation, Farm House, Farm Equipment, Accum - Fixed Assets, Cash in Hand, Deposits & Prepayments, Accrual, Payback by worker for permit",
  "currency": "MYR",
  "subtotal": 0.0,
  "tax_amount": 0.0,
  "total_amount": 0.0,
  "payment_method": "Cash or Credit Card or TnG or ShopeePay",
  "items": [{"name": "item name", "quantity": 1.0, "unit_price": 0.0, "total_price": 0.0}]
}
Return valid JSON only."""

        candidate_models = [
            'gemini-3-flash-preview',
            'gemini-2.5-flash',
            'gemini-flash-latest',
            'gemini-pro-latest'
        ]

        from google.genai import types

        last_error = None
        for model_name in candidate_models:
            try:
                config = types.GenerateContentConfig(
                    temperature=0.0,
                    max_output_tokens=800,
                    response_mime_type='application/json'
                )

                response = client.models.generate_content(
                    model=model_name,
                    contents=[
                        prompt,
                        types.Part.from_bytes(
                            data=optimized_bytes,
                            mime_type='image/jpeg'
                        )
                    ],
                    config=config
                )
                raw_text = response.text.strip()
                
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
                if not re.match(r"^\d{4}-\d{2}-\d{2}$", receipt_date_str):
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
                    category_val = "Plant Inputs"

                item_desc = str(parsed.get("item_description", "")).strip()
                if not item_desc and item_names:
                    item_desc = ", ".join(item_names)

                return ReceiptData(
                    receipt_date=receipt_date_str,
                    merchant_name=str(parsed.get("merchant_name", "Unknown Merchant")),
                    item_description=item_desc,
                    reference_no=str(parsed.get("reference_no", "")),
                    category=category_val,
                    currency=currency_val,
                    subtotal=float(parsed.get("subtotal", 0.0) or 0.0),
                    tax_amount=float(parsed.get("tax_amount", 0.0) or 0.0),
                    total_amount=float(parsed.get("total_amount", 0.0) or 0.0),
                    payment_method=pm,
                    items=items,
                    notes=str(parsed.get("notes", ""))
                )
            except Exception as e:
                last_error = e
                print(f"[AIExtractor] Model {model_name} failed: {e}")

        # Check if error is authentication
        err_str = str(last_error)
        if "401" in err_str or "UNAUTHENTICATED" in err_str or "API_KEY_INVALID" in err_str:
            merchant_msg = "[Invalid Gemini API Key]"
            desc_msg = "Please enter a valid Gemini API Key (starts with AIzaSy...) in Settings"
        else:
            merchant_msg = "AI Extraction Error"
            desc_msg = f"Extraction failed: {err_str[:60]}"

        return ReceiptData(
            receipt_date=datetime.now().strftime("%Y-%m-%d"),
            merchant_name=merchant_msg,
            item_description=desc_msg,
            reference_no="",
            category="Plant Inputs",
            currency="MYR",
            total_amount=0.0,
            notes=str(last_error)
        )
