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
  JSXSpreadAttribute
} from "@babel/types";

import type {packages} from "@babel/standalone";

import { replaceNonAlphaNumeric } from "./utils";

// const Babel = (window as any).Babel as { packages: typeof packages }// https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.26.2/babel.min.js

type TagType = "normal" | "normalRoot" | "com" | "comRoot";

export function transformRender(code: string, travelFn: ({tagName, attributeNames, type}: {tagName: string, attributeNames: Set<string>, type: TagType}) => Record<string, string>) {
  //const { types, parser, traverse, generator } = Babel.packages;

  const ast = parser.parse(code, {
    sourceType: "module",
    plugins: ["jsx"]
  })

  /** 获取标签名 例如 Form.Item => Form */
  const getTagName = (name: JSXIdentifier | JSXMemberExpression | JSXNamespacedName, fullName: string = "") => {
    if (types.isJSXIdentifier(name)) {
      return name.name
    } else if (types.isJSXMemberExpression(name)) {
      return getTagName(name.object);
    }
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

  /** 记录导入信息 */
  const recordImport = (node: types.ImportDeclaration) => {
    node.specifiers.forEach((specifier) => {
      if (types.isImportSpecifier(specifier)) {
        recordImports.set(specifier.local.name, `${node.source.value}_${specifier.local.name}`);
      }
    })
  }

  /** 记录解构组件 */
  const recordDestructuring = (id: types.LVal, relyName: string) => {
    if (types.isObjectPattern(id)) {
      id.properties.forEach((property) => {
        if (types.isObjectProperty(property) && types.isIdentifier(property.key)) {
          recordImports.set(property.key.name, recordImports.get(relyName))
          if (types.isObjectPattern(property.value)) {
            // 多层解构
            recordDestructuring(property.value, relyName)
          }
        }
      })
    }
  }

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
      const tagName = getTagName(path.node.name);

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
              if (types.isJSXExpressionContainer(value)) {
                const { expression } = value;
                if (types.isMemberExpression(expression)) {
                  value.expression = types.binaryExpression("+", expression, types.stringLiteral(` ${replaceNonAlphaNumeric(recordImports.get(tagName))}`)) 
                }
              } else if (types.isStringLiteral(value)) {
                attr.value = types.stringLiteral(`${value.value} ${replaceNonAlphaNumeric(recordImports.get(tagName))}`);
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
        const extendJSXProps = travelFn({tagName, attributeNames, type})
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
        }
      }
    },
  })

  // ast转code
  const sourceCode = generator(ast).code;

  return sourceCode;
}
