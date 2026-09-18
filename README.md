# CovaVision

CovaVision là ứng dụng chấm công bằng khuôn mặt độc lập, tách khỏi SOF và ERP.

Kiến trúc mục tiêu:

- `backend/`: một FastAPI backend duy nhất, xử lý nhận diện khuôn mặt, nhân sự, camera, chấm công và lưu trữ.
- `prisma/`: schema MySQL duy nhất với tên bảng nghiệp vụ rõ ràng.
- `apps/mobile/`: ứng dụng React Native.
- `apps/desktop/`: ứng dụng Electron.
- `tests/`: kiểm thử contract và nghiệp vụ theo hướng test-driven.

Hai source cũ tại `chamcong_mobile` và `ChamCong_KhuonMat` chỉ là nguồn tham chiếu; project mới không dùng remote, token, bảng hoặc workflow SOF/ERP của chúng.

## Chạy backend tối thiểu

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
pytest
uvicorn --app-dir backend app.main:app --reload
```

Health endpoint: `GET http://127.0.0.1:8000/health`.

Để chạy nhận diện và proxy camera RTSP, cài thêm `pip install -e '.[vision]'`. API giữ
URL RTSP ở backend; desktop/mobile chỉ nhận `camera_id`, snapshot hoặc MJPEG stream.

## Database

Prisma schema nằm ở `prisma/schema.prisma`. Không commit `.env`, mật khẩu, dump dữ liệu thật hoặc embedding thật vào repository.

Kiểm tra schema:

```bash
DATABASE_URL='mysql://user:password@127.0.0.1:3306/covavision' prisma validate --schema prisma/schema.prisma
```

Không dùng giá trị ví dụ này cho môi trường thật. Mật khẩu bootstrap phải được tạo qua
biến môi trường hoặc thao tác quản trị, không ghi vào source code.
