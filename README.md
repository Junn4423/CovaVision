# CovaVision

CovaVision là ứng dụng chấm công bằng khuôn mặt độc lập, tách khỏi SOF và ERP.

Kiến trúc mục tiêu:

- `backend/`: một FastAPI backend duy nhất, xử lý nhận diện khuôn mặt, nhân sự, camera, chấm công và lưu trữ.
- `prisma/`: schema MySQL duy nhất với tên bảng nghiệp vụ rõ ràng.
- `apps/mobile/`: ứng dụng React Native.
- `apps/desktop/`: ứng dụng Electron.
- `tests/`: kiểm thử contract và nghiệp vụ theo hướng test-driven.

Hai source cũ tại `chamcong_mobile` và `ChamCong_KhuonMat` chỉ là nguồn tham chiếu; project mới không dùng remote, token, bảng hoặc workflow SOF/ERP của chúng.

## Cài và chạy tự động sau khi clone

Trên macOS có Homebrew MySQL, chạy từ thư mục project:

```bash
chmod +x scripts/*.sh
COVAVISION_BOOTSTRAP_USERNAME=hrm.pro1 \
COVAVISION_BOOTSTRAP_PASSWORD='your-password' \
./scripts/setup_local.sh
./scripts/start_project.sh
```

`setup_local.sh` tạo virtualenv, cài backend/vision, cài Electron, bật MySQL
`mysql@8.4` nếu có, tạo database/user theo `DATABASE_URL`, generate Prisma và
push schema. Nếu đã có tài khoản admin thì bỏ qua hai biến bootstrap. Script không
ghi mật khẩu vào source hoặc Git.

```bash
./scripts/stop_project.sh             # dừng backend và Electron, giữ MySQL
./scripts/stop_project.sh --database  # chỉ dùng khi muốn dừng cả MySQL Homebrew
```

Nếu đã cài bản Electron, có thể chạy backend rồi mở app cài sẵn:

```bash
COVAVISION_DESKTOP_MODE=installed ./scripts/start_project.sh
```

## Quét camera trong LAN

Desktop: vào **Quản lý camera → Quét LAN**. Mobile: mở cấu hình chấm công camera
và bấm **Quét LAN**. Backend sẽ gửi ONVIF WS-Discovery trước; nếu camera không
phản hồi, có thể bật fallback quét subnet `/24`. Frontend chỉ nhận mã candidate,
tên và hãng camera; IP, RTSP URL và credential được backend giữ lại.

## Chạy backend tối thiểu

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
pytest
uvicorn --app-dir backend app.main:app --reload
```

Sau khi cài package lần đầu, generate Prisma Python client:

```bash
PATH="$PWD/.venv/bin:$PATH" prisma generate --schema prisma/schema.prisma
```

Health endpoint: `GET http://127.0.0.1:8000/health`.

Tạo tài khoản quản trị đầu tiên sau khi MySQL đã sẵn sàng. Mật khẩu chỉ truyền qua
environment, không ghi vào source:

```bash
COVAVISION_BOOTSTRAP_USERNAME=hrm.pro1 \
COVAVISION_BOOTSTRAP_PASSWORD='your-password' \
PYTHONPATH=backend python backend/scripts/bootstrap_admin.py
```

Để chạy nhận diện và proxy camera RTSP, cài thêm `pip install -e '.[vision]'`. API giữ
URL RTSP ở backend; desktop/mobile chỉ nhận `camera_id`, snapshot hoặc MJPEG stream.
Ảnh đăng ký khuôn mặt được backend lưu trong `data/employee_faces/` (có thể đổi bằng
`COVAVISION_DATA_DIR`); thư mục dữ liệu này đã được loại khỏi Git.

## Database

Prisma schema nằm ở `prisma/schema.prisma`. Không commit `.env`, mật khẩu, dump dữ liệu thật hoặc embedding thật vào repository.

Kiểm tra schema:

```bash
DATABASE_URL='mysql://user:password@127.0.0.1:3306/covavision' prisma validate --schema prisma/schema.prisma
```

Sau khi MySQL đã sẵn sàng, áp dụng schema vào database bằng Prisma:

```bash
DATABASE_URL='mysql://user:password@127.0.0.1:3306/covavision' \
  prisma db push --schema prisma/schema.prisma
```

Không dùng giá trị ví dụ này cho môi trường thật. Mật khẩu bootstrap phải được tạo qua
biến môi trường hoặc thao tác quản trị, không ghi vào source code.
