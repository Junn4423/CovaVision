# CovaVision Scripts Directory

Thư mục này chứa toàn bộ các script tự động hóa cài đặt, khởi động, dừng và kiểm thử dự án CovaVision, được phân loại rõ ràng theo từng hệ điều hành:

```text
scripts/
├── windows/
│   ├── install.bat / install.ps1  # Cài đặt môi trường, virtualenv, dependencies, MySQL & Prisma
│   ├── start.bat   / start.ps1    # Khởi động FastAPI Backend ngầm và Electron Desktop App
│   ├── stop.bat    / stop.ps1     # Dừng toàn bộ các tiến trình Backend và Electron Desktop App
│   └── test.bat    / test.ps1     # Chạy toàn bộ Pytest backend & Vite frontend build test
│
├── macos/
│   ├── install.sh                 # Cài đặt môi trường trên macOS/Linux qua Homebrew/pip/npm
│   ├── start.sh                   # Khởi động Backend và Desktop App trên macOS
│   ├── stop.sh                    # Dừng Backend và Desktop App
│   └── test.sh                    # Chạy kiểm thử tự động
│
├── setup_local.sh                 # Script tương thích ngược cho macOS/Linux
├── start_project.sh               # Script tương thích ngược cho macOS/Linux
├── stop_project.sh                # Script tương thích ngược cho macOS/Linux
└── test_all.sh                    # Script tương thích ngược cho macOS/Linux
```

---

## 🪟 Hướng Dẫn Sử Dụng Trên Windows

### 1. Cài đặt hệ thống
Nhấp đúp chuột vào file:
`scripts\windows\install.bat`
hoặc mở PowerShell trong thư mục dự án và chạy:
```powershell
.\scripts\windows\install.ps1
```

### 2. Khởi động hệ thống (Backend & Electron Desktop)
Nhấp đúp chuột vào file:
`scripts\windows\start.bat`
hoặc chạy qua PowerShell:
```powershell
.\scripts\windows\start.ps1
```
- Backend FastAPI sẽ tự động chạy tại: `http://127.0.0.1:8000` (API Docs: `http://127.0.0.1:8000/docs`).
- Electron Desktop App sẽ mở trực tiếp trên màn hình của bạn.

### 3. Dừng hệ thống
Nhấp đúp chuột vào file:
`scripts\windows\stop.bat`
hoặc chạy qua PowerShell:
```powershell
.\scripts\windows\stop.ps1
```

### 4. Chạy kiểm thử (Test Suites)
Nhấp đúp chuột vào file:
`scripts\windows\test.bat`
hoặc chạy qua PowerShell:
```powershell
.\scripts\windows\test.ps1
```

---

## 🍎 Hướng Dẫn Sử Dụng Trên macOS / Linux

Cấp quyền thực thi:
```bash
chmod +x scripts/macos/*.sh scripts/*.sh
```

- **Cài đặt:** `./scripts/macos/install.sh` (hoặc `./scripts/setup_local.sh`)
- **Khởi động:** `./scripts/macos/start.sh` (hoặc `./scripts/start_project.sh`)
- **Dừng:** `./scripts/macos/stop.sh` (hoặc `./scripts/stop_project.sh`)
- **Kiểm thử:** `./scripts/macos/test.sh` (hoặc `./scripts/test_all.sh`)
