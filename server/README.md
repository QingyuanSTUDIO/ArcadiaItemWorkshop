# ArcadiaItemWorkshop Server

阿卡狄亚物品创意工坊的 SQLite API 底座，面向 Debian 12 + 宝塔 Nginx 部署。

## 当前功能

- 严格验证 `arcadia-item` v1 JSON；
- 验证七个分类和十个标准内容标签；
- 拒绝未知字段、危险脚本内容和超大请求；
- 条目列表、搜索、分类筛选、分页、详情和上传；
- 举报去重；同一来源对同一条目只能计数一次；
- 达到 5 个有效举报后自动隐藏，数据库保留记录供以后审核；
- `/admin` 管理页面，管理员登录后可搜索、查看、隐藏、恢复和软删除条目；
- 用户注册和登录；管理员可通过接口管理用户角色；
- 世界书本体与创意工坊两个模块的条目同步接口，保存蓝绿灯策略、触发词、顺序和完整内容；
- SQLite WAL 模式，适合单机轻量服务。

## 本地启动

安装 Node.js 20 LTS，然后：

```bash
cd server
npm install
npm test
npm start
```

服务默认监听 `0.0.0.0:8787`，数据库位于 `data/workshop.sqlite`。测试时可通过 `http://服务器公网IP:8787/api/health` 访问。

### 后台持久运行（PM2）

在服务器的 `server` 目录执行一次：

```bash
npm install -g pm2
npm install --omit=dev
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

执行 `pm2 startup` 后，复制它输出的那一整行命令再执行一次。之后服务会自动后台运行、崩溃重启，并在服务器重启后恢复。常用命令：

```bash
pm2 status
pm2 logs arcadia-item-workshop
pm2 restart arcadia-item-workshop
pm2 stop arcadia-item-workshop
```

## 宝塔部署

1. 在宝塔安装 Node.js 20 LTS 和 Nginx。
2. 将 `server` 上传到服务器，例如 `/www/wwwroot/arcadia-workshop/server`。
3. 在项目目录执行 `npm install --omit=dev`。
4. 使用宝塔 Node 项目管理器运行 `npm start`。
5. 将域名反向代理到 `http://127.0.0.1:8787`。
6. 为域名申请 HTTPS 证书。
7. 复制 `.env.example` 为 `.env`，设置 `ADMIN_PASSWORD`，把 `ALLOWED_ORIGINS` 改为实际前端来源，并在宝塔环境变量中配置这些值。

管理员页面：`http://服务器公网IP:8787/admin`；用户管理：`http://服务器公网IP:8787/admin/users`。

首次启动时，如果数据库还没有用户，会使用 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 自动创建管理员账号。后续普通用户可通过 `POST /api/auth/register` 注册。世界书模块接口为 `/api/worldbook`，创意工坊模块接口为 `/api/worldbook/workshop`，均需登录。

宝塔/Nginx 转发真实 IP 后，将 `TRUST_PROXY=true`，用于举报去重。数据库文件和 WAL 文件需要一起备份；备份前建议短暂停止 Node 服务。

## API

- `GET /api/health`
- `GET /api/items?q=关键词&category=武器&limit=30&offset=0`
- `GET /api/items/:id`
- `POST /api/items`
- `POST /api/items/:id/report`，请求体：`{"reason":"举报理由"}`

## 聊天与管理

- 后台首页新增「聊天管理」入口，独立页面为 `/admin/chat`。
- 留言管理支持搜索、分页、公开/隐藏筛选、隐藏、恢复和永久删除。
- 「禁言与用户」视图支持查看活跃状态、禁言原因和到期时间，以及已有账号/IP 封禁状态。
- 管理员可以在后台或酒馆脚本的消息按钮中禁言普通用户，支持限时/永久禁言及后台解禁。禁言仅限制聊天发言，不等同于账号封禁。
- 普通用户发言冷却 10 秒，服务端事务检查并持久化；管理员免冷却。删除留言或重启服务不会重置冷却。
- 登录、手动刷新、打开聊天、发送和互动更新活跃时间；后台聊天轮询不刷新活跃时间。20 分钟内显示绿点，超时显示红点。
- 公共接口最多返回最近 200 条可见留言；前端内存和 DOM 同样最多保留 200 条，不在本地存储留言。服务器保留历史记录供管理员分页审查，不自动删除。
- `/api/chat/activity`（POST）记录主动活动；`/api/chat/messages`（GET/POST）读取/发送留言。
- `/api/admin/chat/messages`（GET）分页查询；`/api/admin/chat/messages/:id`（POST/DELETE）更改状态/删除。
- `/api/admin/chat/users/:id/mute`（POST）接受 `action: mute/unmute`、`duration: 30m/12h/7d/permanent` 和可选 `reason`。
- 首次重启自动追加数据库字段，不需要手工建表。可通过 `DATABASE_PATH` 指定隔离测试数据库路径。
- 数据库和 HTTP 测试：安装依赖后执行 `npm test`；推荐使用 Node.js 22，原生 SQLite 模块必须与运行时版本匹配。
- 可选浏览器回归测试：准备 Playwright 和 Chromium 后执行 `npm run test:ui`。可用 `PLAYWRIGHT_MODULE` 指定已有 Playwright 模块路径，用 `PLAYWRIGHT_CHANNEL=msedge` 使用已安装的 Edge。测试使用模拟接口，不访问线上服务，截图保存在系统临时目录下的 `arcadia-chat-ui`，可通过 `CHAT_SCREENSHOT_DIR` 覆盖。

标准上传样例位于 `test/example-item.json`。服务启动后可以测试：

```bash
curl -X POST https://你的域名/api/items \
  -H "Content-Type: application/json" \
  --data-binary @test/example-item.json
```
