import os
import json
import re
import base64
import requests
import time
from datetime import datetime
from typing import Optional
from ..models.receipt import ReceiptData, ReceiptItem
from ..config import settings
from .image_processor import ImageProcessor

class AIExtractor:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.gemini_api_key or os.getenv("GEMINI_API_KEY", "")
        self.session = requests.Session()

    def extract_receipt_data(self, image_bytes: bytes, api_key: Optional[str] = None) -> ReceiptData:
        """
        Ultra-fast AI Vision extraction using latency-optimized Gemini 3.5 Flash (0 thinking delay).
        """
        start_time = time.time()
        key = (api_key or self.api_key or settings.gemini_api_key or os.getenv("GEMINI_API_KEY", "")).strip()
        
        if not key:
            return ReceiptData(
                receipt_date=datetime.now().strftime("%Y-%m-%d"),
                merchant_name="[API Key Missing]",
                item_description="Please enter your Gemini API Key in Settings",
                reference_no="",
                category="General Expenses",
                currency="MYR",
                total_amount=0.0,
                notes="Enter your Gemini API Key in Settings."
            )

        # Ultra-fast vision compression (max 800px for instant upload)
        optimized_bytes = ImageProcessor.optimize_for_vision(image_bytes, max_dim=800)
        b64_image = base64.b64encode(optimized_bytes).decode("utf-8")

        prompt = """Extract receipt JSON:
{
  "merchant_name": "Store/Merchant name",
  "item_description": "Summary of items or service purchased",
  "receipt_date": "YYYY-MM-DD",
  "reference_no": "Invoice or Receipt No",
  "category": "Accounting category (e.g. Plant Inputs, Upkeep of Vehicles, Petrol, Salaries, Office Supplies, General Expenses)",
  "currency": "MYR",
  "subtotal": 0.0,
  "tax_amount": 0.0,
  "total_amount": 0.0,
  "payment_method": "Cash or Credit Card or TnG or ShopeePay or Bank Transfer",
  "items": [{"name": "item name", "quantity": 1.0, "unit_price": 0.0, "total_price": 0.0}]
}
Return pure JSON only."""

        # Priority order: gemini-3.5-flash with 0 thinking budget is the fastest vision model
        candidate_models = [
            ('gemini-3.5-flash', True),
            ('gemini-3.5-flash', False),
            ('gemini-3.6-flash', False)
        ]

        last_error = None
        for model_name, use_zero_thinking in candidate_models:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={key}"
                gen_config = {
                    "temperature": 0.0,
                    "maxOutputTokens": 280,
                    "responseMimeType": "application/json"
                }
                if use_zero_thinking:
                    gen_config["thinkingConfig"] = {"thinkingBudget": 0}

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
                    "generationConfig": gen_config
                }

                res = self.session.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=8)
                if res.status_code != 200:
                    last_error = f"{res.status_code}: {res.text[:120]}"
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
                elif "transfer" in pm_raw.lower() or "online" in pm_raw.lower():
                    pm = "Bank Transfer"
                else:
                    pm = "Cash"

                category_val = str(parsed.get("category", "General Expenses")).strip()
                item_desc = str(parsed.get("item_description", "")).strip()
                if not item_desc and item_names:
                    item_desc = ", ".join(item_names)

                tot_amt = 0.0
                try:
                    tot_amt = float(str(parsed.get("total_amount", "0")).replace("RM", "").replace("$", "").replace(",", "").strip())
                except Exception:
                    tot_amt = 0.0

                elapsed = time.time() - start_time
                print(f"[AIExtractor] Fast extraction finished in {elapsed:.2f}s using {model_name} (zero-thinking: {use_zero_thinking})")

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

        return ReceiptData(
            receipt_date=datetime.now().strftime("%Y-%m-%d"),
            merchant_name="AI Extraction Error",
            item_description=f"Error: {last_error}",
            reference_no="",
            category="General Expenses",
            currency="MYR",
            total_amount=0.0,
            notes=str(last_error)
        )
