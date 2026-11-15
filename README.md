# 星湾躲猫猫 APP · GitHub 前端包

> 这个包**只含前端**，上传到 GitHub 后自动做两件事：
> ① 发布 PWA 网页版到 GitHub Pages（手机「添加到主屏幕」即像正常 APP）
> ② 用 Capacitor 打包出可安装的 Android debug APK
>
> 后端不在这个包里，在另一个「网站后端」包，地址固定 **`https://m.starven.cn`**。

---

## 一、上传 GitHub（3 步）

```bash
# 1. 在 GitHub 新建一个空仓库（例如 starven-hide-and-seek），然后：
cd 星湾APP_GitHub前端
git init
git add .                      # 注意 .github/workflows/ 要一起提交
git commit -m "星湾躲猫猫 APP 前端"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

2. 仓库 **Settings → Pages → Build and deployment → Source** 选 **`GitHub Actions`**（不要选「Deploy from a branch」）。
3. 推送 `main` 后 `pages.yml` 自动跑完，得到：

```
https://<你的用户名>.github.io/<仓库名>/
```

把这个链接发到工作室群，手机打开 → 浏览器菜单「添加到主屏幕」→ 全屏 APP。

> 想绑自己的域名也可以：仓库放一个 `frontend/CNAME` 写你的域名，Pages 里填 Custom domain。但证书和 CORS 要跟着改，最省事的是直接用 github.io 的 HTTPS 地址。

## 二、打包 APK

**方式 A｜手动**：仓库 **Actions → 打包 Android APK（Capacitor） → Run workflow**，跑完在 Artifacts 里下载 `app-debug.apk`。

**方式 B｜打标签自动发 Release**：

```bash
git tag v1.0.0 && git push --tags
```

`android.yml` 会自动编译并把 APK 挂到 Release 上，直接发给成员安装。

构建链：`npm ci` → `npx cap add android` → `npx cap sync android` → `gradlew assembleDebug`，JDK 17 / Node 20 都由工作流装好，本地不用装 Android Studio。

## 三、地址配置（唯一要改的地方）

`frontend/index.html` 底部这一行决定前端连哪个后端：

```html
<script>
  window.STARVEN_API_BASE = "https://m.starven.cn";
</script>
```

- 所有 REST 请求 → `https://m.starven.cn/api/`
- 实时 WebSocket 自动推导 → `wss://m.starven.cn/api/ws`
- 换域名只改这一行，其它文件都不用动。

**后端配合**：因为前端在 github.io、后端在 m.starven.cn，属于跨域。后端包 `.env` 里的 `CORS_ORIGINS` 默认是 `*`，开箱即用；上线后建议收紧成你的 Pages 域名，例如：

```bash
CORS_ORIGINS=https://<你的用户名>.github.io
```

浏览器 PWA 通过 HTTPS 加载，是标准安全上下文 → **摄像头扫码、GPS/BDS 定位、地图轨迹全部可用**。

## 四、目录结构

```
星湾APP_GitHub前端/
├── frontend/                  ← 站点根目录（Pages 直接发布这一层）
│   ├── index.html             ← ★ 后端地址在这里
│   ├── css/app.css             ins 风视觉 + 自绘线性图标
│   ├── js/                    api / ws / geo / mapview / countdown 等 9 个模块
│   ├── vendor/leaflet/        Leaflet 1.9.4 本地内置，不依赖 CDN
│   ├── assets/                两张 ins 风背景插画（WebP）
│   ├── icons/                 PWA 图标
│   ├── manifest.webmanifest / sw.js
│   └── nginx*.conf            仅同源部署时才用，Pages 部署可忽略
├── .github/workflows/
│   ├── pages.yml              GitHub Pages 自动发布
│   └── android.yml            Capacitor 打 APK + Release
├── package.json / package-lock.json
├── capacitor.config.json      appId: cn.starven.hideandseek
└── docs/预览/                 10 张手机尺寸界面截图
```

## 五、本地预览（可选）

```bash
cd frontend && python3 -m http.server 8080
# 打开 http://localhost:8080
```

`localhost` 也算安全上下文，但接口会跨域打到 `https://m.starven.cn`——**要等后端包部署好才有数据**，否则登录会提示网络不通。

---

## 六、如实说明的边界

- **现场正式拍摄优先用浏览器 PWA（Pages 版）**，功能最完整：摄像头扫码、定位、轨迹、公开全员定位都验证过。
- **APK 版能装能用**（登录、倒计时、扫球手动输入、地图、积分、WebSocket 实时同步都走同一套代码），但 Capacitor 的 WebView 里 `navigator.geolocation` / `getUserMedia` 需要原生插件与 Android 权限配合（`@capacitor/geolocation`、`@capacitor/camera` + `ACCESS_FINE_LOCATION`）。当前工作流**没有接这两个插件**，所以 APK 上定位/摄像头不保证能拿到；如果确定要主推 APK，说一声我补上插件、权限和 workflow。
- GitHub Pages 的地图瓦片（OSM / 高德 / 天地图）依赖现场外网；完全断网时切「纯轨迹画布」仍能看到全员轨迹与场地圈。
- 这是 PWA，不是应用商店上架的原生应用；debug APK 仅供内部分发。

---

*为星湾之未来而奋斗 ✊*
