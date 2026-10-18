/* ============================================================
 *  星极客 App · 接口层
 *  - 与网站共用同一个数据库（走 api_server 的 5001 端口）
 *  - 上传使用 XHR，支持真实百分比进度
 * ============================================================ */
(function (global) {
  'use strict';

  var DEF = 'https://api.xiaoxing666.top';

  var S = {
    base: localStorage.getItem('xjk_base') || DEF,
    token: localStorage.getItem('xjk_token') || '',
    me: null
  };
  try { S.me = JSON.parse(localStorage.getItem('xjk_me') || 'null'); } catch (e) { S.me = null; }

  function save() {
    localStorage.setItem('xjk_base', S.base);
    localStorage.setItem('xjk_token', S.token);
    localStorage.setItem('xjk_me', JSON.stringify(S.me));
  }

  /* ---------- 加载动画：转圈 ---------- */
  var loadCount = 0;
  function showLoading(txt) {
    loadCount++;
    var el = document.getElementById('loading');
    if (!el) return;
    document.getElementById('loading-txt').textContent = txt || '加载中';
    el.classList.add('show');
  }
  function hideLoading() {
    loadCount--;
    if (loadCount <= 0) {
      loadCount = 0;
      var el = document.getElementById('loading');
      if (el) el.classList.remove('show');
    }
  }

  /* ---------- 加载动画：上传进度条 ---------- */
  function progressEl() {
    var el = document.getElementById('upbar');
    if (!el) {
      el = document.createElement('div');
      el.id = 'upbar';
      el.innerHTML =
        '<div class="upbar-box">' +
        '  <div class="upbar-title" id="upbar-title">上传中</div>' +
        '  <div class="upbar-track"><div class="upbar-fill" id="upbar-fill"></div></div>' +
        '  <div class="upbar-num"><span id="upbar-pct">0%</span>' +
        '     <span id="upbar-size"></span></div>' +
        '</div>';
      document.getElementById('app').appendChild(el);
    }
    return el;
  }
  function fmtSize(b) {
    if (!b) return '';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }
  function showProgress(pct, loaded, total, title) {
    var el = progressEl();
    el.classList.add('show');
    document.getElementById('upbar-title').textContent = title || '上传中…';
    document.getElementById('upbar-fill').style.width = Math.max(2, Math.min(100, pct)) + '%';
    document.getElementById('upbar-pct').textContent = Math.floor(Math.min(100, pct)) + '%';
    document.getElementById('upbar-size').textContent =
      (total ? fmtSize(loaded) + ' / ' + fmtSize(total) : '');
  }
  function hideProgress() {
    var el = document.getElementById('upbar');
    if (el) el.classList.remove('show');
  }

  /* ---------- Toast ---------- */
  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1900);
  }

  /* ---------- 核心请求 ---------- */
  function req(path, opt) {
    opt = opt || {};
    var url = S.base.replace(/\/+$/, '') + path;
    var method = opt.method || (opt.data || opt.form ? 'POST' : 'GET');
    var hasFile = !!(opt.file || (opt.form && opt.form instanceof FormData));

    // 轻量 GET 不遮罩，避免闪烁
    var silent = opt.silent === true;
    if (!silent) showLoading(opt.loadingText || '加载中');

    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      xhr.timeout = opt.timeout || 8000;

      if (S.token) xhr.setRequestHeader('Authorization', 'Bearer ' + S.token);

      var body = null;
      if (opt.form instanceof FormData) {
        body = opt.form;                                  // 让浏览器自动带 boundary
      } else if (opt.form) {
        var fd = new FormData();
        for (var k in opt.form) fd.append(k, opt.form[k]);
        body = fd;
      } else if (opt.file) {
        var fd2 = new FormData();
        for (var k2 in (opt.fields || {})) fd2.append(k2, opt.fields[k2]);
        fd2.append(opt.fieldName || 'file', opt.file, opt.file.name);
        body = fd2;
      } else if (opt.data) {
        xhr.setRequestHeader('Content-Type', 'application/json');
        body = JSON.stringify(opt.data);
      }

      if (body) {
        // 真实上传进度
        if (xhr.upload && (hasFile || opt.progress)) {
          xhr.upload.onprogress = function (e) {
            if (!e.lengthComputable) return;
            var pct = e.loaded / e.total * 100;
            showProgress(pct, e.loaded, e.total, opt.progressText || '上传中…');
          };
        }
        xhr.upload.onload = function () { hideProgress(); };
      }

      xhr.onload = function () {
        if (!silent) hideLoading();
        hideProgress();
        var j;
        try { j = JSON.parse(xhr.responseText); }
        catch (e) {
          reject({ msg: '服务器返回异常（' + xhr.status + '）' });
          return;
        }
        if (xhr.status === 401) { S.token = ''; S.me = null; save(); if (global.App) global.App.gotoLogin(); }
        if (j && j.ok === false) { reject(j); return; }
        resolve(j || {});
      };
      xhr.onerror = function () {
        if (!silent) hideLoading(); hideProgress();
        reject({ msg: '网络连接失败，请检查服务器地址' });
      };
      xhr.ontimeout = function () {
        if (!silent) hideLoading(); hideProgress();
        reject({ msg: '请求超时' });
      };
      xhr.send(body);
    });
  }

  function get(p, q, silent) {
    var s = '';
    if (q) for (var k in q) s += (s ? '&' : '?') + encodeURIComponent(k) + '=' + encodeURIComponent(q[k]);
    return req(p + s, { silent: silent });
  }

  /* ---------- 上传（带进度） ---------- */
  function upload(file, fields, fieldName, progressText) {
    return req('/api/upload', {
      file: file, fields: fields || {}, fieldName: fieldName || 'file',
      progressText: progressText || '上传中…', timeout: 180000
    });
  }

  /* ---------- 登录信息 ---------- */
  function setSession(token, user) {
    S.token = token; S.me = user; save();
  }
  function clearSession() {
    S.token = ''; S.me = null; save();
  }

  global.API = {
    state: S, save: save, req: req, get: get, upload: upload,
    toast: toast, loading: showLoading, loaded: hideLoading,
    progress: showProgress, progressEnd: hideProgress,
    setSession: setSession, clearSession: clearSession,
    img: function (u) { return u || ''; }
  };
})(window);
