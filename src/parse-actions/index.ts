import { jsonrepair } from 'jsonrepair'

interface Config {
  path: string,
  value: any,
  style: any
}


interface AddChildActionParams {
  namespace?: string
  ns?: string,
  layout?: any,
  configs: Config[]
}

interface DoConfigActionParams {
  path: string,
  value: any
}

type ActionParams = AddChildActionParams | DoConfigActionParams

interface Action {
  comId: string,
  type: string,
  target: string,
  params: ActionParams
}

export const parseActions = (actions = []) => {
  let _actions = actions;
  if (typeof actions === 'string') {
    try {
      _actions = JSON.parse(actions)
    } catch (error) {
      console.warn('parse actions error，trying repairing...', error?.message || 'unknown error')
      try {
        const repairedActions = jsonrepair(actions)
        _actions = JSON.parse(repairedActions)
      } catch (error) {
        console.error('repair actions error, please try again', error)
      }
    }
  }

  if (!Array.isArray(_actions)) {
    throw new Error('actions must be an array')
  }

  return _actions.map(act => {
    if (!Array.isArray(act)) {
      return act
    }
    const [comId, target, type, params] = act;
    const newAct: Action = {
      comId,
      type,
      target,
      params
    }

    // ns => namespace
    if (newAct.type === 'addChild') {
      if (newAct.params?.ns) {
        newAct.params.namespace = newAct.params.ns;
        delete newAct.params.ns
      }
    }

    // absolute 布局的转化
    if (newAct.params?.value?.display === 'absolute') {
      newAct.params.value.position = 'smart'
      delete newAct.params.value.display
    }

    // absolute 布局的转化
    if (newAct.type === 'addChild' && Array.isArray(newAct.params?.configs)) {
      newAct.params.configs.forEach(config => {
        if (config?.value?.display === 'absolute') {
          config.value.position = 'smart'
          delete config.value.display
        }

        if (config?.style) {
          // 兼容background
          transformToValidBackground(config?.style)
        }
      })
    }

    // 对样式幻觉的兼容
    if (newAct.type === 'doConfig' && newAct.params?.style) {
      // 兼容background
      transformToValidBackground(newAct.params?.style)
    }
    if (newAct.type === 'addChild' && newAct.params?.layout) {
      // 兼容margin
      transformToValidMargins(newAct.params?.layout)
    }

    return newAct
  })
}


/** 
 * 将background转换为有效的backgroundColor和backgroundImage
 * @param styles 需要转换的样式对象
 */
function transformToValidBackground(styles: any): void {
  // 兼容下把渐变色配置到backgroundColor的情况
  if (styles?.backgroundColor && styles?.backgroundColor?.indexOf('gradient') > -1) {
    const imageRegex = /(url\([^)]+\)|linear-gradient\([^)]+\)|radial-gradient\([^)]+\)|conic-gradient\([^)]+\))/;
    const imageMatch = styles.backgroundColor.match(imageRegex);

    if (imageMatch && !styles.backgroundImage) {
      styles.backgroundImage = imageMatch[0];
    }

    delete styles.backgroundColor
  }

  // 如果没有background属性,直接返回
  if (!styles.background) {
    return;
  }

  const background = styles.background.toString();

  // 提取颜色值
  // 匹配颜色格式: #XXX, #XXXXXX, rgb(), rgba(), hsl(), hsla(), 颜色关键字
  const colorRegex = /(#[0-9A-Fa-f]{3,6}|rgb\([^)]+\)|rgba\([^)]+\)|hsl\([^)]+\)|hsla\([^)]+\)|[a-zA-Z]+)/;
  const colorMatch = background.match(colorRegex);

  // 提取图片url或渐变
  // 匹配url()或各种渐变函数
  const imageRegex = /(url\([^)]+\)|linear-gradient\([^)]+\)|radial-gradient\([^)]+\)|conic-gradient\([^)]+\))/;
  const imageMatch = background.match(imageRegex);

  // 删除原有的background属性
  delete styles.background;

  // 如果找到颜色值,设置backgroundColor
  if (colorMatch && !styles.backgroundColor) {
    styles.backgroundColor = colorMatch[0];
  }

  // 如果找到图片或渐变,设置backgroundImage
  if (imageMatch && !styles.backgroundImage) {
    styles.backgroundImage = imageMatch[0];
  }
}

/**
 * 将margin简写转换为marginTop/Right/Bottom/Left
 * @param styles 需要转换的样式对象
 */
function transformToValidMargins(styles: any): void {
  // 如果没有margin属性,直接返回
  if (!styles.margin) {
    return;
  }

  const margin = styles.margin.toString().trim();
  const values = margin.split(/\s+/); // 按空格分割

  // 根据值的数量设置不同方向的margin
  switch (values.length) {
    case 1: // margin: 10px;
      styles.marginTop = values[0];
      styles.marginRight = values[0];
      styles.marginBottom = values[0];
      styles.marginLeft = values[0];
      break;
    case 2: // margin: 10px 20px;
      styles.marginTop = values[0];
      styles.marginRight = values[1];
      styles.marginBottom = values[0];
      styles.marginLeft = values[1];
      break;
    case 3: // margin: 10px 20px 30px;
      styles.marginTop = values[0];
      styles.marginRight = values[1];
      styles.marginBottom = values[2];
      styles.marginLeft = values[1];
      break;
    case 4: // margin: 10px 20px 30px 40px;
      styles.marginTop = values[0];
      styles.marginRight = values[1];
      styles.marginBottom = values[2];
      styles.marginLeft = values[3];
      break;
  }

  // 删除原有的margin属性
  delete styles.margin;
}