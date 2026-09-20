# ==============================================================================
# CovaVision - Windows Installation Script (PowerShell)
# ==============================================================================

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path "$ScriptDir\..\..").Path
Set-Location $ProjectRoot

function Write-Say {
    param([string]$Message)
    Write-Host "[CovaVision Install] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[CovaVision Install][SUCCESS] $Message" -ForegroundColor Green
}

function Write-Fail {
    param([string]$Message)
    Write-Host "[CovaVision Install][ERROR] $Message" -ForegroundColor Red
    exit 1
}

Write-Say "Bat dau cai dat CovaVision tren Windows..."

# 1. Kiem tra Python
Write-Say "Kiem tra Python..."
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCmd) {
    $pythonCmd = Get-Command py -ErrorAction SilentlyContinue
}
if (-not $pythonCmd) {
    Write-Fail "Khong tim thay Python. Vui long cai dat Python 3.9+ va them vao PATH."
}

$pyVer = & $pythonCmd.Source -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
Write-Say "Python phien ban: $pyVer"

# 2. Kiem tra Node.js & npm
Write-Say "Kiem tra Node.js va npm..."
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Fail "Khong tim thay Node.js. Vui long cai dat Node.js 18+ va them vao PATH."
}
$nodeVer = & node -v
Write-Say "Node.js: $nodeVer"

$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    Write-Fail "Khong tim thay npm."
}

# 3. Tao file .env neu chua co
if (-not (Test-Path "$ProjectRoot\.env")) {
    Write-Say "Tao .env tu .env.example..."
    Copy-Item "$ProjectRoot\.env.example" "$ProjectRoot\.env"
} else {
    Write-Say "File .env da ton tai."
}

# 4. Tao Python virtualenv
$VenvDir = "$ProjectRoot\.venv"
$VenvPython = "$VenvDir\Scripts\python.exe"
$VenvPrisma = "$VenvDir\Scripts\prisma.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Say "Tao Python virtual environment (.venv)..."
    & $pythonCmd.Source -m venv "$VenvDir"
    if ($LASTEXITCODE -ne 0) { Write-Fail "Tao virtual environment that bai." }
} else {
    Write-Say "Python virtualenv da ton tai."
}

# 5. Cai dat Python dependencies
Write-Say "Nang cap pip va cai dat backend dependencies..."
& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install -e ".[dev]"
if ($LASTEXITCODE -ne 0) { Write-Fail "Cai dat backend dependencies that bai." }

# Cai dat them cac thu vien vision
Write-Say "Cai dat thu vien vision (numpy, opencv, pillow, onnxruntime, insightface)..."
& $VenvPython -m pip install numpy opencv-python-headless Pillow onnxruntime insightface
if ($LASTEXITCODE -ne 0) { Write-Fail "Cai dat vision dependencies that bai." }

# Khoi dong va cache AI model (buffalo_s)
Write-Say "Kiem tra va khoi tao AI model nhan dien khuon mat (buffalo_s)..."
& $VenvPython -c "from app.recognition.face_recognition_module import FaceRecognition; FaceRecognition()"
if ($LASTEXITCODE -ne 0) {
    Write-Say "Luu y: Model se duoc tu dong tai ve o lan khoi dong he thong tiep theo."
}

# 6. Cai dat Desktop dependencies
Write-Say "Cai dat Desktop Electron dependencies..."
if (-not (Test-Path "$ProjectRoot\apps\desktop\node_modules")) {
    npm --prefix "$ProjectRoot\apps\desktop" ci
    if ($LASTEXITCODE -ne 0) {
        Write-Say "npm ci that bai, dang thu npm install..."
        npm --prefix "$ProjectRoot\apps\desktop" install
    }
} else {
    Write-Say "Desktop dependencies da co."
}

# 7. Khoi tao Database MySQL
Write-Say "Kiem tra ket noi MySQL cong 3306..."
$portOpen = $false
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.Connect("127.0.0.1", 3306)
    $portOpen = $tcp.Connected
    $tcp.Close()
} catch {
    $portOpen = $false
}

if (-not $portOpen) {
    Write-Fail "MySQL chua chay tren 127.0.0.1:3306. Hay bat Laragon MySQL truoc."
}
Write-Say "MySQL cong 3306 dang chay."

# Tim mysql.exe tu Laragon hoac PATH
$mysqlExe = "mysql"
$mysqlCmd = Get-Command mysql -ErrorAction SilentlyContinue
if ($mysqlCmd) {
    $mysqlExe = $mysqlCmd.Source
} else {
    $laragonMysqlCandidates = Get-ChildItem -Path "C:\laragon\bin\mysql\*\bin\mysql.exe" -ErrorAction SilentlyContinue
    if ($laragonMysqlCandidates) {
        $mysqlExe = $laragonMysqlCandidates[0].FullName
    }
}

if (Test-Path $mysqlExe) {
    Write-Say "Dam bao database covavision ton tai trong MySQL..."
    & $mysqlExe -u root -e "CREATE DATABASE IF NOT EXISTS covavision CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
}

# 8. Dong bo Schema Prisma
Write-Say "Dong bo schema Prisma vao database MySQL..."
$env:PATH = "$VenvDir\Scripts;" + $env:PATH
if (-not $env:DATABASE_URL) {
    $env:DATABASE_URL = "mysql://root:@127.0.0.1:3306/covavision"
}

& $VenvPrisma generate --schema "$ProjectRoot\prisma\schema.prisma"
& $VenvPrisma db push --schema "$ProjectRoot\prisma\schema.prisma" --accept-data-loss
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Dong bo Prisma schema that bai."
}

# 9. Khoi tao tai khoan Quan tri
Write-Say "Khoi tao tai khoan quan tri mac dinh (admin)..."
$env:PYTHONPATH = "$ProjectRoot\backend"
$env:COVAVISION_BOOTSTRAP_USERNAME = if ($env:COVAVISION_BOOTSTRAP_USERNAME) { $env:COVAVISION_BOOTSTRAP_USERNAME } else { "admin" }
$env:COVAVISION_BOOTSTRAP_PASSWORD = if ($env:COVAVISION_BOOTSTRAP_PASSWORD) { $env:COVAVISION_BOOTSTRAP_PASSWORD } else { "MatKhauBaoMat123" }
$env:COVAVISION_BOOTSTRAP_ROLE = "ADMIN"

& $VenvPython "$ProjectRoot\backend\scripts\bootstrap_admin.py"

Write-Success "Cai dat hoan tat thanh cong!"
Write-Host "De khoi dong he thong, chay: .\scripts\windows\start.bat hoac .\scripts\windows\start.ps1" -ForegroundColor Yellow
