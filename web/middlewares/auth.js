const jwt = require("jsonwebtoken");
const { User } = require("../db/schemas.js");

async function adminRoleRequired(req, res, next) {
    if (!req.cookies || !req.cookies.token) {
        res.status(403);
        res.redirect("/web/login/");
        return;
    }

    const token = req.cookies.token;
    const decoded = jwt.verify(token, process.env.SECRET_KEY);

    if (!decoded || !decoded.id) {
        res.status(403);
        res.redirect("/web/login/");
        return;
    }

    try {
        const user = await User.findOne({ where: { id: decoded.id } });
        if (!user) {
            res.status(403);
            res.redirect("/web/login/");
            return;
        }
        if (user.role !== "admin") {
            res.status(403);
            res.redirect("/web/");
            return;
        }
    } catch (e) {
        res.status(403);
        res.redirect("/web/login");
        return;
    }
    next();
}

async function generatorRoleRequired(req, res, next) {
    if (!req.cookies || !req.cookies.token) {
        res.status(403);
        res.redirect("/web/login/");
        return;
    }

    const token = req.cookies.token;

    const decoded = jwt.verify(token, process.env.SECRET_KEY);

    if (!decoded || !decoded.id) {
        res.status(403);
        res.redirect("/web/login/");
        return;
    }
    try {
        const user = await User.findOne({ where: { id: decoded.id } });
        if (!user) {
            res.status(403);
            res.redirect("/web/login/");
            return;
        }
        if (!["admin", "generate"].includes(user.role)) {
            res.status(403);
            res.redirect("/web/");
            return;
        }
    } catch (e) {
        res.status(403);
        res.redirect("/web/login");
        return;
    }
    next();
}

async function ratorRoleRequired(req, res, next) {
    if (!req.cookies || !req.cookies.token) {
        res.status(403);
        res.redirect("/web/login/");
        return;
    }

    const token = req.cookies.token;

    const decoded = jwt.verify(token, process.env.SECRET_KEY);

    if (!decoded || !decoded.id) {
        res.status(403);
        res.redirect("/web/login/");
        return;
    }
    try {
        const user = await User.findOne({ where: { id: decoded.id } });
        if (!user) {
            res.status(403);
            res.redirect("/web/login/");
            return;
        }
        if (!(["rate", "generate", "admin"].includes(user.role))) {
            res.status(403);
            res.redirect("/web/");
            return;
        }
    } catch (e) {
        res.status(403);
        res.redirect("/web/login");
        return;
    }
    next();
}

async function findRole(req, res, next) {
    if (!req.cookies || !req.cookies.token) {
        res.status(403);
        res.redirect("/web/login/");
        return;
    }

    const token = req.cookies.token;

    const decoded = jwt.verify(token, process.env.SECRET_KEY);

    if (!decoded || !decoded.id) {
        res.status(403);
        res.redirect("/web/login/");
        return;
    }
    try {
        const user = await User.findOne({ where: { id: decoded.id } });
        if (!user) {
            res.status(403);
            res.redirect("/web/login/");
            return;
        }
        switch (user.role) {
            case "generate":
                res.redirect("/web/generate/");
                return;
            case "rate":
                res.redirect("/web/rate/");
                return;
            case "admin":
                res.redirect("/web/admin/");
                return;
            default:
                break;
        }
    } catch (e) {
        res.status(403);
        res.redirect("/web/login");
        return;
    }
    next();
}

module.exports = { generatorRoleRequired, ratorRoleRequired, findRole, adminRoleRequired };