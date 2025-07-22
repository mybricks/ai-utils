// @ts-nocheck
import * as parser from '@babel/parser'
import traverse from '@babel/traverse'
import type {
  JSXAttribute,
  JSXExpressionContainer,
  JSXIdentifier,
  JSXMemberExpression,
  JSXNamespacedName,
  NumericLiteral,
  ObjectExpression,
  StringLiteral,
} from "@babel/types";

import { fixUnescapedQuotesJsxDataProps } from './fixUnescapedQuotesJsx'
import { fixMissingEqualSignJsx } from './fixMissingEqualSignJsx'

import * as types from '@babel/types'

export async function parseMBX(jsxString: string) {
  let template = jsxString
  try {
    let tempString = jsxString
    tempString = fixMissingEqualSignJsx(tempString)
    tempString = fixUnescapedQuotesJsxDataProps(tempString)
    template = tempString
  } catch (error) {
    console.log(error)
  }

  const ast = parser.parse(template.replace(/<!--((?!-->)[\s\S])*-->/g, ''), {
    sourceType: "module",
    plugins: ['jsx']
  });

  let ui: any;
  let interaction: any;
  const nodeToTptMap = new Map<any, any>();

  const comRefAndIdMap = new Map();

  traverse(ast, {
    enter(path) {
      if (path.isJSXElement()) {
        const tagName = getTagName(path.node.openingElement.name);
        // console.log("🏆 tagName => ", tagName);
        if (!tagName) {
          return;
        }

        const attributes = getAttributes(path.node.openingElement.attributes as GetAttributesParams);
        const id = uuid();

        if (tagName === "page") {
          const tpt = {
            id,
            title: attributes.title,
            style: attributes.layout,
            showType: attributes.showType,
            comAry: [],
          }

          ui = tpt;
          interaction = {
            id,
            title: attributes.title,
            type: 'scene',
            inputs: [
              {
                id: 'open',
                hostId: 'open',
                title: '打开',
                type: 'normal',
                schema: {
                  type: 'any'
                },
              }
            ],
            diagrams: [],
          }
          nodeToTptMap.set(path.node, tpt);
        } else if (tagName === 'flex') {
          const tpt = {
            id,
            namespace: 'flex',
            title: attributes.title,
            style: {
              ...attributes.layout,
              styleAry: attributes.styleAry,
              flexDirection: attributes.row ? 'row' : (attributes.column ? 'column' : 'column')
            },
            comAry: [],
          }
          const parentTpt = nodeToTptMap.get(path.parent);
          parentTpt.comAry.push(tpt);
          nodeToTptMap.set(path.node, tpt);
        } else if (tagName === 'group') {
          const tpt = {
            id,
            namespace: 'group',
            title: attributes.title,
            style: {
              ...attributes.layout,
              styleAry: attributes.styleAry,
            },
            comAry: [],
          }
          const parentTpt = nodeToTptMap.get(path.parent);
          parentTpt.comAry.push(tpt);
          nodeToTptMap.set(path.node, tpt);
        } else if (tagName === 'view') {
          const tpt = {
            id,
            namespace: 'view',
            title: attributes.title,
            style: {
              ...attributes.layout,
              styleAry: attributes.styleAry,
            },
            comAry: [],
          }
          const parentTpt = nodeToTptMap.get(path.parent);
          parentTpt.comAry.push(tpt);
          nodeToTptMap.set(path.node, tpt);
        } else if (tagName === 'relative') {
          const tpt = {
            id,
            namespace: 'relative',
            title: attributes.title,
            style: {
              ...attributes.layout,
              styleAry: attributes.styleAry,
            },
            comAry: [],
          }
          const parentTpt = nodeToTptMap.get(path.parent);
          parentTpt.comAry.push(tpt);
          nodeToTptMap.set(path.node, tpt);
        } else if (tagName.startsWith("slots")) {
          const [_, slotId] = tagName.split(".");
          const parentTpt = nodeToTptMap.get(path.parent);

          if (!parentTpt.slots) {
            parentTpt.slots = {}
          }

          if (!parentTpt.slots[slotId]) {
            const slotTpt = {
              id: slotId,
              style: attributes.layout,
              title: attributes.title,
              type: attributes.type,
              comAry: []
            }
            parentTpt.slots[slotId] = slotTpt;
            nodeToTptMap.set(path.node, slotTpt);
          }

        } else {
          const parentTpt = nodeToTptMap.get(path.parent);
          const tpt = {
            id,
            name: uuid(),
            data: attributes.data,
            namespace: tagName,
            title: attributes.title,
            style: {
              ...attributes.layout,
              styleAry: attributes.styleAry,
            },
            themesId: "_defined",
            outputs: [],
            inputs: []
            // version
          }

          if (attributes.ref) {
            comRefAndIdMap.set(attributes.ref, tpt)
          }

          if(!parentTpt.comAry){
            debugger
          }

          parentTpt.comAry.push(tpt);
          nodeToTptMap.set(path.node, tpt);
        }
      }
    },
  })

  traverse(ast, {
    enter(path) {
      if (path.isJSXElement()) {
        const diagrams = interaction.diagrams

        function getComWithTarget(target: 'this' | string) {
          if (target === 'this') {
            return nodeToTptMap.get(path.node)
          }
          if (comRefAndIdMap.has(target)) {
            return comRefAndIdMap.get(target)
          }

          return {
            id: uuid(),
          }
        }

        const attributes = getAttributes(path.node.openingElement.attributes as GetAttributesParams);

        if (Array.isArray(attributes.outputs)) {
          const outputsValue = attributes.outputs;

          if (!Array.isArray(outputsValue)) {
            return
          }

          const curCom = getComWithTarget('this')

          const diagram = {
            id: uuid(),
            // title: '点击',
            type: 'event',
            from: {
              com: {
                id: curCom.id,
                title: curCom.title,
              }
            },
            comAry: [],
            connections: []
          };

          const methodsId = {};

          const allComAry = new Set();

          (outputsValue[0] ?? []).forEach(item => {
            const {from, to} = item ?? {};
            const [fromComString, fromComMethod] = from ?? []
            const [toComString, toComMethod] = to ?? []
            const fromCom = getComWithTarget(fromComString)
            const toCom = getComWithTarget(toComString)

            if (!fromCom || !toCom) {
              console.warn('逻辑组件连线有缺失')
              return
            }

            if (!methodsId[`${fromCom.id}@${fromComMethod}`]) {
              methodsId[`${fromCom.id}@${fromComMethod}`] = uuid();
            }

            if (!methodsId[`${toCom.id}@${toComMethod}`]) {
              methodsId[`${toCom.id}@${toComMethod}`] = uuid();
            }

            allComAry.add(fromCom)
            allComAry.add(toCom)


            diagram.connections.push({
              from: {
                com: {
                  id: fromCom.id,
                  title: fromCom.title
                },
                pin: {
                  id: methodsId[`${fromCom.id}@${fromComMethod}`],
                  hostId: fromComMethod,
                  position: {}
                  //   title: '输出占位',
                }
              },
              to: {
                com: {
                  id: toCom.id,
                  title: toCom.title
                },
                pin: {
                  id: methodsId[`${toCom.id}@${toComMethod}`],
                  hostId: toComMethod,
                  // title: '输入占位',
                  position: {}
                }
              }
            })

            if (fromComString === 'this') {
              diagram.from.com.pinId = fromComMethod;
            }

            // 给组件增加inputs & outputs
            if (!fromCom.outputs.some(output => output.hostId === fromComMethod)) {
              fromCom.outputs.push({
                id: methodsId[`${fromCom.id}@${fromComMethod}`],
                hostId: fromComMethod,
                // title: '输出占位'
              })
            }
            if (!toCom.inputs.some(input => input.id === toComMethod)) {
              toCom.inputs.push({
                id: toComMethod,
                // title: '输出占位'
              })
            }
          })

          diagram.comAry = Array.from(allComAry)
          diagrams.push(diagram)
        }
      }

    }
  })

  return {
    ui,
    interaction
  };
}

const getTagName = (name: JSXIdentifier | JSXMemberExpression | JSXNamespacedName) => {
  if (types.isJSXIdentifier(name)) {
    return name.name
  } else if (types.isJSXMemberExpression(name)) {
    let tagName = "";
    while (types.isJSXMemberExpression(name)) {
      tagName = `.${name.property.name}${tagName}`;
      name = name.object;
    }
    return `${name.name}${tagName}`;
  }

  return;
}

type ParseValueParams = JSXExpressionContainer | StringLiteral | ObjectExpression | NumericLiteral;
const parseValue = (value: ParseValueParams) => {
  // 处理简写属性的情况
  if (value === null) {
    return true; // JSX属性简写形式会被解析为null
  }

  if (types.isStringLiteral(value)) {
    return value.value;
  } else if (types.isNumericLiteral(value)) {
    return value.value;
  } else if (types.isBooleanLiteral(value)) {
    return value.value;
  } else if (types.isJSXExpressionContainer(value)) {
    return parseValue(value.expression as ParseValueParams);
  } else if (types.isObjectExpression(value)) {
    const result: Record<string, any> = {};
    value.properties.forEach((property: any) => {
      const key = types.isIdentifier(property.key) ? property.key.name : property.key.value;
      result[key] = parseValue(property.value as ParseValueParams);
    });
    return result;
  } else if (types.isArrayExpression(value)) {
    return value.elements.map(element => parseValue(element as ParseValueParams));
  }

  return value;
}

type GetAttributesParams = JSXAttribute[];
const getAttributes = (attributes: GetAttributesParams) => {
  const result: Record<string, any> = {};
  attributes.forEach((attribute) => {
    const name = attribute.name.name as string;
    const value = parseValue(attribute.value as ParseValueParams);
    result[name] = value;
  });
  return result;
}

// utils
function uuid() {
  // 定义字符集，包含大小写字母和数字
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  // 初始化结果字符串，以 'u_' 开头
  let result = 'u_';
  // 循环 5 次，随机选择字符集中的字符拼接到结果字符串中
  for (let i = 0; i < 5; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  // 返回生成的 ID
  return result;
}