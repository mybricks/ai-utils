export const parseActions = (actions = []) => {
  if (!Array.isArray(actions)) {
    throw new Error('actions must be an array')
  }
  return actions.map(act => {
    if (!Array.isArray(act)) {
      return act
    }
    const [comId, target, type, params] = act;
    const newAct = {
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
      })
    }

    return newAct
  })
}