import { isCsrfAllowed, isSafeMethod } from './csrf';

const ALLOWED = ['http://localhost:5173', 'https://p2p.hrg3.com.br'];

describe('csrf', () => {
  it('métodos seguros sempre passam', () => {
    for (const m of ['GET', 'HEAD', 'OPTIONS', 'get']) {
      expect(isSafeMethod(m)).toBe(true);
      expect(
        isCsrfAllowed({
          method: m,
          origin: 'https://evil.com',
          host: 'p2p.hrg3.com.br',
          allowedOrigins: ALLOWED,
        }),
      ).toBe(true);
    }
  });

  it('mutação same-origin passa (Origin host == Host)', () => {
    expect(
      isCsrfAllowed({
        method: 'POST',
        origin: 'https://p2p.hrg3.com.br',
        host: 'p2p.hrg3.com.br',
        allowedOrigins: [],
      }),
    ).toBe(true);
  });

  it('mutação cross-origin na allowlist passa (dev 5173 → 3001)', () => {
    expect(
      isCsrfAllowed({
        method: 'POST',
        origin: 'http://localhost:5173',
        host: 'localhost:3001',
        allowedOrigins: ALLOWED,
      }),
    ).toBe(true);
  });

  it('mutação cross-site maliciosa é barrada', () => {
    expect(
      isCsrfAllowed({
        method: 'POST',
        origin: 'https://evil.com',
        host: 'p2p.hrg3.com.br',
        allowedOrigins: ALLOWED,
      }),
    ).toBe(false);
  });

  it('cai pro Referer quando não há Origin', () => {
    expect(
      isCsrfAllowed({
        method: 'DELETE',
        referer: 'https://p2p.hrg3.com.br/pedidos/123',
        host: 'p2p.hrg3.com.br',
        allowedOrigins: [],
      }),
    ).toBe(true);
    expect(
      isCsrfAllowed({
        method: 'DELETE',
        referer: 'https://evil.com/attack',
        host: 'p2p.hrg3.com.br',
        allowedOrigins: ALLOWED,
      }),
    ).toBe(false);
  });

  it('cliente não-browser (sem Origin nem Referer) passa', () => {
    expect(
      isCsrfAllowed({
        method: 'POST',
        host: 'p2p.hrg3.com.br',
        allowedOrigins: ALLOWED,
      }),
    ).toBe(true);
  });
});
