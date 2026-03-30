"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
const jose = __importStar(require("jose"));
const prisma_js_1 = require("../lib/prisma.js");
// We expect these to be supplied in process.env
const ENTRA_TENANT_ID = process.env.ENTRA_TENANT_ID || 'common';
// Microsoft Entra ID OpenID Connect JWKS URIs
// v1.0 is required for IdTokens and Graph-scoped tokens from older/strict app registrations
// v2.0 is the modern standard. We check the token version and use the matching key set.
const JWKS_V1_URI = `https://login.microsoftonline.com/${ENTRA_TENANT_ID}/discovery/keys`;
const JWKS_V2_URI = `https://login.microsoftonline.com/${ENTRA_TENANT_ID}/discovery/v2.0/keys`;
const JWKS_V1 = jose.createRemoteJWKSet(new URL(JWKS_V1_URI));
const JWKS_V2 = jose.createRemoteJWKSet(new URL(JWKS_V2_URI));
async function authenticate(request, reply) {
    const authHeader = request.headers.authorization;
    const queryToken = request.query?.token;
    let rawToken;
    if (authHeader?.startsWith('Bearer ')) {
        rawToken = authHeader.substring(7).trim();
    }
    else if (queryToken) {
        rawToken = queryToken.trim();
    }
    // Guard against common "empty" strings or missing tokens
    if (!rawToken || rawToken === 'undefined' || rawToken === 'null' || rawToken === '') {
        return reply.status(401).send({
            error: 'Unauthorized',
            message: 'Missing authentication token'
        });
    }
    const token = rawToken;
    try {
        // 1. Decode without verification to check version so we can use the right JWKS
        const decoded = jose.decodeJwt(token);
        const isV2 = decoded.ver === '2.0';
        const jwks = isV2 ? JWKS_V2 : JWKS_V1;
        // 2. Validate the JWT signature
        const { payload } = await jose.jwtVerify(token, jwks);
        // 3. Enforce correct tenant
        const tokenTenantId = payload.tid;
        if (ENTRA_TENANT_ID !== 'common' && tokenTenantId && tokenTenantId !== ENTRA_TENANT_ID) {
            return reply.status(401).send({
                error: 'Unauthorized',
                message: 'Token is from wrong tenant',
                details: `Expected ${ENTRA_TENANT_ID}, got ${tokenTenantId}`
            });
        }
        const entraId = payload.oid;
        const email = (payload.preferred_username || payload.upn || payload.email || '');
        const displayName = (payload.name || '');
        if (!entraId || !email) {
            return reply.status(401).send({ error: 'Unauthorized', message: 'Token is missing oid or email claims' });
        }
        // Auto-provision on first login, update only when name/email change
        let user = await prisma_js_1.prisma.user.findUnique({ where: { entraId } });
        if (!user) {
            user = await prisma_js_1.prisma.user.create({
                data: { entraId, email, displayName, isActive: true, isAdmin: false }
            });
        }
        else if (user.email !== email || user.displayName !== displayName) {
            // Only write when something actually changed
            user = await prisma_js_1.prisma.user.update({
                where: { entraId },
                data: { email, displayName }
            });
        }
        if (!user.isActive) {
            return reply.status(403).send({ error: 'Forbidden', message: 'Your account is disabled' });
        }
        // Attach to request
        request.user = user;
    }
    catch (err) {
        request.log.warn({ err: err?.message, code: err?.code }, 'JWT Validation failed');
        return reply.status(401).send({
            error: 'Unauthorized',
            message: 'Invalid or expired token',
            details: err?.message,
            code: err?.code
        });
    }
}
