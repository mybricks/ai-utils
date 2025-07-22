/**
 * 修复JSX属性中缺少等号的语法问题
 * 如: layout{...} -> layout={...}
 * @param input 输入的JSX字符串
 * @returns 修复后的JSX字符串
 */
export const fixMissingEqualSignJsx = (input: string): string => {
  try {
    return input
      .replace(/layout\{/g, 'layout={')
      .replace(/data\{/g, 'data={')
      .replace(/styleAry\{/g, 'styleAry={');
  } catch (error) {
    return input;
  }
}