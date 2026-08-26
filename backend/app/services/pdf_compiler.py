import os
import io
from typing import List
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage, PageBreak, KeepTogether
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from PIL import Image as PILImage

from ..models.receipt import ReceiptData, CompileA4Request
from ..config import settings

class PDFCompilerService:
    @staticmethod
    def generate_a4_compiled_pdf(
        receipts: List[ReceiptData], 
        request: CompileA4Request,
        output_filepath: str
    ) -> str:
        """
        Compiles multiple receipt images into standard A4 pages (2 or 3 per page)
        with structured accounting details formatted directly on top of each bill image.
        """
        os.makedirs(os.path.dirname(output_filepath), exist_ok=True)
        
        # A4: 210 x 297 mm
        doc = SimpleDocTemplate(
            output_filepath,
            pagesize=A4,
            leftMargin=10*mm,
            rightMargin=10*mm,
            topMargin=10*mm,
            bottomMargin=10*mm
        )

        styles = getSampleStyleSheet()
        
        title_style = ParagraphStyle(
            'TitleStyle',
            parent=styles['Heading1'],
            fontSize=15,
            leading=18,
            textColor=colors.HexColor("#1e293b"),
            alignment=TA_LEFT,
            fontName="Helvetica-Bold"
        )
        
        batch_meta_style = ParagraphStyle(
            'BatchMetaStyle',
            parent=styles['Normal'],
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#475569")
        )
        
        badge_header_style = ParagraphStyle(
            'BadgeHeaderStyle',
            parent=styles['Normal'],
            fontSize=9,
            leading=11,
            fontName="Helvetica-Bold",
            textColor=colors.HexColor("#0f172a")
        )
        
        badge_value_style = ParagraphStyle(
            'BadgeValueStyle',
            parent=styles['Normal'],
            fontSize=8.5,
            leading=10.5,
            textColor=colors.HexColor("#334155")
        )

        elements = []

        # Document Header
        total_batch_amount = sum(r.total_amount for r in receipts)
        main_currency = receipts[0].currency if receipts else "USD"
        
        header_data = [
            [
                Paragraph(f"<b>{request.title}</b>", title_style),
                Paragraph(f"<b>Total Batch:</b> {main_currency} {total_batch_amount:,.2f}<br/><b>Total Bills:</b> {len(receipts)}", batch_meta_style)
            ]
        ]
        
        header_table = Table(header_data, colWidths=[120*mm, 70*mm])
        header_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('LINEBELOW', (0,0), (-1,-1), 1.5, colors.HexColor("#0284c7")),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ]))
        elements.append(header_table)
        elements.append(Spacer(1, 4*mm))

        # Determine slots per page
        items_per_page = 2 if request.layout_mode == "2_per_page" else 3
        # Max image heights based on layout
        max_img_height_mm = 85 if items_per_page == 2 else 55
        
        for idx, receipt in enumerate(receipts):
            if idx > 0 and idx % items_per_page == 0:
                elements.append(PageBreak())
                # Re-add subtle continuation header on subsequent pages
                elements.append(Paragraph(f"<b>{request.title}</b> (Page {idx // items_per_page + 1})", batch_meta_style))
                elements.append(Spacer(1, 3*mm))

            receipt_block = []

            # 1. Summary Meta Table
            items_str = ", ".join([f"{item.name}" for item in receipt.items[:3]]) if receipt.items else "Expense items"
            if len(receipt.items) > 3:
                items_str += f" (+{len(receipt.items)-3} more)"

            table_rows = [
                [
                    Paragraph(f"<b>Receipt #{idx+1}:</b> {receipt.merchant_name}", badge_header_style),
                    Paragraph(f"<b>Date:</b> {receipt.receipt_date}", badge_value_style),
                    Paragraph(f"<b>Ref No:</b> {receipt.reference_no or 'N/A'}", badge_value_style),
                    Paragraph(f"<b>Category:</b> {receipt.category}", badge_value_style),
                    Paragraph(f"<b>Total:</b> <font color='#0284c7'><b>{receipt.currency} {receipt.total_amount:,.2f}</b></font>", badge_header_style),
                ],
                [
                    Paragraph(f"<b>Items:</b> {items_str}", badge_value_style),
                    Paragraph(f"<b>Pay Method:</b> {receipt.payment_method}", badge_value_style),
                    Paragraph(f"<b>Tax:</b> {receipt.currency} {receipt.tax_amount:.2f}", badge_value_style),
                    Paragraph(f"<b>Status:</b> Verified", badge_value_style),
                    Paragraph(f"<b>Folder:</b> {receipt.drive_folder.split('>')[-1].strip() if receipt.drive_folder else 'Monthly'}", badge_value_style)
                ]
            ]

            meta_table = Table(table_rows, colWidths=[55*mm, 32*mm, 35*mm, 35*mm, 33*mm])
            meta_table.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
                ('BOX', (0,0), (-1,-1), 0.8, colors.HexColor("#cbd5e1")),
                ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
                ('TOPPADDING', (0,0), (-1,-1), 3),
                ('BOTTOMPADDING', (0,0), (-1,-1), 3),
                ('LEFTPADDING', (0,0), (-1,-1), 4),
                ('RIGHTPADDING', (0,0), (-1,-1), 4),
            ]))

            receipt_block.append(meta_table)
            receipt_block.append(Spacer(1, 2*mm))

            # 2. Receipt Image
            img_element = None
            if receipt.image_url and os.path.exists(receipt.image_url):
                try:
                    with PILImage.open(receipt.image_url) as pil_img:
                        orig_w, orig_h = pil_img.size
                        aspect = orig_w / float(orig_h)
                        
                        target_h = max_img_height_mm * mm
                        target_w = target_h * aspect
                        max_w = 185 * mm
                        if target_w > max_w:
                            target_w = max_w
                            target_h = target_w / aspect

                        img_element = RLImage(receipt.image_url, width=target_w, height=target_h)
                except Exception as e:
                    print(f"Error loading image {receipt.image_url}: {e}")

            if img_element:
                img_table = Table([[img_element]], colWidths=[190*mm])
                img_table.setStyle(TableStyle([
                    ('ALIGN', (0,0), (-1,-1), 'CENTER'),
                    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 2),
                ]))
                receipt_block.append(img_table)
            else:
                placeholder = Table([[Paragraph("<i>[ Receipt Image Attached / Scanned ]</i>", batch_meta_style)]], colWidths=[190*mm])
                placeholder.setStyle(TableStyle([('ALIGN', (0,0), (-1,-1), 'CENTER')]))
                receipt_block.append(placeholder)

            receipt_block.append(Spacer(1, 4*mm))
            elements.append(KeepTogether(receipt_block))

        doc.build(elements)
        return output_filepath
