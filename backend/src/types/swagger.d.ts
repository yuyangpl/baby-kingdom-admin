declare module 'swagger-jsdoc' {
  interface Options {
    definition: Record<string, unknown>;
    apis: string[];
  }
  function swaggerJsdoc(options: Options): Record<string, unknown>;
  export = swaggerJsdoc;
}

declare module 'swagger-ui-express' {
  import { RequestHandler } from 'express';
  export const serve: RequestHandler[];
  export function setup(
    spec: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): RequestHandler;
}
