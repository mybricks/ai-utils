import less from "less";
import { convertHyphenToCamel, convertCamelToHyphen } from "../utils";

interface Rule {
  selectors?: {
    toCSS: () => string;
  }[];
  type: "Ruleset" | "Declaration" | "Media" | "AtRule";
  rules: (RuleSet | Declaration | Media | AtRule)[];
}

interface RuleSet extends Rule {
  root: true;
  type: "Ruleset";
}

type Keyword = {
  toCSS: () => string;
}

type Anonymous = {
  type: "Anonymous";
  toCSS: () => string;
}

type Color = {
  type: "Color";
  toCSS: () => string;
}

type Dimension = {
  type: "Dimension";
  toCSS: () => string;
}

type Call = {
  type: "Call";
  toCSS: () => string;
}

type Paren = {
  type: "Paren";
  value: Declaration;
}

type Expression = {
  value: (Color | Dimension | Call | Paren)[];
}

type Value = {
  type: "Value";
  toCSS: () => string;
};

interface Declaration extends Rule {
  type: "Declaration";
  name: Keyword[] | string;
  value: Anonymous | Value;
}

interface Media extends Rule {
  type: "Media";
  features: {
    value: Expression[];
  };
}

interface AtRule extends Rule {
  type: "AtRule";
  name: string;
  value: Keyword;
}

type CSSObj = Record<string, any>;

const getSelector = (selectors: Rule["selectors"]) => {
  let selector = selectors?.reduce((pre, selector, index) => {
    return pre + (index ? ",": "") + selector.toCSS();
  }, "") || "";

  return selector.slice(1, selector.length).trim();
}

const flatCSSObjs = (cssObjs: CSSObj[]) => {
  return cssObjs.reduce<CSSObj>((pre, cssObj) => {
    if (cssObj.key === "&") {
      // 隐式&，出现于媒体查询以及其它 @
      Object.entries(cssObj.value).forEach(([key, value]) => {
        pre[key] = value;
      });
    } else {
      pre[cssObj.key] = cssObj.value;
    }
    
    return pre;
  }, {})
}

class Parse {

  cssObj: CSSObj = {};

  constructor(private _ruleSet: RuleSet) {
    const res = this.handleRuleSet(this._ruleSet);
    res.forEach(({key, value}) => {
      this.cssObj[key] = value
    })
  }

  get() {
    return this.cssObj;
  }

  handleRules(rules: Rule["rules"]) {
    const cssObj: CSSObj = {};
    const cssObjs: {key: string, value: CSSObj}[] = [];
    rules.forEach((rule) => {
      if (rule.type === "Ruleset") {
        const next = this.handleRuleSet(rule);
        cssObjs.push(...next)
      } else if (rule.type === "Declaration") {
        const res = this.handleDeclaration(rule);
        cssObj[res.key] = res.value;
      } else if (rule.type === "Media") {
        const res = this.handleMedia(rule);
        cssObjs.push(res);
      } else if (rule.type === "AtRule") {
        const res = this.handleAtRule(rule);
        cssObjs.push(res);
      } else {
        debugger
        // @ts-ignore
        console.log("其它 => ", rule.type);
      }
    })

    return {
      cssObj,
      cssObjs
    }
  }

  handleRuleSet(ruleSet: RuleSet) {
    const selector = ruleSet.root ? "" : getSelector(ruleSet.selectors);
    const res: {key: string, value: CSSObj}[] = [];
    const { cssObj, cssObjs }  = this.handleRules(ruleSet.rules);

    if (selector) {
      res.push({
        key: selector,
        value: cssObj
      })
    }

    return res.concat(...cssObjs);
  }

  handleDeclaration(declaration: Declaration) {
    let key = "";
    if (typeof declaration.name === "string") {
      key = declaration.name;
    } else {
      key = declaration.name[0].toCSS();
    }
    const value = declaration.value.toCSS();

    return {
      key: convertHyphenToCamel(key),
      value
    }
  }

  handleMedia(media: Media) {
    const features = media.features.value.reduce<string>((features, expression: Expression) => {
      expression.value.forEach((value) => {
        if (value.type === "Paren") {
          const res = this.handleDeclaration(value.value);
          features += ` (${res.key}: ${res.value})`;
        } else {
          features += ` ${value.toCSS()}`;
        }
      })
      return features;
    }, "@media");
    const { cssObjs }  = this.handleRules(media.rules);

    return {
      key: features,
      value: flatCSSObjs(cssObjs),
    }
  }

  handleAtRule(atRule: AtRule) {
    const name = atRule.name;
    const value = atRule.value.toCSS();
    const { cssObjs } = this.handleRules(atRule.rules);

    return {
      key: `${name} ${value}`,
      value: flatCSSObjs(cssObjs),
    }
  }
}

export const parseLess = (code: string) => {
  let cssObj: CSSObj = {};

  try {
    less.render(code, (error, output) => {
      if (error) {
        console.error(error);
      } else {
        (less as any).parse(output!.css.replace(/\/\*[\s\S]*?\*\//g, ""), (error: any, output: any) => {
          if (error) {
            console.error(error);
          } else {
            const parse = new Parse(output);
            cssObj = parse.get();
          }
        })
      }
    })
  } catch (error) {
    console.error(error);
  }

  return cssObj
}

const formatCSSString = (cssObj: CSSObj, indent = "") => {
  let code = "";
  const entriesCSSObj = Object.entries(cssObj);
  const lastIndex = entriesCSSObj.length - 1;

  entriesCSSObj.forEach(([key, value], index) => {
    if (typeof value === "object") {
      code += `${!index ? "" : (!indent ? "\n\n" : "\n")}${indent}${key} {\n` + 
        `${formatCSSString(value, indent + "  ")}` +
        `\n${indent}}`;
    } else {
      code += `${indent}${convertCamelToHyphen(key)}: ${value};${index === lastIndex ? "" : "\n"}`;
    }
  })

  return code;
}

const rebuildCSSObj = (cssObj: CSSObj) => {
  const cache: CSSObj = {};
  Object.entries(cssObj).forEach(([key, value]) => {
    const splitKeys = key.split(" ");

    if (splitKeys.length === 1) {
      cache[key] = value;
    } else {
      const cssObj = cache[splitKeys[0]];

      if (cssObj) {
        deepSetCssObj(cssObj, {
          keys: splitKeys.slice(1),
          value
        });
      } else {
        cache[key] = value;
      }
    }
  })

  return cache;
}

const deepSetCssObj = (cssObj: CSSObj, { keys, value }: { keys: string[], value: CSSObj}) => {
  const keysLength = keys.length;
  keys.forEach((key, index) => {
    if (!cssObj[key]) {
      if (index === keysLength - 1) {
        cssObj[key] = value
      } else {
        cssObj[key] = {};
        cssObj = cssObj[key]
      }
    } else {
      if (index === keysLength - 1) {
        cssObj[key] = Object.assign(cssObj[key], value);
      } else {
        cssObj = cssObj[key];
      }
    }
  })
}

export const stringifyLess = (cssObj: CSSObj) => {
  return formatCSSString(rebuildCSSObj(cssObj));
}

// Previous
// export const parseLess = (code: string) => {
//   const cssObj: Record<string, Record<string, string> | string> = {};
//   try {
//     less.render(code, (error, output) => {
//       if (error) {
//         console.error(error)
//       } else if (output) {
//         const css = output.css.replace(/\/\*[\s\S]*?\*\//g, '');

//         // 正则表达式匹配CSS规则和属性
//         const reg = /([^{}]*?)\{([^}]*)\}/g;
//         let ignore = "";
//         let ignorePrefix = "";
//         let match;
//         while ((match = reg.exec(css)) !== null) {
//           const selector = match[1].trim();
//           const properties = match[2].trim();

//           if (selector.startsWith(".") || selector.startsWith("[")) {
//             if (ignore) {
//               cssObj[ignorePrefix] = ignore.trim() + "\n}\n";
//               ignorePrefix = ""
//               ignore = "";
//             }

//             // 将属性字符串转换为对象
//             const propObj: Record<string, string> = {};
//             const props = properties.split("\n").map(prop => prop.trim()).filter(prop => prop);
//             props.forEach(prop => {
//               const index = prop.indexOf(":")
//               const key = prop.slice(0, index)
//               const value = prop.slice(index + 1).trim().replace(/;$/, "")
//               propObj[convertHyphenToCamel(key)] = value;
//             });

//             cssObj[selector] = propObj;
//           } else {
//             if (!ignorePrefix) {
//               ignorePrefix = selector
//             }
//             ignore += match[0];
//           }
//         }

//         if (ignore) {
//           cssObj[ignorePrefix] = ignore.trim() + "\n}";
//           ignorePrefix = ""
//           ignore = "";
//         }

//         const emptyStartKeys = new Set<string>();
//         const startKeys = new Set<string>();

//         Object.keys(cssObj).forEach((key) => {
//           if (!key.startsWith(".") && !key.startsWith("[")) {
//             return
//           }
//           const keys = key.split(' ');
//           if (keys.length > 1) {
//             startKeys.add(keys[0])
//           } else {
//             startKeys.add(keys[0])
//             emptyStartKeys.add(keys[0])
//           }
//         })

//         startKeys.forEach((key) => {
//           if (!emptyStartKeys.has(key)) {
//             cssObj[key] = {};
//           }
//         })
//       } else {
//         console.error("未知错误")
//       }
//     })
//   } catch (error) {
//     console.error(error)
//   }
//   return cssObj;
// }

// export const stringifyLess = (cssObj: Record<string, Record<string, string> | string>) => {
//   const startKeyMap: any = {};

//   Object.keys(cssObj).forEach((key) => {
//     if (!key.startsWith(".") && !key.startsWith("[")) {
//       startKeyMap[key] = cssObj[key];
//       return;
//     }

//     const startKey = key.split(" ")[0];
//     if (!startKeyMap[startKey]) {
//       const keys = new Set<string>();
//       keys.add(key)
//       startKeyMap[startKey] = keys
//     } else {
//       startKeyMap[startKey].add(key)
//     }
//   })

//   let cssCode = "";

//   const startKeyEntries = Object.entries(startKeyMap);
//   const lastStartKeyIndex = startKeyEntries.length - 1;

//   startKeyEntries.forEach(([key, value]: any, startKeyIndex) => {

//     if (typeof value === "string") {
//       cssCode += value + "\n";
//       return;
//     }

//     const keyMap: any = {};

//     Array.from(value).sort((a: any, b: any) => {
//       return b.split(' ').length - a.split(' ').length
//     }).forEach((key: any) => {
//       const keys = key.split(" ");
//       const keyIndent = keys.length === 1 ? "" : Array(keys.length * 2 - 1).join(" ")
//       const valueIndex = keyIndent + "  ";
//       const valueEntries = Object.entries(cssObj[key]);
//       const lastIndex = valueEntries.length;
//       const valueCode = valueEntries.map(([key, value], index) => {
//         return `${valueIndex}${convertCamelToHyphen(key)}: ${value};${lastIndex === index ? "" : "\n"}`
//       }).join("")
//       const lastKey = keys.slice(0, keys.length - 1).join(" ")
//       const currentKey = keys[keys.length - 1];

//       if (keys.length > 1) {
//         const child = keyMap[key];
//         if (keyMap[lastKey]) {
//           keyMap[lastKey].push(`${keyIndent}${currentKey} {\n${valueCode}${child ? "\n" + child.join("") : ""}\n${keyIndent}}`)
//         } else {
//           // 没有
//           keyMap[lastKey] = [`${keyIndent}${currentKey} {\n${valueCode}${child ? "\n" + child.join("") : ""}${keyIndent}}`]
//         }
//       } else {
//         const child = keyMap[currentKey];
//         cssCode = cssCode + `${currentKey} {\n${valueCode}${child ? child.join("\n\n") : ""}${child ? "\n" : ""}}` + (lastStartKeyIndex === startKeyIndex ? "\n" : "\n\n")
//       }
//     })
//   })

//   return cssCode;
// }
// Previous