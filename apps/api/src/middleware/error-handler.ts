import { FastifyInstance } from 'fastify'
import * as Sentry from '@sentry/node'

export class UserFacingError extends Error {
  statusCode: number
  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = 'UserFacingError'
    this.statusCode = statusCode
  }
}

export function setupErrorHandler(fastify: FastifyInstance) {
  fastify.setErrorHandler((error, request, reply) => {
    // Log the error
    fastify.log.error(error)

    if (error instanceof UserFacingError) {
      return reply.status(error.statusCode).send({
        error: error.name,
        message: error.message
      })
    }

    if (error.code === 'FST_ERR_VALIDATION') {
      return reply.status(400).send({
        error: 'ValidationError',
        message: error.message
      })
    }

    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        error: error.name || 'Error',
        message: error.message
      })
    }

    // Default to 500 Internal Server Error
    Sentry.captureException(error)
    return reply.status(500).send({
      error: 'InternalServerError',
      message: 'An unexpected error occurred.'
    })
  })
}
