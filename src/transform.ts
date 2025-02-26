//import * as Babel from "@babel/standalone";
import * as parser from '@babel/parser'
import * as  types from '@babel/types'
import traverse from '@babel/traverse'
import generator from '@babel/generator'

import type {
  JSXIdentifier,
  JSXMemberExpression,
  JSXNamespacedName,
  JSXAttribute,
  JSXSpreadAttribute,
  BinaryExpression
} from "@babel/types";

import type {packages} from "@babel/standalone";

import less from "less"

import { replaceNonAlphaNumeric } from "./utils";

// const Babel = (window as any).Babel as { packages: typeof packages }// https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.26.2/babel.min.js

type TagType = "normal" | "normalRoot" | "com" | "comRoot";

/** 组件唯一标识 */
const DATA_COM_KEY = "data-com-key";

/** 组件唯一标识 */
const DATA_COM_ID = "data-com-id";

/** 依赖组件完全数据源入参key */
const RELY_COM_DATA_KEY = "_data";

/** 组件数据源入参key */
const COM_DATA_KEY = "data";


export function transformRender(code: string, travelFn: (params: {tagName: string, attributeNames: Set<string>, type: TagType, libName: string | null, comName: string | null}) => Record<string, string>) {
  //const { types, parser, traverse, generator } = Babel.packages;

  const ast = parser.parse(code, {
    sourceType: "module",
    plugins: ["jsx"]
  })

  /** 获取标签名 例如 Form.Item => Form */
  const getTagName = (name: JSXIdentifier | JSXMemberExpression | JSXNamespacedName, fullName: string = "") => {
    if (types.isJSXIdentifier(name)) {
      return {
        tagName: name.name,
        fullName: name.name + fullName
      }
    } else if (types.isJSXMemberExpression(name)) {
      return getTagName(name.object, "." + name.property.name + fullName)
    }
    return { tagName: "", fullName }
  }

  /** 最外层依赖组件 */
  let comRoot: types.JSXIdentifier;
  /** 最外层普通标签 */
  let normalRoot: types.JSXIdentifier;
  /** 停止遍历JSXElement */
  let stopJSXElement: boolean = false;

  /**
   * 记录导入的依赖
   * import { Button } from "antd";
   * ['antd']
   */
  const recordImports = new Set();

  /** 记录依赖组件 */
  const recordDependency = new Map();

  /** 记录导入信息 */
  const recordImport = (node: types.ImportDeclaration) => {
    node.specifiers.forEach((specifier) => {
      if (types.isImportSpecifier(specifier)) {
        recordDependency.set(specifier.local.name, node.source.value)
        recordImports.add(node.source.value)
        // recordImports.set(specifier.local.name, `${node.source.value}_${specifier.local.name}`);
      }
    })
  }

  /** 记录解构组件 */
  const recordDestructuring = (id: types.LVal, relyName: string) => {
    if (types.isObjectPattern(id)) {
      id.properties.forEach((property) => {
        if (types.isObjectProperty(property) && types.isIdentifier(property.key)) {
          // TODO: recordDependency
          recordDependency.set(property.key.name, relyName)
          // recordImports.set(property.key.name, recordImports.get(relyName))
          if (types.isObjectPattern(property.value)) {
            // 多层解构
            recordDestructuring(property.value, relyName)
          }
        }
      })
    }
  }

  /** 解析二进制，目前用于解析className={css.card + "xxx"} */
  const parseBinaryExpression = ({ left, right }: BinaryExpression, result: string[] = []) => {
    if (types.isStringLiteral(right)) {
      result.push(right.value)
    }
    if (types.isBinaryExpression(left)) {
      parseBinaryExpression(left, result);
    }
    return result;
  }


  /** 根据标签名获取libName和comName */

  /** 
   * 根据标签名追溯来源
   * import { Select } from "antd"
   * const { Option } = Select 
   * 
   * 已知Option 计算得到 ['anrd', 'Select', 'Option']
   */
  const traceComponentOriginByTagName = (tagName: string, origin: Map<string, string>) => {
    const tags = tagName.split('.')
    let lastOrigin = origin.get(tags[0]);

    while (lastOrigin) {
      tags.unshift(lastOrigin)
      lastOrigin = origin.get(lastOrigin)
    }

    return tags
  }


  /** 解析 */
  traverse(ast, {
    VariableDeclarator(path) {
      const { id, init } = path.node;
      if (types.isIdentifier(init) && recordDependency.has(init.name)) {
        recordDestructuring(id, init.name)
      }
    },
    ImportDeclaration(path) {
      recordImport(path.node);
    },
    JSXElement(path) {
      if (!stopJSXElement) {
        if (types.isJSXIdentifier(path.node.openingElement.name)) {
          if (recordImports.has(path.node.openingElement.name.name)) {
            comRoot = path.node.openingElement.name;
            stopJSXElement = true;
          } else {
            if (!normalRoot) {
              normalRoot = path.node.openingElement.name;
            }
            if (path.node.children.filter((child) => types.isJSXElement(child)).length > 1) {
              stopJSXElement = true;
            }
          }
        }
      }

    },
    JSXOpeningElement(path) {
      /** 标签名 */
      const { tagName, fullName } = getTagName(path.node.name);
      const origin = traceComponentOriginByTagName(fullName, recordDependency)

      if (tagName) {
        // let classNameAttribute;
        const isImportedDependency = recordImports.has(origin[0]);
        const attributeNamesMap = path.node.attributes.filter((attr) => {
          return types.isJSXAttribute(attr)
        }).reduce((attributeNamesMap, attr) => {
          attributeNamesMap.set(attr.name.name as string, attr)
          return attributeNamesMap
        }, new Map())

        let type: TagType = "normal";

        // 判断是否来自import
        if (isImportedDependency) {
          // if (!classNameAttribute) {
          //   path.node.attributes.push(
          //     types.jsxAttribute(
          //       types.jsxIdentifier("className"),
          //       types.stringLiteral(replaceNonAlphaNumeric(`${recordImports.get(tagName)}`)),
          //     ),
          //   )
          // }

          if (comRoot === path.node.name) {
            type = "comRoot";
          } else {
            type = "com";
          }
        } else {
          if (normalRoot === path.node.name) {
            type = "normalRoot";
          }
        }

        // 扩展属性
        // tagName 没用到
        const extendJSXProps = travelFn({tagName, attributeNames: new Set(attributeNamesMap.keys()), type, libName: isImportedDependency ? origin[0] : null, comName: isImportedDependency ? origin.slice(1).join('.') : null})
        if (extendJSXProps) {
          Object.entries(extendJSXProps).forEach(([key, value]) => {
            if (!attributeNamesMap.has(key)) {
              // 没有的属性，添加上
              if (key === DATA_COM_ID) {
                // 特殊约定字段
                path.node.attributes.push(
                  types.jsxAttribute(
                    types.jsxIdentifier(key),
                    attributeNamesMap.has("key") ? types.jsxExpressionContainer(
                      types.binaryExpression("+", types.stringLiteral(value), attributeNamesMap.get("key").value.expression)
                    ) : types.stringLiteral(value),
                  )
                )
              } else {
                // 其他的直接赋值
                path.node.attributes.push(
                  types.jsxAttribute(
                    types.jsxIdentifier(key),
                    types.stringLiteral(value),
                  ),
                );
              }
            }
          })
          // const dataComKey = extendJSXProps[DATA_COM_KEY];
          // 没有_data属性，并且有data-com-key属性
          // if (!attributeNames.has(RELY_COM_DATA_KEY) && dataComKey) {
          //   path.node.attributes.push(
          //     types.jsxAttribute(
          //       types.jsxIdentifier(RELY_COM_DATA_KEY),
          //       types.jSXExpressionContainer(
          //         types.memberExpression(
          //           types.identifier(COM_DATA_KEY),
          //           types.stringLiteral(dataComKey),
          //           true
          //         )
          //       )
          //     )
          //   )
          // }
        }
      }
    },
  })

  // ast转code
  const sourceCode = generator(ast).code;

  return sourceCode;
}

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

function convertCamelToHyphen(str: string) {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

function convertHyphenToCamel(str: string) {
  return str.replace(/-(\w)/g, (match, p1) => p1.toUpperCase());
}
