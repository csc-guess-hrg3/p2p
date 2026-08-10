import { KeyedMutex } from './keyed-mutex';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('KeyedMutex', () => {
  it('serializa execuções da mesma chave (concorrência máx. 1)', async () => {
    const mutex = new KeyedMutex();
    let active = 0;
    let maxActive = 0;
    const fn = async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await sleep(5);
      active--;
    };
    await Promise.all([1, 2, 3, 4].map(() => mutex.run('k', fn)));
    expect(maxActive).toBe(1);
  });

  it('deixa chaves diferentes correrem em paralelo', async () => {
    const mutex = new KeyedMutex();
    let active = 0;
    let maxActive = 0;
    const fn = async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await sleep(5);
      active--;
    };
    await Promise.all(['a', 'b', 'c'].map((k) => mutex.run(k, fn)));
    expect(maxActive).toBeGreaterThan(1);
  });

  it('propaga o resultado e libera a chave mesmo após erro', async () => {
    const mutex = new KeyedMutex();
    await expect(
      mutex.run('k', () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    // chave foi liberada → a próxima execução roda normalmente
    await expect(mutex.run('k', () => Promise.resolve(42))).resolves.toBe(42);
  });
});
