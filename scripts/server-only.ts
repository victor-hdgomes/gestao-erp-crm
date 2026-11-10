/**
 * Substituto do pacote "server-only" para rodar scripts fora do Next.
 *
 * Os services do ERP comecam com `import "server-only"`, que e um pacote vazio
 * cuja unica funcao e quebrar o build se alguem importar aquele arquivo no
 * navegador. Fora do Next esse pacote nao existe, e o import derruba o script.
 *
 * Este arquivo so entra pelo scripts/tsconfig.json, usado exclusivamente pelos
 * scripts de linha de comando. O build da aplicacao continua com o pacote de
 * verdade e com a protecao que ele dá.
 */
export {};
