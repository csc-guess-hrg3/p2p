/**
 * Aumento de tipo do Express — adiciona `cookies` ao Request.
 * O cookie-parser middleware popula essa property, mas o tipo padrão
 * do express não reflete (não há acoplamento entre o middleware e o
 * tipo base). Sem isso, `req.cookies` é `any` por necessidade.
 */
import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    cookies?: Record<string, string | undefined>;
  }
}
