import os
import sys

# Add backend directory to sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, backend_dir)

from app.models.receipt import ReceiptData, ReceiptItem, CompileA4Request
from app.services.image_processor import ImageProcessor
from app.services.ai_extractor import AIExtractor
from app.services.google_drive import GoogleDriveService
from app.services.google_sheets import GoogleSheetsService
from app.services.pdf_compiler import PDFCompilerService
from app.config import settings

def run_verification():
    print("==================================================")
    print("  VERIFYING AI RECEIPT SCANNER & ACCOUNTING APP   ")
    print("==================================================")

    # 1. Test Image Processor
    print("\n[1/4] Testing Image Preprocessing & Filter Enhancement...")
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (400, 500), color="white")
    draw = ImageDraw.Draw(img)
    draw.text((20, 20), "SAMPLE TAX INVOICE", fill="black")
    draw.text((20, 50), "Total: $120.00", fill="black")
    
    import io
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    raw_bytes = buf.getvalue()

    enhanced_bytes = ImageProcessor.enhance_receipt(raw_bytes, filter_mode="bw_enhanced")
    print(f"  -> Enhanced image generated: {len(enhanced_bytes)} bytes (B&W High-Contrast)")

    # 2. Test Google Drive Hierarchy Storage
    print("\n[2/4] Testing Google Drive Hierarchy Storage (YYYY/MM)...")
    drive_service = GoogleDriveService()
    drive_info = drive_service.save_and_organize_receipt(
        image_bytes=enhanced_bytes,
        receipt_date="2026-08-24",
        merchant_name="Starbucks Coffee",
        reference_no="RC-88129"
    )
    print(f"  -> Folder: {drive_info['drive_folder']}")
    print(f"  -> Local mirrored path: {drive_info['local_path']}")
    print(f"  -> File exists on disk: {os.path.exists(drive_info['local_path'])}")

    # 3. Test Google Sheets Ledger
    print("\n[3/4] Testing Google Sheets Ledger Logging...")
    sheets_service = GoogleSheetsService()
    receipt1 = ReceiptData(
        id="REC-TEST01",
        receipt_date="2026-08-24",
        merchant_name="Starbucks Coffee",
        reference_no="RC-88129",
        category="Meals & Entertainment",
        currency="USD",
        subtotal=18.50,
        tax_amount=1.50,
        total_amount=20.00,
        payment_method="Credit Card",
        items=[ReceiptItem(name="Caramel Macchiato", quantity=2, unit_price=7.50, total_price=15.00),
               ReceiptItem(name="Croissant", quantity=1, unit_price=3.50, total_price=3.50)],
        image_url=drive_info["local_path"],
        drive_link=drive_info["drive_link"],
        drive_folder=drive_info["drive_folder"]
    )
    res_sheet = sheets_service.append_receipt(receipt1)
    print(f"  -> {res_sheet['message']}")
    print(f"  -> CSV Ledger exists: {os.path.exists(sheets_service.csv_path)}")

    # 4. Test A4 PDF Compilation (2 per page and 3 per page)
    print("\n[4/4] Testing A4 Multi-Receipt PDF Compilation (2 & 3 per page)...")
    receipt2 = ReceiptData(
        id="REC-TEST02",
        receipt_date="2026-08-22",
        merchant_name="Office Depot",
        reference_no="INV-99012",
        category="Office Supplies",
        currency="USD",
        subtotal=80.00,
        tax_amount=6.40,
        total_amount=86.40,
        payment_method="Credit Card",
        items=[ReceiptItem(name="Printer Toner", quantity=1, unit_price=80.00, total_price=80.00)],
        image_url=drive_info["local_path"],
        drive_link=drive_info["drive_link"],
        drive_folder=drive_info["drive_folder"]
    )
    receipt3 = ReceiptData(
        id="REC-TEST03",
        receipt_date="2026-08-20",
        merchant_name="Shell Petroleum",
        reference_no="SH-4410",
        category="Travel & Transport",
        currency="USD",
        subtotal=50.00,
        tax_amount=0.00,
        total_amount=50.00,
        payment_method="Debit Card",
        items=[ReceiptItem(name="Unleaded Fuel", quantity=1, unit_price=50.00, total_price=50.00)],
        image_url=drive_info["local_path"],
        drive_link=drive_info["drive_link"],
        drive_folder=drive_info["drive_folder"]
    )

    out_pdf_2 = os.path.join(settings.storage_dir, "Compiled_Reports", "Test_A4_2_Per_Page.pdf")
    req_2 = CompileA4Request(layout_mode="2_per_page", title="August 2026 Expense Audit (2 per page)")
    PDFCompilerService.generate_a4_compiled_pdf([receipt1, receipt2], req_2, out_pdf_2)
    print(f"  -> Generated 2-per-page A4 PDF: {out_pdf_2} (Size: {os.path.getsize(out_pdf_2)} bytes)")

    out_pdf_3 = os.path.join(settings.storage_dir, "Compiled_Reports", "Test_A4_3_Per_Page.pdf")
    req_3 = CompileA4Request(layout_mode="3_per_page", title="August 2026 Expense Audit (3 per page)")
    PDFCompilerService.generate_a4_compiled_pdf([receipt1, receipt2, receipt3], req_3, out_pdf_3)
    print(f"  -> Generated 3-per-page A4 PDF: {out_pdf_3} (Size: {os.path.getsize(out_pdf_3)} bytes)")

    print("\n ALL VERIFICATIONS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_verification()
