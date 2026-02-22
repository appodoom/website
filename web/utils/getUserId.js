const jwt = require('jsonwebtoken');

function getUserId(req) {
    const token = req.cookies.token;

    const { id } = jwt.verify(token, process.env.SECRET_KEY);

    return id;
}

module.exports = { getUserId };