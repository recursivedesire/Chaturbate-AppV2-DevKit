class TemplateEngine {

    static render(str: string, params: object|Array<any>, depth = 3): string {
        if (Array.isArray(params)) {
            params = params.reduce((acc, val, index) => {
                acc[index] = val;
                return acc;
            }, {});
        }

        let result = str.replace(/{(\d+|[$?\w.]+)(?:\?(.*?)(?::(.*?))?)?}/g, (match, key, trueValue, falseValue) => {
            let value = key.split('.').reduce((o, k) => o && o[k], params);

            if (value === undefined) {
                return falseValue !== undefined ? falseValue : match;
            }

            return value ? trueValue || value.toString() : falseValue !== undefined ? falseValue : '';
        }).replace(/\\(\[{}\])/g, "$1");

        return depth > 0 && result.includes('{') ? TemplateEngine.render(result, params, depth - 1) : result;
    }
}

export {TemplateEngine};
