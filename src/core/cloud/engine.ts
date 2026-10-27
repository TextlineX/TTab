import type { MetaState } from '../types';
import { cloudRequest, CloudError } from './api';
import { buildPush, chunkPush, mergeRemote, pushSize, type Remote } from './sync';
import { saveCloud, type CloudConfig } from './config';
import { setExtraAliases } from '../normalize';

export interface SyncResult { pushed: number; pulled: number }

/**
 * 一轮同步：先上传自上次以来的本机修改，再按游标拉取其他浏览器的修改。
 * getMeta 取最新本机状态；apply 把云端变化合并进本机（不盖时间戳）。
 */
export async function syncOnce(cfg: CloudConfig, getMeta: () => MetaState, apply: (fn: (s: MetaState) => MetaState) => void): Promise<{ result: SyncResult; cfg: CloudConfig }> {
  const startedAt = Date.now();
  const push = buildPush(getMeta(), cfg.lastPushAt);
  const batches = pushSize(push) ? chunkPush(push) : [{ pages: {}, collections: [], tombstones: {} }];
  let cursor = cfg.cursor;
  let pulled = 0;
  const take = (r: Remote & { cursor: number }) => {
    pulled += Object.keys(r.pages).length + r.collections.length + Object.keys(r.tombstones).length;
    apply(s => mergeRemote(s, r));
    cursor = r.cursor;
  };
  for (const b of batches) {
    let r = await cloudRequest<Remote & { cursor: number; more: boolean }>(cfg, 'POST', '/api/sync', { ...b, cursor });
    take(r);
    while (r.more) {
      r = await cloudRequest<Remote & { cursor: number; more: boolean }>(cfg, 'POST', '/api/sync', { cursor });
      take(r);
    }
  }
  const stamp = { cursor, lastPushAt: startedAt, lastSyncAt: Date.now() };
  await saveCloud(stamp);
  const next = { ...cfg, ...stamp };
  return { result: { pushed: pushSize(push), pulled }, cfg: next };
}

/** 拉取服务器维护的同义词表并生效（管理员改了表，用户不用更新扩展） */
export async function refreshAliases(cfg: CloudConfig): Promise<Record<string, string>> {
  const r = await cloudRequest<{ aliases: Record<string, string> }>(cfg, 'GET', '/api/aliases');
  setExtraAliases(r.aliases);
  await saveCloud({ aliases: r.aliases });
  return r.aliases;
}

export { CloudError };
