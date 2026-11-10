# 星界工坊 · Astral Workshop

面向 TRPG 的模型与卡牌目录，以及支持选款、报名、投稿和投票的星界杯活动站。前端使用 Next.js，后端通过 Supabase 兼容接口访问 Postgres、身份验证与对象存储。

## 本地浏览

使用 Node.js 24。在仓库根目录运行以下命令，然后访问 http://127.0.0.1:9000 。

~~~sh
npm ci
npm run dev
~~~

默认启动只读演示版。首页、模型详情、赛事规则和报名选款可浏览。商品、参赛模型和图片是演示占位资料。登录、报名和后台操作需要配置自己的后端。

## 配置独立后端

1. 创建独立的 Supabase 兼容项目，按编号执行 migrations 中的 SQL。迁移提供表、函数和初始赛事记录。
2. 将 functions/astral-workshop-api 部署为启用 JWT 校验的边缘函数。使用平台注入的 SUPABASE_ANON_KEY 和 SUPABASE_SERVICE_ROLE_KEY。需要经过平台项目代理时，用 ASTRAL_DB_URL 指定自己的 HTTPS 数据接口。
3. 把 .env.example 复制为 .env.local。ASTRAL_BACKEND_URL 填写自己的函数 URL，ASTRAL_AUTH_URL 填写同一项目的 Auth 地址（通常以 /auth/v1 结尾），ASTRAL_ANON_KEY 填写该项目的匿名公钥。按实际站点地址设置 SITE_PUBLIC_ORIGIN 和 NEXT_PUBLIC_SITE_ORIGIN。
4. 启用邮箱验证码并关闭自动确认邮箱。管理员首次开通由边缘函数里的 ASTRAL_ADMIN_INVITES 控制。每条邀请包含 username、随机邀请令牌的 SHA-256 哈希 tokenHash、毫秒时间戳 expiresAt。ASTRAL_ADMIN_AUTH_SECRET 使用独立生成的 32 字节十六进制密钥。将这些值配置到边缘函数的密钥管理中。

更换目录数据时，同步维护前端及边缘函数中的 catalog.json、card-packages.json 和报名模型清单。生产构建用 npm run build。正式站点应使用 HTTPS。

## 素材

仓库含示例 SVG 和虚构目录数据。请使用有权发布的图片、标识和目录资料替换占位内容。vendor 目录里的第三方代码附有自己的许可证。

## 许可证

项目源码采用 MIT 许可证。第三方组件沿用各自的许可证。 [MIT 许可证](LICENSE)
