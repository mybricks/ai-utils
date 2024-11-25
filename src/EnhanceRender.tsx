import {cloneElement, createContext, isValidElement, useContext, forwardRef} from "react";
//import ComContext from "../../ComContext";

const REACT_MEMO_TYPE = Symbol.for('react.memo')
const REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref')
const REACT_FRAGMENT_TYPE = Symbol.for('react.fragment')
const REACT_PROVIDER_TYPE = Symbol.for('react.provider')
const REACT_CONTEXT_TYPE = Symbol.for('react.context');

const RCContext = createContext({} as { _key: string })

//const EditorsContext = createContext({} as { editors: {} })

export function EnhanceRender({children}) {
  //const {model} = comContext
  //const extSourceCodes = model.runtime.model.extSourceCodes
  // const editors = extSourceCodes.editors
  //
  // debugger
  //
  // console.log(editors)

  return (
    <XYRender>
      {children}
    </XYRender>
  )

  // return (
  //   <EditorsContext.Provider value={{editors}}>
  //     <XYRender>
  //       {children}
  //     </XYRender>
  //   </EditorsContext.Provider>
  // )
}

const XYRender = forwardRef(XY)

function XY({_editors_, children}, ref) {
  //return children

  // console.log("children: ", children);
  if (!children) {
    return
  }

  if (Array.isArray(children)) {
    return children.map((child, index) => {
      return (
        <XYRender key={index}>
          {child}
        </XYRender>
      )
    })
  } else {
    if (isValidElement(children)) {
      const {type, props} = children

      console.log(props)////TODO Form的问题
      //
      // if (props?.["label"]==='用户名') {
      //   debugger
      // }

      let _key = children["key"]
      if (!_key && props) {
        _key = props["_key"]
      }

//console.log('_key::',_key)

      // if (_key === '1') {
      //   debugger
      // }

      // if(props?.['className']==='ant-table-cell'){
      //   console.log(arguments)
      //
      //   debugger
      // }

      //console.log(type)

      if (type["$$typeof"] === REACT_MEMO_TYPE) {
        if (_key) {
          return (
            <RCContext.Provider value={{_key}}>
              <MemoNext>{children}</MemoNext>
            </RCContext.Provider>
          )
        }

        return <MemoNext>{children}</MemoNext>
      } else if (type["$$typeof"] === REACT_FORWARD_REF_TYPE) {
        if (_key) {
          return (
            <RCContext.Provider value={{_key}}>
              <ForwardRefNext>{children}</ForwardRefNext>
            </RCContext.Provider>
          )
        }

        return <ForwardRefNext>{children}</ForwardRefNext>
      } else if (type["$$typeof"] === REACT_PROVIDER_TYPE) {
        const nextChildren = props.children;

        if (nextChildren) {
          return cloneElement(children, {
            ...props,
            'data-selector-key': _key,
            children: <XYRender>{nextChildren}</XYRender>,
          })
        }
      } else if (type["$$typeof"] === REACT_CONTEXT_TYPE) {
        const nextChildren = props.children;

        if (nextChildren) {
          return cloneElement(children, {
            ...props,
            'data-selector-key': _key,
            children: (...args) => {
             return <XYRender>{nextChildren(...args)}</XYRender>
            }
          })
        }

        return children;
      } else if (type === REACT_FRAGMENT_TYPE) {
        if (_key) {
          return (
            <RCContext.Provider value={{_key}}>
              <FragmentNext>{children}</FragmentNext>
            </RCContext.Provider>
          )
        }

        return <FragmentNext>{children}</FragmentNext>
      } else if (type === REACT_PROVIDER_TYPE) {
        if (_key) {
          return (
            <RCContext.Provider value={{_key}}>
              <ProviderNext>{children}</ProviderNext>
            </RCContext.Provider>
          )
        }

        return <ProviderNext>{children}</ProviderNext>
      } else if (typeof type === 'function') {
        if (_key) {
          return (
            <RCContext.Provider value={{_key}}>
              <FunctionNext>{children}</FunctionNext>
            </RCContext.Provider>
          )
        }

        return <FunctionNext>{children}</FunctionNext>
      } else if (typeof type === "string") {
        if (_key) {
          return (
            <RCContext.Provider value={{_key}}>
              <StringNext>{children}</StringNext>
            </RCContext.Provider>
          )
        }

        return <StringNext>{children}</StringNext>
      } else {
        const nextChildren = props.children;

        if (nextChildren) {
          return cloneElement(children, {
            ...props,
            'data-selector-key': _key,
            children: <XYRender>{nextChildren}</XYRender>,
          })
        }
      }
    } else {
      // debugger
      //
      // console.log("不是react节点？", children)
    }
  }

  return children
}

function StringNext({children}) {
  const context = useContext(RCContext)
  const {_key} = context

  const {props} = children;
  const nextChildren = props.children;
  const otherProps = {}
  // if (children.type === "h2") {
  //   // console.log("children: ", children, nextChildren)
  //   const getTextWidth = (text, font) => {
  //     const canvas = document.createElement('canvas');
  //     const context = canvas.getContext('2d');
  //     context.font = font;
  //     const metrics = context.measureText(text);
  //     console.log("metrics: ", metrics)
  //     console.log("font: ", font)
  //     return metrics.width;
  //   }
  //
  //   otherProps.onMouseUp = (e) => {
  //     console.log("e: ", e);
  //     console.log("bcr: ", e.target.getBoundingClientRect())
  //     console.log("children: ", children)
  //     const text = e.target.textContent;
  //     console.log("text: ", text);
  //     console.log("??: ", getTextWidth(text, window.getComputedStyle(e.target).font))
  //     const style = window.getComputedStyle(e.target);
  //     console.log("style: ", style)
  //   }
  // }

  if (nextChildren) {
    return cloneElement(children, {
      ...otherProps,
      ...props,
      children: <XYRender>{nextChildren}</XYRender>,
      _key
    })
  }

  return cloneElement(children, {
    ...props,
    _key
  })
}

function FunctionNext({children}) {
  const {type, props} = children

  // const context = useContext(EditorsContext)
  // const {editors} = context

  // if(Array.isArray(editors)){
  //   editors.find(edt=>{
  //     if(edt.com===''){
  //
  //     }
  //   })
  // }

  //console.log(type, props)

  if (type.prototype instanceof React.Component) {
    return <ProviderNext>{children}</ProviderNext>
    if (props.children) {
      return cloneElement(children, {
        ...props,
        children: <XYRender>{props.children}</XYRender>,
      })
    } else {
      return children
    }
  }

  const next = type(props)

  return (
    <XYRender>
      {next}
    </XYRender>
  )
}

function FragmentNext({children}) {
  const {props} = children
  const nextChildren = props.children

  if (nextChildren) {
    return <XYRender>{nextChildren}</XYRender>
  }

  return children
}

function ProviderNext({children}) {
  const {props} = children
  const nextChildren = props.children

  if (nextChildren) {
    if (typeof nextChildren === "function") {
      return cloneElement(children, {
        ...props,
        children: (...args) => {
          return <XYRender>{nextChildren(...args)}</XYRender>
        },
      })
    } else {
      return cloneElement(children, {
        ...props,
        children: <XYRender>{nextChildren}</XYRender>,
      })
    }
    return cloneElement(children, {
      ...props,
      children: <XYRender>{nextChildren}</XYRender>,
    })
  }

  return children
}


function ForwardRefNext({children}) {
  const {type, props, ref} = children
  const next = type.render(props, ref)

  //debugger

  return (
    <XYRender>
      {next}
    </XYRender>
  )
}

function MemoNext({children}) {
  const {type, props} = children
  if (typeof type.type === 'function') {
    const next = type.type(props)

    return (
      <XYRender>
        {next}
      </XYRender>
    )
  } else if (type.type["$$typeof"] === REACT_FORWARD_REF_TYPE) {
    const next = type.type.render(props, props.ref)

    //debugger

    return (
      <XYRender>
        {next}
      </XYRender>
    )
  } else {
    debugger
  }
}