import PinyinMatch from 'pinyin-match';

/**
 * 检查中文文本是否匹配拼音首字母查询
 * @param text 中文文本
 * @param query 拼音首字母或中文查询
 * @returns 是否匹配
 */
export function matchPinyin(text: string, query: string): boolean {
  if (!text || !query) return false;
  
  // 如果查询包含中文，直接进行包含匹配
  if (/[\u4e00-\u9fa5]/.test(query)) {
    return text.includes(query);
  }
  
  // 使用 pinyin-match 进行拼音首字母匹配
  try {
    return PinyinMatch.match(text, query) !== false;
  } catch {
    // 如果拼音匹配失败，回退到简单包含匹配
    return text.toLowerCase().includes(query.toLowerCase());
  }
}

/**
 * 判断输入类型
 */
export function getInputType(input: string): 'number' | 'pinyin' | 'chinese' | 'mixed' {
  if (!input) return 'mixed';
  
  const isAllNumbers = /^\d+$/.test(input);
  if (isAllNumbers) return 'number';
  
  const isAllLetters = /^[a-zA-Z]+$/.test(input);
  if (isAllLetters) return 'pinyin';
  
  const hasChinese = /[\u4e00-\u9fa5]/.test(input);
  if (hasChinese) return 'chinese';
  
  return 'mixed';
}
