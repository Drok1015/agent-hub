# 发布 @agent-hub/sdk 到 npm

## 步骤

### 1. 登录 npm

```bash
cd /workspace/sdk
npm adduser
```

按提示输入：
- Username: 你的 npm 用户名
- Password: 你的 npm 密码
- Email: 你的邮箱

### 2. 验证登录

```bash
npm whoami
```

应显示你的用户名。

### 3. 构建 SDK

```bash
npm run build
```

确认 `dist/` 目录已生成。

### 4. 发布

```bash
npm publish --access public
```

如果是 scoped package（@agent-hub/sdk），必须指定 `--access public`。

### 5. 验证发布

访问 https://www.npmjs.com/package/@agent-hub/sdk 查看包页面。

或者在终端运行：

```bash
npm view @agent-hub/sdk
```

## 安装测试

在另一个项目安装测试：

```bash
npm install @agent-hub/sdk
```

## 更新版本

修改 `sdk/package.json` 中的 version，然后重复步骤 3-4：

```bash
# 修改版本号
npm version patch  # 1.0.0 -> 1.0.1
# 或
npm version minor  # 1.0.0 -> 1.1.0
# 或
npm version major  # 1.0.0 -> 2.0.0

# 重新发布
npm publish --access public
```
