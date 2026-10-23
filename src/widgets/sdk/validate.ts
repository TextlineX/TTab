/** 校验自定义小组件定义（导入文件、工作室保存时使用） */
import { WIDGET_FILE_FORMAT, type ConfigField, type CustomWidgetDef, type WidgetPermission, type WidgetSize } from '../types';

const SIZES: WidgetSize[] = ['s', 'm', 'l', 'w'];
const MAX_CODE = 200 * 1024;
const HOST_RE = /^(\*\.)?([a-z0-9-]+\.)+[a-z]{2,}$|^localhost(:\d+)?$/i;

export function isValidPermission(p: string): p is WidgetPermission {
  if (p === 'bookmarks' || p === 'open' || p === 'storage') return true;
  return p.startsWith('net:') && HOST_RE.test(p.slice(4));
}

export interface ValidationResult { ok: boolean; def?: CustomWidgetDef; errors: string[] }

export function validateWidgetDef(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['不是有效的小组件定义'] };
  const r = raw as Record<string, unknown>;
  const str = (k: string, max: number, required = true) => {
    const v = r[k];
    if (v === undefined || v === null || v === '') { if (required) errors.push(`缺少 ${k}`); return ''; }
    if (typeof v !== 'string') { errors.push(`${k} 必须是文字`); return ''; }
    if (v.length > max) errors.push(`${k} 太长（最多 ${max} 个字符）`);
    return v;
  };
  const id = str('id', 64);
  if (id && !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(id)) errors.push('id 只能包含小写字母、数字、点、下划线和短横线，3~64 个字符');
  const name = str('name', 30);
  const version = str('version', 20, false) || '1.0.0';
  const author = str('author', 40, false);
  const description = str('description', 200, false);
  const html = str('html', MAX_CODE, false);
  const css = str('css', MAX_CODE, false);
  const js = str('js', MAX_CODE, false);
  if (!html && !js) errors.push('html 和 js 至少要有一个');

  const sizes = Array.isArray(r.sizes) ? (r.sizes.filter(s => SIZES.includes(s as WidgetSize)) as WidgetSize[]) : [];
  if (!sizes.length) errors.push('sizes 至少包含 s、m、l、w 中的一个');
  const defaultSize = (SIZES.includes(r.defaultSize as WidgetSize) && sizes.includes(r.defaultSize as WidgetSize) ? r.defaultSize : sizes[0]) as WidgetSize;

  const permissions: WidgetPermission[] = [];
  if (r.permissions !== undefined && !Array.isArray(r.permissions)) errors.push('permissions 必须是数组');
  for (const p of (Array.isArray(r.permissions) ? r.permissions : [])) {
    if (typeof p === 'string' && isValidPermission(p)) { if (!permissions.includes(p)) permissions.push(p); } else errors.push(`不认识的权限：${String(p)}`);
  }

  const config: ConfigField[] = [];
  for (const f of (Array.isArray(r.config) ? r.config : [])) {
    const ff = f as Record<string, unknown>;
    if (typeof ff?.key !== 'string' || !/^[a-zA-Z_][\w]{0,31}$/.test(ff.key) || typeof ff.label !== 'string' || !['text', 'number', 'boolean', 'select'].includes(ff.type as string)) {
      errors.push(`配置项格式不对：${JSON.stringify(f).slice(0, 60)}`);
      continue;
    }
    config.push({
      key: ff.key, label: ff.label.slice(0, 40), type: ff.type as ConfigField['type'],
      options: Array.isArray(ff.options) ? (ff.options as { value: string; label: string }[]).filter(o => typeof o?.value === 'string').map(o => ({ value: o.value, label: String(o.label ?? o.value) })) : undefined,
      default: ff.default as ConfigField['default'],
    });
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, errors, def: { id, name, version, author: author || undefined, description: description || undefined, sizes, defaultSize, permissions, config, html, css, js } };
}

/** 导入：支持带外壳的文件格式，也支持直接是定义对象 */
export function parseWidgetFile(text: string): ValidationResult {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { ok: false, errors: ['文件不是有效的 JSON'] }; }
  const d = data as Record<string, unknown>;
  if (d && d.format === WIDGET_FILE_FORMAT) return validateWidgetDef(d.widget);
  return validateWidgetDef(data);
}

export function exportWidgetFile(def: CustomWidgetDef): string {
  return JSON.stringify({ format: WIDGET_FILE_FORMAT, widget: def }, null, 2);
}

/** 权限的中文说明（安装确认时展示） */
export function describePermission(p: WidgetPermission): string {
  if (p === 'bookmarks') return '读取你的书签（标题、网址、标签，只读）';
  if (p === 'open') return '在浏览器里打开网页';
  if (p === 'storage') return '在本机保存它自己的数据';
  return `访问 ${p.slice(4)}`;
}

/** net 权限对应的浏览器主机权限 */
export function hostPatternsFor(def: Pick<CustomWidgetDef, 'permissions'>): string[] {
  return def.permissions.filter(p => p.startsWith('net:')).flatMap(p => {
    const host = p.slice(4);
    return [`https://${host}/*`, `http://${host}/*`];
  });
}
