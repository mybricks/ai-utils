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

import { replaceNonAlphaNumeric } from "./utils";

// const Babel = (window as any).Babel as { packages: typeof packages }// https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.26.2/babel.min.js

type TagType = "normal" | "normalRoot" | "com" | "comRoot";

/** 组件唯一标识 */
const DATA_COM_KEY = "data-com-key";

/** 依赖组件完全数据源入参key */
const RELY_COM_DATA_KEY = "_data";

/** 组件数据源入参key */
const COM_DATA_KEY = "data";


export function transformRender(code: string, travelFn: ({tagName, attributeNames, type}: {tagName: string, attributeNames: Set<string>, type: TagType}) => Record<string, string>) {
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
   * 导入组件到class名的映射
   * import { Button } from "antd"; => Button => antd_Button
   * const { A } = Button; => A => antd_Button
   */
  const recordImports = new Map();

  /** 记录依赖组件 */
  const recordDependency = new Map();

  /** 记录导入信息 */
  const recordImport = (node: types.ImportDeclaration) => {
    node.specifiers.forEach((specifier) => {
      if (types.isImportSpecifier(specifier)) {
        recordDependency.set(specifier.local.name, node.source.value)
        recordImports.set(specifier.local.name, `${node.source.value}_${specifier.local.name}`);
      }
    })
  }

  /** 记录解构组件 */
  const recordDestructuring = (id: types.LVal, relyName: string) => {
    if (types.isObjectPattern(id)) {
      id.properties.forEach((property) => {
        if (types.isObjectProperty(property) && types.isIdentifier(property.key)) {
          // TODO: recordDependency
          recordImports.set(property.key.name, recordImports.get(relyName))
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

  /** 解析 */

  traverse(ast, {
    VariableDeclarator(path) {
      const { id, init } = path.node;
      if (types.isIdentifier(init) && recordImports.has(init.name)) {
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

      if (tagName) {
        let classNameAttribute;
        const isImportedDependency = recordImports.has(tagName);
        const attributeNames = new Set(path.node.attributes.filter((attr) => {
          return types.isJSXAttribute(attr)
        }).map((attr) => {
          const attributeName = attr.name.name;

          if (isImportedDependency) {
            if (attributeName === "className") {
              classNameAttribute = attr;
              const { value } = attr;
              const className = replaceNonAlphaNumeric(recordImports.get(tagName));
              if (types.isJSXExpressionContainer(value)) {
                const { expression } = value;
                if (types.isMemberExpression(expression)) {
                  value.expression = types.binaryExpression("+", expression, types.stringLiteral(` ${className}`)) 
                } else if (types.isBinaryExpression(expression)) {
                  const classNames = parseBinaryExpression(expression);
                  if (!classNames.some((cn) => cn === className || cn === ` ${className}`)) {
                    value.expression = types.binaryExpression("+", expression, types.stringLiteral(` ${className}`)) 
                  }
                }
              } else if (types.isStringLiteral(value)) {
                if (!value.value.split(" ").includes(className)) {
                  attr.value = types.stringLiteral(`${value.value} ${className}`);
                }
              }
            }
          }

          return attr.name.name as string
        }))

        let type: TagType = "normal";

        // 判断是否来自import
        if (isImportedDependency) {
          if (!classNameAttribute) {
            path.node.attributes.push(
              types.jsxAttribute(
                types.jsxIdentifier("className"),
                types.stringLiteral(replaceNonAlphaNumeric(`${recordImports.get(tagName)}`)),
              ),
            )
          }

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
        const extendJSXProps = travelFn({tagName, attributeNames, type, libName: recordDependency.get(tagName), comName: fullName})
        if (extendJSXProps) {
          Object.entries(extendJSXProps).forEach(([key, value]) => {
            if (!attributeNames.has(key)) {
              // 设置没有的key value
              path.node.attributes.push(
                types.jsxAttribute(
                  types.jsxIdentifier(key),
                  types.stringLiteral(value),
                ),
              );
            }
          })
          const dataComKey = extendJSXProps[DATA_COM_KEY];
          // 没有_data属性，并且有data-com-key属性
          if (!attributeNames.has(RELY_COM_DATA_KEY) && dataComKey) {
            path.node.attributes.push(
              types.jsxAttribute(
                types.jsxIdentifier(RELY_COM_DATA_KEY),
                types.jSXExpressionContainer(
                  types.memberExpression(
                    types.identifier(COM_DATA_KEY),
                    types.stringLiteral(dataComKey),
                    true
                  )
                )
              )
            )
          }
        }
      }
    },
  })

  // ast转code
  const sourceCode = generator(ast).code;

  return sourceCode;
}
