import less from "less"
import * as babel from "@babel/standalone"

/** 编译less */
export const compileLESS = (code: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      less.render(code, {}, (error, output) => {
        if (error) {
          reject(error)
        } else if (output) {
          resolve(output.css)
        } else {
          reject("未知错误")
        }
      })
    } catch (error) {
      reject(error)
    }
  })
}

export const compileJSX = (code: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const options = {
      presets: [
        [
          "env",
          {
            "modules": "commonjs"
          }
        ],
        'react'
      ],
      plugins: [
        ['proposal-decorators', {legacy: true}],
        'proposal-class-properties',
        [
          'transform-typescript',
          {
            isTSX: true
          }
        ],
      ]
    }
    try {
      const result = babel.transform(code, options)?.code

      if (result) {
        resolve(result)
      } else {
        reject("未知错误")
      }
    } catch (error) {
      reject(error)
    }
  })
}