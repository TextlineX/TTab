/**
 * TTab 自定义小组件运行时（运行在扩展的沙箱页面里）
 * - 沙箱没有浏览器扩展 API，也不能直接联网，只能通过 window.ttab 向 TTab 请求
 * - 小组件代码以 new Function('ttab', js) 的方式执行
 */
(function () {
  'use strict';
  var pending = {};
  var seq = 0;
  var configListeners = [];
  var sizeListeners = [];
  var booted = false;

  function post(msg) {
    msg.__ttab = 1;
    parent.postMessage(msg, '*');
  }

  function call(method) {
    var args = Array.prototype.slice.call(arguments, 1);
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      pending[id] = { resolve: resolve, reject: reject };
      post({ rpc: id, method: method, args: args });
    });
  }

  var ttab = {
    /** 当前配置（来自小组件定义里的 config 字段，用户可在设置里修改） */
    config: {},
    /** 当前尺寸：s / m / l / w */
    size: 's',
    onConfigChange: function (fn) { configListeners.push(fn); },
    onResize: function (fn) { sizeListeners.push(fn); },
    notify: function (text) { return call('notify', String(text)); },
    open: function (url, background) { return call('open', String(url), !!background); },
    storage: {
      get: function (key) { return call('storage.get', key); },
      set: function (key, value) { return call('storage.set', key, value); }
    },
    bookmarks: {
      search: function (query, limit) { return call('bookmarks.search', query, limit); },
      list: function (options) { return call('bookmarks.list', options || {}); },
      tags: function () { return call('bookmarks.tags'); }
    },
    fetch: function (url, options) { return call('fetch', String(url), options || {}); },
    /** 便捷方法：请求并解析 JSON */
    fetchJSON: function (url, options) {
      return call('fetch', String(url), options || {}).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return JSON.parse(r.text);
      });
    }
  };

  function showError(err) {
    var box = document.getElementById('__ttab_error') || document.createElement('div');
    box.id = '__ttab_error';
    box.textContent = '小组件出错：' + (err && err.message ? err.message : String(err));
    document.body.appendChild(box);
    post({ type: 'error', message: box.textContent });
  }

  window.addEventListener('error', function (e) { showError(e.error || e.message); });
  window.addEventListener('unhandledrejection', function (e) { showError(e.reason); });

  function boot(msg) {
    booted = true;
    var def = msg.def || {};
    ttab.config = msg.config || {};
    ttab.size = msg.size || 's';
    var vars = msg.theme || {};
    Object.keys(vars).forEach(function (k) { document.documentElement.style.setProperty(k, vars[k]); });
    document.documentElement.dataset.size = ttab.size;
    var style = document.createElement('style');
    style.textContent = def.css || '';
    document.head.appendChild(style);
    var root = document.createElement('div');
    root.id = 'app';
    root.style.height = '100%';
    root.innerHTML = def.html || '';
    document.body.appendChild(root);
    window.ttab = ttab;
    try {
      new Function('ttab', '"use strict";\n' + (def.js || ''))(ttab);
    } catch (err) {
      showError(err);
    }
  }

  window.addEventListener('message', function (e) {
    if (e.source !== parent) return;
    var m = e.data;
    if (!m || m.__ttab !== 1) return;
    if (m.type === 'init') {
      if (!booted) boot(m);
    } else if (m.type === 'config') {
      ttab.config = m.config || {};
      configListeners.forEach(function (fn) { try { fn(ttab.config); } catch (err) { showError(err); } });
    } else if (m.type === 'size') {
      ttab.size = m.size;
      document.documentElement.dataset.size = m.size;
      sizeListeners.forEach(function (fn) { try { fn(m.size); } catch (err) { showError(err); } });
    } else if (m.rpc && pending[m.rpc]) {
      var p = pending[m.rpc];
      delete pending[m.rpc];
      if (m.error) p.reject(new Error(m.error)); else p.resolve(m.result);
    }
  });

  post({ type: 'ready' });
})();
