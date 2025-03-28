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

import { replaceNonAlphaNumeric, convertCamelToHyphen, convertHyphenToCamel } from "../utils";

export { parseLess, stringifyLess } from "./less";

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

type CSSObj = {
  [key: string]: string | CSSObj;
};

export const parseLessNext = (code: string) => {
  const cssObj: CSSObj = {};
  const meta: {key: string; propKey: string; ignore?: string; comment?: string;}[] = [];
  try {
    less.render(code, (error, output) => {
      if (error) {
        console.error(error)
      } else if (output) {
        const css = output.css;
        const cssSplits = css.split("\n");

        let ignore = "";
        let comment = "";
        let selector = "";
        let obj: Record<string, string> = {};
        /** 记录忽略内容的括号 */
        let brace = 0;

        cssSplits.forEach((cssSplit) => {
          const str = cssSplit.trim(); 

          if (!ignore) {
            if (str.startsWith("/*")) {
              if (str.endsWith("*/")) {
                meta.push({
                  key: selector,
                  propKey: '',
                  comment: `${cssSplit}\n`
                })
              } else {
                comment += `${cssSplit}\n`
              }
              return;
            }
          }
          
          if (str.endsWith("{")) {
            if (ignore) {
              ignore += `${cssSplit}\n`;
              brace++;
              return
            }
            if (!['.', '['].includes(str[0])) {
              ignore += `${cssSplit}\n`;
              brace++;
            } else {
              selector = str.replace(/{$/, "").trim();
            }
          } else if (str.endsWith(";")) {
            if (ignore) {
              ignore += `${cssSplit}\n`
              return
            }

            const [key, value] = str.split(":");
            const keyTransform = convertHyphenToCamel(key);
            obj[keyTransform] = value.trim().replace(/;$/, "");
            meta.push({
              key: selector,
              propKey: keyTransform,
            })
          } else if (str.endsWith("}")) {

            if (ignore) {
              brace--;

              ignore += `${cssSplit}\n`

              if (brace === 0) {
                meta.push({
                  key: selector,
                  propKey: "",
                  ignore
                })
                ignore = "";
              }

              return
            }
            cssObj[selector] = obj;
            selector = "";
            obj = {};
          } else if (str.endsWith("*/")) {
            if (ignore) {
              ignore += `${cssSplit}\n`
              return
            }
            meta.push({
              key: selector,
              propKey: "",
              comment: comment += `${cssSplit}\n`
            })
            comment = "";
          }
        })
      } else {
        console.error("未知错误")
      }
    })
  } catch (error) {
    console.error(error)
  }

  return {
    ...cssObj,
    meta
  };
}

export const stringifyLessNext = (cssObjWithMeta: any) => {
  const { meta, ...cssObj } = cssObjWithMeta;
  const calculateIndentCharacters = (indentation: number) => {
    return Array(indentation * 2 - 1).join(" ") + "  ";
  }
  let lessCode = "";
  let selector = "";
  let indentation = 0;

  (meta as {key: string; propKey: string; ignore?: string; comment?: string}[]).forEach(({ key, propKey, ignore, comment }) => {
    if (comment) {
      lessCode += comment
    } else if (ignore) {
      if (!selector) {
        lessCode += ignore
      } else {
        for (let i = indentation + 1; i > 0; i --) {
          lessCode += `${Array((i - 1) * 3).join(" ")}}\n`;
        }
        indentation = -1;
        lessCode += ignore
      }
    } else if (!selector) {
      indentation = 0;
      selector = key;
      lessCode += `${key} {\n`;
      lessCode += `${calculateIndentCharacters(indentation + 1)}${convertCamelToHyphen(propKey)}: ${cssObj[key][propKey]};\n`;
    } else if (selector === key) {
      lessCode += `${calculateIndentCharacters(indentation + 1)}${convertCamelToHyphen(propKey)}: ${cssObj[key][propKey]};\n`;
    } else if (key.startsWith(selector)) {
      const currentKey = key.replace(selector, "").trim();
      selector = key;
      indentation = indentation + 1;
      lessCode += `\n${calculateIndentCharacters(indentation)}${currentKey} {\n`;
      lessCode += `${calculateIndentCharacters(indentation + 1)}${convertCamelToHyphen(propKey)}: ${cssObj[key][propKey]};\n`;
    } else if (selector !== key) {
      for (let i = indentation + 1; i > 0; i --) {
        lessCode += `${Array((i - 1) * 3).join(" ")}}\n`;
      }
      indentation = 0;
      selector = key;
      lessCode += `\n${key} {\n`;
      lessCode += `${calculateIndentCharacters(indentation + 1)}${convertCamelToHyphen(propKey)}: ${cssObj[key][propKey]};\n`;
    }
  })

  for (let i = indentation + 1; i > 0; i --) {
    lessCode += `${Array((i - 1) * 3).join(" ")}}\n`;
  }

  return lessCode;
}
