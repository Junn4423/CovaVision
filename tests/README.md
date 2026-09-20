# CovaVision test suite

Test được chia theo domain để một thay đổi chỉ ảnh hưởng module nào thì có thể chạy nhanh module đó, đồng thời `pytest` vẫn tự động thu thập toàn bộ thư mục con.

```text
tests/
├── api/          HTTP contract và quyền truy cập từng route
├── attendance/   business rule, snapshot, shift check-in/check-out
├── billing/      plan, quota, payment method/provider/callback
├── cameras/      discovery, secret, stream manager, speaker
├── contracts/    route inventory bắt buộc cập nhật khi thêm API
├── core/         runtime/config nền tảng
├── database/     schema, backup, repository contract
├── packaging/    desktop packaging contract
├── recognition/  matching, encoding, model/liveness, service
├── security/     token, mật khẩu, session, revocation
└── tenancy/      organization isolation
```

Chạy backend đầy đủ:

```powershell
.venv\Scripts\python.exe -m pytest tests -q
.venv\Scripts\python.exe -m pytest tests --cov=backend/app --cov-report=term-missing
```

`tests/contracts/test_route_inventory.py` so sánh toàn bộ route FastAPI với ma trận owner. Khi thêm hoặc đổi API, test sẽ fail cho tới khi route có test module tương ứng. Đây là guard chống bỏ sót endpoint; nó không thay thế test chạy với MySQL thật, provider sandbox thật hoặc model InsightFace thật.

Frontend được kiểm tra riêng bởi script test gốc: desktop build, mobile TypeScript và mobile Jest khi `apps/mobile/node_modules` tồn tại.
