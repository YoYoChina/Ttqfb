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
var stack = [];
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
function push(name, title, loadFn) {
  stack.push({ name: name });
  $('sub-title').textContent = title || '';
  $('sub-act').textContent = '';
  go('sub');
  skeleton(3);
  if (loadFn) loadFn();
}
function back() {
  if (stack.length) stack.pop();
  go('chats');
  loadChats();
}

/* ---------- 底部 Tab ---------- */
document.addEventListener('click', function (e) {
  var tb = e.target.closest ? e.target.closest('.tb') : null;
  if (tb) {
    var t = tb.getAttribute('data-tab');
    document.querySelectorAll('.tb').forEach(function (x) { x.classList.remove('on'); });
    tb.classList.add('on');
    go(t, { load: t === 'chats' ? loadChats : t === 'me' ? loadMe : t === 'discover' ? loadDiscover : t === 'contest' ? loadContests : null });
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
    h += '<input class="inp" id="pf-' + f.key + '" placeholder="' + esc(f.ph || '') + '"'
       + (f.type ? ' type="' + f.type + '"' : '') + ' value="' + esc(f.val || '') + '">';
  });
  h += '<button class="btn-main" id="pf-ok" style="margin-top:12px">确 定</button>'
     + '<div class="sheet-cancel" id="sheet-cancel">取消</div></div>';
  $('sheet').innerHTML = h;
  $('sheet').classList.add('show'); $('mask').classList.add('show');
  $('sheet-cancel').onclick = closeSheet;
  $('pf-ok').onclick = function () {
    var d = {};
    fields.forEach(function (f) { d[f.key] = $('pf-' + f.key).value; });
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
  document.querySelectorAll('.tb').forEach(function (x) { x.classList.remove('on'); });
  document.querySelector('.tb[data-tab="chats"]').classList.add('on');
  go('chats', { load: loadChats });
  loadMe();
}

$('lg-btn').onclick = function () {
  var u = $('lg-user').value.trim(), p = $('lg-pass').value.trim();
  if (!u || !p) { $('lg-tip').textContent = '请输入用户名和密码'; return; }
  $('lg-tip').textContent = '';
  API.req('/api/auth/login', { data: { username: u, password: p }, loadingText: '登录中…' })
    .then(function (r) {
      S.token = r.token;
      afterLogin(r.user);
    })
    .catch(function (e) { $('lg-tip').textContent = e.msg || '登录失败'; });
};
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
  }).catch(function () { box.innerHTML = '<div class="empty">加载失败，检查服务器</div>'; });
}
$('chats-new').onclick = function () {
  sheet([
    { text: '发起私聊', fn: function () { pickUser(function (u) { createRoom([u.id]); }); } },
    { text: '创建群聊', fn: function () { pickUser(function () { createRoom(selIds); }); } }
  ]);
};
var selIds = [];
function pickUser(cb) {
  selIds = [];
  API.get('/api/users').then(function (r) {
    var h = '<div class="scroll" style="max-height:60vh;overflow:auto">';
    (r.items || []).forEach(function (u) {
      if (u.id === S.me.id) return;
      h += '<div class="cell" data-uid="' + u.id + '">' + AV(u.avatar, '')
         + '<span class="cell-txt">' + esc(u.name || u.username) + '</span><span class="cell-arrow">✓</span></div>';
    });
    h += '</div>';
    $('sub-title').textContent = '选择联系人';
    $('sub-body').innerHTML = h;
    go('sub');
    var multi = cb.toString().indexOf('selIds') >= 0;
    $('sub-body').onclick = function (e) {
      var c = e.target.closest('.cell'); if (!c) return;
      var uid = +c.getAttribute('data-uid');
      var i = selIds.indexOf(uid);
      if (i >= 0) { selIds.splice(i, 1); c.style.opacity = 1; }
      else { selIds.push(uid); c.style.opacity = .5; }
      if (!multi && selIds.length) { back2(); cb({ id: selIds[0] }); }
    };
    $('sub-act').textContent = multi ? '确定' : '';
    $('sub-act').onclick = function () { if (selIds.length) { back2(); cb({ id: selIds[0] }); } };
  });
}
function back2() { stack.pop(); }
function createRoom(ids) {
  var payload = (ids.length > 1)
    ? { kind: 'group', name: '群聊', user_ids: ids }
    : { kind: 'private', user_id: ids[0] };
  API.req('/api/chat/create', { data: payload, loadingText: '创建中…' })
    .then(function (r) { openChat(r.room_id || r.id); })
    .catch(function (e) { toast(e.msg || '创建失败'); });
}
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
  if (t === 'moments') push('moments', '动态', function () {
    API.get('/api/moments', { offset: 0 }, true).then(function (r) {
      $('sub-body').innerHTML = momentList(r.items || []);
    });
  });
  else if (t === 'articles') openArticles();
  else if (t === 'novels') openNovels();
  else if (t === 'forum') openForum();
});

/* ---------- 文库 ---------- */
function openArticles() {
  push('articles', '文库', function () {
    API.get('/api/articles', { offset: 0 }, true).then(function (r) {
      var h = '';
      (r.items || []).forEach(function (a) {
        h += '<div class="list-item" data-aid="' + a.id + '">'
           + '<div class="list-title">' + esc(a.title) + '</div>'
           + '<div class="list-sub">' + esc(a.category) + ' · ' + esc(a.author ? a.author.name : '')
           + ' · ' + a.views + ' 阅读</div></div>';
      });
      $('sub-body').innerHTML = h || '<div class="empty">暂无文章</div>';
      $('sub-act').textContent = '写文章';
      $('sub-act').onclick = writeArticle;
    });
  });
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
  promptSheet('写文章', [{ key: 'title', ph: '标题' }, { key: 'content', ph: '正文' }], function (d) {
    if (!d.title.trim() || !d.content.trim()) { toast('标题和正文不能为空'); return; }
    API.req('/api/articles', { data: d, loadingText: '发布中…' })
      .then(function () { toast('已发布'); openArticles(); }).catch(function (e) { toast(e.msg); });
  });
}

/* ---------- 小说 ---------- */
function openNovels() {
  push('novels', '小说连载', function () {
    API.get('/api/novels', null, true).then(function (r) {
      var h = '';
      (r.items || []).forEach(function (n) {
        h += '<div class="list-item" data-nid="' + n.id + '">'
           + '<div class="list-title">' + esc(n.title) + '</div>'
           + '<div class="list-sub">' + esc(n.author_name) + ' · ' + n.chapter_count + ' 章 · ' + esc(n.status) + '</div></div>';
      });
      $('sub-body').innerHTML = h || '<div class="empty">暂无小说</div>';
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
        + '<div class="article-meta">' + esc(n.author_name) + ' · ' + esc(n.status) + '</div>'
        + '<p style="color:#666;font-size:14px">' + esc(n.intro) + '</p></div><div class="sec-title">目录</div>';
      (n.chapters || []).forEach(function (c) {
        h += '<div class="list-item" data-cid="' + c.id + '"><div class="list-title">' + esc(c.title) + '</div>'
           + '<div class="list-sub">' + c.words + ' 字 · ' + esc(c.created_at) + '</div></div>';
      });
      $('sub-body').innerHTML = h;
    });
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
      $('sub-body').innerHTML = h || '<div class="empty">暂无帖子</div>';
      $('sub-act').textContent = '发帖';
      $('sub-act').onclick = function () {
        API.get('/api/boards', null, true).then(function (br) {
          sheet((br.items || []).map(function (b) {
            return { text: b.name, fn: function () {
              promptSheet('发帖 · ' + b.name, [{ key: 'title', ph: '标题' }, { key: 'content', ph: '正文' }], function (d) {
                d.board_id = b.id;
                API.req('/api/threads', { data: d, loadingText: '发布中…' })
                  .then(function () { toast('已发布'); openForum(); }).catch(function (e) { toast(e.msg); });
              });
            } };
          }));
        });
      };
    });
  });
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
      h += '<div class="ct-card" data-cid="' + c.id + '">'
         + '<div class="ct-top"><span class="ct-name">' + esc(c.title) + '</span>'
         + '<span class="ct-tag">' + esc(c.status_cn || c.phase_cn || '') + '</span></div>'
         + '<div class="ct-desc">' + esc((c.description || '').slice(0, 60)) + '</div>'
         + '<div class="ct-time">报名：' + esc(c.reg_start || '-') + ' ~ ' + esc(c.reg_end || '-') + '</div>'
         + '<div class="ct-time">比赛：' + esc(c.start_at || '-') + ' ~ ' + esc(c.end_at || '-') + '</div>'
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
        + '<span class="ct-tag">' + esc(c.status_cn || c.phase_cn || '') + '</span></div>'
        + '<div class="ct-desc">' + esc(c.description || '') + '</div>'
        + '<div class="ct-time">报名：' + esc(c.reg_start || '-') + ' ~ ' + esc(c.reg_end || '-') + '</div>'
        + '<div class="ct-time">比赛：' + esc(c.start_at || '-') + ' ~ ' + esc(c.end_at || '-') + '</div>'
        + '<div class="ct-time">赛程：' + esc((c.stages || []).join(' → ')) + '</div>';
      if (c.prize_pool) h += '<div class="ct-time">赏金池：' + c.prize_pool + '</div>';
      h += '<div class="ct-btns"><button class="ct-btn" id="ct-act">' + esc(c.action_label || '查看') + '</button></div></div>';
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
      $('ct-act').onclick = function () {
        if (!c.can_submit) { toast('当前不在投稿时间'); return; }
        promptSheet(c.mine ? '修改作品' : '投稿', [{ key: 'title', ph: '作品标题', val: c.mine ? c.mine.title : '' },
          { key: 'content', ph: '正文', val: c.mine ? c.mine.content : '' }], function (d) {
          API.req('/api/contests/' + cid + '/submit', { data: d, loadingText: '提交中…' })
            .then(function () { toast('已提交'); openContest(cid); }).catch(function (e) { toast(e.msg); });
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
    $('me-stats').innerHTML =
      '<div class="me-stat"><b>' + (st.articles || 0) + '</b><span>文章</span></div>'
      + '<div class="me-stat"><b>' + (st.moments || 0) + '</b><span>动态</span></div>'
      + '<div class="me-stat"><b>' + (st.points || 0) + '</b><span>积分</span></div>'
      + '<div class="me-stat"><b>' + (st.likes || 0) + '</b><span>获赞</span></div>';
  }).catch(function () {});
}
document.addEventListener('click', function (e) {
  var c = e.target.closest ? e.target.closest('[data-me]') : null;
  if (!c) return;
  var k = c.getAttribute('data-me');
  if (k === 'logout') {
    API.clearSession(); go('login');
  } else if (k === 'srv') {
    promptSheet('服务器地址', [{ key: 'base', ph: 'http://...', val: S.base }], function (d) {
      S.base = (d.base || '').trim().replace(/\/+$/, '') || S.base; API.save(); toast('已保存');
    });
  } else if (k === 'profile') {
    promptSheet('编辑资料', [{ key: 'display_name', ph: '昵称', val: (S.me || {}).name || '' },
      { key: 'bio', ph: '个性签名', val: (S.me || {}).bio || '' }], function (d) {
      API.req('/api/profile', { data: d, loadingText: '保存中…' })
        .then(function (r) { S.me = r.user; API.save(); loadMe(); toast('已保存'); })
        .catch(function (e) { toast(e.msg); });
    });
  } else if (k === 'points') {
    push('points', '我的积分', function () {
      API.get('/api/points', null, true).then(function (r) {
        var h = '<div class="ct-card"><div class="ct-name">当前积分：' + r.balance + '</div>';
        (r.logs || []).forEach(function (l) {
          h += '<div class="rank-row"><div class="rank-mid"><div class="rank-title">' + esc(l.reason) + '</div>'
             + '<div class="rank-sub">' + esc(l.created_at) + '</div></div>'
             + '<span class="rank-score" style="color:' + (l.delta >= 0 ? '#0ac06e' : '#fa5151') + '">'
             + (l.delta >= 0 ? '+' : '') + l.delta + '</span></div>';
        });
        $('sub-body').innerHTML = h + '</div>';
      });
    });
  } else if (k === 'mypost') {
    push('mypost', '我的投稿', function () {
      API.get('/api/contests').then(function (r) {
        var h = '', any = false;
        (r.items || []).forEach(function (c) {
          if (c.mine) { any = true; }
        });
        if (!any) { $('sub-body').innerHTML = '<div class="empty">暂无投稿</div>'; return; }
        h = '';
        (r.items || []).forEach(function (c) {
          if (!c.mine) return;
          h += '<div class="list-item" data-cid="' + c.id + '"><div class="list-title">' + esc(c.title) + '</div>'
             + '<div class="list-sub">' + esc(c.mine.title) + '</div></div>';
        });
        $('sub-body').innerHTML = h;
      });
    });
  }
});
$('me-set').onclick = function () { toast('在下方设置'); };

/* ---------- 返回 ---------- */
$('sub-back').onclick = function () {
  stack.pop();
  var tab = document.querySelector('.tb.on');
  var t = tab ? tab.getAttribute('data-tab') : 'chats';
  go(t, { load: t === 'chats' ? loadChats : t === 'me' ? loadMe : t === 'discover' ? loadDiscover : t === 'contest' ? loadContests : null });
};

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
    if (S.token && S.me) go('chats', { load: loadChats });
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
