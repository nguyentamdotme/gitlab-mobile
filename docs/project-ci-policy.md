# Policy CI theo project

Mặc định không project/ref nào được phép gửi CI mutation. Chủ project cần xác minh tác động CI trước khi import policy qua Settings. Policy không chứa token, secret hoặc giá trị variables. Đây là allowlist UI/safety; GitLab vẫn kiểm tra protected branches/environments, approvals, freeze, ownership và permission.

Ví dụ cấu trúc **chỉ để minh họa**, không được cài làm default:

```json
[
  {
    "instance": "https://gitlab.com",
    "projectId": 123,
    "refs": ["sandbox"],
    "environments": ["staging"],
    "risk": "non-production",
    "variables": ["TEST_SUITE"],
    "inputsEnabled": false,
    "stopEnabled": false,
    "approvalsEnabled": false,
    "approvalReauthentication": false,
    "validated": true,
    "redeploy": false
  }
]
```

Thay instance/project/ref/environment bằng mapping thật đã thử. Không suy luận staging từ job name. Manual play yêu cầu metadata environment nằm trong allowlist, job manual và chưa archived; delayed/scheduled job không được play. Run/retry/cancel cần ref thuộc allowlist có tác động đã xác nhận. Retry pipeline chỉ failed/canceled jobs; retry job trả ID mới và app chuyển route đúng ID.

`risk: production` yêu cầu local authentication sau confirmation. Gate policy vẫn bắt buộc; một hộp thoại không thay thế mapping đã kiểm thử. Chưa hoàn thành live safety gates thì không import production policy. Unknown environment giữ khóa trong implementation hiện tại.

`inputsEnabled` cần GitLab 18.1+ và config CI tương ứng. Keys của variables phải có trong allowlist. Không persist request body/value. Branch/tag trùng tên bị từ chối ở Run pipeline để tránh ref mơ hồ. Schedules dùng qualified `refs/heads/...` hoặc `refs/tags/...` và timezone IANA; cron do GitLab validate cuối cùng.

`approvalReauthentication: true` khóa native MR approval và hướng tới website; không thu GitLab password. `approvalsEnabled` chỉ bật khi deployment approval tier/quyền đã được xác minh. Approval không đồng nghĩa deployment hoàn tất.

`stopEnabled` chỉ bật khi environment có `on_stop` workflow đã thử; app gửi `force: false`. `redeploy` chỉ bật khi retry job cũ phù hợp với scripts/artifacts; không phải rollback database. Mapping rollback optional:

```json
{"ref":"rollback-sandbox","inputKey":"target_sha","environment":"staging"}
```

Ref rollback cũng phải nằm trong `refs`, environment trong allowlist, và `inputsEnabled` bật. Workflow nhận SHA deployment cũ; không có REST rollback chung và không tạo deployment record để giả deploy. Production/unknown actions không được coi là verified chỉ vì policy JSON hợp lệ.
