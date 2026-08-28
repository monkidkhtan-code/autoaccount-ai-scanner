from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class ReceiptItem(BaseModel):
    name: str = Field(default="Item", description="Item name or description")
    quantity: Optional[float] = Field(default=1.0, description="Quantity of the item")
    unit_price: Optional[float] = Field(default=0.0, description="Price per unit")
    total_price: Optional[float] = Field(default=0.0, description="Total price for this item")

class ReceiptData(BaseModel):
    id: Optional[str] = Field(default=None, description="Unique internal receipt ID")
    receipt_date: str = Field(default="", description="Receipt/Invoice date in YYYY-MM-DD format")
    merchant_name: str = Field(default="", description="Name of the store, vendor, or merchant")
    item_description: Optional[str] = Field(default="", description="Summary description of purchased items or services")
    company_name: Optional[str] = Field(default="Default Entity", description="Active company or person profile name")
    reference_no: str = Field(default="", description="Invoice number, receipt number, or tax invoice ID")
    category: str = Field(default="Plant Inputs", description="Farm accounting category")
    currency: str = Field(default="MYR", description="Currency code (MYR, SGD, USD, etc.)")
    subtotal: Optional[float] = Field(default=0.0, description="Subtotal before tax")
    tax_amount: Optional[float] = Field(default=0.0, description="Tax / SST / GST amount")
    total_amount: float = Field(default=0.0, description="Total paid amount")
    payment_method: Optional[str] = Field(default="Cash", description="Payment method: Cash, Credit Card, TnG, ShopeePay")
    items: List[ReceiptItem] = Field(default_factory=list, description="List of individual items on the receipt")
    notes: Optional[str] = Field(default="", description="Additional remarks or notes")
    image_url: Optional[str] = Field(default="", description="Local path or URL to the enhanced receipt image")
    drive_link: Optional[str] = Field(default="", description="Google Drive shareable link")
    drive_folder: Optional[str] = Field(default="", description="Google Drive folder path (e.g. Receipts/2026/08_August)")
    sheet_row_index: Optional[int] = Field(default=None, description="Google Sheet row index for updating existing records in place")
    log_time: Optional[str] = Field(default="", description="Data Entry Log Time in DD/MM/YYYY HH:mm:ss format")
    status: Optional[str] = Field(default="Extracted", description="Status: Extracted, Verified, Synced")
    created_at: Optional[str] = Field(default_factory=lambda: datetime.now().isoformat())

class CompileA4Request(BaseModel):
    receipt_ids: List[str] = Field(default_factory=list, description="List of receipt IDs to compile")
    layout_mode: str = Field(default="2_per_page", description="Layout: 2_per_page, 3_per_page, 4_per_page")
    title: str = Field(default="Farm Expense Claim & Receipts Audit Sheet", description="Title for the compiled A4 document")
    include_summary_table: bool = Field(default=True, description="Include total batch summary table at the top")
