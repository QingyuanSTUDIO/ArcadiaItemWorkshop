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

管理员页面：`http://服务器公网IP:8787/admin`。

宝塔/Nginx 转发真实 IP 后，将 `TRUST_PROXY=true`，用于举报去重。数据库文件和 WAL 文件需要一起备份；备份前建议短暂停止 Node 服务。

## API

- `GET /api/health`
- `GET /api/items?q=关键词&category=武器&limit=30&offset=0`
- `GET /api/items/:id`
- `POST /api/items`
- `POST /api/items/:id/report`，请求体：`{"reason":"举报理由"}`

标准上传样例位于 `test/example-item.json`。服务启动后可以测试：

```bash
curl -X POST https://你的域名/api/items \
  -H "Content-Type: application/json" \
  --data-binary @test/example-item.json
```
