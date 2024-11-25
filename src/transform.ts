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

// const Babel = (window as any).Babel as { packages: typeof packages }// https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.26.2/babel.min.js

export function transformRender(code: string, travelFn: ({tagName, attributeNames}) => Record<string, string>) {
  //const { types, parser, traverse, generator } = Babel.packages;

  const ast = parser.parse(code, {
    sourceType: "module",
    plugins: ["jsx"]
  })

  /** 判断是否添加过 _key 属性 */
  const isDoneAttr = (attr: JSXAttribute | JSXSpreadAttribute) => {
    return types.isJSXAttribute(attr) && attr.name.name === "_key";
  }

  /** 获取标签名 例如 Form.Item => Form */
  const getTagName = (name: JSXIdentifier | JSXMemberExpression | JSXNamespacedName) => {
    if (types.isJSXIdentifier(name)) {
      return name.name
    } else if (types.isJSXMemberExpression(name)) {
      return getTagName(name.object)
    }
  }

  /**
   * 收集导入的依赖
   * import { Form, Button } from "antd"; => Form, Button
   */
  const importedDependencies = new Set();

  traverse(ast, {
    ImportDeclaration(path) {
      path.get("specifiers").forEach((specifier) => {
        if (specifier.isImportSpecifier()) {
          importedDependencies.add(specifier.node.local.name);
        }
      });
    },
    JSXOpeningElement(path) {
      // if (path.node.attributes.some(isDoneAttr)) {
      //   return;
      // }

      /** 标签名 */
      const tagName = getTagName(path.node.name);

      // 判断是否来自import
      if (importedDependencies.has(tagName)) {
        const attributeNames = new Set(path.node.attributes.filter((attr) => {
          return types.isJSXAttribute(attr)
        }).map((attr) => attr.name.name))

        // 扩展属性
        const extendJSXProps = travelFn({tagName, attributeNames})
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
