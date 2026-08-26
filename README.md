# AutoAccount AI: Smart Receipt Scanner & Accounting Cloud Hub

A standalone mobile & cloud accounting system that:
- Captures & auto-crops receipts/bills from phone cameras or photo gallery.
- Extracts accurate accounting details (Date, Merchant, Ref#, Category, Tax, Amount, Line Items) with **Gemini AI Vision**.
- Organizes high-res images by month in **Google Drive** (`Accounting/YYYY/MM_Month/`).
- Logs records in real-time to **Google Sheets**.
- Compiles multiple bills (2-3 per page) into **Print-Ready A4 PDF** audit reports.

---

## 24/7 Cloud Deployment (Runs without your laptop)

You can host this app 100% free on **Render.com** or **Railway.app** so it runs 24/7 in the cloud and gives you a permanent HTTPS link (e.g. `https://your-app.onrender.com`) accessible from any smartphone anywhere.

### Step 1: Push this folder to a New GitHub Repository
1. Go to [github.com/new](https://github.com/new) and create a new repository named `autoaccount-ai-scanner` (select **Public** or **Private**).
2. Upload this project folder or push via Git:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: AutoAccount AI Scanner"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/autoaccount-ai-scanner.git
   git push -u origin main
   ```

### Step 2: Deploy Free 24/7 on Render.com
1. Go to [render.com](https://render.com) and sign up/sign in with your GitHub account (100% free).
2. Click **New +** $\rightarrow$ **Web Service**.
3. Select your `autoaccount-ai-scanner` repository from GitHub.
4. Settings:
   - **Environment:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`
5. Under **Environment Variables**, add:
   - `GEMINI_API_KEY`: `your-gemini-api-key`
   - `GOOGLE_APPS_SCRIPT_URL`: `https://script.google.com/macros/s/.../exec`
6. Click **Deploy Web Service**!

Render will build and give you a live link like:
$$\text{\textbf{https://autoaccount-ai-scanner.onrender.com}}$$

You can save this URL to your phone's home screen and scan receipts anytime, anywhere—even with your laptop closed and turned off!

---

## Local Development Quickstart

To run locally on your laptop:
```bash
pip install -r requirements.txt
python start_app.py
```
Open `http://localhost:8000` or `http://<your-local-ip>:8000` on your mobile phone.
