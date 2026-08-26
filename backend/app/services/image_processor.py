import os
import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageOps
import io
import uuid

class ImageProcessor:
    @staticmethod
    def order_points(pts):
        """Order 4 points: top-left, top-right, bottom-right, bottom-left"""
        rect = np.zeros((4, 2), dtype="float32")
        s = pts.sum(axis=1)
        rect[0] = pts[np.argmin(s)] # top-left
        rect[2] = pts[np.argmax(s)] # bottom-right

        diff = np.diff(pts, axis=1)
        rect[1] = pts[np.argmin(diff)] # top-right
        rect[3] = pts[np.argmax(diff)] # bottom-left
        return rect

    @classmethod
    def auto_crop_and_deskew(cls, image_bytes: bytes, margin_percent: float = 0.05) -> bytes:
        """
        Detects receipt edges, straightens perspective, and adds a safety margin padding
        so text and borders are never clipped too tight.
        """
        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                return image_bytes

            orig = img.copy()
            h, w = img.shape[:2]

            scale = 800.0 / max(h, w)
            resized = cv2.resize(img, (int(w * scale), int(h * scale)))

            gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
            blurred = cv2.GaussianBlur(gray, (5, 5), 0)
            
            edged = cv2.Canny(blurred, 40, 160)
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
            dilated = cv2.dilate(edged, kernel, iterations=2)

            contours, _ = cv2.findContours(dilated.copy(), cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
            contours = sorted(contours, key=cv2.contourArea, reverse=True)[:8]

            receipt_contour = None
            for c in contours:
                peri = cv2.arcLength(c, True)
                approx = cv2.approxPolyDP(c, 0.02 * peri, True)
                area = cv2.contourArea(approx)
                
                if len(approx) == 4 and area > (0.18 * resized.shape[0] * resized.shape[1]):
                    receipt_contour = approx
                    break

            if receipt_contour is not None:
                pts = receipt_contour.reshape(4, 2) / scale
                
                # Add safety margin padding outward from centroid so crop isn't too tight
                centroid = np.mean(pts, axis=0)
                expanded_pts = []
                for pt in pts:
                    vec = pt - centroid
                    # Expand by margin_percent (e.g. 5%)
                    new_pt = centroid + vec * (1.0 + margin_percent)
                    # Clamp to image boundaries
                    new_pt[0] = np.clip(new_pt[0], 0, w - 1)
                    new_pt[1] = np.clip(new_pt[1], 0, h - 1)
                    expanded_pts.append(new_pt)
                
                rect = cls.order_points(np.array(expanded_pts, dtype="float32"))
                (tl, tr, br, bl) = rect

                widthA = np.linalg.norm(br - bl)
                widthB = np.linalg.norm(tr - tl)
                maxWidth = max(int(widthA), int(widthB))

                heightA = np.linalg.norm(tr - br)
                heightB = np.linalg.norm(tl - bl)
                maxHeight = max(int(heightA), int(heightB))

                if maxWidth > 150 and maxHeight > 150:
                    dst = np.array([
                        [0, 0],
                        [maxWidth - 1, 0],
                        [maxWidth - 1, maxHeight - 1],
                        [0, maxHeight - 1]
                    ], dtype="float32")

                    M = cv2.getPerspectiveTransform(rect, dst)
                    warped = cv2.warpPerspective(orig, M, (maxWidth, maxHeight))
                    
                    _, encoded_img = cv2.imencode('.jpg', warped, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
                    return encoded_img.tobytes()

            return image_bytes

        except Exception as e:
            print(f"[ImageProcessor] Auto-crop failed: {e}. Keeping original.")
            return image_bytes

    @classmethod
    def optimize_for_vision(cls, image_bytes: bytes, max_dim: int = 1280) -> bytes:
        """
        Resizes image to optimal AI vision resolution (1280px max) for ultra-fast processing
        while retaining 100% OCR readability.
        """
        try:
            image = Image.open(io.BytesIO(image_bytes))
            image = ImageOps.exif_transpose(image)
            w, h = image.size
            if max(w, h) > max_dim:
                scale = max_dim / float(max(w, h))
                new_w = int(w * scale)
                new_h = int(h * scale)
                image = image.resize((new_w, new_h), Image.Resampling.LANCZOS)

            buffer = io.BytesIO()
            image.convert("RGB").save(buffer, format="JPEG", quality=88, optimize=True)
            return buffer.getvalue()
        except Exception:
            return image_bytes

    @classmethod
    def enhance_receipt(
        cls, 
        image_bytes: bytes, 
        filter_mode: str = "enhanced_clean",
        auto_crop: bool = False
    ) -> bytes:
        """
        Enhances receipt images using clean contrast enhancement without destructive thresholding.
        """
        if auto_crop:
            image_bytes = cls.auto_crop_and_deskew(image_bytes)

        image = Image.open(io.BytesIO(image_bytes))
        image = ImageOps.exif_transpose(image)
        
        if filter_mode == "bw_enhanced":
            gray = image.convert("L")
            enhancer = ImageEnhance.Contrast(gray)
            high_contrast = enhancer.enhance(1.8)
            sharpener = ImageEnhance.Sharpness(high_contrast)
            output_image = sharpener.enhance(1.5).convert("RGB")
        elif filter_mode == "grayscale":
            gray = image.convert("L")
            enhancer = ImageEnhance.Contrast(gray)
            enhanced_gray = enhancer.enhance(1.4)
            output_image = enhanced_gray.convert("RGB")
        elif filter_mode == "color_boost":
            color_enhancer = ImageEnhance.Color(image.convert("RGB"))
            boosted = color_enhancer.enhance(1.3)
            contrast_enhancer = ImageEnhance.Contrast(boosted)
            output_image = contrast_enhancer.enhance(1.3)
        elif filter_mode == "original":
            output_image = image.convert("RGB")
        else: # enhanced_clean
            img_rgb = image.convert("RGB")
            contrast_enhancer = ImageEnhance.Contrast(img_rgb)
            high_contrast = contrast_enhancer.enhance(1.25)
            sharpener = ImageEnhance.Sharpness(high_contrast)
            output_image = sharpener.enhance(1.3)

        buffer = io.BytesIO()
        output_image.save(buffer, format="JPEG", quality=95, optimize=True)
        return buffer.getvalue()
