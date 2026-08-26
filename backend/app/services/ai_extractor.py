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
        if not key:
            return None, "No Gemini API Key provided"
        try:
            from google import genai
            return genai.Client(api_key=key), None
        except Exception as e:
            return None, str(e)

    def extract_receipt_data(self, image_bytes: bytes, api_key: Optional[str] = None) -> ReceiptData:
        """
        Fast AI Vision extraction optimized for mobile receipts.
        Uses lightweight payload and concise JSON schema for maximum speed.
        """
        client, err_msg = self.get_client(api_key)
        
        if not client:
            return ReceiptData(
                receipt_date="",
                merchant_name="[API Key Missing] Please enter Gemini API Key in Settings",
                reference_no="",
                category="Plant Inputs",
                currency="MYR",
                total_amount=0.0,
                notes="Please enter your Gemini API Key in Settings."
            )

        # Optimize image size to 960px max dimension (<150KB) for near-instant upload
        optimized_bytes = ImageProcessor.optimize_for_vision(image_bytes, max_dim=960)

        prompt = """Extract receipt JSON:
{
  "merchant_name": "Store/Vendor Name",
  "receipt_date": "YYYY-MM-DD",
  "reference_no": "Invoice/Receipt No",
  "category": "Choose closest from: Sales of Chilies, Plant Inputs, Packing Materials, Salaries, Wages, Staff Welfare, Worker Permit, Petrol, Toll & Parking, Electricity, Water, Telephone & Internet, Upkeep of Farm, Upkeep of Farm Equipment, Upkeep of Vehicles, Insurance & Road tax, Printing & Stationery, Medical, Entertainment, License Fee, Training Fee, Professional Fee, Accounting Fee, Bank Charges, Depreciation, Farm House, Farm Equipment, Accum - Fixed Assets, Cash in Hand, Deposits & Prepayments, Accrual, Payback by worker for permit",
  "currency": "MYR",
  "subtotal": 0.0,
  "tax_amount": 0.0,
  "total_amount": 0.0,
  "payment_method": "Cash or Credit Card or TnG or ShopeePay",
  "items": [{"name": "item name", "quantity": 1.0, "unit_price": 0.0, "total_price": 0.0}]
}
Return pure JSON only."""

        candidate_models = [
            'gemini-3.5-flash-lite',
            'gemini-3.5-flash',
            'gemini-3.7-flash',
            'gemini-3-flash-preview'
        ]

        from google.genai import types

        last_error = None
        for model_name in candidate_models:
            try:
                # Fast config with zero thinking overhead and strict JSON output
                config = types.GenerateContentConfig(
                    temperature=0.0,
                    max_output_tokens=700,
                    response_mime_type='application/json'
                )
                try:
                    config.thinking_config = types.ThinkingConfig(thinking_budget=0)
                except Exception:
                    pass

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
                for item in parsed.get("items", []):
                    try:
                        items.append(ReceiptItem(
                            name=str(item.get("name", "Item")),
                            quantity=float(item.get("quantity", 1.0) or 1.0),
                            unit_price=float(item.get("unit_price", 0.0) or 0.0),
                            total_price=float(item.get("total_price", 0.0) or 0.0)
                        ))
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

                category_val = str(parsed.get("category", "Plant Inputs")).strip()
                if category_val not in FARM_CATEGORIES:
                    category_val = "Plant Inputs"

                return ReceiptData(
                    receipt_date=receipt_date_str,
                    merchant_name=str(parsed.get("merchant_name", "Unknown Merchant")),
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
                print(f"[AIExtractor] Model {model_name} failed: {e}. Trying next fast model...")

        print(f"[AIExtractor] All models failed. Last error: {last_error}")
        return ReceiptData(
            receipt_date=datetime.now().strftime("%Y-%m-%d"),
            merchant_name="AI Extraction Error",
            reference_no="",
            category="Plant Inputs",
            currency="MYR",
            total_amount=0.0,
            notes=f"AI Vision extraction error: {str(last_error)}"
        )
