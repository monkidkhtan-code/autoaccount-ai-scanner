import uvicorn
import webbrowser
import time
import threading
import socket

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def open_browser():
    time.sleep(1.5)
    local_ip = get_local_ip()
    print("\n=======================================================")
    print("  AutoAccount AI Scanner is READY & LIVE!")
    print(f"  -> On your PC:     http://localhost:8000")
    print(f"  -> On your Mobile: http://{local_ip}:8000")
    print("  (Make sure your phone is connected to the same Wi-Fi)")
    print("=======================================================\n")
    webbrowser.open("http://localhost:8000")

if __name__ == "__main__":
    threading.Thread(target=open_browser, daemon=True).start()
    print("Starting server on 0.0.0.0:8000...")
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=False)
