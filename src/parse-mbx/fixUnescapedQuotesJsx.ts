/**
 * @description 一个用于解析和修复JSX `data` 属性对象中不规范引号的健壮工具。
 */

/**
 * 解析JSX字符串，以查找并修复在`data`属性对象中未正确转义的引号。
 *
 * @param {string} jsxString 可能包含错误的输入JSX字符串。
 * @returns {string} 一个修复了`data`属性中引号的新JSX字符串。
 */
export function fixUnescapedQuotesJsxDataProps(jsxString: string): string {
  let result: string = '';
  let lastIndex: number = 0;
  const attrRegex: RegExp = /\bdata\s*=/g;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(jsxString)) !== null) {
    let expressionStartIndex: number = -1;
    for (let i = match.index + match[0].length; i < jsxString.length; i++) {
      if (!/\s/.test(jsxString[i])) {
        if (jsxString[i] === '{') expressionStartIndex = i;
        break;
      }
    }
    if (expressionStartIndex === -1) continue;

    let objectStartIndex: number = -1;
    for (let i = expressionStartIndex + 1; i < jsxString.length; i++) {
      if (!/\s/.test(jsxString[i])) {
        if (jsxString[i] === '{') objectStartIndex = i;
        break;
      }
    }
    if (objectStartIndex === -1) continue;

    const objectEndIndex: number = findMatchingBrace(jsxString, objectStartIndex);
    if (objectEndIndex === -1) continue;

    const objectContent: string = jsxString.substring(objectStartIndex + 1, objectEndIndex);
    
    // 调用全新架构的核心修复函数
    const fixedContent: string = sanitizeObjectString(objectContent);

    result += jsxString.substring(lastIndex, objectStartIndex + 1);
    result += fixedContent;
    lastIndex = objectEndIndex;
  }

  result += jsxString.substring(lastIndex);
  return result;
}

/**
 * 【最终重构版 - 双循环架构】清理对象字面量的字符串内容。
 * 此版本采用嵌套循环，将字符串解析与外部解析完全隔离，确保逻辑清晰和健壮。
 *
 * @param {string} objectStr 对象花括号内部的原始字符串内容。
 * @returns {string} 清理后的字符串内容。
 */
function sanitizeObjectString(objectStr: string): string {
  let result: string = '';
  let i: number = 0;
  
  while (i < objectStr.length) {
    const char: string = objectStr[i];

    // 检查是否是字符串值的开始
    if ((char === '"' || char === "'")) {
      const isValueStart: boolean = isValueStartQuote(objectStr, i);
      
      if (isValueStart) {
        // ======== 进入内循环，专门解析字符串值 ========
        const quote: string = char;
        result += quote; // 1. 添加起始引号
        i++; // 2. 移动到字符串内容开始处
        
        let dangling: boolean = true;
        while (i < objectStr.length) {
          const innerChar: string = objectStr[i];
          
          if (innerChar === quote) { // 遇到与起始引号相同的引号
            const nextMeaningful: string | null = getNextMeaningfulChar(objectStr, i + 1);
            // 判断是否是真正的结束引号
            if (nextMeaningful === ',' || nextMeaningful === '}' || nextMeaningful === null) {
              result += quote; // 添加闭合引号
              i++;
              dangling = false; // 正常闭合
              break; // 退出内循环
            } else {
              // 是需要转义的内部引号
              result += '\\' + innerChar;
              i++;
            }
          } else if (innerChar === '\n' || innerChar === '\r') { // 错误恢复：遇到换行
            result += quote; // 强制闭合字符串
            result += innerChar; // 添加换行符
            i++;
            dangling = false;
            break; // 退出内循环
          } else {
            // 普通的字符串内容
            result += innerChar;
            i++;
          }
        }
        // 错误恢复：如果字符串直到最后都未闭合
        if (dangling) {
          result += quote;
        }
        // ==================== 退出内循环 ====================
      } else {
        // 不是字符串值的开始，可能是对象键，直接添加
        result += char;
        i++;
      }
    } else {
      // 不是引号，只是键、冒号、空格等，直接添加
      result += char;
      i++;
    }
  }
  return result;
}

/**
 * 从给定的左括号开始，查找其匹配的右括号，同时能正确处理引号和嵌套。
 * @param {string} str 用于搜索的完整字符串。
 * @param {number} startIndex 左括号 '{' 的索引。
 * @returns {number} 匹配的右括号 '}' 的索引，如果未找到则返回 -1。
 */
function findMatchingBrace(str: string, startIndex: number): number {
  if (str[startIndex] !== '{') return -1;
  let depth: number = 1;
  let inString: string | null = null;
  for (let i = startIndex + 1; i < str.length; i++) {
    const char: string = str[i];
    const prevChar: string = str[i - 1];
    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (inString === char) inString = null;
      else if (inString === null) inString = char;
    } else if (inString === null) {
      if (char === '{') depth++;
      else if (char === '}') depth--;
    }
    if (depth === 0) return i;
  }
  return -1;
}

/**
 * 从指定索引开始，获取字符串中下一个非空白字符。
 * @param {string} str 要搜索的字符串。
 * @param {number} startIndex 开始搜索的索引。
 * @returns {string|null} 找到的字符，如果到达字符串末尾则返回 null。
 */
function getNextMeaningfulChar(str: string, startIndex: number): string | null {
  for (let i = startIndex; i < str.length; i++) {
    if (!/\s/.test(str[i])) return str[i];
  }
  return null;
}

/**
 * 判断一个引号是否是值的开始。
 * 改进版本：使用状态机的方法来更准确地判断
 * @param {string} str 要检查的字符串。
 * @param {number} index 所讨论的引号的索引。
 * @returns {boolean} 如果该引号是一个值的开始，则返回 true。
 */
function isValueStartQuote(str: string, index: number): boolean {
  let colonFound: boolean = false;
  let commaOrBraceFound: boolean = false;
  
  for (let i = index - 1; i >= 0; i--) {
    const char: string = str[i];
    if (/\s/.test(char)) continue; // 跳过空白字符
    
    if (char === ':') {
      colonFound = true;
      break;
    } else if (char === ',' || char === '{') {
      commaOrBraceFound = true;
      break;
    } else if (char === '"' || char === "'") {
      // 遇到其他引号，说明可能在字符串内部
      return false;
    }
  }
  
  // 如果找到冒号，说明这是属性值
  if (colonFound) return true;
  
  // 如果找到逗号或左括号，这可能是数组元素或第一个属性值
  if (commaOrBraceFound) {
    return false;
  }
  
  return false;
}
