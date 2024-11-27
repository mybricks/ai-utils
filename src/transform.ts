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

export function transformRender(code: string, travelFn: ({tagName, attributeNames}: {tagName: string, attributeNames: Set<string>}) => Record<string, string>) {
  //const { types, parser, traverse, generator } = Babel.packages;

  const ast = parser.parse(code, {
    sourceType: "module",
    plugins: ["jsx"]
  })

  /** 获取标签名 例如 Form.Item => Form */
  const getTagName = (name: JSXIdentifier | JSXMemberExpression | JSXNamespacedName, fullName: string = "") => {
    if (types.isJSXIdentifier(name)) {
      return {
        name: name.name,
        fullName: name.name + fullName
      }
    } else if (types.isJSXMemberExpression(name)) {
      return getTagName(name.object, "-" + name.property.name + fullName)
    }
    return { name: "", fullName }
  }

  /**
   * 收集导入的依赖
   * import { Form, Button } from "antd"; => Form, Button
   */
  const importedDependencies = new Set();
  const dependenciesToImported = new Map();

  traverse(ast, {
    VariableDeclarator(path) {
      if (types.isIdentifier(path.node.init)) {
        const dependency = path.node.init.name;
        if (importedDependencies.has(dependency)) {
          if (types.isObjectPattern(path.node.id)) {
            path.node.id.properties.forEach((property) => {
              if (types.isObjectProperty(property) && types.isIdentifier(property.value)) {
                importedDependencies.add(property.value.name);
                dependenciesToImported.set(property.value.name, dependency);
              }
            })
          }
        }
      }
    },
    ImportDeclaration(path) {
      const dependency = path.node.source.value;

      path.get("specifiers").forEach((specifier) => {
        if (specifier.isImportSpecifier()) {
          importedDependencies.add(specifier.node.local.name);
          dependenciesToImported.set(specifier.node.local.name, dependency);
        }
      });
    },
    JSXOpeningElement(path) {
      /** 标签名 */
      const { name: tagName, fullName } = getTagName(path.node.name);

      // 判断是否来自import
      if (tagName && importedDependencies.has(tagName)) {
        let classNameAttribute;
        const attributeNames = new Set(path.node.attributes.filter((attr) => {
          return types.isJSXAttribute(attr)
        }).map((attr) => {
          const attributeName = attr.name.name;

          if (attributeName === "className") {
            classNameAttribute = attr;
            const { value } = attr;
            if (types.isJSXExpressionContainer(value)) {
              const { expression } = value;
              if (types.isMemberExpression(expression)) {
                value.expression = types.binaryExpression("+", expression, types.stringLiteral(` ${replaceNonAlphaNumeric(`${dependenciesToImported.get(tagName)}_${fullName}`)}`)) 
              }
            }
          }

          return attr.name.name as string
        }))

        if (!classNameAttribute) {
          path.node.attributes.push(
            types.jsxAttribute(
              types.jsxIdentifier("className"),
              types.stringLiteral(replaceNonAlphaNumeric(`${dependenciesToImported.get(tagName)}_${fullName}`)),
            ),
          )
        }

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
