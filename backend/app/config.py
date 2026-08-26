import os
from pydantic import BaseModel

class Settings(BaseModel):
    app_name: str = "Receipt Scanner & Accounting System"
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "AQ.Ab8RN6JmvdDMPQgMGzMDkh0LfQ-84C9xNS1SYIgS9nhI47SffQ")
    google_apps_script_url: str = os.getenv(
        "GOOGLE_APPS_SCRIPT_URL", 
        "https://script.google.com/macros/s/AKfycby7cw5dc1mHY9SEiB14SIyuzmCF0Br26MxKLRGqDTWLU7kG98sJtuZJRgzHVT1surfK/exec"
    )
    google_drive_folder_id: str = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "")
    google_sheet_id: str = os.getenv("GOOGLE_SHEET_ID", "")
    storage_dir: str = os.path.join(os.path.dirname(__file__), "..", "..", "storage")

settings = Settings()
