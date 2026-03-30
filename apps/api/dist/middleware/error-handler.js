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
exports.UserFacingError = void 0;
exports.setupErrorHandler = setupErrorHandler;
const Sentry = __importStar(require("@sentry/node"));
class UserFacingError extends Error {
    statusCode;
    constructor(message, statusCode = 400) {
        super(message);
        this.name = 'UserFacingError';
        this.statusCode = statusCode;
    }
}
exports.UserFacingError = UserFacingError;
function setupErrorHandler(fastify) {
    fastify.setErrorHandler((error, request, reply) => {
        // Log the error
        fastify.log.error(error);
        if (error instanceof UserFacingError) {
            return reply.status(error.statusCode).send({
                error: error.name,
                message: error.message
            });
        }
        if (error.code === 'FST_ERR_VALIDATION') {
            return reply.status(400).send({
                error: 'ValidationError',
                message: error.message
            });
        }
        if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
            return reply.status(error.statusCode).send({
                error: error.name || 'Error',
                message: error.message
            });
        }
        // Default to 500 Internal Server Error
        Sentry.captureException(error);
        return reply.status(500).send({
            error: 'InternalServerError',
            message: 'An unexpected error occurred.'
        });
    });
}
