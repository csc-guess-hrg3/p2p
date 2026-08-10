/**
 * Mutex de exclusão mútua por chave (in-process). Serializa execuções
 * assíncronas que compartilham a mesma `key`, deixando as demais chaves
 * correrem em paralelo.
 *
 * Uso típico: serializar um "check-then-insert" não-atômico contra um
 * recurso externo (ex.: cadastro de fornecedor no ERP por CNPJ) para
 * evitar corrida que duplica o registro.
 *
 * Escopo: UM processo Node. Suficiente para a app em pm2 fork (instância
 * única por ambiente). Em cluster mode (N workers) NÃO serializa entre
 * processos — aí seria necessário um lock no banco (ex.: sp_getapplock).
 */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<unknown>>();

  /**
   * Executa `fn` garantindo que, para uma mesma `key`, só uma execução
   * roda por vez (as outras enfileiram). Libera a chave do mapa quando a
   * fila esvazia, pra não crescer indefinidamente.
   */
  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // Espera o detentor atual da chave (se houver) terminar — sucesso ou
    // falha não importam, só queremos a vez.
    while (this.tails.has(key)) {
      await this.tails.get(key)!.catch(() => undefined);
    }
    // Marca a vez com uma promise `done` que só resolve quando terminarmos.
    let release!: () => void;
    const done = new Promise<void>((r) => (release = r));
    this.tails.set(key, done);
    try {
      return await fn();
    } finally {
      // Libera a chave apenas se ninguém entrou na fila depois de nós.
      if (this.tails.get(key) === done) this.tails.delete(key);
      release();
    }
  }
}
