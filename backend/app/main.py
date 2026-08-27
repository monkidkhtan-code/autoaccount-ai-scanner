import os
import uuid
import json
from typing import List, Optional
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Response, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from .config import settings
from .models.receipt import ReceiptData, CompileA4Request
from .services.image_processor import ImageProcessor
from .services.ai_extractor import AIExtractor
from .services.google_drive import GoogleDriveService
from .services.google_sheets import GoogleSheetsService
from .services.pdf_compiler import PDFCompilerService

app = FastAPI(title="AI Receipt Scanner & Accounting API", version="1.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RECEIPTS_DB_FILE = os.path.join(settings.storage_dir, "receipts_database.json")
receipts_db: List[ReceiptData] = []

def load_receipts():
    global receipts_db
    if os.path.exists(RECEIPTS_DB_FILE):
        try:
            with open(RECEIPTS_DB_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                receipts_db = [ReceiptData(**item) for item in data]
        except Exception as e:
            print(f"Error loading receipts db: {e}")
            receipts_db = []

def save_receipts():
    os.makedirs(settings.storage_dir, exist_ok=True)
    with open(RECEIPTS_DB_FILE, "w", encoding="utf-8") as f:
        json.dump([r.model_dump() for r in receipts_db], f, indent=2)

load_receipts()

# Services initialization
ai_extractor = AIExtractor()
drive_service = GoogleDriveService()
sheets_service = GoogleSheetsService()

def background_cloud_sync(receipt_obj: ReceiptData, image_bytes: bytes, webhook_url: Optional[str] = None, action: str = "append"):
    """Asynchronous background sync to Google Drive & Google Sheet"""
    try:
        sheets_service.sync_to_google_cloud(receipt_obj, image_bytes=image_bytes, webhook_url_override=webhook_url, action=action)
        receipt_obj.status = "Synced Live to Google Sheet & Drive"
        save_receipts()
    except Exception as e:
        print(f"[BackgroundSync] Error syncing to cloud: {e}")

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "gemini_configured": bool(settings.gemini_api_key or os.getenv("GEMINI_API_KEY")),
        "google_script_configured": bool(settings.google_apps_script_url),
        "total_receipts_scanned": len(receipts_db)
    }

@app.post("/api/save-api-key")
def save_api_key(api_key: str = Form(...)):
    settings.gemini_api_key = api_key.strip()
    os.environ["GEMINI_API_KEY"] = api_key.strip()
    ai_extractor.api_key = api_key.strip()
    return {"success": True, "message": "Gemini API Key saved successfully"}

@app.post("/api/preview-crop")
async def preview_crop(
    file: UploadFile = File(...),
    auto_crop: bool = Form(True),
    filter_mode: str = Form("enhanced_clean")
):
    try:
        image_bytes = await file.read()
        enhanced_bytes = ImageProcessor.enhance_receipt(
            image_bytes, 
            filter_mode=filter_mode, 
            auto_crop=auto_crop
        )
        return Response(content=enhanced_bytes, media_type="image/jpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/scan-and-extract")
async def scan_and_extract(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    filter_mode: str = Form("enhanced_clean"),
    auto_crop: bool = Form(False),
    api_key: Optional[str] = Form(None),
    company_name: Optional[str] = Form(None),
    webhook_url: Optional[str] = Form(None),
    auto_sync: bool = Form(True)
):
    try:
        image_bytes = await file.read()
        
        # 1. Enhance image using selected visual filter
        enhanced_bytes = ImageProcessor.enhance_receipt(
            image_bytes, 
            filter_mode=filter_mode, 
            auto_crop=auto_crop
        )
        
        # 2. Extract Data using Gemini AI Vision
        extracted_data = ai_extractor.extract_receipt_data(
            enhanced_bytes, 
            api_key=api_key
        )
        extracted_data.id = f"REC-{uuid.uuid4().hex[:6].upper()}"
        if company_name:
            extracted_data.company_name = company_name

        # 3. Organize in Local Storage
        drive_info = drive_service.save_and_organize_receipt(
            image_bytes=enhanced_bytes,
            receipt_date=extracted_data.receipt_date or "2026-08-24",
            merchant_name=extracted_data.merchant_name or "Receipt",
            reference_no=extracted_data.reference_no or "NoRef"
        )

        extracted_data.image_url = drive_info["local_path"]
        extracted_data.drive_link = drive_info["drive_link"]
        extracted_data.drive_folder = drive_info["drive_folder"]
        extracted_data.status = "Extracted & Saving..."

        # Persist locally
        receipts_db.insert(0, extracted_data)
        save_receipts()

        # 4. Schedule Google Cloud & Drive sync in background to target company webhook
        target_hook = (webhook_url or settings.google_apps_script_url or "").strip()
        if auto_sync and target_hook:
            background_tasks.add_task(background_cloud_sync, extracted_data, enhanced_bytes, target_hook)
        else:
            extracted_data.status = "Saved Locally"

        return {
            "success": True,
            "receipt": extracted_data,
            "drive_info": drive_info,
            "relative_image_url": f"/api/storage-image?path={drive_info['relative_path']}"
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/save-extracted-receipt")
async def save_extracted_receipt(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    receipt_json: str = Form(...),
    filter_mode: str = Form("enhanced_clean"),
    company_name: Optional[str] = Form(None),
    webhook_url: Optional[str] = Form(None)
):
    """
    Direct endpoint for saving client-extracted receipt without running AI vision again.
    """
    try:
        image_bytes = await file.read()
        enhanced_bytes = ImageProcessor.enhance_receipt(image_bytes, filter_mode=filter_mode, auto_crop=False)
        
        parsed = json.loads(receipt_json)
        
        # Ensure items format
        raw_items = parsed.get("items", [])
        items_list = []
        for it in raw_items:
            try:
                items_list.append(ReceiptItem(
                    name=str(it.get("name", "Item")),
                    quantity=float(it.get("quantity", 1.0) or 1.0),
                    unit_price=float(it.get("unit_price", 0.0) or 0.0),
                    total_price=float(it.get("total_price", 0.0) or 0.0)
                ))
            except Exception:
                pass
        
        receipt_obj = ReceiptData(
            id=str(parsed.get("id") or f"REC-{uuid.uuid4().hex[:6].upper()}"),
            receipt_date=str(parsed.get("receipt_date") or datetime.now().strftime("%Y-%m-%d")),
            merchant_name=str(parsed.get("merchant_name") or "Unknown Merchant"),
            item_description=str(parsed.get("item_description") or ""),
            reference_no=str(parsed.get("reference_no") or ""),
            category=str(parsed.get("category") or "General Expenses"),
            currency=str(parsed.get("currency") or "MYR"),
            subtotal=float(parsed.get("subtotal", 0.0) or 0.0),
            tax_amount=float(parsed.get("tax_amount", 0.0) or 0.0),
            total_amount=float(parsed.get("total_amount", 0.0) or 0.0),
            payment_method=str(parsed.get("payment_method") or "Cash"),
            items=items_list,
            company_name=company_name or str(parsed.get("company_name") or "Active Account")
        )

        drive_info = drive_service.save_and_organize_receipt(
            image_bytes=enhanced_bytes,
            receipt_date=receipt_obj.receipt_date or "2026-08-28",
            merchant_name=receipt_obj.merchant_name or "Receipt",
            reference_no=receipt_obj.reference_no or "NoRef"
        )
        receipt_obj.image_url = drive_info["local_path"]
        receipt_obj.drive_link = drive_info["drive_link"]
        receipt_obj.drive_folder = drive_info["drive_folder"]
        receipt_obj.status = "Saved & Syncing to Cloud..."

        # Persist in DB
        receipts_db.insert(0, receipt_obj)
        save_receipts()

        target_hook = (webhook_url or settings.google_apps_script_url or "").strip()
        if target_hook:
            background_tasks.add_task(background_cloud_sync, receipt_obj, enhanced_bytes, target_hook)

        return {
            "success": True,
            "receipt": receipt_obj,
            "drive_info": drive_info,
            "relative_image_url": f"/api/storage-image?path={drive_info['relative_path']}"
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/receipts")
def get_receipts():
    return {
        "count": len(receipts_db),
        "receipts": receipts_db
    }

@app.post("/api/update-receipt")
def update_receipt(
    updated: ReceiptData,
    background_tasks: BackgroundTasks,
    webhook_url: Optional[str] = None
):
    global receipts_db
    for idx, r in enumerate(receipts_db):
        if r.id == updated.id:
            receipts_db[idx] = updated
            save_receipts()
            
            target_hook = (webhook_url or settings.google_apps_script_url or "").strip()
            if target_hook:
                background_tasks.add_task(background_cloud_sync, updated, b"", target_hook, "update")
            
            return {"success": True, "receipt": updated}
    raise HTTPException(status_code=404, detail="Receipt not found")

@app.post("/api/delete-receipt")
def delete_receipt(data: dict):
    global receipts_db
    receipt_id = data.get("id")
    if not receipt_id:
        raise HTTPException(status_code=400, detail="Receipt ID required")
    before_len = len(receipts_db)
    receipts_db = [r for r in receipts_db if r.id != receipt_id]
    if len(receipts_db) < before_len:
        save_receipts()
        return {"success": True, "deleted_id": receipt_id}
    raise HTTPException(status_code=404, detail="Receipt not found")

@app.post("/api/clear-receipts")
def clear_receipts(data: Optional[dict] = None):
    global receipts_db
    company_name = data.get("company_name") if data else None
    if company_name:
        receipts_db = [r for r in receipts_db if r.company_name != company_name]
    else:
        receipts_db = []
    save_receipts()
    return {"success": True, "remaining_count": len(receipts_db)}

@app.post("/api/compile-a4-pdf")
def compile_a4_pdf(request: CompileA4Request):
    if request.receipt_ids:
        selected_receipts = [r for r in receipts_db if r.id in request.receipt_ids]
    else:
        selected_receipts = receipts_db

    if not selected_receipts:
        raise HTTPException(status_code=400, detail="No receipts found to compile.")

    output_filename = f"A4_Compiled_Expenses_{uuid.uuid4().hex[:6]}.pdf"
    compiled_dir = os.path.join(settings.storage_dir, "Compiled_Reports")
    output_filepath = os.path.join(compiled_dir, output_filename)

    PDFCompilerService.generate_a4_compiled_pdf(
        receipts=selected_receipts,
        request=request,
        output_filepath=output_filepath
    )

    return {
        "success": True,
        "filename": output_filename,
        "download_url": f"/api/download-pdf/{output_filename}",
        "total_receipts": len(selected_receipts),
        "layout": request.layout_mode
    }

@app.get("/api/download-pdf/{filename}")
def download_pdf(filename: str):
    filepath = os.path.join(settings.storage_dir, "Compiled_Reports", filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="PDF not found")
    return FileResponse(filepath, media_type="application/pdf", filename=filename)

@app.get("/api/storage-image")
def get_storage_image(path: str):
    full_path = os.path.join(settings.storage_dir, path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(full_path)

client_dir = os.path.join(os.path.dirname(__file__), "..", "..", "mobile_web_client")
if os.path.exists(client_dir):
    app.mount("/", StaticFiles(directory=client_dir, html=True), name="static")
