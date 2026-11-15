#!/usr/bin/env bash
# 星湾躲猫猫 · Android 工程生成器（权限修复版 v2）
#
# 用法：在【仓库根目录】执行  bash make-android.sh
# 生成 ./android/ 完整 Gradle 工程，并把 frontend/ 全部打进 assets。
#
# 核心修复（相对旧 Capacitor 包）：
#  1) Manifest 声明 CAMERA / ACCESS_FINE_LOCATION / ACCESS_COARSE_LOCATION
#     → 华为「应用管理 → 权限」里才会出现「相机 / 位置信息」开关
#  2) 启动时动态申请运行时权限（Android 6+ 必须）
#  3) WebChromeClient.onPermissionRequest 显式 grant 视频采集
#     → getUserMedia（扫一扫）能拿到画面
#  4) WebChromeClient.onGeolocationPermissionsShowPrompt 显式放行
#     + WebSettings.setGeolocationEnabled(true)
#     → navigator.geolocation（地图轨迹 / 定位自检）能拿到坐标
#  5) 用 androidx WebViewAssetLoader 把本地前端挂在
#     https://m.starven.cn/ 根路径下 → 真·HTTPS 安全上下文
#     （file:// 与 Capacitor 默认 http://localhost 都会让浏览器禁用摄像头/定位）
#     挂根路径是为了让 index.html 里的 ./css/ ./js/ ./assets/ 相对路径原样成立
#  6) /api/ 请求与外部地图瓦片一律不拦截，直接走真实网络；wss 也不受影响
#     前端 index.html 已写死 STARVEN_API_BASE=https://m.starven.cn，与页面同源
# 全程不依赖 npm / Capacitor / lockfile，避开 npm ci 的 ENOTEMPTY 问题。
set -euo pipefail

ROOT="$(pwd)/android"
FRONTEND="${FRONTEND_DIR:-frontend}"
say(){ echo "  $*"; }
fail(){ echo "❌ $*"; exit 1; }

echo "========== 生成 Android 工程（权限修复版） =========="
[ -f "$FRONTEND/index.html" ] || fail "没找到 $FRONTEND/index.html，请确认在仓库根目录运行"
[ -f "$FRONTEND/icons/icon-192.png" ] || fail "没找到 $FRONTEND/icons/icon-192.png"

rm -rf "$ROOT"
mkdir -p "$ROOT/app/src/main/java/cn/starven/hns" \
         "$ROOT/app/src/main/res/values" \
         "$ROOT/app/src/main/res/mipmap-xxxhdpi" \
         "$ROOT/app/src/main/assets"

# ---------- Gradle ----------
cat > "$ROOT/settings.gradle" <<'EOF'
pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}
rootProject.name = 'StarvenHNS'
include ':app'
EOF

cat > "$ROOT/build.gradle" <<'EOF'
plugins {
    id 'com.android.application' version '8.3.2' apply false
}
EOF

cat > "$ROOT/gradle.properties" <<'EOF'
android.useAndroidX=true
android.nonTransitiveRClass=true
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
EOF

cat > "$ROOT/app/build.gradle" <<'EOF'
plugins {
    id 'com.android.application'
}

android {
    namespace 'cn.starven.hns'
    compileSdk 34

    defaultConfig {
        applicationId "cn.starven.hns"
        minSdk 23
        targetSdk 34
        versionCode 2
        versionName "2.0.1-permissions"
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
}

dependencies {
    // 只依赖一个库：把本地静态资源挂在 https 域下（安全上下文）
    implementation 'androidx.webkit:webkit:1.9.0'
}
EOF

if [ -n "${ANDROID_HOME:-}" ]; then
  printf 'sdk.dir=%s\n' "$ANDROID_HOME" > "$ROOT/local.properties"
elif [ -n "${ANDROID_SDK_ROOT:-}" ]; then
  printf 'sdk.dir=%s\n' "$ANDROID_SDK_ROOT" > "$ROOT/local.properties"
fi

# ---------- Manifest ----------
cat > "$ROOT/app/src/main/AndroidManifest.xml" <<'EOF'
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <!-- 定位：地图 / 轨迹 / 定位自检 / 30 米探测 -->
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <!-- 相机：扫一扫 getUserMedia -->
    <uses-permission android:name="android.permission.CAMERA" />

    <!-- required=false：没有 GPS/摄像头的设备也能安装 -->
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />
    <uses-feature android:name="android.hardware.location.gps" android:required="false" />
    <uses-feature android:name="android.hardware.location.network" android:required="false" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:hardwareAccelerated="true"
        android:usesCleartextTraffic="false"
        android:theme="@android:style/Theme.Material.Light.NoActionBar">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:screenOrientation="portrait"
            android:configChanges="orientation|screenSize|smallestScreenSize|keyboardHidden|screenLayout|uiMode"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
EOF

cat > "$ROOT/app/src/main/res/values/strings.xml" <<'EOF'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">星湾躲猫猫</string>
</resources>
EOF

# ---------- MainActivity ----------
cat > "$ROOT/app/src/main/java/cn/starven/hns/MainActivity.java" <<'EOF'
package cn.starven.hns;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import java.util.ArrayList;
import java.util.List;

/**
 * 星湾躲猫猫 · 权限修复版 WebView 容器
 *
 * 页面地址：https://m.starven.cn/index.html
 *   - 同源静态资源 → APK 内置前端（离线可用，且是真 HTTPS 安全上下文）
 *   - /api/**    → 不拦截，WebView 直接联网到真实后端
 *   - 其它域名   → 不拦截（地图瓦片 OSM / 高德 / 天地图）
 *   - wss://m.starven.cn/api/ws → WebSocket 不走 shouldInterceptRequest
 */
public class MainActivity extends Activity {

    private WebView web;
    private static final int REQ_PERM = 1001;
    private static final String HOST = "https://m.starven.cn";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);               // ① 允许 Web Geolocation
        s.setMediaPlaybackRequiresUserGesture(false); // ② video.play() 自动播放
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }
        WebView.setWebContentsDebuggingEnabled(true); // debug 包可远程调试

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain("m.starven.cn")
                // 挂根路径：index.html 里的 ./css/ ./js/ ./assets/ 才能原样解析
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view,
                                                             WebResourceRequest req) {
                Uri url = req.getUrl();
                String host = url.getHost();
                String path = url.getPath();
                // 外部域名（地图瓦片）与后端 API 一律交给真实网络，
                // 绝不能让 AssetsPathHandler 给它们返回 404。
                if (host == null || !"m.starven.cn".equals(host)) return null;
                if (path != null && path.startsWith("/api/")) return null;
                // SW 预缓存列表里的 "./" 会请求根路径，回落到首页
                if (path == null || path.isEmpty() || "/".equals(path)) {
                    return loader.shouldInterceptRequest(Uri.parse(HOST + "/index.html"));
                }
                return loader.shouldInterceptRequest(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view,
                                                    WebResourceRequest req) {
                return false;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            // ③ 摄像头：WebView 默认静默拒绝，必须显式 grant
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    @Override public void run() {
                        ensureCamera();
                        List<String> grant = new ArrayList<>();
                        for (String r : request.getResources()) {
                            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)
                                    || PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) {
                                grant.add(r);
                            }
                        }
                        if (!grant.isEmpty()) {
                            request.grant(grant.toArray(new String[0]));
                        } else {
                            request.deny();
                        }
                    }
                });
            }

            // ④ 定位：必须显式 invoke(true)，否则 WebView 直接拒绝
            @Override
            public void onGeolocationPermissionsShowPrompt(
                    final String origin,
                    final GeolocationPermissions.Callback callback) {
                runOnUiThread(new Runnable() {
                    @Override public void run() {
                        ensureLocation();
                        callback.invoke(origin, true, false);
                    }
                });
            }
        });

        // ⑤ 运行时权限：Manifest 声明 + 这里动态申请，系统设置里才会出现开关
        requestPermissionsIfNeeded();

        web.loadUrl(HOST + "/index.html");
    }

    private void requestPermissionsIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            requestPermissions(new String[] {
                    Manifest.permission.CAMERA,
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
            }, REQ_PERM);
        }
    }

    private void ensureCamera() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && checkSelfPermission(Manifest.permission.CAMERA)
                        != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { Manifest.permission.CAMERA }, REQ_PERM);
        }
    }

    private void ensureLocation() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                        != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
            }, REQ_PERM);
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
EOF

# ---------- 前端资源与图标 ----------
cp -r "$FRONTEND/." "$ROOT/app/src/main/assets/"
cp "$FRONTEND/icons/icon-192.png" \
   "$ROOT/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png"

# ---------- 自检 ----------
grep -q 'ACCESS_FINE_LOCATION' "$ROOT/app/src/main/AndroidManifest.xml" \
  || fail "Manifest 缺少定位权限"
grep -q 'android.permission.CAMERA' "$ROOT/app/src/main/AndroidManifest.xml" \
  || fail "Manifest 缺少相机权限"
grep -q 'onPermissionRequest' "$ROOT/app/src/main/java/cn/starven/hns/MainActivity.java" \
  || fail "MainActivity 缺少摄像头授权回调"
grep -q 'setGeolocationEnabled(true)' "$ROOT/app/src/main/java/cn/starven/hns/MainActivity.java" \
  || fail "MainActivity 缺少定位开关"
[ -f "$ROOT/app/src/main/assets/index.html" ] || fail "前端 index.html 没复制进去"

echo ""
echo "✅ Android 工程已生成：$ROOT"
echo "   页面 origin : https://m.starven.cn/index.html  （安全上下文 ✅）"
echo "   权限        : CAMERA + FINE/COARSE_LOCATION + 运行时申请 + 回调放行"
echo "   静态资源    : $(find "$ROOT/app/src/main/assets" -type f | wc -l) 个文件（离线可用）"
echo "   API         : /api/** 与 wss 直接联网，不拦截"
echo "   前端改动    : 0（index.html 里 STARVEN_API_BASE 已指向同一域名）"
