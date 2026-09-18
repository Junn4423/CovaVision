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
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
pytest
uvicorn app.main:app --reload
```

Health endpoint: `GET http://127.0.0.1:8000/health`.

## Database

Prisma schema nằm ở `prisma/schema.prisma`. Không commit `.env`, mật khẩu, dump dữ liệu thật hoặc embedding thật vào repository.

Các bước migrate MySQL sẽ được thêm sau khi contract API và mô hình nghiệp vụ được chốt bằng test.

