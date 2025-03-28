import less from "less";
import { convertHyphenToCamel, convertCamelToHyphen } from "../utils";

export const parseLess = (code: string) => {
  const cssObj: Record<string, Record<string, string> | string> = {};
  try {
    less.render(code, (error, output) => {
      if (error) {
        console.error(error)
      } else if (output) {
        const css = output.css.replace(/\/\*[\s\S]*?\*\//g, '');

        // 正则表达式匹配CSS规则和属性
        const reg = /([^{}]*?)\{([^}]*)\}/g;
        let ignore = "";
        let ignorePrefix = "";
        let match;
        while ((match = reg.exec(css)) !== null) {
          const selector = match[1].trim();
          const properties = match[2].trim();

          if (selector.startsWith(".") || selector.startsWith("[")) {
            if (ignore) {
              cssObj[ignorePrefix] = ignore.trim() + "\n}\n";
              ignorePrefix = ""
              ignore = "";
            }

            // 将属性字符串转换为对象
            const propObj: Record<string, string> = {};
            const props = properties.split("\n").map(prop => prop.trim()).filter(prop => prop);
            props.forEach(prop => {
              const index = prop.indexOf(":")
              const key = prop.slice(0, index)
              const value = prop.slice(index + 1).trim().replace(/;$/, "")
              propObj[convertHyphenToCamel(key)] = value;
            });

            cssObj[selector] = propObj;
          } else {
            if (!ignorePrefix) {
              ignorePrefix = selector
            }
            ignore += match[0];
          }
        }

        if (ignore) {
          cssObj[ignorePrefix] = ignore.trim() + "\n}";
          ignorePrefix = ""
          ignore = "";
        }

        const emptyStartKeys = new Set<string>();
        const startKeys = new Set<string>();

        Object.keys(cssObj).forEach((key) => {
          if (!key.startsWith(".") && !key.startsWith("[")) {
            return
          }
          const keys = key.split(' ');
          if (keys.length > 1) {
            startKeys.add(keys[0])
          } else {
            startKeys.add(keys[0])
            emptyStartKeys.add(keys[0])
          }
        })

        startKeys.forEach((key) => {
          if (!emptyStartKeys.has(key)) {
            cssObj[key] = {};
          }
        })
      } else {
        console.error("未知错误")
      }
    })
  } catch (error) {
    console.error(error)
  }
  return cssObj;
}

export const stringifyLess = (cssObj: Record<string, Record<string, string> | string>) => {
  const startKeyMap: any = {};

  Object.keys(cssObj).forEach((key) => {
    if (!key.startsWith(".") && !key.startsWith("[")) {
      startKeyMap[key] = cssObj[key];
      return;
    }

    const startKey = key.split(" ")[0];
    if (!startKeyMap[startKey]) {
      const keys = new Set<string>();
      keys.add(key)
      startKeyMap[startKey] = keys
    } else {
      startKeyMap[startKey].add(key)
    }
  })

  let cssCode = "";

  const startKeyEntries = Object.entries(startKeyMap);
  const lastStartKeyIndex = startKeyEntries.length - 1;

  startKeyEntries.forEach(([key, value]: any, startKeyIndex) => {

    if (typeof value === "string") {
      cssCode += value + "\n";
      return;
    }

    const keyMap: any = {};

    Array.from(value).sort((a: any, b: any) => {
      return b.split(' ').length - a.split(' ').length
    }).forEach((key: any) => {
      const keys = key.split(" ");
      const keyIndent = keys.length === 1 ? "" : Array(keys.length * 2 - 1).join(" ")
      const valueIndex = keyIndent + "  ";
      const valueEntries = Object.entries(cssObj[key]);
      const lastIndex = valueEntries.length;
      const valueCode = valueEntries.map(([key, value], index) => {
        return `${valueIndex}${convertCamelToHyphen(key)}: ${value};${lastIndex === index ? "" : "\n"}`
      }).join("")
      const lastKey = keys.slice(0, keys.length - 1).join(" ")
      const currentKey = keys[keys.length - 1];

      if (keys.length > 1) {
        const child = keyMap[key];
        if (keyMap[lastKey]) {
          keyMap[lastKey].push(`${keyIndent}${currentKey} {\n${valueCode}${child ? "\n" + child.join("") : ""}\n${keyIndent}}`)
        } else {
          // 没有
          keyMap[lastKey] = [`${keyIndent}${currentKey} {\n${valueCode}${child ? "\n" + child.join("") : ""}${keyIndent}}`]
        }
      } else {
        const child = keyMap[currentKey];
        cssCode = cssCode + `${currentKey} {\n${valueCode}${child ? child.join("\n\n") : ""}${child ? "\n" : ""}}` + (lastStartKeyIndex === startKeyIndex ? "\n" : "\n\n")
      }
    })
  })

  return cssCode;
}