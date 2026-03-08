const translations = {
  zh: {
    start: '开始',
    cloud: '词云',
    search: '搜索书签...',
    settings: '控制中心',
    root: '根目录',
    back: '返回',
    gridDynamics: '网格布局',
    maxColumns: '最大列数',
    containerWidth: '容器宽度',
    cloudAesthetics: '词云美学',
    organicTilt: '随机倾斜',
    maxFontSize: '文字上限',
    workspaceRoot: '工作空间',
    changeRoot: '更改默认根目录',
    visualTheme: '视觉主题',
    pureTextMode: '纯文字模式',
    coloredTags: '彩色标签',
    maintenance: '维护',
    clearCache: '清除图标颜色缓存',
    language: '语言设置',
    pickFolder: '选择文件夹作为根目录'
  },
  en: {
    start: 'START',
    cloud: 'CLOUD',
    search: 'Search...',
    settings: 'Control Center',
    root: 'ROOT',
    back: 'Back',
    gridDynamics: 'Grid Dynamics',
    maxColumns: 'Max Columns',
    containerWidth: 'Container Width',
    cloudAesthetics: 'Cloud Aesthetics',
    organicTilt: 'Organic Tilt',
    maxFontSize: 'Max Font Size',
    workspaceRoot: 'Workspace Root',
    changeRoot: 'Change Default Root',
    visualTheme: 'Visual Theme',
    pureTextMode: 'Pure Text Mode',
    coloredTags: 'Colored Tags',
    maintenance: 'Maintenance',
    clearCache: 'Clear Icon Color Cache',
    language: 'Language',
    pickFolder: 'Pick Root Folder'
  }
};

export type Lang = 'zh' | 'en';

export const getTranslation = (lang: string) => {
  let targetLang: Lang = 'en';
  if (lang === 'auto') {
    const browserLang = navigator.language.split('-')[0];
    targetLang = (browserLang === 'zh' ? 'zh' : 'en') as Lang;
  } else {
    targetLang = lang as Lang;
  }
  return translations[targetLang];
};
