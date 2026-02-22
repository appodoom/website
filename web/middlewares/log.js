function log(req, res, next) {

    const oldSend = res.send;
    res.send = function(body) {
        const preview = typeof body === 'string' ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200);
        console.log(
            `[${req.method}] ${req.originalUrl} → ${res.statusCode} | Response:`,
            preview
        );
        return oldSend.call(this, body);
    };

    next();
}

module.exports = { log };