# Gmail SMTP 配置指南

## 1. 前置条件：开启两步验证

1. 登录 Google 账号 → **安全性** → **两步验证** → 开启
2. 如果只有通行密钥（Passkey），需额外添加一种传统验证方式（如 Google Authenticator 或短信验证），否则应用专用密码入口不会出现

## 2. 生成应用专用密码

**快捷入口：** <https://myaccount.google.com/apppasswords>

手动路径：Google 账号页面顶部搜索栏输入 **"应用专用密码"** 或 **"App passwords"**

操作步骤：
1. 应用名称随意填写（如 `SMTP`）
2. 点击创建
3. 记下生成的 **16 位密码**（只显示一次）

### 找不到入口？

| 原因 | 解决方法 |
|------|----------|
| 两步验证未开启 | 必须先开启两步验证 |
| Google Workspace 账号 | 管理员可能禁用了，需联系管理员开启 |
| 仅使用通行密钥（Passkey） | 需额外添加 Authenticator App 或短信验证，之后入口才会出现 |

## 3. SMTP 参数

| 参数 | 值 |
|------|-----|
| SMTP 服务器 | `smtp.gmail.com` |
| 端口 | `587`（TLS）或 `465`（SSL） |
| 加密方式 | STARTTLS（端口 587）/ SSL（端口 465） |
| 用户名 | 完整邮箱地址 `xxx@gmail.com` |
| 密码 | 应用专用密码（16 位，非登录密码） |
| SMTP_FROM | `xxx@gmail.com`（必须与登录账号一致） |

## 4. 环境变量配置

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_FROM=your@gmail.com
SMTP_USER=your@gmail.com
SMTP_PASS=abcdefghijklmnop   # 应用专用密码（去掉空格）
```

## 5. 代码示例

### Node.js (nodemailer)

```js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'your@gmail.com',
    pass: 'abcd efgh ijkl mnop'  // 应用专用密码
  }
});

await transporter.sendMail({
  from: 'your@gmail.com',
  to: 'recipient@example.com',
  subject: 'Test',
  text: 'Hello'
});
```

### Python (smtplib)

```python
import smtplib
from email.mime.text import MIMEText

msg = MIMEText('Hello')
msg['Subject'] = 'Test'
msg['From'] = 'your@gmail.com'
msg['To'] = 'recipient@example.com'

with smtplib.SMTP('smtp.gmail.com', 587) as server:
    server.starttls()
    server.login('your@gmail.com', 'abcdefghijklmnop')
    server.send_message(msg)
```

## 6. 注意事项

- **SMTP_FROM 必须是你的 Gmail 地址**，Google 不允许伪造发件人
- 如需用别名发送，先在 Gmail **设置 → 账户 → 以这个地址发送邮件** 中添加
- Google Workspace 用户可能需要管理员开启"允许用户通过外部 SMTP 发送"
- 每日发送限额：普通 Gmail 约 500 封，Workspace 约 2000 封
- 应用专用密码只显示一次，丢失后需重新生成
