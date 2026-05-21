type RewriteRule = {
    type: 'exact' | 'prefix' | 'regex';
    from: string | RegExp;
    to: string | ((substring: string, ...args: string[]) => string);
};

class InputRewriter {
    private rules: RewriteRule[] = [];

    exact(from: string, to: string): this {
        this.rules.push({ type: 'exact', from, to });
        return this;
    }

    prefix(from: string, to: string): this {
        this.rules.push({ type: 'prefix', from, to });
        return this;
    }

    regex(from: RegExp, to: string | ((substring: string, ...args: string[]) => string)): this {
        this.rules.push({ type: 'regex', from, to });
        return this;
    }

    rewrite(input: string): string {
        for (const rule of this.rules) {
            if (rule.type === 'exact') {
                if (input === rule.from) {
                    return rule.to as string;
                }
            } else if (rule.type === 'prefix') {
                if (input.startsWith(rule.from as string)) {
                    return (rule.to as string) + input.slice((rule.from as string).length);
                }
            } else if (rule.type === 'regex') {
                const regex = rule.from as RegExp;
                if (regex.test(input)) {
                    return input.replace(regex, rule.to as any);
                }
            }
        }
        return input;
    }
}

export {InputRewriter};
