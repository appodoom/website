function validate(arglen, ...args) {
    if (args.length !== arglen) return false;
    for (const arg of args) {
        if (!arg || arg.trim().length === 0) return false;
    }
    return true;
}

module.exports = { validate };