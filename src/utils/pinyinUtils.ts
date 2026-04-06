/**
 * 极简拼音首字母映射工具
 * 用于支持搜索时的拼音匹配（首字母匹配）
 */

const PINYIN_MAP: Record<string, string> = {
  'a': '阿啊呵腌嗄吖',
  'b': '吧把八百办被本不步比并别变表并别部兵病并',
  'c': '才采才参草层查产长常场厂成程吃出处传船次从村才层',
  'd': '大到第地当代带但导等低点电店定度端对多等得点',
  'e': '而二儿耳额饿恩',
  'f': '发法反方分风封夫服复父副分反方分',
  'g': '个各各给更工公共关管光广国过该各个',
  'h': '哈还海汉好号和合何河和黑很红后候花华话回会或合',
  'j': '几及极集级即计记济加家假价件见建间将江讲交教解接节结解今金进近京经旧就举句级即',
  'k': '卡开看可渴克刻客课空口快块看可',
  'l': '拉来蓝老乐离里理力立连联量两列料林临流六龙路里理力',
  'm': '马买卖满慢忙毛每美门们面民明名命么没每',
  'n': '那南难内能你年念宁农弄那南',
  'o': '哦欧偶',
  'p': '怕排旁跑朋皮篇片平评破品平',
  'q': '七期其奇气起前强切亲轻青清情区全权其起',
  'r': '然让热人认任日如入人认',
  's': '三色山商上少设社身深什神声生师失十实使世市示事试视收手守首受书术树数水说四似所上身',
  't': '它台太谈特提题体天田条铁听同通统图土推条天同',
  'w': '外完万王网望位未味问我五武物务万位',
  'x': '西习喜下先现线相详响向项小校些写新心信星行形许序学寻训西先现',
  'y': '压雅亚烟严言岩沿研眼演羊样阳要药耀一医已以议意因音阴银应英影硬用由右于语玉育预原圆远月用以',
  'z': '再在早造则泽怎增战站张章丈照这者真正证知之职直指纸中重种主助住注自总走最作在正知中'
};

/**
 * 获取字符串的拼音首字母串
 */
export function getPinyinInitials(str: string): string {
  let initials = '';
  for (const char of str) {
    let found = false;
    for (const [key, chars] of Object.entries(PINYIN_MAP)) {
      if (chars.includes(char)) {
        initials += key;
        found = true;
        break;
      }
    }
    if (!found) initials += char.toLowerCase();
  }
  return initials;
}

/**
 * 判断搜索词是否匹配字符串（支持原词匹配和拼音首字母匹配）
 */
export function pinyinMatch(text: string, query: string): boolean {
  if (!text || !query) return false;
  const normalizedText = text.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  
  // 1. 原词直接匹配
  if (normalizedText.includes(normalizedQuery)) return true;
  
  // 2. 拼音首字母匹配
  const initials = getPinyinInitials(normalizedText);
  if (initials.includes(normalizedQuery)) return true;
  
  return false;
}
