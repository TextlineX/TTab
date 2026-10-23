import React, { useEffect, useRef, useState } from 'react';
import type { CustomWidgetDef, WidgetHost, WidgetSize } from './types';
import { handleRpc } from './sdk/hostApi';
import { getWidgetData, setWidgetData } from './store';
import { fnv1a } from '../core/vectors/vecmath';

interface Props {
  def: CustomWidgetDef;
  instanceId: string;
  size: WidgetSize;
  config: Record<string, unknown>;
  host: WidgetHost;
  onError?: (msg: string) => void;
  /** 变化时重新加载沙箱（工作室的"重新运行"） */
  reloadKey?: number;
}

const THEME_VARS = ['--text', '--muted', '--faint', '--accent', '--accent-text', '--accent-soft', '--on-accent', '--ai', '--warn', '--danger', '--fill-1', '--fill-2', '--line', '--surface', '--panel'];

/** 当前主题：颜色变量 + 明暗（沙箱的 color-scheme 必须和页面一致，否则浏览器会给 iframe 画不透明底色） */
function readTheme() {
  const root = document.documentElement;
  const css = getComputedStyle(root);
  return {
    theme: Object.fromEntries(THEME_VARS.map(v => [v, css.getPropertyValue(v).trim()])),
    scheme: root.dataset.scheme === 'light' ? 'light' : 'dark',
  };
}

/** 在沙箱 iframe 里运行自定义小组件，并作为它与 TTab 之间的唯一通道 */
const WidgetFrame: React.FC<Props> = ({ def, instanceId, size, config, host, onError, reloadKey = 0 }) => {
  const ref = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  // 用 ref 保存最新值，消息处理函数不需要重新绑定
  const latest = useRef({ def, config, size, host, instanceId, onError });
  latest.current = { def, config, size, host, instanceId, onError };

  useEffect(() => {
    const onMessage = async (e: MessageEvent) => {
      const frame = ref.current;
      if (!frame || e.source !== frame.contentWindow) return;
      const m = e.data as { __ttab?: number; type?: string; rpc?: number; method?: string; args?: unknown[]; message?: string };
      if (!m || m.__ttab !== 1) return;
      const { def, config, size, host, instanceId, onError } = latest.current;
      const reply = (msg: Record<string, unknown>) => frame.contentWindow?.postMessage({ __ttab: 1, ...msg }, '*');
      if (m.type === 'ready') {
        sentConfig.current = JSON.stringify(config);
        reply({ type: 'init', def, config, size, ...readTheme(), instanceId });
        setReady(true);
      } else if (m.type === 'error') {
        onError?.(m.message || '出错了');
      } else if (m.rpc && m.method) {
        try {
          const result = await handleRpc({
            def, items: host.items, openUrl: host.openUrl, notify: host.notify,
            getData: () => getWidgetData<Record<string, unknown>>(instanceId),
            setData: v => setWidgetData(instanceId, v),
          }, m.method, Array.isArray(m.args) ? m.args : []);
          reply({ rpc: m.rpc, result });
        } catch (err) {
          reply({ rpc: m.rpc, error: (err as Error).message });
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // 只有配置内容真的变了才通知小组件（父组件每次渲染都会生成新的对象）
  const configJson = JSON.stringify(config);
  const sentConfig = useRef(configJson);
  useEffect(() => {
    if (!ready || sentConfig.current === configJson) return;
    sentConfig.current = configJson;
    ref.current?.contentWindow?.postMessage({ __ttab: 1, type: 'config', config: JSON.parse(configJson) }, '*');
  }, [configJson, ready]);
  const codeHash = fnv1a(`${def.html}\u0000${def.css}\u0000${def.js}`);
  useEffect(() => { if (ready) ref.current?.contentWindow?.postMessage({ __ttab: 1, type: 'size', size }, '*'); }, [size, ready]);

  // 主题变化（换强调色、切换明暗）时同步给小组件
  useEffect(() => {
    if (!ready) return;
    const ob = new MutationObserver(() => ref.current?.contentWindow?.postMessage({ __ttab: 1, type: 'theme', ...readTheme() }, '*'));
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-scheme'] });
    return () => ob.disconnect();
  }, [ready]);
  const scheme = typeof document !== 'undefined' && document.documentElement.dataset.scheme === 'light' ? 'light' : 'dark';

  return (
    <iframe
      ref={ref}
      // 代码变化时重新加载沙箱
      key={`${def.id}@${def.version}#${codeHash}:${reloadKey}`}
      src={`widget-sandbox.html#${scheme}`}
      sandbox="allow-scripts allow-forms"
      title={def.name}
      className="w-full h-full border-0 bg-transparent"
      style={{ colorScheme: scheme }}
    />
  );
};

export default WidgetFrame;
