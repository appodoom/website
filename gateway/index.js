// Gateway
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const {
    createProxyMiddleware: createHttpProxyMiddleware,
} = require("http-proxy-middleware");
const rateLimit = require("express-rate-limit");
require("dotenv").config({ path: "../.env" });

const app = express();

let proxies = [];

// =======================
// Proxy Class Definition
// =======================
class Proxy {
    constructor(name, context, port, host = "localhost", protocol = "http") {
        this.name = name;
        this.context = context;
        this.port = port;
        this.protocol = protocol;
        this.host = host;
        proxies.push(this);
    }

    create() {
        return createHttpProxyMiddleware(this.context, {
            target: {
                host: this.host,
                port: this.port,
                protocol: this.protocol,
            },
            changeOrigin: true,
        });
    }

    get path() {
        return `${this.protocol}://${this.host}:${this.port}/${this.name}`;
    }

    async test() {
        try {
            await axios.get(this.path + "/test/");
            console.log(`[TEST SUCCESSFUL] ${this.name} api`);
            return true;
        } catch (error) {
            console.log(`[TEST FAILED] ${this.name} api: ${error.message}`);
            return false;
        }
    }
}

// =======================
// Creating Proxies
// =======================
const generateApi = new Proxy("api/generate", "/api/generate/**", process.env.GENERATE_PORT, "generate");
const webApi = new Proxy("web", "/web/**", process.env.WEB_PORT, "web");

const proxiesToTest = [generateApi, webApi];
const proxiesRequestHandlers = new Map();

// =======================
// Functions
// =======================
function proxyErrorHandler(_req, res) {
    res.send("The accessed resource is not available right now. Please try again later");
}

function customExpressRequestHandler(name) {
    return proxiesRequestHandlers.get(name) || proxyErrorHandler;
}

async function testAllProxiesOnce() {
    const failed = [];
    for (const proxy of proxiesToTest) {
        const success = await proxy.test();
        if (!success) failed.push(proxy.name);
    }

    if (failed.length > 0) {
        console.log(`[GATEWAY ERROR] The following proxies failed initial test:`);
        failed.forEach((name) => console.log(`  - ${name}`));
        return false;
    }

    console.log(`[GATEWAY OK] All proxies passed initial test`);
    return true;
}

async function periodicTest(deltaSeconds) {
    console.log(`[TEST MONITOR] Running proxy health checks every ${deltaSeconds}s`);
    setInterval(async () => {
        console.log(`[TEST MONITOR] Checking proxies...`);
        for (const proxy of proxiesToTest) {
            const success = await proxy.test();
            if (!success) {
                console.log(`[MONITOR ALERT] ${proxy.name} failed health check.`);
            }
        }
    }, deltaSeconds * 1000);
}

// =======================
// Initialize Gateway
// =======================
(async () => {
    console.log(`[GATEWAY INIT] Testing proxies before starting...`);
    const success = await testAllProxiesOnce();

    if (!success) {
        console.log(`[GATEWAY STOPPED] One or more proxies failed initial test. Fix them and retry.`);
        process.exit(1);
    }

    // Register proxy handlers
    proxiesToTest.forEach((proxy) => {
        proxiesRequestHandlers.set(proxy.name, proxy.create());
    });

    const limiter = rateLimit({
        windowMs: 30 * 1000,
        max: 15,
        message: `Too many requests. Try again later`,
    });

    app.use(cors());
    // app.use(limiter);
    app.get('/', (req, res) => {
        res.redirect('/web/');
    });


    for (const proxy of proxies) {
        app.use(proxy.context, customExpressRequestHandler(proxy.name));
    }

    app.use((req, res) => {
        res.redirect('/web/404/');
    })

    const GATEWAY_PORT = process.env.GATEWAY_PORT || 8080;
    app.listen(GATEWAY_PORT, () => {
        console.log(`[GATEWAY LISTENING] Gateway is listening on port ${GATEWAY_PORT}`);
    });

    // Start periodic tests
    const DELTA_SECONDS = Number(process.env.DELTA_SECONDS) || 30;
    await periodicTest(DELTA_SECONDS);
})();