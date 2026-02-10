const getMethods = (obj) => {
    let properties = new Set()
    let currentObj = obj
    do {
      Object.getOwnPropertyNames(currentObj).map(item => properties.add(item))
    } while ((currentObj = Object.getPrototypeOf(currentObj)))
    return [...properties.keys()].filter(item => typeof obj[item] === 'function')
  }
// show({x}), must have {}, and x is a singel variable
const show = (x) => {
    try {
        // 如果 x 是 undefined 或 null
        if (x === undefined || x === null) {
            console.log(x);
            return;
        }
        
        // 如果 x 不是对象，直接打印
        if (typeof x !== 'object') {
            console.log(x.toString ? x.toString() : String(x));
            return;
        }
        
        // 如果 x 是数组
        if (Array.isArray(x)) {
            console.log("[");
            x.forEach((item, index) => {
                console.log(`  [${index}]:`, item.toString ? item.toString() : String(item));
            });
            console.log("]");
            return;
        }
        
        // 如果 x 是对象，尝试获取键值对
        const keys = Object.keys(x);
        const values = Object.values(x);
        
        if (keys.length === 0) {
            console.log("{}");
        } else if (keys.length === 1) {
            // 单键值对的情况
            const key = keys[0];
            const value = values[0];
            console.log(key + ": " + (value && value.toString ? value.toString() : String(value)));
        } else {
            // 多键值对的情况
            console.log("{");
            keys.forEach((key, index) => {
                const value = values[index];
                console.log(`  ${key}:`, value && value.toString ? value.toString() : String(value));
            });
            console.log("}");
        }
    } catch (error) {
        console.log("[Error in show function]:", error.message);
        console.log("Original input:", x);
    }
}
const getVarName = varObj => {
    Object.keys(varObj)[0]
}

module.exports = {
    getMethods,
    show,
    getVarName
};