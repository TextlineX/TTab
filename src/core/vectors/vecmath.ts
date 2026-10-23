/** 向量运算：归一化、余弦、量化存储、球面 k-means */

export function normalize(v: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

/** 两个已归一化向量的余弦相似度 = 点积 */
export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/** 32 位 FNV-1a 哈希 */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// 量化：Float32 → Int8 + 缩放系数，体积缩小到 1/4，用 base64 存进 storage
// ---------------------------------------------------------------------------
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToB64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

function b64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12)
      | ((B64.indexOf(clean[i + 2] ?? 'A') & 63) << 6) | (B64.indexOf(clean[i + 3] ?? 'A') & 63);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

export function quantize(v: Float32Array): string {
  let max = 0;
  for (let i = 0; i < v.length; i++) max = Math.max(max, Math.abs(v[i]));
  const scale = max / 127 || 1;
  const q = new Int8Array(v.length);
  for (let i = 0; i < v.length; i++) q[i] = Math.round(v[i] / scale);
  return `${scale.toExponential(6)}:${bytesToB64(new Uint8Array(q.buffer))}`;
}

export function dequantize(s: string): Float32Array {
  const i = s.indexOf(':');
  const scale = Number(s.slice(0, i));
  const q = new Int8Array(b64ToBytes(s.slice(i + 1)).buffer);
  const v = new Float32Array(q.length);
  for (let k = 0; k < q.length; k++) v[k] = q[k] * scale;
  return normalize(v);
}

// ---------------------------------------------------------------------------
// 球面 k-means（向量已归一化，用点积当相似度）。确定性初始化，结果稳定。
// ---------------------------------------------------------------------------
export interface KMeansResult {
  assign: Int32Array;
  centroids: Float32Array[];
  /** 每个点到所属中心的相似度 */
  sims: Float32Array;
}

export function kmeans(vecs: Float32Array[], k: number, iterations = 20): KMeansResult {
  const n = vecs.length;
  const dims = vecs[0]?.length || 0;
  k = Math.max(1, Math.min(k, n));
  // k-means++ 的确定性版本：每次选离已有中心最远的点
  const centroids: Float32Array[] = [Float32Array.from(vecs[0])];
  const best = new Float32Array(n).fill(-Infinity);
  while (centroids.length < k) {
    const c = centroids[centroids.length - 1];
    let far = -1, farSim = Infinity;
    for (let i = 0; i < n; i++) {
      best[i] = Math.max(best[i], dot(vecs[i], c));
      if (best[i] < farSim) { farSim = best[i]; far = i; }
    }
    centroids.push(Float32Array.from(vecs[far]));
  }
  const assign = new Int32Array(n).fill(-1);
  const sims = new Float32Array(n);
  for (let it = 0; it < iterations; it++) {
    let changed = 0;
    for (let i = 0; i < n; i++) {
      let bi = 0, bs = -Infinity;
      for (let c = 0; c < k; c++) {
        const s = dot(vecs[i], centroids[c]);
        if (s > bs) { bs = s; bi = c; }
      }
      if (assign[i] !== bi) { assign[i] = bi; changed++; }
      sims[i] = bs;
    }
    if (!changed && it > 0) break;
    for (let c = 0; c < k; c++) {
      const acc = new Float32Array(dims);
      let cnt = 0;
      for (let i = 0; i < n; i++) if (assign[i] === c) { cnt++; for (let d = 0; d < dims; d++) acc[d] += vecs[i][d]; }
      if (cnt) centroids[c] = normalize(acc);
    }
  }
  return { assign, centroids, sims };
}
