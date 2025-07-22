/**
 * @description 一个用于解析和修复JSX `data` 属性对象中的引号，将内部双引号替换为单引号。
 */

/**
 * 解析JSX字符串，将data属性对象中的内部双引号替换为单引号。
 *
 * @param {string} jsxString 输入的JSX字符串。
 * @returns {string} 处理后的JSX字符串。
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
    
    const fixedContent: string = convertQuotesInObject(objectContent);

    result += jsxString.substring(lastIndex, objectStartIndex + 1);
    result += fixedContent;
    lastIndex = objectEndIndex;
  }

  result += jsxString.substring(lastIndex);
  return result;
}

/**
 * 将对象中的双引号字符串值转换为单引号。
 * @param {string} objectStr 对象字符串内容。
 * @returns {string} 转换后的字符串内容。
 */
function convertQuotesInObject(objectStr: string): string {
  let result: string = '';
  let i: number = 0;
  
  while (i < objectStr.length) {
    const char: string = objectStr[i];

    if (char === '"') {
      let isValue = false;
      
      // 向前查找冒号，确定这是否是一个值
      for (let j = i - 1; j >= 0; j--) {
        if (/\s/.test(objectStr[j])) continue;
        if (objectStr[j] === ':') {
          isValue = true;
          break;
        }
        break;
      }

      if (isValue) {
        // 先收集整个字符串内容
        const startQuote = i;
        i++;
        let content = '';
        let hasUnescapedQuote = false;
        
        while (i < objectStr.length) {
          const currentChar = objectStr[i];
          
          if (currentChar === '"') {
            // 检查下一个非空白字符
            let j = i + 1;
            while (j < objectStr.length && /\s/.test(objectStr[j])) j++;
            
            // 如果是结束引号
            if (j >= objectStr.length || objectStr[j] === ',' || objectStr[j] === '}') {
              // 如果没有未转义的引号，保持原样
              if (!hasUnescapedQuote) {
                result += objectStr.substring(startQuote, i + 1);
              } else {
                // 有未转义的引号，进行转换
                result += '"' + content.replace(/"/g, "'") + '"';
              }
              i++;
              break;
            } else {
              // 发现未转义的引号
              hasUnescapedQuote = true;
              content += currentChar;
              i++;
            }
          } else {
            content += currentChar;
            i++;
          }
        }
      } else {
        // 这是一个键，保持原样
        result += char;
        i++;
      }
    } else {
      result += char;
      i++;
    }
  }
  
  return result;
}

/**
 * 查找匹配的右括号。
 * @param {string} str 要搜索的字符串。
 * @param {number} startIndex 左括号的索引。
 * @returns {number} 匹配的右括号索引。
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