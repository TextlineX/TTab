const PREMIUM_PALETTE = [
  'rgb(59, 130, 246)', // Blue
  'rgb(139, 92, 246)', // Purple
  'rgb(236, 72, 153)', // Pink
  'rgb(20, 184, 166)', // Teal
  'rgb(245, 158, 11)', // Amber
  'rgb(16, 185, 129)', // Emerald
];

/**
 * 根据图标 URL 提取主色调
 */
export async function extractColorFromIcon(url: string): Promise<string> {
  return new Promise((resolve) => {
    const getRandomColor = () => PREMIUM_PALETTE[Math.floor(Math.random() * PREMIUM_PALETTE.length)];
    
    if (!url || url.includes('default')) return resolve(getRandomColor());

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = url;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve('#3b82f6'); // 默认蓝色

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      
      let r = 0, g = 0, b = 0, count = 0;
      for (let i = 0; i < data.length; i += 4) {
        // 忽略透明像素
        if (data[i + 3] < 128) continue;
        
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
      }

      if (count === 0) return resolve('#3b82f6');

      const avgR = Math.round(r / count);
      const avgG = Math.round(g / count);
      const avgB = Math.round(b / count);

      resolve(`rgb(${avgR}, ${avgG}, ${avgB})`);
    };

    img.onerror = () => {
      resolve('#3b82f6'); // 默认颜色
    };
  });
}

/**
 * 获取 Chrome Favicon 2 API 的 URL
 * @param pageUrl 网页 URL
 * @param size 图标大小
 * @returns 完整的图标 URL
 */
export function getFaviconUrl(pageUrl: string, size: number = 64): string {
  // 浏览器原生支持的 favicon2 API
  return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=${size}`;
}
