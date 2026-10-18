/* ============================================================
 *  星极客 App · 页面逻辑（纯本地 UI，微信风格）
 *  所有加载动画均在本地立刻渲染，不等网络
 * ============================================================ */
(function () {
'use strict';

var S = API.state;
var $ = function (id) { return document.getElementById(id); };
var esc = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
};
function IMG(u) {
  if (!u) return '';
  if (/^https?:/i.test(u)) return u;
  return S.base.replace(/\/+$/, '') + u;
}
function AV(u, cls) {
  var src = IMG(u);
  return src ? '<img class="avatar ' + (cls || '') + '" src="' + src + '" onerror="this.style.visibility=\'hidden\'">'
             : '<span class="avatar ' + (cls || '') + '">🙂</span>';
}
function toast(m) { API.toast(m); }

/* ---------- 本地骨架屏：切页瞬间立刻渲染，不等接口 ---------- */
function skeleton(n, box) {
  var h = '';
  for (var i = 0; i < (n || 4); i++) {
    h += '<div class="skel-row w80"></div><div class="skel-row w60"></div>';
  }
  (box || $('sub-body')).innerHTML = '<div class="skel">' + h + '</div>';
}

/* ---------- 页面路由 ---------- */
var stack = [];          // 子页层级栈：每层记录返回目标与重绘函数
var curTab = 'chats';    // 当前底部 Tab

function setTab(t) {
  curTab = t;
  document.querySelectorAll('.tb').forEach(function (x) {
    x.classList.toggle('on', x.getAttribute('data-tab') === t);
  });
}
function tabLoader(t) {
  return t === 'chats' ? loadChats : t === 'me' ? loadMe
       : t === 'discover' ? loadDiscover : t === 'contest' ? loadContests : null;
}
function goTab(t) {
  setTab(t);
  go(t, { load: tabLoader(t) });
}
function go(name, opt) {
  opt = opt || {};
  ['login', 'chats', 'chat', 'discover', 'contest', 'me', 'sub'].forEach(function (p) {
    var el = $('page-' + p);
    if (el) el.classList.toggle('show', p === name);
  });
  $('tabbar').style.display = (name === 'login' || name === 'chat') ? 'none' : 'flex';
  window.scrollTo(0, 0);
  var sc = $('page-' + name).querySelector('.scroll');
  if (sc) sc.scrollTop = 0;
  if (opt.load) opt.load();
}
function push(name, title, loadFn, opt) {
  opt = opt || {};
  stack.push({ name: name, title: title || '', loadFn: loadFn,
               tab: opt.tab || curTab, act: opt.act || '',
               actFn: opt.actFn || null });
  renderSub();
  go('sub');
  skeleton(3);
  if (loadFn) loadFn();
}
function renderSub() {
  var top = stack[stack.length - 1];
  if (!top) return;
  $('sub-title').textContent = top.title;
  var a = $('sub-act');
  a.textContent = top.act || '';
  a.onclick = top.actFn || function () { toast(''); };
  a.style.visibility = top.act ? 'visible' : 'hidden';
}
/* 刷新当前子页：重新拉取数据，但不新增层级（修复"返回一次回到首页"） */
function reloadSub() {
  var top = stack[stack.length - 1];
  if (!top) return;
  skeleton(3);
  if (top.loadFn) top.loadFn();
  else $('sub-body').innerHTML = '';
}

/* 返回上一层：有子页就回上一层子页，没有才回底部 Tab */
function back() {
  stack.pop();
  var prev = stack[stack.length - 1];
  if (prev) {
    renderSub();
    go('sub');
    if (prev.loadFn) prev.loadFn();
    else $('sub-body').innerHTML = '';
  } else {
    goTab(curTab);
  }
}
/* Android 物理返回键 */
function onBackKey() {
  if (document.getElementById('page-chat').classList.contains('show')) {
    curRoom = null; goTab(curTab); return;
  }
  var mask = document.getElementById('mask');
  if (mask && mask.classList.contains('show')) { closeSheet && closeSheet(); return; }
  if (document.getElementById('page-sub').classList.contains('show')) { back(); return; }
  if (curTab !== 'chats') { goTab('chats'); return; }
}
document.addEventListener('backbutton', function (e) { onBackKey(); });
window.addEventListener('popstate', function () { onBackKey(); });

/* ---------- 底部 Tab ---------- */
document.addEventListener('click', function (e) {
  var tb = e.target.closest ? e.target.closest('.tb') : null;
  if (tb) {
    var t = tb.getAttribute('data-tab');
    stack = [];
    goTab(t);
  }
});

/* ---------- 弹层 ---------- */
function sheet(items) {
  var h = '';
  items.forEach(function (it, i) {
    h += '<div class="sheet-item" data-i="' + i + '">' + esc(it.text) + '</div>';
  });
  h += '<div class="sheet-cancel" id="sheet-cancel">取消</div>';
  $('sheet').innerHTML = h;
  $('sheet').classList.add('show');
  $('mask').classList.add('show');
  $('sheet').onclick = function (e) {
    var it = e.target.closest('.sheet-item');
    closeSheet();
    if (it && items[+it.getAttribute('data-i')].fn) items[+it.getAttribute('data-i')].fn();
  };
}
function closeSheet() {
  $('sheet').classList.remove('show');
  $('mask').classList.remove('show');
}
$('mask').onclick = closeSheet;

function promptSheet(title, fields, onOk) {
  var h = '<div style="padding:16px 16px 6px"><div style="font-size:16px;font-weight:600;text-align:center;margin-bottom:12px">'
        + esc(title) + '</div>';
  fields.forEach(function (f) {
    if (f.type === 'textarea') {
      h += '<textarea class="inp inp-area" id="pf-' + f.key + '" placeholder="' + esc(f.ph || '') + '"'
         + (f.rows ? ' rows="' + f.rows + '"' : ' rows="5"') + '>' + esc(f.val || '') + '</textarea>';
    } else if (f.type === 'file') {
      h += '<div class="pf-file"><span class="pf-file-lb">' + esc(f.ph || '选择文件') + '</span>'
         + '<input class="inp inp-file" id="pf-' + f.key + '" type="file"'
         + (f.accept ? ' accept="' + f.accept + '"' : ' accept="image/*"') + '></div>';
    } else if (f.type === 'select') {
      h += '<select class="inp" id="pf-' + f.key + '">';
      (f.options || []).forEach(function (o) {
        h += '<option value="' + esc(o.value) + '"'
           + (String(o.value) === String(f.val) ? ' selected' : '') + '>' + esc(o.text) + '</option>';
      });
      h += '</select>';
    } else {
      h += '<input class="inp" id="pf-' + f.key + '" placeholder="' + esc(f.ph || '') + '"'
         + (f.type ? ' type="' + f.type + '"' : '') + ' value="' + esc(f.val || '') + '">';
    }
  });
  h += '<button class="btn-main" id="pf-ok" style="margin-top:12px">确 定</button>'
     + '<div class="sheet-cancel" id="sheet-cancel">取消</div></div>';
  $('sheet').innerHTML = h;
  $('sheet').classList.add('show'); $('mask').classList.add('show');
  $('sheet-cancel').onclick = closeSheet;
  $('pf-ok').onclick = function () {
    var d = {};
    var bad = null;
    fields.forEach(function (f) {
      var el = $('pf-' + f.key);
      if (f.type === 'file') {
        d[f.key] = (el && el.files && el.files[0]) ? el.files[0] : '';
        if (f.required && !d[f.key] && !bad) bad = f;
      } else {
        d[f.key] = el ? el.value : '';
        if (f.required && !String(d[f.key] || '').trim() && !bad) bad = f;
      }
    });
    if (bad) { toast('请填写' + (bad.ph || bad.key)); return; }
    closeSheet();
    onOk(d);
  };
}

/* ============================================================
 *  登录
 * ============================================================ */
function gotoLogin() { go('login'); }
window.App = { gotoLogin: gotoLogin };

function afterLogin(u) {
  API.setSession(S.token, u);
  try { localStorage.setItem('xjk_lastuser', u.username || ''); } catch (e) {}
  stack = []; curTab = 'chats'; setTab('chats');
  go('chats', { load: loadChats });
  loadMe();
}
/* 登录页回填上次账号 */
(function () {
  try {
    var lu = localStorage.getItem('xjk_lastuser') || '';
    if (lu && $('lg-user')) $('lg-user').value = lu;
  } catch (e) {}
})();

$('lg-btn').onclick = function () {
  var u = $('lg-user').value.trim(), p = $('lg-pass').value.trim();
  if (!u || !p) { $('lg-tip').textContent = '请输入用户名和密码'; return; }
  $('lg-tip').textContent = '';
  API.req('/api/auth/login', { data: { username: u, password: p }, loadingText: '登录中…' })
    .then(function (r) {
      S.token = r.token;
      /* 自动登录：勾选后保存密码，下次启动自动登录；未勾选也保留 token 免登录 */
      var keep = $('lg-keep');
      if (keep && keep.checked) {
        try { localStorage.setItem('xjk_autopw', p); } catch (e) {}
      } else {
        try { localStorage.removeItem('xjk_autopw'); } catch (e) {}
      }
      afterLogin(r.user);
    })
    .catch(function (e) { $('lg-tip').textContent = e.msg || '登录失败'; });
};
/* 自动登录：有账号密码就直接登，不再显示登录页 */
function tryAutoLogin() {
  var u = ''; try { u = localStorage.getItem('xjk_lastuser') || ''; } catch (e) {}
  var pw = ''; try { pw = localStorage.getItem('xjk_autopw') || ''; } catch (e) {}
  if (!u || !pw) return false;
  API.req('/api/auth/login', { data: { username: u, password: pw }, silent: true })
    .then(function (r) { S.token = r.token; afterLogin(r.user); })
    .catch(function () { /* 自动登录失败就留在登录页，不影响手动登录 */ });
  return true;
}
$('lg-reg').onclick = function () {
  promptSheet('注册账号', [
    { key: 'username', ph: '用户名（2-32位）' },
    { key: 'password', ph: '密码（至少6位）', type: 'password' }
  ], function (d) {
    API.req('/api/auth/register', { data: d, loadingText: '注册中…' })
      .then(function (r) { S.token = r.token; afterLogin(r.user); toast('注册成功'); })
      .catch(function (e) { toast(e.msg || '注册失败'); });
  });
};
$('lg-srv').onclick = function () {
  promptSheet('服务器地址', [{ key: 'base', ph: 'http://192.168.1.8:5001', val: S.base }], function (d) {
    S.base = (d.base || '').trim().replace(/\/+$/, '') || S.base;
    API.save();
    toast('已保存：' + S.base);
  });
};

/* ============================================================
 *  消息列表
 * ============================================================ */
function loadChats() {
  var box = $('chats-list');
  box.innerHTML = '<div class="skel"><div class="skel-row w80"></div><div class="skel-row w60"></div>'
                + '<div class="skel-row w80"></div></div>';
  API.get('/api/chat/rooms').then(function (r) {
    var items = r.items || [];
    if (!items.length) { box.innerHTML = '<div class="empty">暂无会话<br><span style="font-size:13px">点右上角 ＋ 发起聊天</span></div>'; return; }
    items.sort(function (a, b) { return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0); });
    var h = '';
    items.forEach(function (c) {
      h += '<div class="chat-item" data-rid="' + c.id + '">'
         + '<div class="msg-ava">' + AV(c.avatar)
         + (c.unread > 0 ? '<span class="badge">' + (c.unread > 99 ? '99+' : c.unread) + '</span>' : '') + '</div>'
         + '<div class="chat-mid">'
         + '<div class="chat-name">' + esc(c.name) + (c.muted ? ' <span style="font-size:11px;color:#b2b2b2">🔇</span>' : '') + '</div>'
         + '<div class="chat-preview">' + (c.pinned ? '<span style="color:#fa9d3b">[置顶]</span> ' : '') + esc(c.last_text || '暂无消息') + '</div>'
         + '</div><div class="chat-right"><div class="chat-time">' + esc(c.last_time || '') + '</div></div></div>';
    });
    box.innerHTML = h;
  }).catch(function (e) {
    box.innerHTML = '<div class="empty"><div class="empty-ico">⚠️</div>'
      + '<div class="empty-t">加载失败</div>'
      + '<div class="empty-d">' + esc((e && e.msg) || '请检查服务器地址') + '</div>'
      + '<button class="btn-retry" id="chats-retry">重新加载</button></div>';
    var b = document.getElementById('chats-retry');
    if (b) b.onclick = loadChats;
  });
}
$('chats-new').onclick = function () {
  sheet([
    { text: '按用户名找人聊', fn: function () { chatByUsername(); } },
    { text: '从通讯录选人聊', fn: function () { pickUser('single'); } },
    { text: '创建群聊', fn: function () { pickUser('multi'); } }
  ]);
};

/* ---------- 按用户名发起私聊：与网站同一账号、同一份聊天记录 ---------- */
function chatByUsername() {
  promptSheet('按用户名发起私聊', [
    { key: 'username', ph: '输入对方用户名，如 admin', required: true }
  ], function (d) {
    var uname = (d.username || '').trim();
    if (!uname) return;
    API.req('/api/chat/with/' + encodeURIComponent(uname), { method: 'POST', loadingText: '查找中…' })
      .then(function (r) {
        toast(r.msg || ('已找到 ' + uname));
        openChat(r.room_id);
      })
      .catch(function (e) { toast(e.msg || '找不到这个用户'); });
  });
}

var selIds = [];
var pickMode = 'single';
function pickUser(mode) {
  selIds = []; pickMode = mode || 'single';
  var multi = pickMode === 'multi';
  /* 关键：用 push 进栈，返回时才有上一层可回 */
  push('pick', multi ? '选择群成员' : '选择联系人', function () {
    API.get('/api/users').then(function (r) {
      var h = '';
      (r.items || []).forEach(function (u) {
        if (S.me && u.id === S.me.id) return;
        h += '<div class="cell" data-uid="' + u.id + '">' + AV(u.avatar, '')
           + '<span class="cell-txt">' + esc(u.name || u.username)
           + ' <span style="color:#b2b2b2;font-size:12px">ID:' + esc(u.username) + '</span></span>'
           + '<span class="cell-arrow pick-tick">✓</span></div>';
      });
      if (!h) h = '<div class="empty">还没有其他用户</div>';
      $('sub-body').innerHTML = h;
      var top = stack[stack.length - 1];
      if (top) {
        top.act = multi ? '确定(0)' : '';
        top.actFn = function () { doCreateRoom(); };
        renderSub();
      }
      $('sub-body').onclick = function (e) {
        var c = e.target.closest('.cell'); if (!c) return;
        var uid = +c.getAttribute('data-uid');
        var i = selIds.indexOf(uid);
        if (i >= 0) { selIds.splice(i, 1); c.classList.remove('picked'); }
        else { selIds.push(uid); c.classList.add('picked'); }
        if (multi) {
          if (top) { top.act = '确定(' + selIds.length + ')'; renderSub(); }
        } else if (selIds.length) {
          doCreateRoom();
        }
      };
    }).catch(function (e) {
      $('sub-body').innerHTML = '<div class="empty">' + esc((e && e.msg) || '加载失败') + '</div>';
    });
  });
}
function doCreateRoom() {
  if (!selIds.length) { toast('请先选择联系人'); return; }
  var multi = pickMode === 'multi';
  var payload;
  if (multi) {
    payload = { kind: 'group', name: '群聊(' + (selIds.length + 1) + ')', user_ids: selIds };
  } else {
    payload = { kind: 'private', user_id: selIds[0] };
  }
  API.req('/api/chat/create', { data: payload, loadingText: '创建中…' })
    .then(function (r) {
      /* 只弹掉"选人"这一层，不再清空整个栈，返回键行为才正常 */
      if (stack.length && stack[stack.length - 1].name === 'pick') stack.pop();
      var rid = r.room_id || r.id;
      toast(multi ? '群聊已创建' : (r.existed ? '已进入会话' : '会话已创建'));
      openChat(rid);
    })
    .catch(function (e) { toast(e.msg || '创建失败'); });
}
function back2() { stack.pop(); }
document.addEventListener('click', function (e) {
  var it = e.target.closest ? e.target.closest('.chat-item') : null;
  if (it) openChat(+it.getAttribute('data-rid'));
});

/* ============================================================
 *  聊天室
 * ============================================================ */
var curRoom = null, curMsgs = [], replyTo = null;
function openChat(rid) {
  curRoom = rid; replyTo = null;
  go('chat');
  $('chat-body').innerHTML = '<div class="skel"><div class="skel-row w60"></div><div class="skel-row w80"></div></div>';
  API.req('/api/chat/rooms/' + rid + '/read', { method: 'POST', silent: true }).catch(function () {});
  API.get('/api/chat/rooms/' + rid + '/messages').then(function (r) {
    curMsgs = r.items || [];
    var room = r.room || {};
    $('chat-title').textContent = room.name || '聊天';
    renderMsgs();
    var b = $('chat-body'); b.scrollTop = b.scrollHeight;
  }).catch(function () { $('chat-body').innerHTML = '<div class="empty">加载失败</div>'; });
}
function renderMsgs() {
  var h = '';
  curMsgs.forEach(function (m) {
    var mine = m.sender_id === (S.me && S.me.id);
    var h2 = '';
    if (m.recalled) {
      h += '<div class="msg-row" style="justify-content:center"><span style="font-size:12px;color:#b2b2b2">'
         + (mine ? '你撤回了一条消息' : '对方撤回了一条消息') + '</span></div>';
      return;
    }
    if (m.reply_to_content) {
      h2 += '<div class="msg-quote" style="font-size:12px;color:#888;border-left:2px solid #ccc;padding-left:6px;margin-bottom:4px">'
          + esc(m.reply_to_content) + '</div>';
    }
    var body = m.kind === 'image'
      ? '<img class="bubble-img" src="' + IMG(m.image) + '" style="max-width:150px;border-radius:6px">'
      : esc(m.content);
    var reacts = '';
    if (m.reacts) {
      reacts = '<div class="reacts">';
      for (var k in m.reacts) {
        var rc = m.reacts[k];
        reacts += '<span class="react-chip' + (rc.mine ? ' on' : '') + '" data-mid="' + m.id + '" data-e="' + esc(rc.emoji) + '">'
                + esc(rc.emoji) + ' ' + rc.count + '</span>';
      }
      reacts += '</div>';
    }
    h += '<div class="msg-row' + (mine ? ' mine' : '') + '" data-mid="' + m.id + '">'
       + (mine ? '' : AV(m.sender_avatar))
       + '<div class="msg-col">'
       + (mine ? '' : '<div class="msg-name">' + esc(m.sender_name) + '</div>')
       + '<div class="bubble">' + h2 + body + '</div>' + reacts
       + '</div>' + (mine ? AV(m.sender_avatar) : '') + '</div>';
  });
  $('chat-body').innerHTML = h || '<div class="empty">还没有消息</div>';
}
$('chat-back').onclick = function () { curRoom = null; go('chats', { load: loadChats }); };
$('chat-more').onclick = function () {
  sheet([
    { text: '置顶 / 取消置顶', fn: function () { setRoom('pinned'); } },
    { text: '消息免打扰', fn: function () { setRoom('muted'); } },
    { text: '群公告', fn: function () { setNotice(); } },
    { text: '邀请成员', fn: function () { pickUser(function () { invite(); }); } },
    { text: '退出会话', fn: function () { leaveRoom(); } }
  ]);
};
function setRoom(k) {
  var v = {}; v[k] = true;
  API.req('/api/chat/rooms/' + curRoom + '/setting', { data: v, loadingText: '设置中…' })
    .then(function (r) { toast('已' + ((r.pinned || r.muted) ? '开启' : '关闭')); openChat(curRoom); })
    .catch(function (e) { toast(e.msg || '失败'); });
}
function setNotice() {
  promptSheet('群公告', [{ key: 'notice', ph: '输入公告内容' }], function (d) {
    API.req('/api/chat/rooms/' + curRoom + '/notice', { data: d, loadingText: '保存中…' })
      .then(function () { toast('公告已更新'); }).catch(function (e) { toast(e.msg); });
  });
}
function invite() {
  API.req('/api/chat/rooms/' + curRoom + '/invite', { data: { user_ids: selIds }, loadingText: '邀请中…' })
    .then(function () { toast('已邀请'); }).catch(function (e) { toast(e.msg); });
}
function leaveRoom() {
  API.req('/api/chat/rooms/' + curRoom + '/leave', { method: 'POST', loadingText: '处理中…' })
    .then(function () { toast('已退出'); go('chats', { load: loadChats }); })
    .catch(function (e) { toast(e.msg); });
}
function sendMsg(content, kind, image) {
  if (!curRoom) return;
  var d = { content: content || '', kind: kind || 'text' };
  if (image) d.image = image;
  if (replyTo) { d.reply_to = replyTo; replyTo = null; }
  API.req('/api/chat/rooms/' + curRoom + '/send', { data: d, silent: true })
    .then(function () { $('ci-text').value = ''; openChat(curRoom); })
    .catch(function (e) { toast(e.msg || '发送失败'); });
}
$('ci-send').onclick = function () {
  var t = $('ci-text').value.trim();
  if (!t) return;
  sendMsg(t);
};
$('ci-text').addEventListener('keypress', function (e) {
  if (e.key === 'Enter') $('ci-send').click();
});
$('ci-img').onclick = function () { $('ci-file').click(); };
$('ci-file').onchange = function () {
  var f = this.files[0]; if (!f) return;
  API.upload(f, {}, 'file', '发送图片…').then(function (r) {
    sendMsg('', 'image', r.filename);
  }).catch(function (e) { toast(e.msg || '上传失败'); });
  this.value = '';
};
var EMOJIS = ['😀','😂','🥰','😍','🤔','😅','😭','😡','👍','👏','🙏','💪','🎉','❤️','🔥','⭐','🌙','📚','✍️','💡'];
$('ci-emoji').onclick = function () {
  var p = $('emoji-panel');
  if (p.classList.contains('show')) { p.classList.remove('show'); return; }
  var h = '<div class="emoji-grid">';
  EMOJIS.forEach(function (e) { h += '<span class="emoji-item" data-e="' + e + '">' + e + '</span>'; });
  p.innerHTML = h + '</div>';
  p.classList.add('show');
  p.onclick = function (ev) {
    var s = ev.target.closest('.emoji-item');
    if (!s) return;
    var m = curMsgs.slice(-1)[0];
    if (m && !m.recalled) {
      API.req('/api/chat/rooms/' + curRoom + '/react', { data: { message_id: m.id, emoji: s.getAttribute('data-e') }, silent: true })
        .then(function () { openChat(curRoom); });
    }
    p.classList.remove('show');
  };
};
$('chat-body').onclick = function (e) {
  var chip = e.target.closest('.react-chip');
  if (chip) {
    API.req('/api/chat/rooms/' + curRoom + '/react', {
      data: { message_id: +chip.getAttribute('data-mid'), emoji: chip.getAttribute('data-e') }, silent: true
    }).then(function () { openChat(curRoom); });
    return;
  }
  var row = e.target.closest('.msg-row');
  if (!row) return;
  var mid = +row.getAttribute('data-mid');
  var m = curMsgs.filter(function (x) { return x.id === mid; })[0];
  if (!m || m.recalled) return;
  sheet([
    { text: '引用回复', fn: function () { replyTo = mid; toast('已引用，输入内容发送'); } },
    { text: '表情回应', fn: function () {
        sheet(EMOJIS.slice(0, 8).map(function (em) {
          return { text: em, fn: function () {
            API.req('/api/chat/rooms/' + curRoom + '/react', { data: { message_id: mid, emoji: em }, silent: true })
              .then(function () { openChat(curRoom); });
          } };
        }));
    } },
    { text: m.sender_id === S.me.id ? '撤回（2分钟内）' : '复制文本', fn: function () {
        if (m.sender_id === S.me.id) {
          API.req('/api/chat/rooms/' + curRoom + '/recall', { data: { message_id: mid }, loadingText: '撤回中…' })
            .then(function () { openChat(curRoom); }).catch(function (e) { toast(e.msg || '超过2分钟无法撤回'); });
        } else { toast('已复制'); }
    } }
  ]);
};

/* ============================================================
 *  发现
 * ============================================================ */
function loadDiscover() {
  API.get('/api/moments', { offset: 0 }, true).then(function (r) {
    $('dc-moments').innerHTML = momentList(r.items || []);
  }).catch(function () {});
}
function momentList(list) {
  if (!list.length) return '<div class="empty">暂无动态</div>';
  var h = '';
  list.forEach(function (m) {
    var imgs = '';
    (m.images || []).forEach(function (u) {
      imgs += '<img class="moment-img" src="' + IMG(u) + '">';
    });
    var cmts = '';
    (m.comments || []).forEach(function (c) {
      cmts += '<div class="moment-cmt"><b>' + esc(c.author) + '：</b>' + esc(c.content) + '</div>';
    });
    h += '<div class="moment" data-mid="' + m.id + '">'
       + '<div class="moment-head">' + AV(m.author && m.author.avatar, 'moment-ava')
       + '<div><div class="moment-name">' + esc(m.author ? (m.author.name || m.author.username) : '') + '</div>'
       + '<div class="moment-time">' + esc(m.created_at) + '</div></div></div>'
       + '<div class="moment-text">' + esc(m.content) + '</div>'
       + (imgs ? '<div class="moment-imgs">' + imgs + '</div>' : '')
       + '<div class="moment-bar"><span class="mb-btn" data-act="like" data-mid="' + m.id + '">'
       + (m.liked ? '❤️' : '🤍') + ' ' + m.like_count + '</span>'
       + '<span class="mb-btn" data-act="cmt" data-mid="' + m.id + '">💬 评论</span></div>'
       + (cmts ? '<div class="moment-cmts">' + cmts + '</div>' : '')
       + '</div>';
  });
  return h;
}
$('dc-post').onclick = function () {
  promptSheet('发布动态', [{ key: 'content', ph: '此刻的想法…' }], function (d) {
    if (!d.content.trim()) return;
    API.req('/api/moments', { data: { content: d.content }, loadingText: '发布中…' })
      .then(function () { toast('已发布'); loadDiscover(); }).catch(function (e) { toast(e.msg); });
  });
};
document.addEventListener('click', function (e) {
  var b = e.target.closest ? e.target.closest('.mb-btn') : null;
  if (!b) return;
  var mid = +b.getAttribute('data-mid'), act = b.getAttribute('data-act');
  if (act === 'like') {
    API.req('/api/moments/' + mid + '/like', { method: 'POST', silent: true })
      .then(function () { loadDiscover(); });
  } else {
    promptSheet('写评论', [{ key: 'content', ph: '说点什么…' }], function (d) {
      API.req('/api/moments/' + mid + '/comment', { data: d, loadingText: '发送中…' })
        .then(function () { loadDiscover(); }).catch(function (e) { toast(e.msg); });
    });
  }
});
document.addEventListener('click', function (e) {
  var c = e.target.closest ? e.target.closest('[data-go]') : null;
  if (!c) return;
  var t = c.getAttribute('data-go');
  if (t === 'moments') push('moments', '动态', function () { loadMomentsPage(); },
    { act: '发动态', actFn: writeMoment });
  else if (t === 'articles') openArticles();
  else if (t === 'novels') openNovels();
  else if (t === 'forum') openForum();
});

/* ---------- 文库 ---------- */
function openArticles() {
  /* act/actFn 交给 push，按钮才会真正显示（之前被 visibility:hidden 挡住） */
  push('articles', '文库', function () {
    API.get('/api/articles', { offset: 0 }, true).then(function (r) {
      var h = '';
      (r.items || []).forEach(function (a) {
        h += '<div class="list-item" data-aid="' + a.id + '">'
           + '<div class="list-title">' + esc(a.title) + '</div>'
           + '<div class="list-sub">' + esc(a.category) + ' · ' + esc(a.author ? a.author.name : '')
           + ' · ' + a.views + ' 阅读</div></div>';
      });
      $('sub-body').innerHTML = h || '<div class="empty">暂无文章，点右上角"写文章"发布</div>';
      var top = stack[stack.length - 1];
      if (top && !top.act) { top.act = '写文章'; top.actFn = writeArticle; renderSub(); }
    }).catch(function (e) {
      $('sub-body').innerHTML = '<div class="empty">' + esc((e && e.msg) || '加载失败') + '</div>';
    });
  }, { act: '写文章', actFn: function () { writeArticle(); } });
}
document.addEventListener('click', function (e) {
  var it = e.target.closest ? e.target.closest('[data-aid]') : null;
  if (it && !it.getAttribute('data-go')) openArticle(+it.getAttribute('data-aid'));
});
function openArticle(aid) {
  push('article', '文章', function () {
    API.get('/api/articles/' + aid, null, true).then(function (r) {
      var a = r.article;
      $('sub-body').innerHTML =
        '<div class="article-hd"><h2>' + esc(a.title) + '</h2>'
        + '<div class="article-meta">' + esc(a.author ? a.author.name : '') + ' · ' + esc(a.created_at) + '</div></div>'
        + '<div class="article-body">' + esc(a.content).replace(/\n/g, '<br>') + '</div>';
      $('sub-act').textContent = '下载';
      $('sub-act').onclick = function () { dl(a.title + '.txt', a.content || ''); };
    });
  });
}
function dl(name, text) {
  var b = new Blob([text], { type: 'text/plain;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name; a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
}
function writeArticle() {
  API.get('/api/categories', null, true).then(function (cr) {
    var opts = (cr.items || []).map(function (c) { return { value: c.id, text: c.name }; });
    if (!opts.length) opts = [{ value: '', text: '未分类' }];
    promptSheet('写文章', [
      { key: 'title', ph: '标题', required: true },
      { key: 'category_id', ph: '分类', type: 'select', options: opts,
        val: opts[0].value },
      { key: 'summary', ph: '摘要（可选）', type: 'textarea', rows: 2 },
      { key: 'content', ph: '正文', type: 'textarea', rows: 8, required: true },
      { key: 'cover', ph: '封面图（可选）', type: 'file' }
    ], function (d) {
      if (!String(d.title || '').trim() || !String(d.content || '').trim()) {
        toast('标题和正文不能为空'); return;
      }
      var f = document.getElementById('pf-cover');
      var file = (f && f.files && f.files[0]) ? f.files[0] : null;
      function post(coverName) {
        var payload = { title: d.title, content: d.content,
                        summary: d.summary || '', category_id: d.category_id || '' };
        if (coverName) payload.cover = coverName;
        API.req('/api/articles', { data: payload, loadingText: '发布中…' })
          .then(function () { toast('已发布'); reloadSub(); })
          .catch(function (e) { toast(e.msg || '发布失败'); });
      }
      if (file) {
        API.upload(file, {}, 'cover', '封面上传中…')
          .then(function (r) { post(r.filename || ''); })
          .catch(function (e) { toast(e.msg || '封面上传失败'); });
      } else {
        post('');
      }
    });
  }).catch(function () {
    toast('分类加载失败');
  });
}

/* ---------- 小说 ---------- */
function loadMomentsPage() {
  API.get('/api/moments', { offset: 0 }, true).then(function (r) {
    $('sub-body').innerHTML = momentList(r.items || []);
  }).catch(function (e) {
    $('sub-body').innerHTML = '<div class="empty">' + esc((e && e.msg) || '加载失败') + '</div>';
  });
}
function writeMoment() {
  promptSheet('发动态', [{ key: 'content', ph: '说点什么…', type: 'textarea', rows: 4, required: true }],
    function (d) {
      API.req('/api/moments', { data: { content: d.content }, loadingText: '发布中…' })
        .then(function () { toast('已发布'); loadMomentsPage(); })
        .catch(function (e) { toast(e.msg || '发布失败'); });
    });
}

function openNovels() {
  push('novels', '小说连载', function () {
    API.get('/api/novels', null, true).then(function (r) {
      var h = '';
      (r.items || []).forEach(function (n) {
        h += '<div class="list-item" data-nid="' + n.id + '">'
           + '<div class="list-title">' + esc(n.title) + '</div>'
           + '<div class="list-sub">' + esc(n.author_name) + ' · ' + n.chapter_count + ' 章 · ' + esc(n.status_cn || n.status) + '</div></div>';
      });
      $('sub-body').innerHTML = h || '<div class="empty">暂无小说</div>';
    }).catch(function (e) {
      $('sub-body').innerHTML = '<div class="empty">' + esc((e && e.msg) || '加载失败') + '</div>';
    });
  }, { act: '写小说', actFn: writeNovel });
}
function writeNovel() {
  API.get('/api/novel-categories', null, true).then(function (r) {
    var opts = (r.items || []).map(function (c) { return { value: c.id, text: c.name }; });
    promptSheet('新建小说', [
      { key: 'title', ph: '小说标题', required: true },
      { key: 'intro', ph: '作品简介', type: 'textarea', rows: 3 },
      { key: 'category_id', ph: '分区', type: 'select', options: opts,
        val: opts.length ? opts[0].value : '' },
      { key: 'status', ph: '状态', type: 'select',
        options: [{ value: 'serializing', text: '连载中' }, { value: 'finished', text: '已完结' }],
        val: 'serializing' }
    ], function (d) {
      API.req('/api/novels', { data: d, loadingText: '创建中…' })
        .then(function (r) { toast('已创建'); openNovel(r.novel_id); })
        .catch(function (e) { toast(e.msg || '创建失败'); });
    });
  });
}
document.addEventListener('click', function (e) {
  var it = e.target.closest ? e.target.closest('[data-nid]') : null;
  if (it) openNovel(+it.getAttribute('data-nid'));
});
function openNovel(nid) {
  push('novel', '小说', function () {
    API.get('/api/novels/' + nid, null, true).then(function (r) {
      var n = r.novel, h = '<div class="article-hd"><h2>' + esc(n.title) + '</h2>'
        + '<div class="article-meta">' + esc(n.author_name) + ' · ' + esc(n.status_cn || n.status) + '</div>'
        + '<p class="novel-intro">' + esc(n.intro || n.summary || '暂无简介') + '</p></div>'
        + '<div class="sec-title">目录（' + ((n.chapters || []).length) + ' 章）</div>';
      if (!(n.chapters || []).length) h += '<div class="empty">还没有章节</div>';
      (n.chapters || []).forEach(function (c) {
        h += '<div class="list-item" data-cid="' + c.id + '"><div class="list-title">' + esc(c.title) + '</div>'
           + '<div class="list-sub">' + (c.words || 0) + ' 字 · ' + esc(c.created_at || '') + '</div></div>';
      });
      $('sub-body').innerHTML = h;
      // 作者本人可写章节
      if (n.author_id && S.me && n.author_id === S.me.id) {
        var top = stack[stack.length - 1];
        if (top) { top.act = '写章节'; top.actFn = function () { writeChapter(nid); }; renderSub(); }
      }
    }).catch(function (e) {
      $('sub-body').innerHTML = '<div class="empty">' + esc((e && e.msg) || '加载失败') + '</div>';
    });
  });
}
function writeChapter(nid) {
  promptSheet('写章节', [
    { key: 'title', ph: '章节标题', required: true },
    { key: 'content', ph: '正文', type: 'textarea', rows: 8, required: true }
  ], function (d) {
    API.req('/api/novels/' + nid + '/chapters', { data: d, loadingText: '发布中…' })
      .then(function (r) { toast('已发布'); openChapter(r.chapter_id); })
      .catch(function (e) { toast(e.msg || '发布失败'); });
  });
}
document.addEventListener('click', function (e) {
  var it = e.target.closest ? e.target.closest('[data-cid]') : null;
  if (it) openChapter(+it.getAttribute('data-cid'));
});
function openChapter(cid) {
  push('chapter', '章节', function () {
    API.get('/api/chapters/' + cid, null, true).then(function (r) {
      var c = r.chapter;
      $('sub-body').innerHTML =
        '<div class="article-hd"><h2>' + esc(c.title) + '</h2>'
        + '<div class="article-meta">' + esc(c.novel_title) + '</div></div>'
        + '<div class="article-body">' + esc(c.content).replace(/\n/g, '<br>') + '</div>'
        + '<div class="chapter-nav">'
        + (c.prev_id ? '<button class="btn-main" data-pcid="' + c.prev_id + '">上一章</button>' : '<span></span>')
        + (c.next_id ? '<button class="btn-main" data-pcid="' + c.next_id + '">下一章</button>' : '<span></span>')
        + '</div>';
    });
  });
}
document.addEventListener('click', function (e) {
  var it = e.target.closest ? e.target.closest('[data-pcid]') : null;
  if (it) openChapter(+it.getAttribute('data-pcid'));
});

/* ---------- 论坛 ---------- */
function writeThread() {
  API.get('/api/boards', null, true).then(function (br) {
    var boards = br.items || [];
    if (!boards.length) { toast('还没有板块，请先在网站创建'); return; }
    if (boards.length === 1) { threadForm(boards[0]); return; }
    sheet(boards.map(function (b) {
      return { text: b.name, fn: function () { threadForm(b); } };
    }));
  }).catch(function () { toast('板块加载失败'); });
}
function threadForm(b) {
  promptSheet('发帖 · ' + b.name, [
    { key: 'title', ph: '标题', required: true },
    { key: 'content', ph: '正文', type: 'textarea', rows: 8, required: true }
  ], function (d) {
    d.board_id = b.id;
    API.req('/api/threads', { data: d, loadingText: '发布中…' })
      .then(function () { toast('已发布'); reloadSub(); })
      .catch(function (e) { toast(e.msg || '发布失败'); });
  });
}
function openForum() {
  push('forum', '论坛', function () {
    API.get('/api/threads', { offset: 0 }, true).then(function (r) {
      var h = '';
      (r.items || []).forEach(function (t) {
        h += '<div class="list-item" data-tid="' + t.id + '">'
           + '<div class="list-title">' + (t.pinned ? '📌 ' : '') + esc(t.title) + '</div>'
           + '<div class="list-sub">' + esc(t.board) + ' · ' + esc(t.author ? t.author.name : '')
           + ' · ' + t.reply_count + ' 回复</div></div>';
      });
      $('sub-body').innerHTML = h || '<div class="empty">暂无帖子，点右上角"发帖"发一条</div>';
      var top = stack[stack.length - 1];
      if (top && !top.act) { top.act = '发帖'; top.actFn = writeThread; renderSub(); }
    }).catch(function (e) {
      $('sub-body').innerHTML = '<div class="empty">' + esc((e && e.msg) || '加载失败') + '</div>';
    });
  }, { act: '发帖', actFn: function () { writeThread(); } });
}
document.addEventListener('click', function (e) {
  var it = e.target.closest ? e.target.closest('[data-tid]') : null;
  if (it) openThread(+it.getAttribute('data-tid'));
});
function openThread(tid) {
  push('thread', '帖子', function () {
    API.get('/api/threads/' + tid, null, true).then(function (r) {
      var t = r.thread, h = '<div class="article-hd"><h2>' + esc(t.title) + '</h2>'
        + '<div class="article-meta">' + esc(t.board) + ' · ' + esc(t.author ? t.author.name : '') + '</div></div>'
        + '<div class="article-body">' + esc(t.content).replace(/\n/g, '<br>') + '</div>'
        + '<div class="sec-title">回复 ' + t.reply_count + '</div>';
      (t.replies || []).forEach(function (c) {
        h += '<div class="list-item"><div class="list-sub">' + c.floor + '楼 · ' + esc(c.author ? c.author.name : '') + '</div>'
           + '<div style="font-size:15px;line-height:1.6">' + esc(c.content).replace(/\n/g, '<br>') + '</div></div>';
      });
      $('sub-body').innerHTML = h;
      $('sub-act').textContent = '回复';
      $('sub-act').onclick = function () {
        promptSheet('回复', [{ key: 'content', ph: '说点什么…' }], function (d) {
          API.req('/api/threads/' + tid + '/reply', { data: d, loadingText: '发送中…' })
            .then(function () { toast('已回复'); openThread(tid); }).catch(function (e) { toast(e.msg); });
        });
      };
    });
  });
}

/* ============================================================
 *  比赛
 * ============================================================ */
var ctFilter = 'all';
function phaseCls(ph) {
  return ph === 'running' ? 'ph-run' : ph === 'registering' ? 'ph-reg'
       : ph === 'ended' ? 'ph-end' : ph === 'before_start' ? 'ph-wait' : 'ph-none';
}
/* 赛程进度条：初赛 → 预决赛 → 决赛 */
function stageBar(c) {
  var arr = c.stages_done || [];
  if (!arr.length) return '';
  var h = '<div class="stage-bar">';
  arr.forEach(function (st, i) {
    var cls = st.current ? 'st-cur' : (st.done ? 'st-done' : 'st-todo');
    h += '<span class="st ' + cls + '">' + esc(st.name) + '</span>';
    if (i < arr.length - 1) h += '<span class="st-line ' + (st.done ? 'st-done' : '') + '"></span>';
  });
  h += '</div>';
  return h;
}

function loadContests() {
  var box = $('ct-list');
  box.innerHTML = '<div class="skel"><div class="skel-row w80"></div><div class="skel-row w60"></div></div>';
  API.get('/api/contests').then(function (r) {
    var list = r.items || [];
    if (ctFilter !== 'all') list = list.filter(function (c) {
      return (c.stages || []).indexOf(ctFilter) >= 0 || c.stage === ctFilter;
    });
    if (!list.length) { box.innerHTML = '<div class="empty">暂无比赛</div>'; return; }
    var h = '';
    list.forEach(function (c) {
      var stageTxt = (c.cur_stage) ? c.cur_stage
                   : ((c.stages || []).length ? (c.stages[0]) : '');
      h += '<div class="ct-card" data-cid="' + c.id + '">'
         + '<div class="ct-top"><span class="ct-name">' + esc(c.title) + '</span>'
         + '<span class="ct-tag ' + phaseCls(c.phase) + '">' + esc(c.phase_cn || c.status_cn || '') + '</span></div>'
         + '<div class="ct-desc">' + esc((c.description || '').slice(0, 60)) + '</div>'
         + stageBar(c)
         + '<div class="ct-time">报名：' + esc(c.reg_start || '-') + ' ~ ' + esc(c.reg_end || '-') + '</div>'
         + '<div class="ct-time">比赛：' + esc(c.start_at || '-') + ' ~ ' + esc(c.end_at || '-') + '</div>'
         + (c.mine_brief ? '<div class="ct-time" style="color:#07C160">已投稿：' + esc(c.mine_brief.title) + '</div>' : '')
         + '<div class="ct-btns"><span class="ct-btn">' + esc(c.action_label || '查看') + '</span></div>'
         + '</div>';
    });
    box.innerHTML = h;
  }).catch(function () { box.innerHTML = '<div class="empty">加载失败</div>'; });
}
document.addEventListener('click', function (e) {
  var t = e.target.closest ? e.target.closest('.tab') : null;
  if (t && t.parentNode.id === 'ct-tabs') {
    document.querySelectorAll('#ct-tabs .tab').forEach(function (x) { x.classList.remove('on'); });
    t.classList.add('on');
    ctFilter = t.getAttribute('data-st');
    loadContests();
  }
  var c = e.target.closest ? e.target.closest('.ct-card') : null;
  if (c) openContest(+c.getAttribute('data-cid'));
});
$('ct-refresh').onclick = loadContests;

function openContest(cid) {
  push('contest', '比赛', function () {
    API.get('/api/contests/' + cid, null, true).then(function (r) {
      var c = r.contest, h =
        '<div class="ct-card"><div class="ct-top"><span class="ct-name">' + esc(c.title) + '</span>'
        + '<span class="ct-tag ' + phaseCls(c.phase) + '">' + esc(c.phase_cn || c.status_cn || '') + '</span></div>'
        + '<div class="ct-desc">' + esc(c.description || '') + '</div>'
        + stageBar(c)
        + '<div class="ct-time">报名：' + esc(c.reg_start || '-') + ' ~ ' + esc(c.reg_end || '-') + '</div>'
        + '<div class="ct-time">比赛：' + esc(c.start_at || '-') + ' ~ ' + esc(c.end_at || '-') + '</div>'
        + '<div class="ct-time">当前阶段：<b style="color:#07C160">' + esc(c.cur_stage || (c.stages || [])[0] || '未设置') + '</b>'
        + (c.stage_total > 1 ? '（第 ' + Math.max(c.stage_index + 1, 1) + '/' + c.stage_total + ' 阶段）' : '') + '</div>';
      if (c.prize_pool) h += '<div class="ct-time">赏金池：<b style="color:#fa9d3b">' + c.prize_pool + '</b></div>';
      if (c.need_register) {
        h += '<div class="ct-time">报名状态：' + (c.registered
             ? '<b style="color:#07C160">已报名</b>' : '<b style="color:#fa5151">未报名</b>') + '</div>';
      }
      h += '<div class="ct-btns">';
      if (c.can_register && !c.registered) {
        h += '<button class="ct-btn ct-btn-main" id="ct-reg">' + esc(c.action_label || '报名')
           + (c.reg_kind === 'late' && c.late_cost ? '（补报 ' + c.late_cost + ' 积分）' : '') + '</button>';
      }
      h += '<button class="ct-btn" id="ct-act">' + esc(c.mine ? '修改作品' : (c.can_submit ? '参赛投稿' : '投稿')) + '</button>'
         + '</div></div>';
      if (c.mine) {
        h += '<div class="sec-title">我的作品</div><div class="ct-card">'
           + '<div class="ct-top"><span class="ct-name">' + esc(c.mine.title) + '</span></div>'
           + '<div class="ct-time">平均分：' + (c.mine.avg == null ? '待评' : c.mine.avg) + '</div>'
           + (c.mine.rank ? '<div class="ct-time">名次：第 ' + c.mine.rank + ' 名</div>' : '')
           + (c.mine.bounty ? '<div class="ct-time">赏金：' + c.mine.bounty + '</div>' : '')
           + '<div class="ct-btns"><button class="ct-btn" id="ct-edit">修改作品</button></div></div>';
      }
      if ((c.ranking || []).length) {
        h += '<div class="sec-title">排行榜</div>';
        c.ranking.forEach(function (rk) {
          h += '<div class="rank-row"><span class="rank-no">' + rk.rank + '</span>'
             + '<div class="rank-mid"><div class="rank-title">' + esc(rk.title) + '</div>'
             + '<div class="rank-sub">' + esc(rk.author) + ' · ' + rk.judge_count + ' 位评委</div></div>'
             + '<span class="rank-score">' + rk.avg + (rk.bounty ? '<br><span style="font-size:11px;color:#fa9d3b">+' + rk.bounty + '</span>' : '') + '</span></div>';
        });
      }
      $('sub-body').innerHTML = h;
      var rg = $('ct-reg');
      if (rg) rg.onclick = function () {
        API.req('/api/contests/' + cid + '/register', { data: {}, loadingText: '报名中…' })
          .then(function (r) { toast(r.msg || '报名成功'); reloadSub(); })
          .catch(function (e) { toast(e.msg || '报名失败'); });
      };
      $('ct-act').onclick = function () {
        if (!c.can_submit) {
          var why = c.submit_reason;
          if (!why) {
            if (!c.registered && c.need_register) why = '请先在上方点击"' + (c.action_label || '报名') + '"';
            else if (c.phase === 'before_reg') why = '报名尚未开始（' + (c.reg_start || '') + ' 开始）';
            else if (c.phase === 'registering' || c.phase === 'before_start') why = '比赛尚未开始，投稿通道将于 ' + (c.start_at || '') + ' 开放';
            else if (c.phase === 'ended') why = '本场比赛已结束';
            else why = '当前不在投稿时间';
          }
          toast(why); return;
        }
        promptSheet(c.mine ? '修改作品' : '参赛投稿', [
          { key: 'title', ph: '作品标题', val: c.mine ? c.mine.title : '', required: true },
          { key: 'content', ph: '正文', val: c.mine ? c.mine.content : '', type: 'textarea', rows: 8, required: true },
          { key: 'attachment', ph: '附件（图片/文档，可选）', type: 'file',
            accept: 'image/*,.txt,.pdf,.doc,.docx,.zip' }
        ], function (d) {
          function post(attName) {
            var payload = { title: d.title, content: d.content };
            if (attName) payload.attachment = attName;
            API.req('/api/contests/' + cid + '/submit', { data: payload, loadingText: '提交中…' })
              .then(function () { toast('已提交'); reloadSub(); })
              .catch(function (e) { toast(e.msg || '提交失败'); });
          }
          if (d.attachment && d.attachment.size) {
            API.upload(d.attachment, {}, 'file', '附件上传中…')
              .then(function (r) { post(r.filename || ''); })
              .catch(function (e) { toast(e.msg || '附件上传失败'); });
          } else {
            post('');
          }
        });
      };
      var ed = $('ct-edit'); if (ed) ed.onclick = function () { $('ct-act').click(); };
    });
  });
}

/* ============================================================
 *  我
 * ============================================================ */
function loadMe() {
  var box = $('me-body');
  var me = S.me || {};
  box.innerHTML =
    '<div class="me-head">' + AV(me.avatar, 'me-ava') + '</div>'
    + '<div class="me-info"><div class="me-name">' + esc(me.name || me.username || '') + '</div>'
    + '<div class="me-id">ID：' + esc(me.username || '') + '</div>'
    + '<div class="me-bio">' + esc(me.bio || '这个人很懒，什么都没写') + '</div></div>'
    + '<div class="me-stats" id="me-stats"></div>'
    + '<div class="cell-group">'
    + '<div class="cell" data-me="profile"><span class="cell-txt">编辑资料</span><span class="cell-arrow">›</span></div>'
    + '<div class="cell" data-me="points"><span class="cell-txt">我的积分</span><span class="cell-arrow">›</span></div>'
    + '<div class="cell" data-me="mypost"><span class="cell-txt">我的投稿</span><span class="cell-arrow">›</span></div>'
    + '</div>'
    + '<div class="cell-group">'
    + '<div class="cell" data-me="srv"><span class="cell-txt">服务器设置</span><span class="cell-arrow">›</span></div>'
    + '<div class="cell" data-me="logout"><span class="cell-txt" style="color:#fa5151">退出登录</span><span class="cell-arrow">›</span></div>'
    + '</div>';
  API.get('/api/me', null, true).then(function (r) {
    var st = r.stats || {};
    function num() { for (var i = 0; i < arguments.length; i++) { if (arguments[i] != null) return arguments[i]; } return 0; }
    $('me-stats').innerHTML =
      '<div class="me-stat"><b>' + num(st.articles, st.article) + '</b><span>文章</span></div>'
      + '<div class="me-stat"><b>' + num(st.moments, st.moment) + '</b><span>动态</span></div>'
      + '<div class="me-stat"><b>' + num(st.points) + '</b><span>积分</span></div>'
      + '<div class="me-stat"><b>' + num(st.likes, st.like) + '</b><span>获赞</span></div>';
  }).catch(function () {});
}
document.addEventListener('click', function (e) {
  var c = e.target.closest ? e.target.closest('[data-me]') : null;
  if (!c) return;
  var k = c.getAttribute('data-me');
  if (k === 'logout') {
    API.clearSession(); stack = []; curTab = 'chats'; go('login');
  } else if (k === 'srv') {
    promptSheet('服务器地址', [{ key: 'base', ph: 'http://...', val: S.base }], function (d) {
      S.base = (d.base || '').trim().replace(/\/+$/, '') || S.base; API.save(); toast('已保存');
    });
  } else if (k === 'profile') {
    promptSheet('编辑资料', [{ key: 'display_name', ph: '昵称', val: (S.me || {}).name || '' },
      { key: 'bio', ph: '个性签名', val: (S.me || {}).bio || '', type: 'textarea', rows: 3 },
      { key: 'gender', ph: '性别', val: (S.me || {}).gender || '' },
      { key: 'location', ph: '地区', val: (S.me || {}).location || '' }], function (d) {
      API.req('/api/profile', { data: d, loadingText: '保存中…' })
        .then(function (r) { S.me = r.user; API.save(); loadMe(); toast('已保存'); })
        .catch(function (e) { toast(e.msg); });
    });
  } else if (k === 'points') {
    push('points', '我的积分', function () {
      $('sub-body').innerHTML =
        '<div class="empty"><div class="empty-ico">🛠</div>'
        + '<div class="empty-t">积分中心暂未开放</div>'
        + '<div class="empty-d">积分明细、兑换与排行榜正在开发中<br>比赛赏金与投票功能不受影响</div></div>';
    });
  } else if (k === 'mypost') {
    push('mypost', '我的投稿', function () {
      API.get('/api/contests').then(function (r) {
        var h = '', any = false;
        var mine = (r.items || []).filter(function (c) { return c.mine_brief; });
        if (!mine.length) { $('sub-body').innerHTML = '<div class="empty">暂无投稿</div>'; return; }
        h = '';
        mine.forEach(function (c) {
          h += '<div class="list-item" data-cid="' + c.id + '"><div class="list-title">' + esc(c.title) + '</div>'
             + '<div class="list-sub">我的作品：' + esc(c.mine_brief.title) + ' · ' + esc(c.phase_cn || '') + '</div></div>';
        });
        $('sub-body').innerHTML = h;
      }).catch(function (e) {
        $('sub-body').innerHTML = '<div class="empty">' + esc((e && e.msg) || '加载失败') + '</div>';
      });
    });
  }
});
$('me-set').onclick = function () { toast('在下方设置'); };

/* ---------- 返回 ---------- */
$('sub-back').onclick = function () { back(); };

/* ---------- 启动屏控制（本地动画，最迟 1.6s 收起） ---------- */
var splashDone = false;
function hideSplash() {
  if (splashDone) return; splashDone = true;
  var sp = document.getElementById('splash');
  if (sp) { sp.classList.add('hide'); setTimeout(function () { sp.style.display = 'none'; }, 500); }
}
setTimeout(hideSplash, 1600);

/* ---------- 启动 ---------- */
(function boot() {
  /* 关键：先立刻把页面画出来（本地已登录则进消息页，否则登录页），
     绝不等网络请求，避免出现白屏。之后再异步探测服务器。 */
  try {
    if (S.token && S.me) { setTab('chats'); go('chats', { load: loadChats }); tryAutoLogin(); }
    else if (tryAutoLogin()) { setTab('chats'); go('chats', { load: loadChats }); }
    else go('login');
  } catch (e) { go('login'); }
  hideSplash();

  /* 绝对兜底：2.5 秒后若仍无任何页面显示，强制进登录页 */
  setTimeout(function () {
    var any = document.querySelector('.page.show');
    if (!any) { go('login'); hideSplash(); }
  }, 2500);

  /* 异步探测服务器，只更新提示文字，不再决定页面去留 */
  API.get('/api/hello', null, true).then(function () {
    if (S.token) {
      API.get('/api/me', null, true).then(function (r) {
        S.me = r.user; API.save();
        go('chats', { load: loadChats }); loadMe(); loadDiscover(); loadContests();
      }).catch(function () { API.clearSession(); go('login'); });
    }
  }).catch(function () {
    var t = $('lg-tip');
    if (t) t.textContent = '连不上服务器，点下方"服务器设置"';
  });
})();

})();
