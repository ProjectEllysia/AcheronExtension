/**
 * La forma del cuerpo de `GET /acheron/vault`, declarada aquí por una carencia
 * del paquete y no por gusto.
 *
 * `@projectellysia/acheron-core-web` declara `VaultJson`, `AlgorithmBlock` y
 * los demás tipos de su frontera en `src/types.ts`, pero su `index.ts` NO los
 * reexporta y su `exports` no abre esa ruta, así que un consumidor no puede
 * importarlos. Esta declaración es estructuralmente compatible con la suya —por
 * eso `openVault` la acepta— y debe desaparecer en cuanto el paquete exporte
 * sus tipos.
 *
 * Está en su propio fichero para que borrarlo sea un cambio de una línea en
 * cada importador, y para que nadie lo confunda con un contrato propio de la
 * extensión: el contrato es del motor.
 */

/** Cómo se derivó la clave maestra de una bóveda. */
export interface AlgorithmBlock {
  transformation?: string
  kdf?: string
  salt: string
  kdfIterations?: string | number
  kdfMemoryKiB?: string | number
  kdfParallelism?: string | number
  kdfKeyLength?: string | number
}

/**
 * El JSON de la bóveda. Las listas de storables cuelgan de la clave PLURAL de
 * cada tipo (`accounts`, `creditcards`…), que es lo que el catálogo llama
 * `category`.
 */
export interface VaultJson {
  version?: number
  revision?: number
  checker: string
  vaultKey: string
  algorithm: AlgorithmBlock
  [category: string]: unknown
}

/** Un storable ya descifrado. */
export interface PlainStorable {
  title: string
  [field: string]: unknown
}
