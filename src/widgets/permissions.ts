/** 申请网站访问权限（必须在点击事件中同步调用）；非扩展环境直接视为允许 */
export function requestOrigins(origins: string[]): Promise<boolean> {
  if (!origins.length || typeof chrome === 'undefined' || !chrome.permissions?.request) return Promise.resolve(true);
  return chrome.permissions.request({ origins }).catch(() => false);
}
